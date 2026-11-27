import assert from 'node:assert/strict';
import test from 'node:test';
import { toPigWeightHistoryRows } from '../src/utils/pigWeightHistory.js';

test('weight-history rows flatten pig measurements and mark the latest entry per pig', () => {
  const pigs = [
    {
      id: 'pig-a', weight: 31, updated_at: '2026-11-20T10:00:00Z',
      weight_history: [
        { id: 'a-1', weigh_in_date: '2026-11-01', age_days: 120, recorded_weight: 25 },
        { id: 'a-2', weigh_in_date: '2026-11-20', age_days: 139, recorded_weight: 31 },
      ],
    },
    {
      id: 'pig-b', weight: 22, updated_at: '2026-11-18T10:00:00Z',
      weight_history: [
        { id: 'b-1', weigh_in_date: '2026-11-18', age_days: 80, recorded_weight: 22 },
      ],
    },
  ];

  assert.deepEqual(toPigWeightHistoryRows(pigs).map(({ pigId, recordId, weighInDate, ageDays, recordedWeight, isLatest }) => ({
    pigId, recordId, weighInDate, ageDays, recordedWeight, isLatest,
  })), [
    { pigId: 'pig-a', recordId: 'a-2', weighInDate: '2026-11-20', ageDays: 139, recordedWeight: 31, isLatest: true },
    { pigId: 'pig-b', recordId: 'b-1', weighInDate: '2026-11-18', ageDays: 80, recordedWeight: 22, isLatest: true },
    { pigId: 'pig-a', recordId: 'a-1', weighInDate: '2026-11-01', ageDays: 120, recordedWeight: 25, isLatest: false },
  ]);
});

test('weight-history rows identify migration baseline snapshots', () => {
  const [row] = toPigWeightHistoryRows([{
    id: 'pig-d',
    weight: 21,
    weight_history: [{
      id: 'baseline-1',
      weigh_in_date: '2026-10-30',
      age_days: 75,
      recorded_weight: 21,
      is_baseline: true,
    }],
  }]);

  assert.equal(row.isSnapshot, true);
});

test('weight-history rows fall back to one current snapshot for stale cached pigs', () => {
  const rows = toPigWeightHistoryRows([
    { id: 'pig-c', weight: 19.5, updated_at: '2026-10-30T12:30:00Z' },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].pigId, 'pig-c');
  assert.equal(rows[0].weighInDate, '2026-10-30');
  assert.equal(rows[0].ageDays, null);
  assert.equal(rows[0].recordedWeight, 19.5);
  assert.equal(rows[0].isLatest, true);
  assert.equal(rows[0].isSnapshot, true);
});
