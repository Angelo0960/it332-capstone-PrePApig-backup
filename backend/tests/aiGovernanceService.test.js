import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiGovernanceService, classifyGeminiFailure, getGeminiModelBudget } from '../services/aiGovernanceService.js';

const makeStorage = () => {
  const cache = new Map();
  const locks = new Map();
  const usage = [];
  return {
    cache,
    usage,
    async getAnalysisCache(key) { return cache.get(key) || null; },
    async saveAnalysisCache(record) { cache.set(record.cacheKey, record); },
    async claimAnalysis(key, token, leaseMs, now) {
      const lock = locks.get(key);
      if (lock && lock.expiresAt > now) return false;
      locks.set(key, { token, expiresAt: now + leaseMs });
      return true;
    },
    async releaseAnalysis(key, token) {
      if (locks.get(key)?.token === token) locks.delete(key);
    },
    async reserveGeminiRequest(model, feature, budget, requestId, now) {
      const minuteCount = usage.filter((entry) => entry.model === model && now - entry.at < 60_000).length;
      const dayCount = usage.filter((entry) => entry.model === model && now - entry.at < 86_400_000).length;
      if (dayCount >= budget.daily) return { allowed: false, category: 'quota_daily', retryAfterSeconds: 3600 };
      if (minuteCount >= budget.rpm) return { allowed: false, category: 'quota_rpm', retryAfterSeconds: 60 };
      const event = { id: usage.length + 1, model, feature, at: now, status: 'started' };
      usage.push(event);
      return { allowed: true, usageId: event.id, minuteCount: minuteCount + 1, dailyCount: dayCount + 1 };
    },
    async finishGeminiRequest(id, result) {
      const event = usage.find((entry) => entry.id === id);
      if (event) Object.assign(event, result);
    },
  };
};

test('uses conservative per-model budgets from the provider limits', () => {
  assert.deepEqual(getGeminiModelBudget('gemini-3.6-flash'), { rpm: 4, daily: 16 });
  assert.deepEqual(getGeminiModelBudget('gemini-3.5-flash-lite'), { rpm: 12, daily: 400 });
  assert.deepEqual(getGeminiModelBudget('unlisted-model'), { rpm: 4, daily: 16 });
});

test('classifies daily quota, temporary rate limit, permission, authentication, and network failures', () => {
  assert.equal(classifyGeminiFailure({ status: 429, payload: { error: { status: 'RESOURCE_EXHAUSTED', message: 'Requests per day quota exceeded' } } }).category, 'quota_daily');
  assert.equal(classifyGeminiFailure({ status: 429, payload: { error: { status: 'RESOURCE_EXHAUSTED', message: 'Requests per minute quota exceeded' } } }).category, 'quota_rpm');
  assert.equal(classifyGeminiFailure({ status: 403, payload: { error: { status: 'PERMISSION_DENIED', message: 'Forbidden' } } }).category, 'permission');
  assert.equal(classifyGeminiFailure({ status: 401, payload: { error: { status: 'UNAUTHENTICATED', message: 'Invalid API key' } } }).category, 'authentication');
  assert.equal(classifyGeminiFailure({ error: new TypeError('network down') }).category, 'network');
});

test('persists successful analysis for 24 hours and invalidates it when source input changes', async () => {
  const storage = makeStorage();
  let now = 1_000_000;
  let calls = 0;
  const service = createAiGovernanceService({ storage, now: () => now, sleep: async () => {} });
  const first = await service.runAnalysis({
    ownerId: 'user-1', feature: 'feed', model: 'gemini-3.5-flash-lite', cacheScope: 'batch-A:1w', sourceData: { history: [1, 2] },
    generate: async () => { calls += 1; return { success: true, analysis: 'stable', generatedAt: new Date(now).toISOString() }; },
  });
  assert.equal(first.cacheMetadata.state, 'generated');
  assert.equal(Date.parse(first.cacheMetadata.expiresAt) - now, 86_400_000);

  now += 60_000;
  const hit = await service.runAnalysis({
    ownerId: 'user-1', feature: 'feed', model: 'gemini-3.5-flash-lite', cacheScope: 'batch-A:1w', sourceData: { history: [1, 2] },
    generate: async () => { calls += 1; return { success: true, analysis: 'must not run' }; },
  });
  assert.equal(hit.cacheMetadata.state, 'hit');
  assert.equal(hit.analysis, 'stable');
  assert.equal(calls, 1);

  const changed = await service.runAnalysis({
    ownerId: 'user-1', feature: 'feed', model: 'gemini-3.5-flash-lite', cacheScope: 'batch-A:1w', sourceData: { history: [1, 2, 3] },
    generate: async () => { calls += 1; return { success: true, analysis: 'changed source' }; },
  });
  assert.equal(changed.analysis, 'changed source');
  assert.equal(changed.cacheMetadata.state, 'generated');
  assert.equal(calls, 2);
});

test('returns the last successful same-source result with its timestamp when generation fails', async () => {
  const storage = makeStorage();
  let now = 1_000_000;
  const service = createAiGovernanceService({ storage, now: () => now, sleep: async () => {} });
  const input = { ownerId: 'user-1', feature: 'profit', model: 'gemini-3.5-flash-lite', cacheScope: '2026-01:all', sourceData: { costs: 20 } };
  const first = await service.runAnalysis({ ...input, generate: async () => ({ success: true, analysis: 'saved analysis' }) });
  now += 86_400_001;
  const fallback = await service.runAnalysis({ ...input, generate: async () => { const error = new Error('provider details must not leak'); error.category = 'quota_daily'; throw error; } });
  assert.equal(fallback.analysis, 'saved analysis');
  assert.equal(fallback.generatedAt, first.generatedAt);
  assert.equal(fallback.cacheMetadata.state, 'stale-fallback');
  assert.equal(fallback.cacheMetadata.error.category, 'quota_daily');
  assert.equal(JSON.stringify(fallback).includes('provider details must not leak'), false);
});

test('deduplicates simultaneous identical source requests', async () => {
  const storage = makeStorage();
  const service = createAiGovernanceService({ storage, sleep: async () => {} });
  let calls = 0;
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const input = { ownerId: 'user-1', feature: 'expense', model: 'gemini-3.5-flash-lite', cacheScope: '2026-01:all', sourceData: { total: 20 } };
  const generate = async () => { calls += 1; await pending; return { success: true, analysis: 'one result' }; };
  const first = service.runAnalysis({ ...input, generate });
  const second = service.runAnalysis({ ...input, generate });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  finish();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.analysis, 'one result');
  assert.equal(b.analysis, 'one result');
});

test('does not reuse an in-flight result after source data changes', async () => {
  const storage = makeStorage();
  const service = createAiGovernanceService({ storage, sleep: async () => {} });
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const base = { ownerId: 'user-1', feature: 'feed', model: 'gemini-3.5-flash-lite', cacheScope: 'batch-A:1w' };
  const first = service.runAnalysis({ ...base, sourceData: { history: [1] }, generate: async () => { await pending; return { success: true, analysis: 'old source' }; } });
  await new Promise((resolve) => setImmediate(resolve));
  const second = service.runAnalysis({ ...base, sourceData: { history: [1, 2] }, generate: async () => ({ success: true, analysis: 'new source' }) });
  finish();
  const [oldResult, newResult] = await Promise.all([first, second]);
  assert.equal(oldResult.analysis, 'old source');
  assert.equal(newResult.analysis, 'new source');
});

test('shares the persistent lock across service instances for identical source data', async () => {
  const storage = makeStorage();
  const options = { storage, sleep: () => new Promise((resolve) => setImmediate(resolve)) };
  const firstService = createAiGovernanceService(options);
  const secondService = createAiGovernanceService(options);
  let calls = 0;
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const input = { ownerId: 'user-1', feature: 'expense', model: 'gemini-3.5-flash-lite', cacheScope: 'scope-1', sourceData: { total: 44 } };
  const first = firstService.runAnalysis({ ...input, generate: async () => { calls += 1; await pending; return { success: true, analysis: 'shared result' }; } });
  await new Promise((resolve) => setImmediate(resolve));
  const second = secondService.runAnalysis({ ...input, generate: async () => { calls += 1; return { success: true, analysis: 'duplicate result' }; } });
  finish();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(firstResult.analysis, 'shared result');
  assert.equal(secondResult.analysis, 'shared result');
});

test('does not call Gemini after the daily app budget is exhausted', async () => {
  const storage = makeStorage();
  const now = 1_000_000;
  const budget = getGeminiModelBudget('gemini-3.6-flash');
  for (let i = 0; i < budget.daily; i += 1) storage.usage.push({ model: 'gemini-3.6-flash', at: now, status: 'success' });
  const service = createAiGovernanceService({ storage, now: () => now, sleep: async () => {} });
  let fetches = 0;
  await assert.rejects(service.requestGemini({
    model: 'gemini-3.6-flash', feature: 'feed', apiKey: 'test-key', body: {},
    fetchImpl: async () => { fetches += 1; throw new Error('must not call'); },
  }), (error) => error.category === 'quota_daily');
  assert.equal(fetches, 0);
});

test('backs off once for a temporary RPM response but never retries a daily quota response', async () => {
  const storage = makeStorage();
  const waits = [];
  const service = createAiGovernanceService({ storage, sleep: async (ms) => waits.push(ms), random: () => 0 });
  let fetches = 0;
  const result = await service.requestGemini({
    model: 'gemini-3.5-flash-lite', feature: 'feed', apiKey: 'test-key', body: {},
    fetchImpl: async () => {
      fetches += 1;
      if (fetches === 1) return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'per minute quota exceeded' } }), { status: 429 });
      return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    },
  });
  assert.deepEqual(result.payload, { candidates: [] });
  assert.equal(fetches, 2);
  assert.equal(waits.length, 1);

  const dailyStorage = makeStorage();
  const dailyService = createAiGovernanceService({ storage: dailyStorage, sleep: async () => {} });
  let dailyFetches = 0;
  await assert.rejects(dailyService.requestGemini({
    model: 'gemini-3.5-flash-lite', feature: 'feed', apiKey: 'test-key', body: {},
    fetchImpl: async () => {
      dailyFetches += 1;
      return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'per day quota exceeded' } }), { status: 429 });
    },
  }), (error) => error.category === 'quota_daily');
  assert.equal(dailyFetches, 1);
});

test('retries one transient Gemini 503 with backoff and records both attempts', async () => {
  const storage = makeStorage();
  const waits = [];
  const service = createAiGovernanceService({ storage, sleep: async (ms) => waits.push(ms), random: () => 0 });
  let attempts = 0;
  const result = await service.requestGemini({
    model: 'gemini-3.8-flash', feature: 'profit_analysis', apiKey: 'test-key', body: {}, maxRetries: 1,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'temporary overload' } }), { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), { status: 200 });
    },
  });
  assert.equal(result.payload.candidates.length, 1);
  assert.equal(attempts, 2);
  assert.equal(waits.length, 1);
  assert.deepEqual(storage.usage.map((row) => row.status), ['failed', 'success']);
});

test('retries one provider timeout unless the caller cancelled the request', async () => {
  const storage = makeStorage();
  const waits = [];
  const service = createAiGovernanceService({ storage, sleep: async (ms) => waits.push(ms), random: () => 0 });
  let attempts = 0;
  const result = await service.requestGemini({
    model: 'gemini-3.8-flash', feature: 'profit_analysis', apiKey: 'test-key', body: {}, maxRetries: 1,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('request timeout'), { name: 'AbortError' });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), { status: 200 });
    },
  });

  assert.equal(result.payload.candidates.length, 1);
  assert.equal(attempts, 2);
  assert.equal(waits.length, 1);
  assert.deepEqual(storage.usage.map((row) => row.status), ['failed', 'success']);

  const cancelled = new AbortController();
  cancelled.abort();
  let cancelledAttempts = 0;
  await assert.rejects(service.requestGemini({
    model: 'gemini-3.8-flash', feature: 'profit_analysis', apiKey: 'test-key', body: {}, maxRetries: 1, signal: cancelled.signal,
    fetchImpl: async () => { cancelledAttempts += 1; throw Object.assign(new Error('request aborted'), { name: 'AbortError' }); },
  }), (error) => error.category === 'network');
  assert.equal(cancelledAttempts, 1);
});

test('does not retry before a provider Retry-After that exceeds the bounded wait', async () => {
  const storage = makeStorage();
  const service = createAiGovernanceService({ storage, sleep: async () => {} });
  let fetches = 0;
  await assert.rejects(service.requestGemini({
    model: 'gemini-3.5-flash-lite', feature: 'feed', apiKey: 'test-key', body: {},
    fetchImpl: async () => {
      fetches += 1;
      return new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'per minute quota exceeded' } }), {
        status: 429,
        headers: { 'retry-after': '90' },
      });
    },
  }), (error) => error.category === 'quota_rpm' && error.retryAfterSeconds === 90);
  assert.equal(fetches, 1);
});

test('usage logs omit API keys and analytical prompt contents', async () => {
  const storage = makeStorage();
  const logged = [];
  const logger = Object.fromEntries(['info', 'warn', 'error'].map((level) => [level, (value) => logged.push(value)]));
  const service = createAiGovernanceService({ storage, logger });
  await service.requestGemini({
    model: 'gemini-3.5-flash-lite', feature: 'expense', apiKey: 'secret-api-key', body: { prompt: 'private farmer data' },
    fetchImpl: async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
  });
  const logs = logged.join('\n');
  assert.equal(logs.includes('secret-api-key'), false);
  assert.equal(logs.includes('private farmer data'), false);
});
