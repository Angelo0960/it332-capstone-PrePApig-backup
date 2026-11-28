import assert from 'node:assert/strict';
import test from 'node:test';
import { toPigWeightHistoryRows } from '../src/utils/pigWeightHistory.js';

test('weight-history rows group each pig chronologically and calculate the change from the previous weigh-in', () => {
  const pigs = [
    {
      id: 'pig-a', weight: 12.9, updated_at: '2026-11-03T10:00:00Z',
      weight_history: [
        { id: 'a-3', weigh_in_date: '2026-11-03', age_days: 122, recorded_weight: 12.9 },
        { id: 'a-1', weigh_in_date: '2026-11-01', age_days: 120, recorded_weight: 12 },
        { id: 'a-2', weigh_in_date: '2026-11-02', age_days: 121, recorded_weight: 13.1 },
      ],
    },
    {
      id: 'pig-b', weight: 22, updated_at: '2026-11-01T10:00:00Z',
      weight_history: [
        { id: 'b-1', weigh_in_date: '2026-11-01', age_days: 80, recorded_weight: 22 },
      ],
    },
  ];

  assert.deepEqual(toPigWeightHistoryRows(pigs).map(({ pigId, recordId, weighInDate, ageDays, recordedWeight, dailyChange, isLatest }) => ({
    pigId, recordId, weighInDate, ageDays, recordedWeight, dailyChange, isLatest,
  })), [
    { pigId: 'pig-a', recordId: 'a-1', weighInDate: '2026-11-01', ageDays: 120, recordedWeight: 12, dailyChange: null, isLatest: false },
    { pigId: 'pig-a', recordId: 'a-2', weighInDate: '2026-11-02', ageDays: 121, recordedWeight: 13.1, dailyChange: 1.1, isLatest: false },
    { pigId: 'pig-a', recordId: 'a-3', weighInDate: '2026-11-03', ageDays: 122, recordedWeight: 12.9, dailyChange: -0.2, isLatest: true },
    { pigId: 'pig-b', recordId: 'b-1', weighInDate: '2026-11-01', ageDays: 80, recordedWeight: 22, dailyChange: null, isLatest: true },
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
