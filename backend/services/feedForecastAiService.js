import 'dotenv/config';
import { FEED_RATION_STAGE_MAP } from './feedForecastService.js';

const extractText = (payload) => payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';

const parseJson = (text) => {
  try { return JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
};

const buildStockContext = (feedStocks = null, forecastRows = [], rationForecasts = []) => {
  const stockAvailable = Array.isArray(feedStocks);
  const categories = rationForecasts.map((ration) => {
    const rows = ration.forecast || [];
    const hasForecast = ration.status === 'forecasted' && rows.length > 0;
    const forecastKg = hasForecast ? rows.reduce((sum, row) => sum + Math.max(0, Number(row.predictedKg) || 0), 0) : null;
    const mapping = FEED_RATION_STAGE_MAP[ration.rationCode];
    const matchingStocks = mapping && stockAvailable
      ? feedStocks.filter((stock) => mapping.stockAliases.some((alias) => String(stock.feed_type || '').trim().toLowerCase() === alias.toLowerCase()))
      : [];
    const stockQuantityKg = stockAvailable
      ? matchingStocks.reduce((sum, stock) => sum + Math.max(0, Number(stock.stock_quantity) || 0), 0)
      : null;
    const coveragePercent = hasForecast && stockQuantityKg != null && forecastKg > 0
      ? Number(((stockQuantityKg / forecastKg) * 100).toFixed(1))
      : null;
    const surplusKg = hasForecast && stockQuantityKg != null
      ? Number(Math.max(0, stockQuantityKg - forecastKg).toFixed(3))
      : null;
    const shortfallKg = hasForecast && stockQuantityKg != null
      ? Number(Math.max(0, forecastKg - stockQuantityKg).toFixed(3))
      : null;
    return {
      rationCode: ration.rationCode,
      feedStage: mapping?.feedStage || null,
      forecastKg: hasForecast ? Number(forecastKg.toFixed(3)) : null,
      averageWeeklyForecastKg: hasForecast ? Number((forecastKg / rows.length).toFixed(3)) : null,
      stockMatch: !mapping ? 'unmapped' : stockAvailable ? 'mapped' : 'mapped_stock_unavailable',
      stockQuantityKg: mapping && stockAvailable ? Number(stockQuantityKg.toFixed(3)) : null,
      coveragePercent,
      surplusKg,
      shortfallKg,
      note: !mapping ? 'No explicit mapping exists for this ration code.' : stockAvailable ? `Mapped to ${mapping.feedStage} feed stock by explicit ration-code mapping.` : 'Feed-stock data is unavailable.',
    };
  });
  return {
    totalRecordedStockKg: stockAvailable ? Number(feedStocks.reduce((sum, row) => sum + Math.max(0, Number(row.stock_quantity) || 0), 0).toFixed(3)) : null,
    recordedStocks: stockAvailable ? feedStocks.map((row) => ({ feedType: row.feed_type, stockQuantityKg: Number(row.stock_quantity) || 0 })) : [],
    rationForecasts: categories,
    stockToForecastComparison: stockAvailable ? 'mapped_by_explicit_ration_code_to_feed_stage' : 'unavailable_stock_data',
  };
};

const extractChatText = (payload) => {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((part) => part?.text || '').join('').trim();
  return '';
};

const requestProvider = async ({ provider, model, apiKey, prompt, fetchImpl }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  let response;
  try {
    if (provider === 'gemini') {
      response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
        signal: controller.signal,
      });
    } else {
      const isOpenRouter = provider === 'openrouter';
      response = await fetchImpl(isOpenRouter ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          ...(isOpenRouter ? { 'HTTP-Referer': 'https://prepapig.onrender.com', 'X-Title': 'PrepAPig Feed Forecast' } : {}),
        },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2 }),
        signal: controller.signal,
      });
    }
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(`${provider} returned HTTP ${response.status}: ${payload?.error?.message || 'provider request failed'}`);
  const text = provider === 'gemini' ? extractText(payload) : extractChatText(payload);
  if (!text) throw new Error(`${provider} returned an empty feed forecast analysis`);
  const structured = parseJson(text);
  if (!structured) throw new Error(`${provider} did not return structured feed forecast analysis`);
  return { structured, provider, model };
};

export const generateFeedForecastAnalysis = async ({ forecast, feedStocks = null, fetchImpl = fetch }) => {
  const prompt = [
    'Write for a busy pig farmer, not a software engineer. Use simple everyday words, short sentences, and explain any unavoidable farming or financial term immediately.',
    'Do not use technical model terms, statistical jargon, abbreviations, or unexplained phrases. Focus on what the farmer should understand and do next.',
    'You are an agricultural feed-planning advisor reviewing a weekly feed-consumption forecast for a pig farm.',
    'Use only the supplied historical and forecast values. Do not invent measurements, prices, causes, or farm conditions.',
    'Treat the uploaded historical feed data as the active dataset for this analysis. Do not replace its values with invented measurements.',
    'Analyze the direction of weekly consumption, actual-versus-planned variance, projected bag requirements, projected cost, forecast error, and uncertainty.',
    'Use the supplied explicit ration-code-to-feed-stage mapping to compare each forecast with its matching recorded feed stock. Do not infer any other mappings.',
    'Analyze each ration forecast independently, including direction, uncertainty, requirements, and mapped stock. Do not make stock coverage or shortage claims for unmapped ration codes.',
    'Recommend buying only when the computed per-stage shortfall supports it. If stock or forecast data is unavailable, say it is unavailable and recommend verifying records rather than assuming zero.',
    'Do not replace recorded feed, inventory, expense, financial, or FCR calculations with this planning analysis.',
    'Return JSON only in this exact shape:',
    '{"analysis":"short evidence-based analysis","suggestion":"specific planning suggestion","riskLevel":"low|medium|high|unknown","actions":["action"],"limitations":["limitation"]}',
    `Forecast and stock data: ${JSON.stringify({ historicalSummary: forecast.historicalSummary, history: forecast.history, forecast: forecast.forecast, rationForecasts: forecast.rationForecasts, evaluation: forecast.evaluation, provenance: forecast.provenance, stockContext: buildStockContext(feedStocks, forecast.forecast || [], forecast.rationForecasts || []) })}`,
  ].join('\n');
  const providers = [
    { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY, model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' },
    { provider: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'openrouter/free' },
    { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini' },
  ].filter((item) => String(item.apiKey || '').trim());
  if (!providers.length) throw new Error('No AI provider is configured. Set GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY in the backend environment.');

  const failures = [];
  for (const entry of providers) {
    try {
      const { structured, provider, model } = await requestProvider({ ...entry, apiKey: String(entry.apiKey).trim(), prompt, fetchImpl });
      return {
        success: true,
        provider,
        model,
        analysis: structured.analysis || '',
        suggestion: structured.suggestion || '',
        riskLevel: structured.riskLevel || 'unknown',
        actions: Array.isArray(structured.actions) ? structured.actions : [],
        limitations: Array.isArray(structured.limitations) ? structured.limitations : [],
        stockContext: buildStockContext(feedStocks, forecast.forecast || [], forecast.rationForecasts || []),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      failures.push(`${entry.provider}: ${String(error.message || 'request failed').slice(0, 300)}`);
      console.warn(`Feed forecast provider ${entry.provider} failed; trying next configured provider.`);
    }
  }
  throw new Error(`All configured AI providers failed for feed forecast analysis (${failures.join('; ')})`);
};

export { extractText, extractChatText, parseJson, buildStockContext };