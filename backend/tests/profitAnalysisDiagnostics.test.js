import assert from 'node:assert/strict';
import test from 'node:test';
import { runProfitAiStage } from '../services/profitAnalysisDiagnostics.js';

test('failed profit-analysis stage logs request ID, stage, duration, and sanitized error metadata', async () => {
  const lines = [];
  let now = 100;
  const error = Object.assign(new Error('column unit_price_at_usage is missing; API_KEY=AIzaSy123456789012345678901234567890'), {
    code: '42703',
  });
  const logger = {
    info: (line) => lines.push(line),
    error: (line) => lines.push(line),
  };

  await assert.rejects(runProfitAiStage({
    requestId: 'profit-request-test',
    stage: 'load_feed_records',
    run: async () => { now = 118; throw error; },
    logger,
    now: () => now,
  }), (caught) => caught === error);

  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.equal(event.event, 'profit_ai_stage_failed');
  assert.equal(event.requestId, 'profit-request-test');
  assert.equal(event.stage, 'load_feed_records');
  assert.equal(event.durationMs, 18);
  assert.equal(event.errorCode, '42703');
  assert.match(event.errorMessage, /unit_price_at_usage/);
  assert.doesNotMatch(event.errorMessage, /AIza|API_KEY=/);
});

test('successful profit-analysis stage logs completion and returns its result', async () => {
  const lines = [];
  let now = 10;
  const result = await runProfitAiStage({
    requestId: 'profit-request-test',
    stage: 'load_batches',
    run: async () => { now = 15; return [{ id: 'batch-id' }]; },
    logger: { info: (line) => lines.push(line), error: (line) => lines.push(line) },
    now: () => now,
  });

  assert.deepEqual(result, [{ id: 'batch-id' }]);
  assert.equal(JSON.parse(lines[0]).event, 'profit_ai_stage_completed');
  assert.equal(JSON.parse(lines[0]).durationMs, 5);
});
