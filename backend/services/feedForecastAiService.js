import 'dotenv/config';
import { FEED_RATION_STAGE_MAP } from './feedForecastService.js';
import { getGeminiModel } from './geminiModel.js';
import { getOpenAiEndpoint, isOpenAiBaseUrlConfigured } from './openAiEndpoint.js';

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
    const stockQuantityKg = mapping && stockAvailable && matchingStocks.length > 0
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
      stockMatch: !mapping ? 'unmapped' : !stockAvailable ? 'mapped_stock_unavailable' : matchingStocks.length ? 'mapped' : 'mapped_no_stock_record',
      stockQuantityKg: mapping && stockAvailable && matchingStocks.length > 0 ? Number(stockQuantityKg.toFixed(3)) : null,
      coveragePercent,
      surplusKg,
      shortfallKg,
      note: !mapping ? 'No explicit mapping exists for this ration code.' : !stockAvailable ? 'Feed-stock data is unavailable.' : matchingStocks.length ? `Mapped to ${mapping.feedStage} feed stock by explicit ration-code mapping.` : `No stock record exists for ${mapping.feedStage}; quantity is unavailable.`,
    };
  });
  return {
    totalRecordedStockKg: stockAvailable && feedStocks.length > 0 ? Number(feedStocks.reduce((sum, row) => sum + Math.max(0, Number(row.stock_quantity) || 0), 0).toFixed(3)) : null,
    recordedStocks: stockAvailable ? feedStocks.map((row) => ({ feedType: row.feed_type, stockQuantityKg: Number(row.stock_quantity) || 0 })) : [],
    rationForecasts: categories,
    stockToForecastComparison: !stockAvailable
      ? 'unavailable_stock_data'
      : !feedStocks.length
        ? 'no_stock_records'
        : categories.some((ration) => ration.stockMatch === 'mapped_no_stock_record')
          ? 'partially_mapped_by_explicit_ration_code_to_feed_stage'
          : 'mapped_by_explicit_ration_code_to_feed_stage',
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
      response = await fetchImpl(isOpenRouter ? 'https://openrouter.ai/api/v1/chat/completions' : getOpenAiEndpoint('chatCompletions'), {
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

const narrativeContainsNumericFigure = (structured = {}) => {
  const fields = [structured.analysis, structured.suggestion, ...(Array.isArray(structured.actions) ? structured.actions : []), ...(Array.isArray(structured.limitations) ? structured.limitations : [])].filter((value) => value != null);
  return fields.some((value) => typeof value !== 'string' || /[0-9₀-₉]|[₱$€£]/u.test(value));
};

const validateForecastCalculations = (forecast) => {
  const metrics = forecast?.calculatedMetrics;
  if (!Array.isArray(metrics)) {
    if (forecast?.status === 'forecasted' && Array.isArray(forecast.rationForecasts) && forecast.rationForecasts.length) {
      throw new Error('Backend feed forecast metrics are missing; AI interpretation was not generated.');
    }
    return;
  }
  metrics.forEach((metric) => {
    const totalKg = Number(metric.totalForecastKg);
    if (!Number.isFinite(totalKg) || !Number.isFinite(Number(metric.bagEquivalent)) || !Number.isFinite(Number(metric.wholeBagsForTotalNeed))) {
      throw new Error('Backend feed forecast metrics contain an invalid total or bag calculation.');
    }
    if (metric.reconciliationStatus === 'not_applicable') return;
    const rationRows = (metric.rationForecasts || []).filter((row) => row.forecastKg != null && Number.isFinite(Number(row.forecastKg)));
    const rationTotalKg = rationRows.reduce((sum, row) => sum + Number(row.forecastKg), 0);
    if (Math.abs(rationTotalKg - totalKg) > 0.001 || Math.abs(Number(metric.bagEquivalent) - (totalKg / 50)) > 0.001) {
      throw new Error('Backend feed forecast total does not reconcile with its ration and bag calculations.');
    }
    if (Number(metric.wholeBagsForTotalNeed) !== Math.ceil(Math.max(0, totalKg) / 50)) {
      throw new Error('Backend feed forecast whole-bag calculation failed validation.');
    }
    if (metric.estimatedCostPhp != null) {
      const pricedRows = rationRows.filter((row) => Number(row.forecastKg) > 0);
      if (pricedRows.some((row) => row.estimatedCostPhp == null)) {
        throw new Error('Backend feed forecast total cost is present while a ration cost is unavailable.');
      }
      const rationCost = pricedRows.reduce((sum, row) => sum + Number(row.estimatedCostPhp), 0);
      if (Math.abs(rationCost - Number(metric.estimatedCostPhp)) > 0.01) {
        throw new Error('Backend feed forecast total cost does not reconcile with ration costs.');
      }
    }
  });
};

export const generateFeedForecastAnalysis = async ({ forecast, feedStocks = null, stockContext = null, fetchImpl = fetch }) => {
  validateForecastCalculations(forecast);
  const deterministicStockContext = stockContext || buildStockContext(feedStocks, forecast.forecast || [], forecast.rationForecasts || []);
  const prompt = [
    'Write for a busy pig farmer, not a software engineer. Use simple everyday words, short sentences, and explain any unavoidable farming or financial term immediately.',
    'Do not use technical model terms, statistical jargon, abbreviations, or unexplained phrases. Focus on what the farmer should understand and do next.',
    'You are an agricultural feed-planning advisor reviewing a weekly feed-consumption forecast for a pig farm.',
    'Use only the supplied historical and forecast values. Do not invent measurements, prices, causes, or farm conditions.',
    'Treat the uploaded historical feed data as the active dataset for this analysis. Do not replace its values with invented measurements.',
    'The backend has already calculated the quantities, bag equivalents, costs, and stock comparisons. Its reconciliation status indicates whether the plan is complete; backend figures are authoritative.',
    'Interpret the direction, uncertainty, and operational meaning of those calculated results. Do not calculate, change, round, or restate any numerical figure in your prose.',
    'Do not include digits, currency amounts, percentages, dates, bag counts, feed-code identifiers, or numbers written as words in analysis, suggestion, actions, or limitations. The application displays authoritative figures separately.',
    'If the reconciliation status is partial, explain that the overall plan is incomplete and ask the farmer to verify the missing feed history before acting on the total.',
    'Use the supplied explicit ration-code-to-feed-stage mapping to interpret each forecast with its matching recorded feed stock. Do not infer any other mappings.',
    'Analyze each ration forecast independently. Do not make stock or shortage claims for unmapped ration codes, incomplete forecasts, or unavailable stock data.',
    'Recommend buying only when the backend-calculated per-stage shortfall supports it. If stock or forecast data is unavailable, say it is unavailable and recommend verifying records rather than assuming zero.',
    'Do not replace recorded feed, inventory, expense, financial, or FCR calculations with this planning analysis.',
    'Return JSON only in this exact shape:',
    '{"analysis":"short qualitative interpretation without figures","suggestion":"qualitative planning suggestion without figures","riskLevel":"low|medium|high|unknown","actions":["qualitative action without figures"],"limitations":["qualitative limitation without figures"]}',
    `Authoritative forecast and calculation data: ${JSON.stringify({ dataType: forecast.dataType, reconciliationStatus: forecast.reconciliationStatus, historicalSummary: forecast.historicalSummary, history: forecast.history, forecast: forecast.forecast, rationForecasts: forecast.rationForecasts, calculatedMetrics: forecast.calculatedMetrics, evaluation: forecast.evaluation, provenance: forecast.provenance, stockContext: deterministicStockContext })}`,
  ].join('\n');

  const configuredProviders = [
    { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY, model: getGeminiModel() },
    { provider: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY, model: process.env.OPENROUTER_MODEL || 'openrouter/free' },
    { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini' },
  ];
  const useOpenAi = isOpenAiBaseUrlConfigured();
  const providers = useOpenAi
    ? configuredProviders.filter((item) => item.provider === 'openai' && String(item.apiKey || '').trim())
    : configuredProviders.filter((item) => String(item.apiKey || '').trim());
  if (!providers.length) {
    if (useOpenAi) throw new Error('OPENAI_BASE_URL is set; OPENAI_API_KEY is required to use the selected OpenAI endpoint.');
    throw new Error('No AI provider is configured. Set GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY in the backend environment.');
  }

  const failures = [];
  for (const entry of providers) {
    try {
      const { structured, provider, model } = await requestProvider({ ...entry, apiKey: String(entry.apiKey).trim(), prompt, fetchImpl });
      if (narrativeContainsNumericFigure(structured)) {
        failures.push(`${entry.provider}: numeric figure found in narrative`);
        console.warn(`Feed forecast provider ${entry.provider} returned numeric narrative content; trying next configured provider.`);
        continue;
      }
      return {
        success: true,
        provider,
        model,
        analysis: structured.analysis || '',
        suggestion: structured.suggestion || '',
        riskLevel: ['low', 'medium', 'high', 'unknown'].includes(String(structured.riskLevel || '').toLowerCase()) ? String(structured.riskLevel).toLowerCase() : 'unknown',
        actions: Array.isArray(structured.actions) ? structured.actions : [],
        limitations: Array.isArray(structured.limitations) ? structured.limitations : [],
        stockContext: deterministicStockContext,
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