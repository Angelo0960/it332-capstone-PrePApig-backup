import 'dotenv/config';
import { generatePigPriceAnalysis as generateGeminiPigPriceAnalysis, LIVE_WEIGHT_SEARCH_QUERIES } from './geminiPigPriceService.js';
import { getOpenAiEndpoint, isOpenAiBaseUrlConfigured, requestOpenAiJson } from './openAiEndpoint.js';

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENROUTER_MODEL = 'openrouter/free';

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

const extractChatText = (payload) => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join('').trim();
  return '';
};

const extractChatSources = (payload) => {
  const annotations = payload?.choices?.[0]?.message?.annotations || payload?.choices?.[0]?.message?.citations || [];
  return annotations.map((annotation) => ({
    title: annotation.title || annotation.url || annotation.source || 'OpenAI-compatible source',
    url: annotation.url || annotation.sourceUrl || annotation.source,
  })).filter((source) => source.url);
};

export const generatePigPriceAnalysis = async ({
  locations,
  provincialReference,
  fetchImpl = fetch,
  apiKey = getConfiguredApiKey(),
  model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
  localPricePoints = [],
  webSearchAvailable = false,
}) => {
  if (!isOpenAiBaseUrlConfigured() && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY)) {
    try {
      return await generateGeminiPigPriceAnalysis({
        locations,
        provincialReference,
        localPricePoints,
        fetchImpl,
      });
    } catch (error) {
      const message = String(error?.message || '');
      const canFallback = getConfiguredOpenRouterKey() || getConfiguredApiKey();
      if (!canFallback || !/quota|rate.?limit|resource.?exhausted|billing|unauthori[sz]|invalid.?api.?key|unavailable|not found/i.test(message)) {
        throw error;
      }
      console.warn('Gemini unavailable; falling back to the configured secondary AI provider.');
    }
  }

  if (!isOpenAiBaseUrlConfigured() && getConfiguredOpenRouterKey()) {
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
    throw new Error(isOpenAiBaseUrlConfigured()
      ? 'OPENAI_BASE_URL is set; OPENAI_API_KEY is required to use the selected OpenAI endpoint.'
      : 'No AI provider is configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY in the backend environment.');
  }

  const uniqueLocations = [...new Set(locations)].slice(0, 10);
  const useProviderWebSearch = !webSearchAvailable && !model.endsWith('/free') && !model.endsWith(':free');
  const webSearchInstruction = useProviderWebSearch
    ? 'Use web search and prioritize public Facebook posts, pages, and groups for local price evidence when available.'
    : 'Use only the supplied local and provincial reference points. Do not claim that you performed additional web searches.';
  const webSearchPrompt = useProviderWebSearch
    ? `Search each of these exact Filipino queries separately: ${JSON.stringify(LIVE_WEIGHT_SEARCH_QUERIES)}. Find current public pig liveweight or farmgate price points for these locations: ${uniqueLocations.join(', ')}.`
    : 'Do not perform additional web searches. Analyze only the supplied reference points and report when they contain no verified local offer.';
  const prompt = [
    'Write for a pig farmer, not a technical analyst. Use simple everyday language, short sentences, and explain any unavoidable market or money term immediately.',
    'Do not use technical model terms, statistical jargon, abbreviations, or unexplained phrases. Clearly separate what the data shows from what the farmer should do next.',
    'You are analyzing pig selling-price options for a farmer near Calaca, Batangas, Philippines.',
    webSearchPrompt,
    `${webSearchInstruction} Do not use private or login-only content. Do not invent prices. Include only locations with a qualifying sourced price in pricePoints; omit locations with no verified numeric price.`,
    'Separate liveweight/farmgate prices from retail, dressed-meat, or unrelated prices.',
    'Analyze pig prices only. Do not calculate farm profit, revenue, expenses, ROI, break-even, or any other financial analysis.',
    'Separate descriptive analytics (what observed prices show), diagnostic analytics (why source quality, recency, geography, or coverage limits comparison), and prescriptive analytics (practical checks before selling). Use plain language and short, readable paragraphs; never call an unverified or older provincial reference the strongest verified local price.',
    'Return JSON only with this shape:',
    '{"pricePoints":[{"location":"Calaca","pricePhpPerKg":152.5,"unit":"PHP/kg liveweight","period":"YYYY-MM","source":"source name","sourceUrl":"public direct URL","status":"found"}],"analytics":{"descriptive":"summarize only sourced price observations","diagnostic":"explain source, date, and geographic limits without listing locations that have no price","prescriptive":"practical checks before selling"},"analysis":"brief plain-language summary based only on sourced observations","suggestion":"one clear next action","limitations":["important limitation"]}',
    'Keep price observations separate from interpretation. Do not calculate farm profit, revenue, expenses, ROI, break-even, or any financial analysis. Omit locations without a qualifying sourced numeric price from pricePoints and comparisons; do not estimate, average, or invent missing prices or present province averages as municipality buyer offers.',
    `Provincial reference (not Calaca-only): ${JSON.stringify(provincialReference)}`,
    `Official and user-provided reference points, including their source, period, scope, and verification status: ${JSON.stringify(localPricePoints)}`,
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);
  let payload;
  let analysis;
  let sources;
  try {
    const request = async (endpoint, body) => requestOpenAiJson({
      endpoint,
      fetchImpl,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${configuredApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    });

    try {
      ({ payload } = await request('responses', {
        model,
        ...(useProviderWebSearch ? { tools: [{ type: 'web_search' }] } : {}),
        input: prompt,
        stream: false,
      }));
      analysis = extractText(payload);
      sources = extractGrounding(payload);
    } catch (error) {
      let sameProviderOrigin = false;
      try {
        sameProviderOrigin = new URL(getOpenAiEndpoint('responses')).origin === new URL(getOpenAiEndpoint('chatCompletions')).origin;
      } catch {
        sameProviderOrigin = false;
      }
      const canUseChatCompletions = sameProviderOrigin
        && (error.nonJsonResponse || error.providerStatus === 404 || error.providerStatus === 405);
      if (!canUseChatCompletions) throw error;
      console.warn(JSON.stringify({
        event: 'openai_responses_fallback',
        providerStatus: error.providerStatus || null,
        contentType: error.providerContentType || null,
        endpointHost: error.providerEndpointHost || null,
        endpointPath: error.providerEndpointPath || null,
        fallbackEndpoint: 'chat/completions',
      }));
      ({ payload } = await request('chatCompletions', {
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        stream: false,
      }));
      analysis = extractChatText(payload);
      sources = extractChatSources(payload);
    }
  } finally {
    clearTimeout(timeout);
  }

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
    searchQueries: LIVE_WEIGHT_SEARCH_QUERIES,
    pricePoints: Array.isArray(structured.pricePoints) ? structured.pricePoints : [],
    analytics: structured.analytics && typeof structured.analytics === 'object' ? structured.analytics : null,
    analysis: structured.analysis || analysis,
    suggestion: structured.suggestion || structured.analytics?.prescriptive || '',
    limitations: Array.isArray(structured.limitations) ? structured.limitations : [],
    sources: sources || [],
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
  const webSearchInstruction = /(?:\/free|:free)$/.test(model)
    ? 'Use only the supplied local and provincial reference points. Do not call web search because this free model must operate without paid search tools.'
    : 'Use web search and prioritize public Facebook posts, pages, and groups for local price evidence when available.';
  const prompt = [
    'Write for a pig farmer, not a technical analyst. Use simple everyday language, short sentences, and explain any unavoidable market or money term immediately.',
    'Do not use technical model terms, statistical jargon, abbreviations, or unexplained phrases. Clearly separate what the data shows from what the farmer should do next.',
    'You are analyzing pig selling-price options for a farmer near Calaca, Batangas, Philippines.',
    `Search each of these exact Filipino queries separately: ${JSON.stringify(LIVE_WEIGHT_SEARCH_QUERIES)}.`,
    `Find current public pig liveweight or farmgate price points for these locations: ${uniqueLocations.join(', ')}.`,
    `${webSearchInstruction} Do not use private or login-only content. Do not invent prices. Include only locations with a qualifying sourced price in pricePoints; omit locations with no verified numeric price.`,
    'Separate liveweight/farmgate prices from retail, dressed-meat, or unrelated prices.',
    'Analyze pig prices only. Do not calculate farm profit, revenue, expenses, ROI, break-even, or any other financial analysis.',
    'Separate descriptive analytics (what observed prices show), diagnostic analytics (why source quality, recency, geography, or coverage limits comparison), and prescriptive analytics (practical checks before selling). Use plain language and short, readable paragraphs; never call an unverified or older provincial reference the strongest verified local price.',
    'Return JSON only with this shape:',
    '{"pricePoints":[{"location":"Calaca","pricePhpPerKg":152.5,"unit":"PHP/kg liveweight","period":"YYYY-MM","source":"source name","sourceUrl":"public direct URL","status":"found"}],"analytics":{"descriptive":"summarize only sourced price observations","diagnostic":"explain source, date, and geographic limits without listing locations that have no price","prescriptive":"practical checks before selling"},"analysis":"brief plain-language summary based only on sourced observations","suggestion":"one clear next action","limitations":["important limitation"]}',
    'Keep price observations separate from interpretation. Do not calculate farm profit, revenue, expenses, ROI, break-even, or any financial analysis. Omit locations without a qualifying sourced numeric price from pricePoints and comparisons; do not estimate, average, or invent missing prices or present province averages as municipality buyer offers.',
    `Provincial reference (not Calaca-only): ${JSON.stringify(provincialReference)}`,
    `Official and user-provided reference points, including their source, period, scope, and verification status: ${JSON.stringify(localPricePoints)}`,
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
        ...( /(?:\/free|:free)$/.test(model) ? {} : { tools: [{ type: 'openrouter:web_search' }] }),
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
    searchQueries: LIVE_WEIGHT_SEARCH_QUERIES,
    pricePoints: Array.isArray(structured.pricePoints) ? structured.pricePoints : [],
    analytics: structured.analytics && typeof structured.analytics === 'object' ? structured.analytics : null,
    analysis: structured.analysis || analysis,
    suggestion: structured.suggestion || structured.analytics?.prescriptive || '',
    limitations: Array.isArray(structured.limitations) ? structured.limitations : [],
    sources: extractOpenRouterSources(payload),
    generatedAt: new Date().toISOString(),
  };
};

export { extractText, extractGrounding };
