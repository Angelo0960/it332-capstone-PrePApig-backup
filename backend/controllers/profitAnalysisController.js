import supabase from '../config/supabase.js';
import { collectPages } from '../services/pagination.js';
import { validDate } from './salesController.js';
import { generateProfitAnalysis } from '../services/profitAiService.js';

const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const numeric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateAgeDays = (date, today = new Date()) => {
  if (!date || !validDate(String(date).slice(0, 10))) return null;
  return Math.max(0, Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`)) / 86400000));
};

const summarizeGrowth = (batch, pigs, now = new Date()) => {
  const rows = pigs.filter((pig) => String(pig.batch_id) === String(batch.id));
  const expectedCount = Number(batch.pig_count);
  const validWeights = rows.every((pig) => numeric(pig.weight) && Number(pig.weight) >= 0);
  const complete = Number.isSafeInteger(expectedCount) && expectedCount > 0 && rows.length === expectedCount && validWeights;
  const totalWeightKg = complete ? round(rows.reduce((sum, pig) => sum + Number(pig.weight), 0)) : null;
  const currentWeightDates = [...new Set(rows.map((pig) => {
    const timestamp = Date.parse(pig.updated_at || '');
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
  }).filter(Boolean))];
  const hasCurrentTimestamps = rows.every((pig) => Number.isFinite(Date.parse(pig.updated_at || '')));
  const currentSnapshotDate = complete && hasCurrentTimestamps && currentWeightDates.length === 1 ? currentWeightDates[0] : null;
  const currentAverageWeightKg = complete ? round(totalWeightKg / rows.length) : null;
  const history = (Array.isArray(batch.weight_history) ? batch.weight_history : [])
    .map((point) => ({ date: String(point?.date || '').slice(0, 10), weightKg: Number(point?.weight), source: String(point?.source || 'recorded') }))
    .filter((point) => validDate(point.date) && Number.isFinite(point.weightKg) && point.weightKg >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latestDatedPoint = currentSnapshotDate ? [...history].reverse().find((point) => point.date < currentSnapshotDate) : null;
  const hasStartWeight = numeric(batch.start_weight) && Number(batch.start_weight) >= 0 && validDate(String(batch.date_acquired || '').slice(0, 10));
  const previous = latestDatedPoint || (hasStartWeight ? {
    date: String(batch.date_acquired).slice(0, 10),
    weightKg: Number(batch.start_weight),
    source: 'recorded batch start weight',
  } : null);
  let growth = null;
  if (complete && currentSnapshotDate && previous && previous.date < currentSnapshotDate && currentAverageWeightKg >= previous.weightKg) {
    const elapsedDays = Math.max(1, Math.floor((Date.parse(`${currentSnapshotDate}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`)) / 86400000));
    growth = {
      previousSnapshotDate: previous.date,
      currentSnapshotDate,
      previousAverageWeightKg: round(previous.weightKg),
      currentAverageWeightKg,
      gainKg: round(currentAverageWeightKg - previous.weightKg),
      gainKgPerDay: round((currentAverageWeightKg - previous.weightKg) / elapsedDays),
      previousSnapshotSource: previous.source,
      currentWeightSource: 'sum of owner-scoped individual pig records',
    };
  }
  const acquiredAge = Number(batch.age_on_acquisition);
  const daysSinceAcquisition = dateAgeDays(batch.date_acquired, now);
  const ageDays = Number.isFinite(acquiredAge) && acquiredAge >= 0 && daysSinceAcquisition !== null ? Math.floor(acquiredAge) + daysSinceAcquisition : null;
  return {
    batchCode: batch.batch_code || 'Unnamed batch',
    status: batch.status || 'unknown',
    pigCount: complete ? rows.length : null,
    expectedPigCount: Number.isSafeInteger(expectedCount) ? expectedCount : null,
    totalWeightKg,
    currentAverageWeightKg,
    ageDays,
    growth,
    validWeightHistorySnapshots: history.length,
    weightHistorySources: [...new Set(history.map((point) => point.source))],
    weightDataComplete: complete,
  };
};

export const generateAiProfitAnalysis = async (req, res) => {
  try {
    const { from, to, batch_id: batchId, selected_price_per_kg: selectedPriceRaw, reference_price_per_kg: referencePriceRaw, price_source: priceSource } = req.body || {};
    if (!validDate(from) || !validDate(to) || from > to || batchId && !uuid.test(batchId)) {
      return res.status(400).json({ success: false, message: 'Valid date range and batch ID are required' });
    }
    if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86400000) {
      return res.status(400).json({ success: false, message: 'The analysis date range cannot exceed 366 days' });
    }
    const parsePrice = (value) => value === null || value === undefined || value === '' ? null : Number(value);
    const selectedPrice = parsePrice(selectedPriceRaw);
    const referencePrice = parsePrice(referencePriceRaw);
    if ([selectedPrice, referencePrice].some((price) => price !== null && (!Number.isFinite(price) || price <= 0 || price > 100000))) {
      return res.status(400).json({ success: false, message: 'Price assumptions must be positive values no greater than 100000 per kg' });
    }

    const batchQuery = () => {
      let query = supabase.from('pig_batches')
        .select('id,batch_code,pig_count,breed,age_on_acquisition,start_weight,current_weight,sale_price_per_kg,date_acquired,status,weight_history')
        .eq('owner_id', req.user.id)
        .order('id');
      if (batchId) query = query.eq('id', batchId);
      return query;
    };
    const pigQuery = () => {
      let query = supabase.from('pigs').select('batch_id,weight,updated_at').eq('owner_id', req.user.id).order('id');
      if (batchId) query = query.eq('batch_id', batchId);
      return query;
    };
    const datedQuery = (table, fields, dateField) => {
      let query = supabase.from(table).select(fields).eq('owner_id', req.user.id).gte(dateField, from).lte(dateField, to).order(dateField).order('id');
      if (batchId) query = query.eq('batch_id', batchId);
      return query;
    };
    let batches = await collectPages(batchQuery);
    if (!batchId) batches = batches.filter((batch) => String(batch.status || '').trim().toLowerCase() === 'active');
    const [pigs, expenses, feeds, vaccinations] = await Promise.all([
      collectPages(pigQuery),
      collectPages(() => datedQuery('expenses', 'id,batch_id,expense_type,amount,expense_date', 'expense_date')),
      collectPages(() => datedQuery('feed_records', 'id,batch_id,quantity_kg,feeding_date,unit_price_at_usage', 'feeding_date')),
      collectPages(() => datedQuery('vaccination_records', 'id,batch_id,dosage,vaccination_date,price_per_dose_at_usage', 'vaccination_date')),
    ]);
    if (!batches.length) {
      return res.status(200).json({ success: true, available: false, message: 'No active batch records are available for this selection.', limitations: ['No active batch is available to estimate standing value or growth.'] });
    }

    const growth = batches.map((batch) => summarizeGrowth(batch, pigs, new Date()));
    const valuation = batches.map((batch, index) => {
      const row = growth[index];
      const recordedPrice = numeric(batch.sale_price_per_kg) && Number(batch.sale_price_per_kg) > 0 ? Number(batch.sale_price_per_kg) : null;
      const pricePerKg = selectedPrice ?? recordedPrice ?? referencePrice;
      const valuationBasis = selectedPrice !== null ? 'selected local market price' : recordedPrice !== null ? 'recorded batch sale price' : referencePrice !== null ? 'Batangas provincial reference price' : null;
      return {
        batchCode: row.batchCode,
        totalWeightKg: row.totalWeightKg,
        pricePerKg: row.weightDataComplete && pricePerKg !== null ? round(pricePerKg) : null,
        valuationBasis,
        estimatedStandingValue: row.weightDataComplete && pricePerKg !== null ? round(row.totalWeightKg * pricePerKg) : null,
      };
    });
    const costRows = {
      recordedExpensesPhp: round(expenses.reduce((sum, row) => sum + (numeric(row.amount) && Number(row.amount) >= 0 ? Number(row.amount) : 0), 0)),
      feedUsageCostPhp: round(feeds.reduce((sum, row) => sum + (numeric(row.quantity_kg) && numeric(row.unit_price_at_usage) && Number(row.quantity_kg) >= 0 && Number(row.unit_price_at_usage) >= 0 ? Number(row.quantity_kg) * Number(row.unit_price_at_usage) : 0), 0)),
      vaccineUsageCostPhp: round(vaccinations.reduce((sum, row) => sum + (numeric(row.dosage) && numeric(row.price_per_dose_at_usage) && Number(row.dosage) >= 0 && Number(row.price_per_dose_at_usage) >= 0 ? Number(row.dosage) * Number(row.price_per_dose_at_usage) : 0), 0)),
    };
    const missingFeedCostCount = feeds.filter((row) => !numeric(row.unit_price_at_usage)).length;
    const missingVaccineCostCount = vaccinations.filter((row) => !numeric(row.price_per_dose_at_usage) || !numeric(row.dosage)).length;
    const totalRecordedCostsPhp = round(Object.values(costRows).reduce((sum, value) => sum + value, 0));
    const allValuationsAvailable = valuation.every((row) => row.estimatedStandingValue !== null);
    const estimatedStandingValuePhp = allValuationsAvailable ? round(valuation.reduce((sum, row) => sum + row.estimatedStandingValue, 0)) : null;
    const estimatedStandingValueLessSelectedPeriodCostsPhp = estimatedStandingValuePhp === null ? null : round(estimatedStandingValuePhp - totalRecordedCostsPhp);
    const limitations = [];
    if (growth.some((row) => !row.weightDataComplete)) limitations.push('At least one batch is missing a complete individual-pig weight total; its standing value and growth are unavailable.');
    if (growth.some((row) => !row.growth)) limitations.push('Some batches do not have two dated weight points to calculate recent recorded growth.');
    if (growth.some((row) => row.ageDays === null)) limitations.push('Some batches are missing acquisition date or age-at-acquisition data.');
    if (growth.some((row) => row.growth?.previousSnapshotSource === 'auto_feed')) limitations.push('Some growth rates start from a feed-based calculated weight snapshot, not a direct physical weigh-in.');
    if (!allValuationsAvailable) limitations.push('A selling-price basis is missing for at least one batch; combined standing value and estimated margin are unavailable.');
    if (missingFeedCostCount) limitations.push(`${missingFeedCostCount} feed usage record(s) lack a transaction-time unit price and are excluded from calculated feed costs.`);
    if (missingVaccineCostCount) limitations.push(`${missingVaccineCostCount} vaccination record(s) lack dosage or a transaction-time price and are excluded from calculated vaccine costs.`);
    limitations.push('Manual expense entries and feed/vaccine usage costs are both included; possible overlap cannot be determined from the records.');
    if (batchId) limitations.push('Unassigned expenses are excluded from a single-batch analysis because they cannot be reliably allocated to that batch.');
    else limitations.push('All-batch expense totals cover farm records in the selected period, including expenses linked to batches that may no longer be active; standing value covers only active batches.');
    if (batches.some((batch) => String(batch.status || '').toLowerCase() !== 'active')) limitations.push('The selected batch is not active; its current standing value may not represent unsold pigs.');
    limitations.push('This compares current estimated standing value with costs recorded only within the selected date range; it is not full lifecycle profit, cash flow, or a realized sale result.');

    const context = {
      period: { from, to },
      selection: batchId ? 'one selected batch' : 'all active batches',
      growth,
      valuation,
      recordedCostsInSelectedPeriod: costRows,
      totalRecordedCostsPhp,
      estimatedStandingValuePhp,
      estimatedStandingValueLessSelectedPeriodCostsPhp,
      expenseRecordCount: expenses.length,
      feedUsageRecordCount: feeds.length,
      vaccinationRecordCount: vaccinations.length,
      limitations,
      priceSource: selectedPrice !== null ? String(priceSource || 'user-selected local price').slice(0, 100) : null,
    };
    let aiAnalysis = null;
    let aiAnalysisError = null;
    try {
      aiAnalysis = await generateProfitAnalysis({ context });
    } catch (aiError) {
      aiAnalysisError = String(aiError.message || '').includes('not configured')
        ? 'AI profit analysis is not configured.'
        : 'AI interpretation is temporarily unavailable.';
    }
    res.json({ success: true, available: true, deterministic: context, aiAnalysis, aiAnalysisError });
  } catch (error) {
    const missingKey = String(error.message || '').includes('not configured');
    const missingMigration = error.code === '42703' || error.code === 'PGRST204';
    res.status(missingKey ? 503 : missingMigration ? 503 : 502).json({
      success: false,
      message: missingKey ? 'AI profit analysis is not configured' : missingMigration ? 'Growth history is unavailable; apply the growth-history database migration first' : 'AI profit analysis is temporarily unavailable',
    });
  }
};
