import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFeedDonePayload,
  buildVaccinationDonePayload,
} from '../src/utils/markDonePayloads.js';

const now = new Date('2026-10-07T12:34:56.000Z');

test('vaccination mark-done builds the expected complete payload', () => {
  const payload = buildVaccinationDonePayload({
    batchId: 'batch-1',
    vaccineName: 'Swine Fever',
    doses: '12',
    now,
  });

  assert.deepEqual(payload, {
    batch_id: 'batch-1',
    vaccine_name: 'Swine Fever',
    vaccination_date: '2026-10-07',
    dosage: 12,
    notes: 'Marked as done via schedule',
    next_due_date: '2026-11-06',
    administered_by: 'Farmer',
    status: 'Completed',
  });
});

test('vaccination mark-done converts decimal and invalid doses safely', () => {
  assert.equal(buildVaccinationDonePayload({ batchId: 'b', vaccineName: 'PRRS', doses: '12.9', now }).dosage, 12);
  assert.equal(buildVaccinationDonePayload({ batchId: 'b', vaccineName: 'PRRS', doses: '', now }).dosage, 0);
  assert.equal(buildVaccinationDonePayload({ batchId: 'b', vaccineName: 'PRRS', doses: 'not-a-number', now }).dosage, 0);
});

test('vaccination mark-done handles month and year rollover for next due date', () => {
  const payload = buildVaccinationDonePayload({
    batchId: 'b',
    vaccineName: 'PRRS',
    doses: 1,
    now: new Date('2026-12-15T08:00:00.000Z'),
  });
  assert.equal(payload.vaccination_date, '2026-12-15');
  assert.equal(payload.next_due_date, '2027-01-14');
});

test('feed mark-done builds the expected complete payload', () => {
  const payload = buildFeedDonePayload({
    batchId: 'batch-2',
    feedType: 'Grower Pellet',
    amount: '24.5',
    now,
  });

  assert.equal(payload.batch_id, 'batch-2');
  assert.equal(payload.feed_type, 'Grower Pellet');
  assert.equal(payload.quantity_kg, 24.5);
  assert.equal(payload.feeding_date, '2026-10-07');
  assert.equal(payload.feeding_time, now.toLocaleTimeString());
  assert.equal(payload.notes, 'Auto‑marked as done');
});

test('feed mark-done converts invalid amounts to zero', () => {
  assert.equal(buildFeedDonePayload({ batchId: 'b', feedType: 'Finisher', amount: '', now }).quantity_kg, 0);
  assert.equal(buildFeedDonePayload({ batchId: 'b', feedType: 'Finisher', amount: 'invalid', now }).quantity_kg, 0);
});

test('feed mark-done preserves decimal precision and negative input behavior', () => {
  assert.equal(buildFeedDonePayload({ batchId: 'b', feedType: 'Starter Mash', amount: '0.25', now }).quantity_kg, 0.25);
  assert.equal(buildFeedDonePayload({ batchId: 'b', feedType: 'Starter Mash', amount: '-2', now }).quantity_kg, -2);
});

test('both payload builders preserve identifiers and names literally', () => {
  const batchId = 'Batch/Ω 01';
  const vaccineName = 'E. Coli / Booster';
  const feedType = 'Grower Pellet / Premium';

  assert.equal(buildVaccinationDonePayload({ batchId, vaccineName, doses: 1, now }).batch_id, batchId);
  assert.equal(buildVaccinationDonePayload({ batchId, vaccineName, doses: 1, now }).vaccine_name, vaccineName);
  assert.equal(buildFeedDonePayload({ batchId, feedType, amount: 1, now }).batch_id, batchId);
  assert.equal(buildFeedDonePayload({ batchId, feedType, amount: 1, now }).feed_type, feedType);
});
