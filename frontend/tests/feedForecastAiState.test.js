import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldResetFeedForecastAi } from '../src/utils/feedForecastAiState.js';

test('keeps feed AI analysis when only the forecast data refreshes for the same selection', () => {
  assert.equal(shouldResetFeedForecastAi('All Batches', 'All Batches'), false);
});

test('resets feed AI analysis when the selected batch changes', () => {
  assert.equal(shouldResetFeedForecastAi('Batch A', 'Batch B'), true);
});
