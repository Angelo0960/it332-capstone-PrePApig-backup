import 'dotenv/config';

const extractText = (payload) => payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';

const parseJson = (text) => {
  try { return JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
};

const buildStockContext = (feedStocks = [], forecastRows = []) => {
  const totalStockKg = feedStocks.reduce((sum, row) => sum + Math.max(0, Number(row.stock_quantity) || 0), 0);
  const forecastKg = forecastRows.reduce((sum, row) => sum + Math.max(0, Number(row.predictedKg) || 0), 0);
  const averageWeeklyForecastKg = forecastRows.length ? forecastKg / forecastRows.length : 0;
  const coverageWeeks = averageWeeklyForecastKg > 0 ? totalStockKg / averageWeeklyForecastKg : null;
  return {
    totalStockKg: Number(totalStockKg.toFixed(3)),
    forecastKg: Number(forecastKg.toFixed(3)),
    averageWeeklyForecastKg: Number(averageWeeklyForecastKg.toFixed(3)),
    coverageWeeks: coverageWeeks == null ? null : Number(coverageWeeks.toFixed(2)),
    projectedShortfallKg: Number(Math.max(0, forecastKg - totalStockKg).toFixed(3)),
    feedStocks: feedStocks.map((row) => ({ feedType: row.feed_type, stockQuantityKg: Number(row.stock_quantity) || 0, unitPrice: Number(row.unit_price) || null })),
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

export const generateFeedForecastAnalysis = async ({ forecast, feedStocks = [], fetchImpl = fetch }) => {
  const prompt = [
    'Write for a busy pig farmer, not a software engineer. Use simple everyday words, short sentences, and explain any unavoidable farming or financial term immediately.',
    'Do not use technical model terms, statistical jargon, abbreviations, or unexplained phrases. Focus on what the farmer should understand and do next.',
    'You are an agricultural feed-planning advisor reviewing a weekly feed-consumption forecast for a pig farm.',
    'Use only the supplied historical and forecast values. Do not invent measurements, prices, causes, or farm conditions.',
    'Treat the uploaded historical feed data as the active dataset for this analysis. Do not replace its values with invented measurements.',
    'Analyze the direction of weekly consumption, actual-versus-planned variance, projected bag requirements, projected cost, forecast error, and uncertainty.',
    'Check the current feed-stock quantities against the one-week forecast. Calculate whether the stock covers the forecast, estimate coverage in weeks, identify a projected shortfall or surplus, and suggest the next action: purchase, monitor, or avoid unnecessary buying. Do not recommend a purchase when stock coverage is sufficient.',
    'Give practical but qualified suggestions for feed purchasing and monitoring. Do not replace recorded feed, inventory, expense, financial, or FCR calculations.',
    'Return JSON only in this exact shape:',
    '{"analysis":"short evidence-based analysis","suggestion":"specific planning suggestion","riskLevel":"low|medium|high|unknown","actions":["action"],"limitations":["limitation"]}',
    `Forecast and stock data: ${JSON.stringify({ historicalSummary: forecast.historicalSummary, history: forecast.history, forecast: forecast.forecast, evaluation: forecast.evaluation, provenance: forecast.provenance, stockContext: buildStockContext(feedStocks, forecast.forecast || []) })}`,
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
        stockContext: buildStockContext(feedStocks, forecast.forecast || []),
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