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

export const generateProfitAnalysis = async ({ context, fetchImpl = fetch, apiKey = getApiKey(), model = getGeminiModel() }) => {
  const useOpenAi = isOpenAiBaseUrlConfigured();
  const provider = useOpenAi ? 'OpenAI' : 'Gemini';
  const configuredKey = String(useOpenAi ? process.env.OPENAI_API_KEY || '' : apiKey || '').trim();
  const configuredModel = useOpenAi ? process.env.OPENAI_MODEL || 'gpt-4.1-mini' : model;
  if (!configuredKey) throw new Error(`${provider} is selected but its API key is not configured.`);
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
  let payload;
  let responseStatus = 200;
  try {
    if (useOpenAi) {
      try {
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
      } catch (error) {
        error.model = error.model || configuredModel;
        throw error;
      }
    } else {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${configuredModel}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': configuredKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: 'MINIMAL' },
            maxOutputTokens: 4096,
          },
        }),
        signal: controller.signal,
      });
      responseStatus = response.status;
      payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload?.error?.message || `${provider} returned HTTP ${response.status}`);
        error.providerStatus = responseStatus;
        error.providerCode = payload?.error?.status || payload?.error?.code || null;
        error.model = configuredModel;
        throw error;
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  const finishReason = useOpenAi
    ? payload?.choices?.[0]?.finish_reason || 'unknown'
    : payload?.candidates?.[0]?.finishReason || 'unknown';
  const openAiText = payload?.choices?.[0]?.message?.content;
  const responseText = useOpenAi
    ? typeof openAiText === 'string' ? openAiText.trim() : Array.isArray(openAiText) ? openAiText.map((part) => part?.text || '').join('').trim() : ''
    : extractText(payload);
  const structured = parseJson(responseText);
  if (!structured || typeof structured.analysis !== 'string' || typeof structured.suggestion !== 'string') {
    const error = new Error(`${provider} returned incomplete structured profit analysis (finish reason: ${finishReason})`);
    error.providerStatus = responseStatus;
    error.providerCode = finishReason;
    error.model = payload?.modelVersion || configuredModel;
    error.responseId = payload?.responseId || null;
    error.modelVersion = payload?.modelVersion || null;
    error.usageMetadata = payload?.usageMetadata || null;
    throw error;
  }
  return {
    success: true,
    provider: useOpenAi ? 'openai' : 'gemini',
    model: configuredModel,
    analysis: structured.analysis,
    suggestion: structured.suggestion,
    riskLevel: ['low', 'medium', 'high', 'unknown'].includes(String(structured.riskLevel).toLowerCase()) ? String(structured.riskLevel).toLowerCase() : 'unknown',
    actions: Array.isArray(structured.actions) ? structured.actions.filter((item) => typeof item === 'string').slice(0, 5) : [],
    limitations: Array.isArray(structured.limitations) ? structured.limitations.filter((item) => typeof item === 'string').slice(0, 6) : [],
    generatedAt: new Date().toISOString(),
  };
};
