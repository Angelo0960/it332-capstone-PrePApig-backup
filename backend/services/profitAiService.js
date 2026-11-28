import 'dotenv/config';
import { getGeminiModel } from './geminiModel.js';
import { requestGeminiApi, runCachedAiAnalysis } from './aiGovernanceService.js';

const getApiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY || '';
const extractText = (payload) => payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
const parseJson = (text) => {
  try { return JSON.parse(text); } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
};

export const getProfitAnalysisGenerationConfig = () => ({
  responseMimeType: 'application/json',
  responseJsonSchema: {
    type: 'object',
    properties: {
      analysis: { type: 'string' },
      suggestion: { type: 'string' },
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'unknown'] },
      actions: { type: 'array', items: { type: 'string' } },
      limitations: { type: 'array', items: { type: 'string' } },
    },
    required: ['analysis', 'suggestion', 'riskLevel', 'actions', 'limitations'],
  },
  thinkingConfig: { thinkingLevel: 'LOW' },
  maxOutputTokens: 65_536,
});

const generateProfitAnalysisUncached = async ({ context, fetchImpl = fetch, apiKey = getApiKey(), model = getGeminiModel(), requestGemini = requestGeminiApi }) => {
  const provider = 'Gemini';
  const configuredKey = String(apiKey || '').trim();
  const configuredModel = model;
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
  const timeout = setTimeout(() => controller.abort(), 75_000);
  let payload;
  let responseStatus = 200;
  try {
    const result = await requestGemini({
      model: configuredModel,
      feature: 'profit_analysis',
      apiKey: configuredKey,
      fetchImpl,
      signal: controller.signal,
      timeoutMs: 30000,
      maxRetries: 1,
      body: {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: getProfitAnalysisGenerationConfig(),
      },
    });
    payload = result.payload;
  } finally {
    clearTimeout(timeout);
  }
  const finishReason = payload?.candidates?.[0]?.finishReason || 'unknown';
  const responseText = extractText(payload);
  const structured = parseJson(responseText);
  if (!structured || typeof structured.analysis !== 'string' || typeof structured.suggestion !== 'string') {
    const error = new Error(`${provider} returned incomplete structured profit analysis (finish reason: ${finishReason})`);
    error.providerStatus = responseStatus;
    error.providerCode = finishReason;
    error.category = 'provider_error';
    error.model = payload?.modelVersion || configuredModel;
    error.responseId = payload?.responseId || null;
    error.modelVersion = payload?.modelVersion || null;
    error.usageMetadata = payload?.usageMetadata || null;
    throw error;
  }
  return {
    success: true,
    provider: 'gemini',
    model: configuredModel,
    analysis: structured.analysis,
    suggestion: structured.suggestion,
    riskLevel: ['low', 'medium', 'high', 'unknown'].includes(String(structured.riskLevel).toLowerCase()) ? String(structured.riskLevel).toLowerCase() : 'unknown',
    actions: Array.isArray(structured.actions) ? structured.actions.filter((item) => typeof item === 'string').slice(0, 5) : [],
    limitations: Array.isArray(structured.limitations) ? structured.limitations.filter((item) => typeof item === 'string').slice(0, 6) : [],
    generatedAt: new Date().toISOString(),
  };
};

export const generateProfitAnalysis = async ({ context, ownerId, cacheScope, fetchImpl = fetch, apiKey = getApiKey(), model = getGeminiModel(), requestGemini = requestGeminiApi }) => {
  if (!ownerId) return generateProfitAnalysisUncached({ context, fetchImpl, apiKey, model, requestGemini });
  const cacheModel = model;
  return runCachedAiAnalysis({
    ownerId,
    feature: 'profit_analysis',
    model: cacheModel,
    cacheScope: cacheScope ?? 'profit-analysis',
    promptVersion: 'profit-analysis-v1',
    sourceData: context,
    generate: () => generateProfitAnalysisUncached({ context, fetchImpl, apiKey, model, requestGemini }),
  });
};
