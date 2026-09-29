import { getBatchAgeDays } from './feedScheduleService.js';

// ============================================
// VACCINATION SCHEDULE
// ============================================

/**
 * Standard vaccination schedule, keyed on pig age in days.
 * Mirrors frontend/src/utils/vaccinationProgress.js and the schedule shown
 * on the Vaccination screen, so notifications, the dashboard and the
 * vaccination UI all agree on what is due.
 */
export const VACCINATION_SCHEDULE = [
  { vaccine: 'Swine Fever', minDay: 7, maxDay: 10 },
  { vaccine: 'E. Coli', minDay: 14, maxDay: 21 },
  { vaccine: 'PRRS', minDay: 28, maxDay: 35 },
  { vaccine: 'Porcine Circovirus', minDay: 42, maxDay: 49 },
];

export const VACCINATION_TOTAL = VACCINATION_SCHEDULE.length;

function normalize(name) {
  return String(name ?? '').trim().toLowerCase();
}

/**
 * A record counts as administered only if it is explicitly Completed.
 * Scheduled and Overdue records must not count as done.
 */
export function isCompletedRecord(record) {
  return String(record?.status ?? '').trim().toLowerCase() === 'completed';
}

/**
 * Pig age in days for a batch, honouring the age it was acquired at.
 * @param {Object} batch
 * @returns {number}
 */
export function getBatchAge(batch) {
  return getBatchAgeDays(batch?.date_acquired, batch?.age_on_acquisition);
}

/**
 * Which schedule vaccines have been administered to a batch.
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
 * Work out the vaccination state of a batch from its age and its records.
 *
 * A vaccine is:
 *   - completed  - a Completed record exists
 *   - overdue    - the pig is past maxDay and it was never given
 *   - due        - the pig is inside the [minDay, maxDay] window
 *   - upcoming   - the pig has not reached minDay yet
 *
 * @param {number} ageDays - Pig age in days
 * @param {Set<string>} completed - Normalized names already given
 * @returns {{due: Array, overdue: Array, upcoming: Array, completed: Array, isComplete: boolean}}
 */
export function getVaccinationState(ageDays, completed = new Set()) {
  const age = Math.max(0, parseInt(ageDays, 10) || 0);
  const done = completed instanceof Set ? completed : new Set();

  const state = { due: [], overdue: [], upcoming: [], completed: [], isComplete: false };

  for (const entry of VACCINATION_SCHEDULE) {
    const name = normalize(entry.vaccine);

    if (done.has(name)) {
      state.completed.push(entry);
    } else if (age > entry.maxDay) {
      state.overdue.push({ ...entry, daysOverdue: age - entry.maxDay });
    } else if (age >= entry.minDay) {
      state.due.push(entry);
    } else {
      state.upcoming.push({ ...entry, daysUntil: entry.minDay - age });
    }
  }

  state.isComplete = state.completed.length >= VACCINATION_TOTAL;
  return state;
}

/**
 * Convenience: vaccination state straight from a batch and its records.
 * @param {Object} batch
 * @param {Array<Object>} records
 */
export function getBatchVaccinationState(batch, records) {
  const age = getBatchAge(batch);
  const completed = getCompletedVaccines(records, batch?.id);
  return getVaccinationState(age, completed);
}

/**
 * Human-readable summary for a notification body.
 * @param {Array<{vaccine: string, daysOverdue?: number}>} items
 * @returns {string}
 */
export function describeItems(items) {
  return items
    .map((item) => {
      const overdue = item.daysOverdue != null
        ? ` (${item.daysOverdue} day${item.daysOverdue === 1 ? '' : 's'} overdue)`
        : '';
      return `${item.vaccine}${overdue}`;
    })
    .join(', ');
}
