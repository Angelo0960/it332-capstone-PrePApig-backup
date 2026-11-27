import assert from 'node:assert/strict';
import test from 'node:test';
import { toIndividualPigTableRows } from '../src/utils/individualPigTable.js';

test('individual pig table rows expose each pig and its management details', () => {
  const pigs = [
    { id: 'pig-1', weight: 24.5, health_status: 'Healthy', notes: 'Booster due soon' },
    { id: 'pig-2', weight: 31, health_status: 'Recovering', notes: '' },
  ];

  assert.deepEqual(toIndividualPigTableRows(pigs), [
    { id: 'pig-1', weight: 24.5, healthStatus: 'Healthy', notes: 'Booster due soon', pig: pigs[0] },
    { id: 'pig-2', weight: 31, healthStatus: 'Recovering', notes: '', pig: pigs[1] },
  ]);
});

test('individual pig table rows handle absent health and notes', () => {
  const pig = { id: 12, weight: 0 };
  assert.deepEqual(toIndividualPigTableRows([pig]), [
    { id: 12, weight: 0, healthStatus: 'Unknown', notes: '', pig },
  ]);
});
