import { formatLocalDate } from './dates.js';

export const buildVaccinationDonePayload = ({ batchId, vaccineName, doses, nextDueDate = null, now = new Date() }) => ({
  batch_id: batchId,
  vaccine_name: vaccineName,
  vaccination_date: formatLocalDate(now),
  dosage: parseInt(doses, 10) || 0,
  notes: 'Marked as done via schedule',
  next_due_date: nextDueDate,
  administered_by: 'Farmer',
  status: 'Completed',
});

export const buildFeedDonePayload = ({ batchId, feedType, amount, now = new Date() }) => ({
  batch_id: batchId,
  feed_type: feedType,
  quantity_kg: parseFloat(amount) || 0,
  feeding_date: formatLocalDate(now),
  feeding_time: now.toLocaleTimeString(),
  notes: 'Auto‑marked as done',
});
