import 'dotenv/config';

const DEFAULT_MODEL = 'gpt-4.1-mini';

const getConfiguredApiKey = () => process.env.OPENAI_API_KEY || '';

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
}) => {
  const configuredApiKey = String(apiKey || '').trim();
  if (!configuredApiKey) {
    throw new Error('OpenAI API key is not configured. Set OPENAI_API_KEY in the backend environment.');
  }

  const uniqueLocations = [...new Set(locations)].slice(0, 10);
  const prompt = [
    'You are analyzing pig selling-price options for a farmer near Calaca, Batangas, Philippines.',
    `Find current public pig liveweight or farmgate price points from at least 3 different nearby locations among: ${uniqueLocations.join(', ')}.`,
    'Use web search and prioritize public Facebook posts, pages, and groups for local price evidence when available. Do not use private or login-only content. Do not invent prices. If a location has no reliable public price, label it unavailable.',
    'Separate liveweight/farmgate prices from retail, dressed-meat, or unrelated prices.',
    'Recommend which available location/source is the most useful price basis and explain why.',
    'Return JSON only with this shape:',
    '{"pricePoints":[{"location":"Calaca","pricePhpPerKg":null,"unit":"PHP/kg liveweight","period":"YYYY-MM or unavailable","source":"source name or unavailable","sourceUrl":"public direct URL or unavailable","status":"found or unavailable"}],"analysis":"short analysis","suggestion":"recommended price basis or next action","limitations":["important limitation"]}',
    'Use null and unavailable when a location has no reliable public price. Do not estimate, average, or invent missing local prices.',
    `Provincial reference (not Calaca-only): ${JSON.stringify(provincialReference)}`,
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

export { extractText, extractGrounding };
