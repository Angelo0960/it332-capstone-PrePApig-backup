// Keep this schedule/helper in sync with backend/utils/vaccinationSchedule.js.
const FIXED_VACCINATION_SCHEDULE = [
  { key: 'iron-day-3', vaccine: 'Iron', label: 'Iron', day: 3, dosesPerPig: 1, doseMlPerPig: 1 },
  { key: 'mycoplasma-day-7', vaccine: 'Mycoplasma Vaccine', label: 'Mycoplasma Vaccine', day: 7, dosesPerPig: 1, doseMlPerPig: 2 },
  { key: 'vitamin-b-complex-day-10', vaccine: 'Vitamin B-Complex', label: 'Vitamin B-Complex', day: 10, dosesPerPig: 1, doseMlPerPig: 1 },
  { key: 'iron-second-dose-day-14', vaccine: 'Iron', label: 'Iron (2nd Dose)', day: 14, dosesPerPig: 1, doseMlPerPig: 1 },
  { key: 'vitamin-b-complex-second-dose-day-25', vaccine: 'Vitamin B-Complex', label: 'Vitamin B-Complex (2nd Dose)', day: 25, dosesPerPig: 1, doseMlPerPig: 1 },
  { key: 'ivermectin-day-35', vaccine: 'Ivermectin', label: 'Ivermectin', day: 35, dosesPerPig: 1, doseMlPerPig: 1 },
];

const MONTHLY_VACCINATION_SCHEDULE = [
  { key: 'vitamin-b-complex-monthly', vaccine: 'Vitamin B-Complex', label: 'Vitamin B-Complex (Monthly)', firstDay: 65, intervalDays: 30, dosesPerPig: 1, doseMlPerPig: 1 },
  { key: 'ivermectin-monthly', vaccine: 'Ivermectin', label: 'Ivermectin (Monthly)', firstDay: 65, intervalDays: 30, dosesPerPig: 1, doseMlPerPig: 1 },
];

export const getScheduledVaccineNames = () => Array.from(new Set(
  [...FIXED_VACCINATION_SCHEDULE, ...MONTHLY_VACCINATION_SCHEDULE].map(({ vaccine }) => vaccine)
));

const DAY_MS = 24 * 60 * 60 * 1000;

const dateOnly = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text ? null : text;
};

const utcDay = (value) => {
  const normalized = dateOnly(value);
  return normalized ? Math.floor(Date.parse(`${normalized}T00:00:00.000Z`) / DAY_MS) : null;
};

export const getAgeOnDate = (batch, targetDate, currentAgeFallback = null, currentDateFallback = null) => {
  const targetDay = utcDay(targetDate);
  if (targetDay == null) return null;
  const acquiredDate = batch?.dateAcquired || batch?.date_acquired || batch?.createdAt || batch?.created_at;
  const acquiredDay = utcDay(acquiredDate);
  const baseAge = Number(batch?.ageOnAcquisition ?? batch?.age_on_acquisition) || 0;
  if (acquiredDay != null) return baseAge + Math.max(0, targetDay - acquiredDay);

  const referenceDay = utcDay(currentDateFallback);
  const fallbackAge = Number(currentAgeFallback);
  if (referenceDay != null && Number.isFinite(fallbackAge)) {
    return Math.max(0, fallbackAge - (referenceDay - targetDay));
  }
  return null;
};

export const getVaccinationScheduleForAge = (ageDays, includeNext = true) => {
  const age = Math.max(0, Math.floor(Number(ageDays) || 0));
  const schedule = FIXED_VACCINATION_SCHEDULE.map((item) => ({
    ...item,
    minDay: item.day,
    maxDay: item.day,
    isRecurring: false,
  }));

  for (const rule of MONTHLY_VACCINATION_SCHEDULE) {
    let dueDay = rule.firstDay;
    while (dueDay <= age) {
      schedule.push({
        key: `${rule.key}-${dueDay}`,
        vaccine: rule.vaccine,
        label: rule.label,
        day: dueDay,
        minDay: dueDay,
        maxDay: dueDay,
        dosesPerPig: rule.dosesPerPig,
        doseMlPerPig: rule.doseMlPerPig,
        isRecurring: true,
      });
      dueDay += rule.intervalDays;
    }
    if (includeNext) {
      schedule.push({
        key: `${rule.key}-${dueDay}`,
        vaccine: rule.vaccine,
        label: rule.label,
        day: dueDay,
        minDay: dueDay,
        maxDay: dueDay,
        dosesPerPig: rule.dosesPerPig,
        doseMlPerPig: rule.doseMlPerPig,
        isRecurring: true,
      });
    }
  }

  return schedule.sort((a, b) => a.day - b.day);
};

export const getCompletedVaccinationScheduleKeys = ({ batch, records, occurrences, currentAge, currentDate }) => {
  const batchId = String(batch?.id ?? batch?.batch_id ?? '');
  const completedRecords = (records || [])
    .filter((record) => String(record.batch_id ?? record.batchId ?? '') === batchId)
    .filter((record) => String(record.status || '').toLowerCase() === 'completed')
    .map((record) => ({
      name: String(record.vaccine_name || '').trim().toLowerCase(),
      age: getAgeOnDate(batch, record.vaccination_date || record.created_at, currentAge, currentDate),
    }))
    .filter((record) => record.name && Number.isFinite(record.age)
      && (currentAge == null || !Number.isFinite(Number(currentAge)) || record.age <= Number(currentAge)))
    .sort((a, b) => a.age - b.age);

  const completedKeys = new Set();
  for (const record of completedRecords) {
    const nextOccurrence = (occurrences || [])
      .filter((occurrence) => occurrence.vaccine.trim().toLowerCase() === record.name
        && occurrence.day <= record.age
        && !completedKeys.has(occurrence.key))
      .sort((a, b) => Math.abs(record.age - a.day) - Math.abs(record.age - b.day) || a.day - b.day)[0];
    if (nextOccurrence) completedKeys.add(nextOccurrence.key);
  }
  return completedKeys;
};
