import 'dotenv/config';

const SEARCH_LOCATIONS = ['Lemery', 'Calaca', 'Tuy', 'Balayan', 'Lian', 'Nasugbu', 'Taal'];

const getSerperKey = () => String(process.env.SERPER_API_KEY || '').trim();
const getGoogleKey = () => String(process.env.GOOGLE_SEARCH_API_KEY || '').trim();
const getGoogleCx = () => String(process.env.GOOGLE_SEARCH_ENGINE_ID || '').trim();

const getSearchQuery = (location, now = new Date()) => {
  const month = now.toLocaleString('en-US', { month: 'long', timeZone: 'Asia/Manila' });
  const year = now.toLocaleString('en-US', { year: 'numeric', timeZone: 'Asia/Manila' });
  return `site:facebook.com presyo ng buhay na baboy ${location} Batangas ${month} ${year} liveweight farmgate price per kilogram`;
};

const decodeHtml = (value) => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const parsePrice = (text) => {
  const normalized = decodeHtml(text);
  const patterns = [
    /(?:₱|PHP|Php)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:per\s*kg|\/\s*kg|kg)?/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:PHP|pesos?)\s*(?:per\s*kg|\/\s*kg|kg)?/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const value = Number(match[1].replace(/,/g, ''));
    if (Number.isFinite(value) && value >= 20 && value <= 1000) return value;
  }
  return null;
};

const parsePrices = (text) => {
  const normalized = decodeHtml(text);
  const range = normalized.match(/(?:₱|PHP|Php)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:-|–|to)\s*(?:₱|PHP|Php)?\s*([\d,]+(?:\.\d{1,2})?)/i)
    || normalized.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:-|–|to)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:PHP|pesos?)\b/i);
  if (range) {
    const values = range.slice(1).map((value) => Number(value.replace(/,/g, ''))).filter((value) => Number.isFinite(value) && value >= 20 && value <= 1000);
    if (values.length === 2) return { min: Math.min(...values), max: Math.max(...values), average: Number(((values[0] + values[1]) / 2).toFixed(2)) };
  }
  const single = parsePrice(normalized);
  return single == null ? null : { min: single, max: single, average: single };
};

const parseObservedDate = (text, item = {}) => {
  const raw = [item.date, item.publishedDate, item.pagemap?.metatags?.[0]?.['article:published_time'], text].filter(Boolean).join(' ');
  const iso = raw.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020) return parsed.toISOString().slice(0, 10);
  return null;
};

const looksLikeLiveweight = (text) => /live\s*weight|liveweight|farmgate|farm\s*gate|buhay na baboy|live hog|per\s*kg|\/\s*kg/i.test(text)
  && !/retail pork|dressed meat|pork chop|liempo|kasim|baboy na karne/i.test(text);

const isFacebookUrl = (value) => /^https?:\/\/(?:www\.)?facebook\.com\//i.test(String(value || ''));

const normalizeResult = (location, query, item) => {
  const title = decodeHtml(item.title || item.name || 'Web search result');
  const snippet = decodeHtml(item.snippet || item.description || '');
  const combined = `${title}. ${snippet}`;
  const prices = parsePrices(combined);
  if (!prices || !looksLikeLiveweight(combined)) return null;
  const observedDate = parseObservedDate(combined, item);
  return {
    location,
    query,
    pricePhpPerKg: prices.average,
    priceMinPhpPerKg: prices.min,
    priceMaxPhpPerKg: prices.max,
    priceAveragePhpPerKg: prices.average,
    priceType: /farmgate|farm\s*gate/i.test(combined) ? 'farmgate/liveweight' : 'liveweight',
    unit: 'PHP/kg liveweight',
    period: observedDate || 'search result date unavailable',
    observedDate,
    source: title,
    sourceUrl: item.link || item.url || 'unavailable',
    status: observedDate ? 'partially_verified' : 'unverified',
    verificationStatus: observedDate ? 'partially_verified' : 'unverified',
    evidence: snippet,
    sourceType: 'Facebook public post/page/group search result; verify with buyer before selling',
  };
};

const searchSerper = async (query, fetchImpl) => {
  const response = await fetchImpl('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': getSerperKey(),
    },
    body: JSON.stringify({ q: query, gl: 'ph', hl: 'en', num: 10 }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.message || `Serper returned HTTP ${response.status}`);
  return payload.organic || [];
};

const searchGoogle = async (query, fetchImpl) => {
  const params = new URLSearchParams({
    key: getGoogleKey(),
    cx: getGoogleCx(),
    q: query,
    gl: 'ph',
    num: '10',
  });
  const response = await fetchImpl(`https://www.googleapis.com/customsearch/v1?${params}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Google Search returned HTTP ${response.status}`);
  return payload.items || [];
};

export const searchPigPricesWeb = async ({
  locations = SEARCH_LOCATIONS,
  fetchImpl = fetch,
  now = new Date(),
} = {}) => {
  // Google Custom Search is the primary pricing source. Serper remains an
  // explicitly configured fallback when Google credentials are unavailable.
  const provider = getGoogleKey() && getGoogleCx()
    ? 'google_custom_search'
    : getSerperKey()
      ? 'serper'
      : null;
  if (!provider) {
    throw new Error('Google web search is not configured. Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID in the backend environment.');
  }

  const pricePoints = [];
  const sources = [];
  const errors = [];
  const uniqueLocations = [...new Set(locations)].slice(0, 10);
  for (const location of uniqueLocations) {
    const query = getSearchQuery(location, now);
    try {
      const results = provider === 'serper'
        ? await searchSerper(query, fetchImpl)
        : await searchGoogle(query, fetchImpl);
      const facebookResults = results.filter((item) => isFacebookUrl(item.link || item.url));
      const point = facebookResults.map((item) => normalizeResult(location, query, item)).find(Boolean);
      if (point) pricePoints.push(point);
      else pricePoints.push({ location, query, pricePhpPerKg: null, unit: 'PHP/kg liveweight', period: 'unavailable', source: 'No qualifying public Facebook result', sourceUrl: 'unavailable', status: 'unavailable', verificationStatus: 'unavailable', sourceType: 'Facebook public post/page/group search' });
      facebookResults.slice(0, 5).forEach((item) => {
        const url = item.link || item.url;
        if (url) sources.push({ title: decodeHtml(item.title || item.name || url), url });
      });
    } catch (error) {
      errors.push(`${location}: ${String(error.message || error)}`.slice(0, 240));
      pricePoints.push({ location, query, pricePhpPerKg: null, unit: 'PHP/kg liveweight', period: 'unavailable', source: 'Facebook search failed', sourceUrl: 'unavailable', status: 'unavailable', verificationStatus: 'unavailable', sourceType: 'Facebook public post/page/group search' });
    }
  }

  return {
    success: true,
    provider,
    locations: uniqueLocations,
    searchQueries: uniqueLocations.map((location) => getSearchQuery(location, now)),
    pricePoints,
    sources: [...new Map(sources.map((source) => [source.url, source])).values()],
    limitations: [
      'Facebook search snippets are public observations, not guaranteed buyer offers.',
      'Confirm location, date, liveweight basis, and price directly before selling.',
      ...errors,
    ],
    generatedAt: new Date().toISOString(),
  };
};

export { SEARCH_LOCATIONS, getSearchQuery, parsePrice, parsePrices, normalizeResult };
