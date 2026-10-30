import 'dotenv/config';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const getApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY || '';

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

export const generateFeedForecastAnalysis = async ({ forecast, feedStocks = [], fetchImpl = fetch, apiKey = getApiKey(), model = process.env.GEMINI_MODEL || DEFAULT_MODEL }) => {
  const configuredKey = String(apiKey || '').trim();
  if (!configuredKey) throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY in the backend environment.');
  const prompt = [
    'You are an agricultural feed-planning advisor reviewing a weekly feed-consumption forecast for a pig farm.',
    'Use only the supplied historical and forecast values. Do not invent measurements, prices, causes, or farm conditions.',
    'The uploaded source is synthetic historical data. Clearly state that the results are planning guidance, not verified operational measurements.',
    'Analyze the direction of weekly consumption, actual-versus-planned variance, projected bag requirements, projected cost, forecast error, and uncertainty.',
    'Check the current feed-stock quantities against the total four-week forecast. Calculate whether the stock covers the forecast, estimate coverage in weeks, identify a projected shortfall or surplus, and suggest the next action: purchase, monitor, or avoid unnecessary buying. Do not recommend a purchase when stock coverage is sufficient.',
    'Give practical but qualified suggestions for feed purchasing and monitoring. Do not replace recorded feed, inventory, expense, financial, or FCR calculations.',
    'Return JSON only in this exact shape:',
    '{"analysis":"short evidence-based analysis","suggestion":"specific planning suggestion","riskLevel":"low|medium|high|unknown","actions":["action"],"limitations":["limitation"]}',
    `Forecast and stock data: ${JSON.stringify({ historicalSummary: forecast.historicalSummary, history: forecast.history, forecast: forecast.forecast, evaluation: forecast.evaluation, provenance: forecast.provenance, stockContext: buildStockContext(feedStocks, forecast.forecast || []) })}`,
  ].join('\n');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': configuredKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini returned HTTP ${response.status}`);
  const text = extractText(payload);
  if (!text) throw new Error('Gemini returned an empty feed forecast analysis');
  const structured = parseJson(text);
  if (!structured) throw new Error('Gemini did not return structured feed forecast analysis');
  return {
    success: true,
    provider: 'gemini',
    model,
    analysis: structured.analysis || '',
    suggestion: structured.suggestion || '',
    riskLevel: structured.riskLevel || 'unknown',
    actions: Array.isArray(structured.actions) ? structured.actions : [],
    limitations: Array.isArray(structured.limitations) ? structured.limitations : [],
    stockContext: buildStockContext(feedStocks, forecast.forecast || []),
    generatedAt: new Date().toISOString(),
  };
};

export { extractText, parseJson, buildStockContext };