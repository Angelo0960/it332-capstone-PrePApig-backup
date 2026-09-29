/**
 * Vaccination schedule and progress helpers.
 *
 * Shared so the dashboard and the Vaccination screen agree on what counts
 * as "done". A vaccine only counts once it has a real record saved for
 * that batch with a Completed status - age alone never lights anything up.
 */

/**
 * The standard vaccination schedule, by pig age in days.
 * @type {Array<{vaccine: string, minDay: number, maxDay: number, dosePerPig: number}>}
 */
export const VACCINATION_SCHEDULE = [
  { vaccine: 'Swine Fever', minDay: 7, maxDay: 10, dosePerPig: 1 },
  { vaccine: 'E. Coli', minDay: 14, maxDay: 21, dosePerPig: 1 },
  { vaccine: 'PRRS', minDay: 28, maxDay: 35, dosePerPig: 1 },
  { vaccine: 'Porcine Circovirus', minDay: 42, maxDay: 49, dosePerPig: 1 },
];

export const VACCINATION_TOTAL = VACCINATION_SCHEDULE.length;

/**
 * Normalize a vaccine name for comparison (trim + case-insensitive).
 * @param {string} name
 * @returns {string}
 */
function normalize(name) {
  return String(name ?? '').trim().toLowerCase();
}

/**
 * A record counts as administered only if it is explicitly Completed.
 * Scheduled and Overdue records must not light up the dashboard.
 * @param {Object} record
 * @returns {boolean}
 */
export function isCompletedRecord(record) {
  return String(record?.status ?? '').trim().toLowerCase() === 'completed';
}

/**
 * Names of the schedule vaccines already administered to a batch.
 *
 * Only Completed records are considered, and only names that match the
 * standard schedule count toward the total.
 *
 * @param {Array<Object>} records - vaccination_records rows
 * @param {string} batchId
 * @returns {Set<string>} Normalized vaccine names that are done
 */
export function getCompletedVaccines(records, batchId) {
  const done = new Set();
  if (!Array.isArray(records) || !batchId) return done;

  const scheduled = new Set(VACCINATION_SCHEDULE.map((v) => normalize(v.vaccine)));

  for (const record of records) {
    if (record?.batch_id !== batchId) continue;
    if (!isCompletedRecord(record)) continue;

    const name = normalize(record.vaccine_name);
    if (scheduled.has(name)) done.add(name);
  }

  return done;
}

/**
 * Vaccination progress for a batch.
 * @param {Array<Object>} records - vaccination_records rows
 * @param {string} batchId
 * @returns {{completed: number, total: number, isComplete: boolean, done: Set<string>}}
 */
export function getVaccinationProgress(records, batchId) {
  const done = getCompletedVaccines(records, batchId);

  return {
    completed: done.size,
    total: VACCINATION_TOTAL,
    isComplete: done.size >= VACCINATION_TOTAL,
    done,
  };
}
