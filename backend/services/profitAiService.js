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

export const generateProfitAnalysis = async ({ context, fetchImpl = fetch, apiKey = getApiKey(), model = process.env.GEMINI_MODEL || DEFAULT_MODEL }) => {
  const configuredKey = String(apiKey || '').trim();
  if (!configuredKey) throw new Error('AI provider is not configured');
  const prompt = [
    'You are a cautious farm performance advisor. Write in plain language for a pig farmer.',
    'Interpret only the supplied deterministic figures, recorded growth snapshots, recorded expenses, and clearly labeled estimates.',
    'Do not calculate or alter monetary totals, growth rates, age, or estimated profit. Do not invent missing records, costs, prices, growth, revenue, causes, or projections.',
    'Call the result an estimated standing-value margin, not realized profit: standing value minus recorded costs in the selected expense period is not a full lifecycle profit or accounting result.',
    'Discuss recorded weight gain and age only when valid dated snapshots support it. Distinguish measured growth history from auto-calculated feed-based weight updates.',
    'If any costs, price, growth, weight, or batch allocation are incomplete, state that clearly and avoid a confident profitability conclusion.',
    'Return JSON only in this exact shape:',
    '{"analysis":"evidence-based interpretation","suggestion":"specific practical next step","riskLevel":"low|medium|high|unknown","actions":["action"],"limitations":["limitation"]}',
    `Deterministic analysis context: ${JSON.stringify(context)}`,
  ].join('\n');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': configuredKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 512 } }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  const payload = await response.json();
  if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
  const structured = parseJson(extractText(payload));
  if (!structured || typeof structured.analysis !== 'string' || typeof structured.suggestion !== 'string') {
    throw new Error('AI provider returned invalid structured profit analysis');
  }
  return {
    success: true,
    provider: 'gemini',
    model,
    analysis: structured.analysis,
    suggestion: structured.suggestion,
    riskLevel: ['low', 'medium', 'high', 'unknown'].includes(String(structured.riskLevel).toLowerCase()) ? String(structured.riskLevel).toLowerCase() : 'unknown',
    actions: Array.isArray(structured.actions) ? structured.actions.filter((item) => typeof item === 'string').slice(0, 5) : [],
    limitations: Array.isArray(structured.limitations) ? structured.limitations.filter((item) => typeof item === 'string').slice(0, 6) : [],
    generatedAt: new Date().toISOString(),
  };
};
