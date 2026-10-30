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

export const generateExpenseAnalysis = async ({ summary, fetchImpl = fetch, apiKey = getApiKey(), model = process.env.GEMINI_MODEL || DEFAULT_MODEL }) => {
  const configuredKey = String(apiKey || '').trim();
  if (!configuredKey) throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY in the backend environment.');
  const prompt = [
    'You are a farm-cost planning advisor reviewing recorded pig-farm expenses.',
    'Use only the supplied recorded expense totals and categories. Do not invent costs, revenue, prices, causes, or operational facts.',
    'Explain which expense categories contribute most, identify concentration or unusually large categories only when supported by the supplied percentages, and suggest practical cost-control or recordkeeping actions.',
    'Keep recorded expenses separate from feed usage and current-price estimates. Do not treat estimates as recorded expenses.',
    'Return JSON only in this exact shape:',
    '{"analysis":"short evidence-based analysis","suggestion":"specific actionable suggestion","riskLevel":"low|medium|high|unknown","actions":["action"],"limitations":["limitation"]}',
    `Recorded expense summary: ${JSON.stringify(summary)}`,
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
  const structured = parseJson(extractText(payload));
  if (!structured) throw new Error('Gemini did not return structured expense analysis');
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
