import assert from 'node:assert/strict';
import test from 'node:test';
import { generateProfitAnalysis, getProfitAnalysisGenerationConfig } from '../services/profitAiService.js';

test('Gemini profit output config constrains the required JSON fields and allows adequate reasoning headroom', () => {
  const config = getProfitAnalysisGenerationConfig();

  assert.equal(config.responseMimeType, 'application/json');
  assert.equal(config.maxOutputTokens, 65_536);
  assert.equal(config.thinkingConfig.thinkingLevel, 'LOW');
  assert.equal(config.responseJsonSchema.type, 'object');
  assert.equal(config.responseJsonSchema.properties.analysis.type, 'string');
  assert.equal(config.responseJsonSchema.properties.actions.type, 'array');
  assert.deepEqual(config.responseJsonSchema.required, ['analysis', 'suggestion', 'riskLevel', 'actions', 'limitations']);
  assert.deepEqual(config.responseJsonSchema.properties.riskLevel.enum, ['low', 'medium', 'high', 'unknown']);
});

test('profit analysis sends schema-constrained Gemini JSON and parses the required fields', async () => {
  let request;
  const result = await generateProfitAnalysis({
    context: { totalRecordedCostsPhp: 1000 },
    apiKey: 'test-key',
    model: 'gemini-3.8-flash',
    requestGemini: async (options) => {
      request = options;
      return { payload: { modelVersion: 'gemini-3.8-flash', candidates: [{
        finishReason: 'STOP',
        content: { parts: [{ text: JSON.stringify({
          analysis: 'Costs exceed estimated value.',
          suggestion: 'Review feed expenses.',
          riskLevel: 'medium',
          actions: ['Compare feed costs.'],
          limitations: ['No sale is recorded.'],
        }) }] },
      }] } };
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.model, 'gemini-3.8-flash');
  assert.equal(result.analysis, 'Costs exceed estimated value.');
  assert.deepEqual(request.body.generationConfig, getProfitAnalysisGenerationConfig());
  assert.equal(request.maxRetries, 1);
  assert.equal(request.timeoutMs, 30_000);
});

test('profit analysis uses Gemini even when an OpenAI endpoint override is configured', async () => {
  const previousEnvironment = {
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  };
  process.env.OPENAI_BASE_URL = 'https://provider.example/v1';
  process.env.OPENAI_API_KEY = 'synthetic-openai-key';
  process.env.OPENAI_MODEL = 'synthetic-openai-model';
  let geminiCalls = 0;
  let openAiRequests = 0;

  try {
    const result = await generateProfitAnalysis({
      context: { totalRecordedCostsPhp: 1000 },
      apiKey: 'synthetic-gemini-key',
      model: 'gemini-3.8-flash',
      requestGemini: async () => {
        geminiCalls += 1;
        return { payload: { modelVersion: 'gemini-3.8-flash', candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify({
            analysis: 'Costs exceed estimated value.',
            suggestion: 'Review feed expenses.',
            riskLevel: 'medium',
            actions: ['Compare feed costs.'],
            limitations: ['No sale is recorded.'],
          }) }] },
        }] } };
      },
      fetchImpl: async () => {
        openAiRequests += 1;
        return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
          analysis: 'OpenAI analysis.',
          suggestion: 'OpenAI suggestion.',
          riskLevel: 'low',
          actions: [],
          limitations: [],
        }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    });

    assert.equal(result.provider, 'gemini');
    assert.equal(result.model, 'gemini-3.8-flash');
    assert.equal(geminiCalls, 1);
    assert.equal(openAiRequests, 0);
  } finally {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('incomplete model output is classified and includes its finish reason', async () => {
  await assert.rejects(generateProfitAnalysis({
    context: {},
    apiKey: 'test-key',
    model: 'gemini-3.8-flash',
    requestGemini: async () => ({ payload: { modelVersion: 'gemini-3.8-flash', candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }] } }),
  }), (error) => error.category === 'provider_error' && error.providerCode === 'MAX_TOKENS');
});
