const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Days elapsed since a date, floored at 0.
 * @param {string|Date} date
 * @returns {number}
 */
export function daysSince(date) {
  if (!date) return 0;
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - then.getTime()) / MS_PER_DAY));
}

/**
 * Derive the acquisition date from a pig age.
 *
 * The "Add New Batch" modal treats the entered age as the authoritative
 * value, so the acquisition date is worked out from it: a batch entered
 * as 30 days old was acquired 30 days ago. This keeps the age and the
 * date from ever disagreeing.
 *
 * @param {number|string} ageDays - Pig age in days
 * @returns {string} Date as YYYY-MM-DD
 */
export function getDateAcquiredForAge(ageDays) {
  const age = Math.max(0, parseInt(ageDays, 10) || 0);
  const date = new Date();
  date.setDate(date.getDate() - age);

  // Build from local date parts so the value never shifts across timezones
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Current age of a batch's pigs, in days.
 *
 * A batch is created with the pigs' age on the acquisition date
 * (`age_on_acquisition`). Their current age is that value plus the days
 * elapsed since the batch was acquired, so the age entered in the
 * "Add New Batch" modal is reflected everywhere the dashboard shows age.
 *
 * @param {Object} batch - Batch object from the API
 * @returns {number} Age in days
 */
export function getBatchAgeDays(batch) {
  if (!batch) return 0;

  const ageOnAcquisition = Math.max(0, parseInt(batch.age_on_acquisition, 10) || 0);
  const anchor = batch.date_acquired || batch.created_at;

  return daysSince(anchor) + ageOnAcquisition;
}

/**
 * Growth phase for a pig age, mirroring the backend's 26-week feed program
 * (backend/lib/fcrService.js `getCurrentPhase`).
 *
 * Weeks 1-4 Starter, 5-10 Grower, 11-15 Finisher 1, 16+ Finisher 2.
 * @param {number} ageDays - Pig age in days
 * @returns {string} Phase name
 */
export function getPhaseForAge(ageDays) {
  const weeks = Math.floor(Math.max(0, ageDays) / 7) + 1;
  if (weeks <= 4) return 'Starter';
  if (weeks <= 10) return 'Grower';
  if (weeks <= 15) return 'Finisher 1';
  return 'Finisher 2';
}

/**
 * Target FCR for a growth phase
 * (mirrors backend/lib/feedScheduleService.js `getPhaseFCR`).
 * @param {string} phase
 * @returns {number}
 */
export function getTargetFCRForPhase(phase) {
  const defaults = {
    Starter: 2.0,
    Grower: 2.8,
    'Finisher 1': 2.5,
    'Finisher 2': 2.5,
  };
  return defaults[phase] ?? 2.8;
}

/**
 * Market target weight for a growth phase, in kg per pig.
 * Finisher 2 matches the backend's FORECAST_TARGET_WEIGHT_KG default of 95.
 * @param {string} phase
 * @returns {number}
 */
export function getTargetWeightForPhase(phase) {
  const targets = {
    Starter: 30,
    Grower: 60,
    'Finisher 1': 85,
    'Finisher 2': 95,
  };
  return targets[phase] ?? 95;
}

/**
 * Display label for a phase's feed, matching the backend's ration mapping.
 * @param {string} phase
 * @returns {string}
 */
export function getFeedLabelForPhase(phase) {
  const labels = {
    Starter: 'Starter Mash',
    Grower: 'Grower Pellet',
    'Finisher 1': 'Finisher',
    'Finisher 2': 'Finisher',
  };
  return labels[phase] ?? 'Starter Mash';
}

export default getBatchAgeDays;
