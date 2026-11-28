import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';

const jwtSecret = 'route-smoke-test-secret-is-not-a-credential';
const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const encodedPayload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
const testSupabaseKey = `${encodedHeader}.${encodedPayload}.test-signature`;
process.env.JWT_SECRET = jwtSecret;
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = testSupabaseKey;
process.env.SUPABASE_ANON_KEY = testSupabaseKey;
for (const key of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY']) {
  delete process.env[key];
}

const [{ default: feedRouter }, { default: expensesRouter }, { default: reportRouter }, { default: marketPriceRouter }] = await Promise.all([
  import('../routes/feedRoutes.js'),
  import('../routes/expensesRoutes.js'),
  import('../routes/reportRoutes.js'),
  import('../routes/marketPriceRoutes.js'),
]);

const app = express();
app.use(express.json());
app.use('/feeds', feedRouter);
app.use('/expenses', expensesRouter);
app.use('/reports', reportRouter);
app.use('/market-prices', marketPriceRouter);
let server;
let baseUrl;
const token = jwt.sign({ id: '00000000-0000-4000-8000-000000000001', email: 'route-smoke@example.invalid' }, jwtSecret);

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

const request = (path, body) => fetch(`${baseUrl}${path}`, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test('deterministic uploaded-feed forecast route works without an AI provider', async () => {
  const response = await request('/feeds/forecast?source=uploaded_historical&batch_id=all&horizon_weeks=1');
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.status, 'forecasted');
  assert.ok(Array.isArray(result.forecast));
  assert.equal(Object.hasOwn(result, 'aiAnalysis'), false);
});

test('expense AI endpoint validates its payload before provider access', async () => {
  const response = await request('/expenses/ai-analysis', { summary: {} });
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.success, false);
});

test('profit AI endpoint validates its date range before database or provider access', async () => {
  const response = await request('/reports/ai-profit-analysis', {});
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.success, false);
});

test('pig-price AI endpoint validates locations before source or provider access', async () => {
  const response = await request('/market-prices/pigs/ai-analysis', { locations: 'not-an-array' });
  const result = await response.json();
  assert.equal(response.status, 400);
  assert.equal(result.success, false);
});
