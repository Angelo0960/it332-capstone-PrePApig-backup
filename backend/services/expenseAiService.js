import 'dotenv/config';
import { getGeminiModel } from './geminiModel.js';
import { requestOpenAiJson, isOpenAiBaseUrlConfigured } from './openAiEndpoint.js';

const getApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY || '';
const extractText = (payload) => payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
const parseJson = (text) => {
  try { return JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
};

export const generateExpenseAnalysis = async ({ summary, fetchImpl = fetch, apiKey = getApiKey(), model = getGeminiModel() }) => {
  const useOpenAi = isOpenAiBaseUrlConfigured();
  const provider = useOpenAi ? 'OpenAI' : 'Gemini';
  const configuredKey = String(useOpenAi ? process.env.OPENAI_API_KEY || '' : apiKey || '').trim();
  const configuredModel = useOpenAi ? process.env.OPENAI_MODEL || 'gpt-4.1-mini' : model;
  if (!configuredKey) throw new Error(`${provider} is selected but its API key is not configured.`);
  const prompt = [
    'Write for a pig farmer using simple everyday language. Use short sentences and explain any unavoidable expense or financial term immediately.',
    'Do not use technical model terms, statistical jargon, abbreviations, or unexplained phrases. Clearly say what the farmer should do next.',
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
  let payload;
  try {
    if (useOpenAi) {
      ({ payload } = await requestOpenAiJson({
        endpoint: 'chatCompletions',
        fetchImpl,
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${configuredKey}` },
          body: JSON.stringify({ model: configuredModel, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2, stream: false }),
          signal: controller.signal,
        },
      }));
    } else {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${configuredModel}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': configuredKey },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
        signal: controller.signal,
      });
      payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message || `${provider} returned HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
  const openAiText = payload?.choices?.[0]?.message?.content;
  const responseText = useOpenAi
    ? typeof openAiText === 'string' ? openAiText.trim() : Array.isArray(openAiText) ? openAiText.map((part) => part?.text || '').join('').trim() : ''
    : extractText(payload);
  const structured = parseJson(responseText);
  if (!structured) throw new Error(`${provider} did not return structured expense analysis`);
  return {
    success: true,
    provider: useOpenAi ? 'openai' : 'gemini',
    model: configuredModel,
    analysis: structured.analysis || '',
    suggestion: structured.suggestion || '',
    riskLevel: structured.riskLevel || 'unknown',
    actions: Array.isArray(structured.actions) ? structured.actions : [],
    limitations: Array.isArray(structured.limitations) ? structured.limitations : [],
    generatedAt: new Date().toISOString(),
  };
};

export { extractText, parseJson };
