import assert from 'node:assert/strict';
import test from 'node:test';
import { attachWeightHistoryToPigs, groupWeightHistoryByPig } from '../services/pigWeightHistory.js';

test('groups weigh-in records under the matching pig without leaking them across pigs', () => {
  const grouped = groupWeightHistoryByPig([
    { pig_id: 'pig-a', id: 'entry-a', recorded_weight: 31 },
    { pig_id: 'pig-b', id: 'entry-b', recorded_weight: 18 },
    { pig_id: 'pig-a', id: 'entry-a2', recorded_weight: 26 },
  ]);

  assert.deepEqual(grouped.get('pig-a').map(({ id }) => id), ['entry-a', 'entry-a2']);
  assert.deepEqual(grouped.get('pig-b').map(({ id }) => id), ['entry-b']);
  assert.equal(grouped.get('pig-c'), undefined);
});

test('attaches empty unavailable histories without inventing a current snapshot', () => {
  const pigs = attachWeightHistoryToPigs([
    { id: 'pig-a', weight: 31 },
    { id: 'pig-b', weight: 18 },
  ], [], false);

  assert.deepEqual(pigs.map(({ id, weight, weight_history, weight_history_available }) => ({
    id, weight, weight_history, weight_history_available,
  })), [
    { id: 'pig-a', weight: 31, weight_history: [], weight_history_available: false },
    { id: 'pig-b', weight: 18, weight_history: [], weight_history_available: false },
  ]);
});
