import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldFetchFeedForecast } from '../src/utils/feedForecastCache.js';

const successfulForecast = {
  status: 'forecasted',
  aiAnalysis: { success: true, analysis: 'Feed needs are stable.' },
};

test('reuses a fresh forecast with a successful AI analysis', () => {
  assert.equal(shouldFetchFeedForecast({ cached: successfulForecast, isFresh: true }), false);
});

test('does not call the API again during the short AI failure cooldown', () => {
  assert.equal(shouldFetchFeedForecast({
    cached: { status: 'forecasted', aiAnalysisError: 'AI temporarily unavailable' },
    isFresh: true,
    isRetrySuppressed: true,
  }), false);
});

test('retries after an AI failure cooldown expires', () => {
  assert.equal(shouldFetchFeedForecast({
    cached: { status: 'forecasted', aiAnalysisError: 'AI temporarily unavailable' },
    isFresh: true,
  }), true);
});

test('refreshes stale successful AI analysis', () => {
  assert.equal(shouldFetchFeedForecast({ cached: successfulForecast, isFresh: false }), true);
});

test('does not retry a fresh forecast that has no forecastable data', () => {
  assert.equal(shouldFetchFeedForecast({ cached: { status: 'insufficient_history' }, isFresh: true }), false);
});

test('loads when no cached forecast exists', () => {
  assert.equal(shouldFetchFeedForecast({ cached: null, isFresh: false }), true);
});
