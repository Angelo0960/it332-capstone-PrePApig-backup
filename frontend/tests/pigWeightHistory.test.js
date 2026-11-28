import assert from 'node:assert/strict';
import test from 'node:test';
import { getPigWeightHistoryRows } from '../src/utils/pigWeightHistory.js';

test('builds per-pig chronological history with changes from the prior weigh-in', () => {
  const rows = getPigWeightHistoryRows({
    id: 'pig-1',
    weight_history: [
      { id: 'new', weigh_in_date: '2026-11-20', recorded_weight: 31, age_days: 139 },
      { id: 'base', weigh_in_date: '2026-11-01', recorded_weight: 25, age_days: 120, is_baseline: true, baseline_source: 'batch_start' },
    ],
  });

  assert.deepEqual(rows.map(({ recordId, weighInDate, recordedWeight, changeKg, isBaseline, baselineLabel }) => ({
    recordId, weighInDate, recordedWeight, changeKg, isBaseline, baselineLabel,
  })), [
    { recordId: 'base', weighInDate: '2026-11-01', recordedWeight: 25, changeKg: null, isBaseline: true, baselineLabel: 'Batch start weight baseline' },
    { recordId: 'new', weighInDate: '2026-11-20', recordedWeight: 31, changeKg: 6, isBaseline: false, baselineLabel: null },
  ]);
});

test('does not invent a historical row when a pig has no stored weigh-ins', () => {
  assert.deepEqual(getPigWeightHistoryRows({ id: 'pig-2', weight: 42 }), []);
});

test('does not claim an unknown baseline came from batch acquisition', () => {
  const [row] = getPigWeightHistoryRows({
    id: 'pig-3',
    weight_history: [{ id: 'legacy', weigh_in_date: '2026-11-01', recorded_weight: 24, is_baseline: true }],
  });

  assert.equal(row.baselineLabel, 'Baseline snapshot; provenance unavailable');
});
