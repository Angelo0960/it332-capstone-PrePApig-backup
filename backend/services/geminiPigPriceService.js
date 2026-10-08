const DEFAULT_MODEL = 'gemini-3.8-flash';

const extractText = (payload) =>
  payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim() || '';

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
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
}) => {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const uniqueLocations = [...new Set(locations)].slice(0, 10);
  const prompt = [
    'You are analyzing pig selling-price options for a farmer near Calaca, Batangas, Philippines.',
    `Find current public pig liveweight or farmgate price points from at least 3 different nearby locations among: ${uniqueLocations.join(', ')}.`,
    'Use web search grounding. Do not invent prices. If a location has no reliable public price, label it unavailable.',
    'Separate liveweight/farmgate prices from retail, dressed-meat, or unrelated prices.',
    'Recommend which available location/source is the most useful price basis and explain why.',
    'Return a concise analysis with: price points by location, source date, unit, limitations, and a suggested price range or next action.',
    `Provincial reference (not Calaca-only): ${JSON.stringify(provincialReference)}`,
  ].join('\n');

  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini returned HTTP ${response.status}`);
  }

  const analysis = extractText(payload);
  if (!analysis) throw new Error('Gemini returned an empty price analysis');

  return {
    success: true,
    model,
    locations: uniqueLocations,
    analysis,
    sources: extractGrounding(payload),
    generatedAt: new Date().toISOString(),
  };
};

export { extractText, extractGrounding };
