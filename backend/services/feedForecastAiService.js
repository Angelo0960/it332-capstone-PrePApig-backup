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

export const generateFeedForecastAnalysis = async ({ forecast, fetchImpl = fetch, apiKey = getApiKey(), model = process.env.GEMINI_MODEL || DEFAULT_MODEL }) => {
  const configuredKey = String(apiKey || '').trim();
  if (!configuredKey) throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY in the backend environment.');
  const prompt = [
    'You are an agricultural feed-planning advisor reviewing a weekly feed-consumption forecast for a pig farm.',
    'Use only the supplied historical and forecast values. Do not invent measurements, prices, causes, or farm conditions.',
    'The uploaded source is synthetic historical data. Clearly state that the results are planning guidance, not verified operational measurements.',
    'Analyze the direction of weekly consumption, actual-versus-planned variance, projected bag requirements, projected cost, forecast error, and uncertainty.',
    'Give practical but qualified suggestions for feed purchasing and monitoring. Do not replace recorded feed, inventory, expense, financial, or FCR calculations.',
    'Return JSON only in this exact shape:',
    '{"analysis":"short evidence-based analysis","suggestion":"specific planning suggestion","riskLevel":"low|medium|high|unknown","actions":["action"],"limitations":["limitation"]}',
    `Forecast data: ${JSON.stringify({ historicalSummary: forecast.historicalSummary, history: forecast.history, forecast: forecast.forecast, evaluation: forecast.evaluation, provenance: forecast.provenance })}`,
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
    generatedAt: new Date().toISOString(),
  };
};

export { extractText, parseJson };