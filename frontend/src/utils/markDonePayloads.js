const DAYS_TO_NEXT_VACCINATION = 30;

const formatDate = (date) => date.toISOString().split('T')[0];

export const buildVaccinationDonePayload = ({ batchId, vaccineName, doses, now = new Date() }) => ({
  batch_id: batchId,
  vaccine_name: vaccineName,
  vaccination_date: formatDate(now),
  dosage: parseInt(doses, 10) || 0,
  notes: 'Marked as done via schedule',
  next_due_date: formatDate(
    new Date(now.getTime() + DAYS_TO_NEXT_VACCINATION * 24 * 60 * 60 * 1000)
  ),
  administered_by: 'Farmer',
  status: 'Completed',
});

export const buildFeedDonePayload = ({ batchId, feedType, amount, now = new Date() }) => ({
  batch_id: batchId,
  feed_type: feedType,
  quantity_kg: parseFloat(amount) || 0,
  feeding_date: formatDate(now),
  feeding_time: now.toLocaleTimeString(),
  notes: 'Auto‑marked as done',
});
