import assert from 'node:assert/strict';
import test from 'node:test';

const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
const testSupabaseKey = `eyJhbGciOiJub25lIn0.${payload}.test`;
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = testSupabaseKey;
process.env.SUPABASE_ANON_KEY = testSupabaseKey;

const { default: reportRouter } = await import('../routes/reportRoutes.js');

test('profit-analysis route is not wrapped in a route-level rate limiter', () => {
  const layer = reportRouter.stack.find((item) => item.route?.path === '/ai-profit-analysis');
  assert.ok(layer, 'profit-analysis route is registered');
  assert.deepEqual(layer.route.stack.map((handler) => handler.name), ['generateAiProfitAnalysis']);
});
