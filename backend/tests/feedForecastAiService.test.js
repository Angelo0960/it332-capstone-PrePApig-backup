import assert from 'node:assert/strict';
import test from 'node:test';

const jwtHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const jwtPayload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
const testSupabaseKey = `${jwtHeader}.${jwtPayload}.test-signature`;
process.env.JWT_SECRET = 'feed-provider-order-test-secret-not-a-credential';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = testSupabaseKey;
process.env.SUPABASE_ANON_KEY = testSupabaseKey;
process.env.OPENAI_BASE_URL = 'https://provider.example/v1';
process.env.OPENAI_API_KEY = 'synthetic-openai-key';
process.env.OPENAI_MODEL = 'synthetic-openai-model';
process.env.OPENROUTER_API_KEY = 'synthetic-openrouter-key';
process.env.OPENROUTER_MODEL = 'synthetic-openrouter-model';
process.env.GEMINI_API_KEY = 'synthetic-gemini-key';
process.env.GEMINI_MODEL = 'gemini-3.8-flash';

const { generateFeedForecastAnalysis } = await import('../services/feedForecastAiService.js');

const forecast = { status: 'forecasted', calculatedMetrics: [], forecast: [], rationForecasts: [] };
const structured = {
  analysis: 'Recorded stock can be compared with the forecast.',
  suggestion: 'Review the feed plan before ordering.',
  riskLevel: 'low',
  actions: ['Review stock coverage.'],
  limitations: ['This is a planning estimate.'],
};

test('tries Gemini before OpenAI even when OPENAI_BASE_URL is set', async () => {
  const providerAttempts = [];
  const fallbackFetchRequests = [];
  const result = await generateFeedForecastAnalysis({
    forecast,
    requestProviderImpl: async ({ provider, model }) => {
      providerAttempts.push(provider);
      return { structured, provider, model };
    },
    fetchImpl: async (url) => {
      fallbackFetchRequests.push(String(url));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(structured) } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  assert.deepEqual(providerAttempts, ['gemini']);
  assert.deepEqual(fallbackFetchRequests, []);
  assert.equal(result.provider, 'gemini');
  assert.equal(result.model, 'gemini-3.8-flash');
});
