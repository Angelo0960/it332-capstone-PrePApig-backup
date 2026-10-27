import 'dotenv/config';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';

const getConfiguredApiKey = () => process.env.OPENAI_API_KEY || '';
const getConfiguredOpenRouterKey = () => process.env.OPENROUTER_API_KEY || '';

const extractText = (payload) => {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload?.output || [])
    .filter((item) => item?.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((part) => part?.type === 'output_text')
    .map((part) => part.text || '')
    .join('')
    .trim();
};

const parseStructuredAnalysis = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }
};

const extractGrounding = (payload) => (payload?.output || [])
  .flatMap((item) => item?.content || [])
  .flatMap((part) => part?.annotations || [])
  .filter((annotation) => annotation?.type === 'url_citation' && annotation.url)
  .map((annotation) => ({
    title: annotation.title || annotation.url,
    url: annotation.url,
  }));

export const generatePigPriceAnalysis = async ({
  locations,
  provincialReference,
  fetchImpl = fetch,
  apiKey = getConfiguredApiKey(),
  model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
  localPricePoints = [],
}) => {
  if (getConfiguredOpenRouterKey()) {
    try {
      return await generateOpenRouterPigPriceAnalysis({
        locations,
        provincialReference,
        fetchImpl,
        apiKey: getConfiguredOpenRouterKey(),
        model: process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
        localPricePoints,
      });
    } catch (error) {
      const message = String(error?.message || '');
      const canFallbackToOpenAi = getConfiguredApiKey() && /credit|quota|billing|rate.?limit|resource.?exhausted|unauthori[sz]|invalid.?api.?key/i.test(message);
      if (!canFallbackToOpenAi) throw error;
      console.warn('OpenRouter unavailable; falling back to OpenAI provider.');
    }
  }

  const configuredApiKey = String(apiKey || getConfiguredApiKey()).trim();
  if (!configuredApiKey) {
    throw new Error('No AI provider is configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY in the backend environment.');
  }

  const uniqueLocations = [...new Set(locations)].slice(0, 10);
  const prompt = [
    'You are analyzing pig selling-price options for a farmer near Calaca, Batangas, Philippines.',
    `Find current public pig liveweight or farmgate price points from at least 3 different nearby locations among: ${uniqueLocations.join(', ')}.`,
    'Use web search and prioritize public Facebook posts, pages, and groups for local price evidence when available. Do not use private or login-only content. Do not invent prices. If a location has no reliable public price, label it unavailable.',
    'Separate liveweight/farmgate prices from retail, dressed-meat, or unrelated prices.',
    'Analyze pig prices only. Do not calculate farm profit, revenue, expenses, ROI, break-even, or any other financial analysis.',
    'Compare observed price levels, price range, location differences, price direction, source quality, and the most defensible selling-price basis.',
    'Return JSON only with this shape:',
    '{"pricePoints":[{"location":"Calaca","pricePhpPerKg":null,"unit":"PHP/kg liveweight","period":"YYYY-MM or unavailable","source":"source name or unavailable","sourceUrl":"public direct URL or unavailable","status":"found or unavailable"}],"analysis":"detailed review covering the observed price range, location comparison, source quality, recommended price basis, and risks","suggestion":"recommended price basis or next action","limitations":["important limitation"]}',
    'Write analysis as a detailed review of at least four sentences. Explain the observed prices, compare locations, identify the strongest price basis, distinguish verified public evidence from user-provided references, and state the confidence and limitations.',
    'Use null and unavailable when a location has no reliable public price. Do not estimate, average, or invent missing local prices.',
    `Provincial reference (not Calaca-only): ${JSON.stringify(provincialReference)}`,
    `Local reference points (may be user-provided and not independently verified): ${JSON.stringify(localPricePoints)}`,
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${configuredApiKey}`,
      },
      body: JSON.stringify({
        model,
        tools: [{ type: 'web_search' }],
        input: prompt,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `OpenAI returned HTTP ${response.status}`);
    error.providerStatus = response.status;
    throw error;
  }

  const analysis = extractText(payload);
  if (!analysis) throw new Error('OpenAI returned an empty price analysis');

  const structured = parseStructuredAnalysis(analysis) || {
    pricePoints: [],
    analysis,
    suggestion: '',
    limitations: ['OpenAI did not return the requested structured format.'],
  };

  return {
    success: true,
    provider: 'openai',
    model,
    locations: uniqueLocations,
    pricePoints: Array.isArray(structured.pricePoints) ? structured.pricePoints : [],
    analysis: structured.analysis || analysis,
    suggestion: structured.suggestion || '',
    limitations: Array.isArray(structured.limitations) ? structured.limitations : [],
    sources: extractGrounding(payload),
    generatedAt: new Date().toISOString(),
  };
};

const extractOpenRouterText = (payload) => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || part?.content || '').join('').trim();
  }
  return '';
};

const extractOpenRouterSources = (payload) => {
  const message = payload?.choices?.[0]?.message || {};
  const citations = message.annotations || message.citations || [];
  return citations
    .map((citation) => ({
      title: citation.title || citation.url || citation.source || 'OpenRouter web source',
      url: citation.url || citation.sourceUrl || citation.source,
    }))
    .filter((source) => source.url);
};

const generateOpenRouterPigPriceAnalysis = async ({
  locations,
  provincialReference,
  fetchImpl = fetch,
  apiKey,
  model = DEFAULT_OPENROUTER_MODEL,
  localPricePoints = [],
}) => {
  const configuredApiKey = String(apiKey || '').trim();
  if (!configuredApiKey) {
    throw new Error('OpenRouter API key is not configured. Set OPENROUTER_API_KEY in the backend environment.');
  }

  const uniqueLocations = [...new Set(locations)].slice(0, 10);
  const prompt = [
    'You are analyzing pig selling-price options for a farmer near Calaca, Batangas, Philippines.',
    `Find current public pig liveweight or farmgate price points from at least 3 different nearby locations among: ${uniqueLocations.join(', ')}.`,
    'Use web search and prioritize public Facebook posts, pages, and groups for local price evidence when available. Do not use private or login-only content. Do not invent prices. If a location has no reliable public price, label it unavailable.',
    'Separate liveweight/farmgate prices from retail, dressed-meat, or unrelated prices.',
    'Analyze pig prices only. Do not calculate farm profit, revenue, expenses, ROI, break-even, or any other financial analysis.',
    'Compare observed price levels, price range, location differences, price direction, source quality, and the most defensible selling-price basis.',
    'Return JSON only with this shape:',
    '{"pricePoints":[{"location":"Calaca","pricePhpPerKg":null,"unit":"PHP/kg liveweight","period":"YYYY-MM or unavailable","source":"source name or unavailable","sourceUrl":"public direct URL or unavailable","status":"found or unavailable"}],"analysis":"detailed review covering the observed price range, location comparison, source quality, recommended price basis, and risks","suggestion":"recommended price basis or next action","limitations":["important limitation"]}',
    'Write analysis as a detailed review of at least four sentences. Explain the observed prices, compare locations, identify the strongest price basis, distinguish verified public evidence from user-provided references, and state the confidence and limitations.',
    'Use null and unavailable when a location has no reliable public price. Do not estimate, average, or invent missing local prices.',
    `Provincial reference (not Calaca-only): ${JSON.stringify(provincialReference)}`,
    `Local reference points (may be user-provided and not independently verified): ${JSON.stringify(localPricePoints)}`,
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${configuredApiKey}`,
        'HTTP-Referer': 'https://prepapig.onrender.com',
        'X-Title': 'PrepAPig Price Analysis',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'openrouter:web_search' }],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `OpenRouter returned HTTP ${response.status}`);
    error.providerStatus = response.status;
    throw error;
  }

  const analysis = extractOpenRouterText(payload);
  if (!analysis) throw new Error('OpenRouter returned an empty price analysis');
  const structured = parseStructuredAnalysis(analysis) || {
    pricePoints: [],
    analysis,
    suggestion: '',
    limitations: ['OpenRouter did not return the requested structured format.'],
  };

  return {
    success: true,
    provider: 'openrouter',
    model,
    locations: uniqueLocations,
    pricePoints: Array.isArray(structured.pricePoints) ? structured.pricePoints : [],
    analysis: structured.analysis || analysis,
    suggestion: structured.suggestion || '',
    limitations: Array.isArray(structured.limitations) ? structured.limitations : [],
    sources: extractOpenRouterSources(payload),
    generatedAt: new Date().toISOString(),
  };
};

export { extractText, extractGrounding };
