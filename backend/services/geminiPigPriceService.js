import 'dotenv/config';

const DEFAULT_MODEL = 'gemini-2.5-flash';

const getConfiguredApiKey = () =>
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY || '';

const extractText = (payload) =>
  payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim() || '';

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

const extractGrounding = (payload) => {
  const metadata = payload?.candidates?.[0]?.groundingMetadata;
  const chunks = metadata?.groundingChunks || [];
  return chunks
    .map((chunk) => chunk.web)
    .filter((web) => web?.uri)
    .map((web) => ({ title: web.title || web.uri, url: web.uri }));
};

export const generatePigPriceAnalysis = async ({
  locations,
  provincialReference,
  fetchImpl = fetch,
  apiKey = getConfiguredApiKey(),
  model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
}) => {
  const configuredApiKey = String(apiKey || '').trim();
  if (!configuredApiKey) {
    throw new Error(
      'Gemini API key is not configured. Set GEMINI_API_KEY in the backend environment.'
    );
  }

  const uniqueLocations = [...new Set(locations)].slice(0, 10);
  const prompt = [
    'You are analyzing pig selling-price options for a farmer near Calaca, Batangas, Philippines.',
    `Find current public pig liveweight or farmgate price points from at least 3 different nearby locations among: ${uniqueLocations.join(', ')}.`,
    'Use web search grounding. Do not invent prices. If a location has no reliable public price, label it unavailable.',
    'Separate liveweight/farmgate prices from retail, dressed-meat, or unrelated prices.',
    'Recommend which available location/source is the most useful price basis and explain why.',
    'Return JSON only with this shape:',
    '{"pricePoints":[{"location":"Calaca","pricePhpPerKg":null,"unit":"PHP/kg liveweight","period":"YYYY-MM or unavailable","source":"source name or unavailable","status":"found or unavailable"}],"analysis":"short analysis","suggestion":"recommended price basis or next action","limitations":["important limitation"]}',
    'Use null and unavailable when a location has no reliable public price. Do not estimate, average, or invent missing local prices.',
    `Provincial reference (not Calaca-only): ${JSON.stringify(provincialReference)}`,
  ].join('\n');

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': configuredApiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini returned HTTP ${response.status}`);
  }

  const analysis = extractText(payload);
  if (!analysis) throw new Error('Gemini returned an empty price analysis');

  const structured = parseStructuredAnalysis(analysis) || {
    pricePoints: [],
    analysis,
    suggestion: '',
    limitations: ['Gemini did not return the requested structured format.'],
  };

  return {
    success: true,
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
