import 'dotenv/config';

const SEARCH_QUERIES = {
  Calaca: 'magkano ang presyo ng buhay na baboy sa calaca',
  Lemery: 'magkano ang presyo ng buhay na baboy sa lemery',
  Balayan: 'magakano ang presyo ng buhay na baboy sa balayan',
  Tuy: 'magakano ang presyo ng buhay na baboy sa tuy',
  Taal: 'magkano ang presyo ng buhay na baboy sa taal',
};

const getSerperKey = () => String(process.env.SERPER_API_KEY || '').trim();
const getGoogleKey = () => String(process.env.GOOGLE_SEARCH_API_KEY || '').trim();
const getGoogleCx = () => String(process.env.GOOGLE_SEARCH_ENGINE_ID || '').trim();

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

const looksLikeLiveweight = (text) => /live\s*weight|liveweight|farmgate|farm\s*gate|buhay na baboy|live hog|per\s*kg|\/\s*kg/i.test(text);

const normalizeResult = (location, query, item) => {
  const title = decodeHtml(item.title || item.name || 'Web search result');
  const snippet = decodeHtml(item.snippet || item.description || '');
  const combined = `${title}. ${snippet}`;
  const price = parsePrice(combined);
  if (price == null || !looksLikeLiveweight(combined)) return null;
  return {
    location,
    query,
    pricePhpPerKg: price,
    unit: 'PHP/kg liveweight',
    period: 'search result date unavailable',
    source: title,
    sourceUrl: item.link || item.url || 'unavailable',
    status: 'found',
    evidence: snippet,
    sourceType: 'web search result; verify with buyer before selling',
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
  locations = Object.keys(SEARCH_QUERIES),
  fetchImpl = fetch,
} = {}) => {
  const provider = getSerperKey() ? 'serper' : getGoogleKey() && getGoogleCx() ? 'google_custom_search' : null;
  if (!provider) {
    throw new Error('Web search is not configured. Set SERPER_API_KEY or GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID.');
  }

  const pricePoints = [];
  const sources = [];
  const errors = [];
  for (const location of [...new Set(locations)].slice(0, 10)) {
    const query = SEARCH_QUERIES[location] || `magkano ang presyo ng buhay na baboy sa ${location.toLowerCase()}`;
    try {
      const results = provider === 'serper'
        ? await searchSerper(query, fetchImpl)
        : await searchGoogle(query, fetchImpl);
      const point = results.map((item) => normalizeResult(location, query, item)).find(Boolean);
      if (point) pricePoints.push(point);
      else pricePoints.push({ location, query, pricePhpPerKg: null, unit: 'PHP/kg liveweight', period: 'unavailable', source: 'No qualifying public web result', sourceUrl: 'unavailable', status: 'unavailable' });
      results.slice(0, 5).forEach((item) => {
        const url = item.link || item.url;
        if (url) sources.push({ title: decodeHtml(item.title || item.name || url), url });
      });
    } catch (error) {
      errors.push(`${location}: ${String(error.message || error)}`.slice(0, 240));
      pricePoints.push({ location, query, pricePhpPerKg: null, unit: 'PHP/kg liveweight', period: 'unavailable', source: 'Web search failed', sourceUrl: 'unavailable', status: 'unavailable' });
    }
  }

  return {
    success: true,
    provider,
    locations: [...new Set(locations)].slice(0, 10),
    searchQueries: [...new Set(locations)].slice(0, 10).map((location) => SEARCH_QUERIES[location] || `magkano ang presyo ng buhay na baboy sa ${location.toLowerCase()}`),
    pricePoints,
    sources: [...new Map(sources.map((source) => [source.url, source])).values()],
    limitations: [
      'Search snippets are public web observations, not guaranteed buyer offers.',
      'Confirm location, date, liveweight basis, and price directly before selling.',
      ...errors,
    ],
    generatedAt: new Date().toISOString(),
  };
};

export { SEARCH_QUERIES, parsePrice, normalizeResult };
