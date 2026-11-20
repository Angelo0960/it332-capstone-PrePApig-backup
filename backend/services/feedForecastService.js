import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import supabase from '../config/supabase.js';

const MIN_DAILY_POINTS = 14;
const DEFAULT_WINDOW_DAYS = 28;
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/data');
const getMaxSourceDate = () => new Date().toISOString().slice(0, 10);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const FEED_RATION_STAGE_MAP = Object.freeze({
  Tmpbc5: Object.freeze({ feedStage: 'Super Biik', feedType: 'Super Biik', stockAliases: ['Super Biik', 'super_biik', 'Tmpbc5'] }),
  'HS-Premium': Object.freeze({ feedStage: 'Starter', feedType: 'Starter Mash', stockAliases: ['Starter', 'Starter Mash', 'starter', 'HS-Premium'] }),
  'HG-Premium': Object.freeze({ feedStage: 'Grower', feedType: 'Grower Pellet', stockAliases: ['Grower', 'Grower Pellet', 'grower', 'HG-Premium'] }),
  HPSPM: Object.freeze({ feedStage: 'Finisher', feedType: 'Finisher', stockAliases: ['Finisher', 'finisher', 'HPSPM'] }),
});

const regression = (points) => {
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  const denominator = points.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
  const slope = denominator === 0 ? 0 : points.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0) / denominator;
  const intercept = meanY - (slope * meanX);
  return { slope, intercept, predict: (x) => intercept + (slope * x) };
};

const aggregateDaily = (rows) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const date = String(row.feeding_date || '').slice(0, 10);
    const quantity = Number(row.quantity_kg);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(quantity) || quantity < 0) return;
    grouped.set(date, (grouped.get(date) || 0) + quantity);
  });
  return [...grouped.entries()]
    .map(([date, quantityKg]) => ({ date, quantityKg: Number(quantityKg.toFixed(3)) }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

const DAY_MS = 24 * 60 * 60 * 1000;
const isValidIsoDate = (dateValue) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ''))) return false;
  const date = new Date(`${dateValue}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateValue;
};
const calendarWeekStart = (dateValue) => {
  if (!isValidIsoDate(dateValue)) return null;
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};

// Uploaded weekly-source rows can start on different weekdays by batch; require the full seven-day observation to have elapsed.
const isCompleteWeeklyObservation = (weekStart) => {
  if (!isValidIsoDate(weekStart)) return false;
  const timestamp = Date.parse(`${weekStart}T00:00:00Z`);
  return new Date(timestamp + 6 * DAY_MS).toISOString().slice(0, 10) <= getMaxSourceDate();
};

const aggregateUploadedDailyWeeks = (dailyRows, { byRation = false } = {}) => {
  const sourceRows = dailyRows.filter((row) => isValidIsoDate(row.feeding_date) && String(row.batch_id || '').trim());
  const batchRanges = new Map();
  const weeklyBatchDates = new Map();
  const rowsToAggregate = [];
  const seenBatchDates = new Set();
  const duplicateWeeks = new Set();

  sourceRows.forEach((row) => {
    const date = row.feeding_date;
    const batchId = String(row.batch_id).trim();
    const weekStart = calendarWeekStart(date);
    const range = batchRanges.get(batchId) || { start: date, end: date };
    range.start = date < range.start ? date : range.start;
    range.end = date > range.end ? date : range.end;
    batchRanges.set(batchId, range);

    const dayKey = `${batchId}|${date}`;
    if (seenBatchDates.has(dayKey)) duplicateWeeks.add(weekStart);
    else seenBatchDates.add(dayKey);

    const quantityKg = Number(row.quantity_kg);
    if (!Number.isFinite(quantityKg) || quantityKg < 0) return;
    const datesByBatch = weeklyBatchDates.get(weekStart) || new Map();
    const dates = datesByBatch.get(batchId) || new Set();
    dates.add(date);
    datesByBatch.set(batchId, dates);
    weeklyBatchDates.set(weekStart, datesByBatch);
    rowsToAggregate.push({ row, batchId, weekStart, quantityKg });
  });

  const completeWeeks = new Set();
  // A batch may start or end mid-week; require every date within its observed active range, and skip weeks with missing or duplicate daily rows.
  weeklyBatchDates.forEach((datesByBatch, weekStart) => {
    if (!isCompleteWeeklyObservation(weekStart) || duplicateWeeks.has(weekStart)) return;
    const weekStartMs = Date.parse(`${weekStart}T00:00:00Z`);
    const weekEndMs = weekStartMs + 6 * DAY_MS;
    const weekEnd = new Date(weekEndMs).toISOString().slice(0, 10);
    let hasCompleteCoverage = true;
    for (const [batchId, range] of batchRanges.entries()) {
      if (range.start > weekEnd || range.end < weekStart) continue;
      const expectedStart = Math.max(weekStartMs, Date.parse(`${range.start}T00:00:00Z`));
      const expectedEnd = Math.min(weekEndMs, Date.parse(`${range.end}T00:00:00Z`));
      const expectedDays = Math.floor((expectedEnd - expectedStart) / DAY_MS) + 1;
      const observedDays = datesByBatch.get(batchId)?.size || 0;
      if (observedDays !== expectedDays) {
        hasCompleteCoverage = false;
        break;
      }
    }
    if (hasCompleteCoverage) completeWeeks.add(weekStart);
  });

  const grouped = new Map();
  rowsToAggregate.forEach(({ row, weekStart, quantityKg }) => {
    if (!completeWeeks.has(weekStart)) return;
    const rationCode = String(row.ration_code || '').trim() || 'Unspecified ration';
    const key = byRation ? `${weekStart}|${rationCode}` : weekStart;
    const weekEnd = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * DAY_MS).toISOString().slice(0, 10);
    const group = grouped.get(key) || { week_start: weekStart, week_end: weekEnd, actual_weekly_kg: 0, planned_weekly_kg: 0, ration_code: byRation ? rationCode : null };
    group.actual_weekly_kg += quantityKg;
    group.planned_weekly_kg += Number(row.planned_kg) || 0;
    grouped.set(key, group);
  });

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      actual_weekly_kg: Number(row.actual_weekly_kg.toFixed(3)),
      planned_weekly_kg: Number(row.planned_weekly_kg.toFixed(3)),
    }))
    .sort((left, right) => left.week_start.localeCompare(right.week_start) || String(left.ration_code || '').localeCompare(String(right.ration_code || '')));
};

const readCsv = (filename) => {
  const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return headers.reduce((row, header, index) => ({ ...row, [header]: values[index] ?? '' }), {});
  });
};

const UPLOADED_BATCH_ALIASES = Object.freeze({
  'BATCH-01': 'BATCH-2026-01',
  'BATCH-02': 'BATCH-2025-01',
  'BATCH-03': 'BATCH-2025-02',
  'BATCH-04': 'BATCH-2025-03',
  'BATCH-05': 'BATCH-2024-01',
});

const loadUploadedHistoricalData = ({ batchId } = {}) => {
  const sourceBatchId = !batchId || batchId === 'all' ? null : UPLOADED_BATCH_ALIASES[batchId] || batchId;
  const dailyRows = readCsv('PrepAPig_5Y_Daily_Feed_Usage.csv')
    .filter((row) => isValidIsoDate(row.date) && row.date <= getMaxSourceDate())
    .filter((row) => !sourceBatchId || row.batch_id === sourceBatchId)
    .map((row) => ({
      batch_id: row.batch_id,
      feeding_date: row.date,
      quantity_kg: Number(row.actual_feed_kg),
      planned_kg: Number(row.planned_daily_kg_per_pig) * Number(row.active_pigs),
      ration_code: String(row.ration_code || '').trim() || 'Unspecified ration',
      dataType: row.data_type,
    }));
  const weeklyRows = readCsv('PrepAPig_5Y_Weekly_Forecast.csv')
    .filter((row) => isCompleteWeeklyObservation(row.week_start))
    .filter((row) => !sourceBatchId || row.batch_id === sourceBatchId)
    .map((row) => ({ ...row, ration_code: String(row.ration_code || '').trim() || 'Unspecified ration' }))
    .sort((a, b) => a.week_start.localeCompare(b.week_start) || a.batch_id.localeCompare(b.batch_id));
  return { dailyRows, weeklyRows, sourceBatchId: sourceBatchId || 'all' };
};

const dateForWeeklyRow = (row) => row.week_end || row.week_start;

const weightedPricePerBag = (rows) => {
  const pricedRows = rows.filter((row) => Number(row.actual_weekly_kg) > 0 && Number(row.price_per_50kg_bag_php) > 0);
  const pricedKg = pricedRows.reduce((sum, row) => sum + Number(row.actual_weekly_kg), 0);
  return pricedKg > 0
    ? Number((pricedRows.reduce((sum, row) => sum + (Number(row.price_per_50kg_bag_php) * Number(row.actual_weekly_kg)), 0) / pricedKg).toFixed(2))
    : null;
};

const summarizeUploadedHistory = (dailyRows, weeklyRows, priceRows = weeklyRows) => {
  const actualKg = weeklyRows.reduce((sum, row) => sum + (Number(row.actual_weekly_kg) || 0), 0);
  const plannedKg = weeklyRows.reduce((sum, row) => sum + (Number(row.planned_weekly_kg) || 0), 0);
  const recentWeekStarts = new Set(
    [...new Set(priceRows.map((row) => calendarWeekStart(row.week_start)).filter(Boolean))].sort().slice(-12)
  );
  const recent = priceRows.filter((row) => recentWeekStarts.has(calendarWeekStart(row.week_start)));
  const recentRationCodes = [...new Set(priceRows.map((row) => String(row.ration_code || '').trim()).filter(Boolean))];
  const averageRecentPricePer50kgBagPhpByRationCode = Object.fromEntries(
    recentRationCodes.map((rationCode) => {
      const rationPriceRows = priceRows
        .filter((row) => String(row.ration_code || '').trim() === rationCode)
        .sort((left, right) => String(left.week_start).localeCompare(String(right.week_start)))
        .slice(-12);
      return [rationCode, weightedPricePerBag(rationPriceRows)];
    })
  );
  const dates = weeklyRows.map(dateForWeeklyRow).sort();
  return {
    actualKg: Number(actualKg.toFixed(3)), plannedKg: Number(plannedKg.toFixed(3)), varianceKg: Number((actualKg - plannedKg).toFixed(3)),
    actualBagEquivalent: Number((actualKg / 50).toFixed(3)), plannedBagEquivalent: Number((plannedKg / 50).toFixed(3)),
    averageRecentPricePer50kgBagPhp: weightedPricePerBag(recent),
    averageRecentPricePer50kgBagPhpByRationCode,
    sourceRows: dailyRows.length, sourceWeeks: weeklyRows.length, sourceDateStart: dates[0] || null, sourceDateEnd: dates.at(-1) || null,
  };
};

const forecastUploadedWeeklyConsumption = (weeklyRows, horizonWeeks = 4, options = {}, includeEvaluationRows = false) => {
  const weekly = weeklyRows.slice(-Math.max(8, 16));
  if (weekly.length < 8) {
    return { status: 'insufficient_data', granularity: 'weekly', historyWeeks: weekly.length, requiredHistoryWeeks: 8, forecast: [], evaluation: null, history: weekly.map((row) => ({ date: dateForWeeklyRow(row), quantityKg: Number(row.actual_weekly_kg || 0), plannedKg: Number(row.planned_weekly_kg || 0) })), ...options };
  }
  const points = weekly.map((row, index) => ({ x: index, y: Number(row.actual_weekly_kg) || 0 }));
  const holdoutCount = Math.max(2, Math.floor(points.length * 0.2));
  const training = points.slice(0, -holdoutCount);
  const holdout = points.slice(-holdoutCount);
  const validationModel = regression(training);
  const errors = holdout.map((point) => point.y - Math.max(0, validationModel.predict(point.x)));
  const residualMean = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const residualStdDev = Math.sqrt(errors.reduce((sum, value) => sum + ((value - residualMean) ** 2), 0) / Math.max(1, errors.length - 1));
  const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length;
  const interval = Math.max(mae, residualStdDev * 1.96);
  const pricePerKg = Number(options.averageRecentPricePer50kgBagPhp) > 0 ? Number(options.averageRecentPricePer50kgBagPhp) / 50 : null;
  const recentAverageKg = points.slice(-4).reduce((sum, point) => sum + point.y, 0) / Math.min(4, points.length);
  const lastDate = new Date(`${dateForWeeklyRow(weekly.at(-1))}T00:00:00Z`);
  const forecastModel = regression(points);
  const forecast = Array.from({ length: clamp(Number(horizonWeeks) || 4, 1, 8) }, (_, index) => {
    const date = new Date(lastDate);
    date.setUTCDate(date.getUTCDate() + ((index + 1) * 7));
    const predicted = Math.max(0, forecastModel.predict(points.length + index));
    const stablePredicted = predicted < (recentAverageKg * 0.5) ? recentAverageKg : predicted;
    const projectedCostPhp = stablePredicted === 0
      ? 0
      : pricePerKg ? Number((stablePredicted * pricePerKg).toFixed(2)) : null;
    return {
      date: date.toISOString().slice(0, 10), predictedKg: Number(stablePredicted.toFixed(3)),
      lowerKg: Number(Math.max(0, stablePredicted - interval).toFixed(3)), upperKg: Number((stablePredicted + interval).toFixed(3)),
      projectedBagEquivalent: Number((stablePredicted / 50).toFixed(3)), projectedBagCount: Math.ceil(stablePredicted / 50), projectedCostPhp,
    };
  });
  const evaluationRows = holdout.map((point, index) => ({
    date: dateForWeeklyRow(weekly[training.length + index]),
    actualKg: Number(point.y.toFixed(3)),
    predictedKg: Number(Math.max(0, validationModel.predict(point.x)).toFixed(3)),
  }));
  return {
    status: 'forecasted', granularity: 'weekly', historyWeeks: weekly.length, requiredHistoryWeeks: 8,
    lastObservedDate: dateForWeeklyRow(weekly.at(-1)),
    evaluation: { holdoutWeeks: holdoutCount, meanAbsoluteErrorKg: Number(mae.toFixed(3)) },
    history: weekly.map((row) => ({ date: dateForWeeklyRow(row), quantityKg: Number(Number(row.actual_weekly_kg).toFixed(3)), plannedKg: Number(Number(row.planned_weekly_kg).toFixed(3)) })),
    forecast, limitations: ['Forecast uses weekly-grouped rows from the uploaded historical dataset.', 'Forecast does not replace recorded feed, inventory, expense, or FCR calculations.'],
    ...(includeEvaluationRows ? { evaluationRows } : {}),
    ...options,
  };
};

const sumRationEvaluation = (rationForecasts) => {
  const byDate = new Map();
  rationForecasts.forEach((ration) => {
    (ration.evaluationRows || []).forEach((row) => {
      const sums = byDate.get(row.date) || { actualKg: 0, predictedKg: 0 };
      sums.actualKg += row.actualKg;
      sums.predictedKg += row.predictedKg;
      byDate.set(row.date, sums);
    });
  });
  const errors = [...byDate.values()].map((row) => row.actualKg - row.predictedKg);
  return errors.length
    ? { holdoutWeeks: errors.length, meanAbsoluteErrorKg: Number((errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length).toFixed(3)) }
    : null;
};

const reconcileAggregateForecast = (aggregate, rationForecasts) => {
  const forecastable = rationForecasts.filter((ration) => ration.status === 'forecasted' && Array.isArray(ration.forecast));
  if (aggregate.status !== 'forecasted' || !forecastable.length) {
    return { ...aggregate, status: 'insufficient_data', forecast: [], evaluation: null };
  }
  const forecast = (aggregate.forecast || []).map((period, index) => {
    const rationRows = forecastable.map((ration) => ration.forecast[index]).filter(Boolean);
    const predictedKg = rationRows.reduce((sum, row) => sum + Math.max(0, Number(row.predictedKg) || 0), 0);
    const lowerKg = rationRows.reduce((sum, row) => sum + Math.max(0, Number(row.lowerKg) || 0), 0);
    const upperKg = rationRows.reduce((sum, row) => sum + Math.max(0, Number(row.upperKg) || 0), 0);
    const costUnavailable = rationRows.some((row) => Number(row.predictedKg) > 0 && row.projectedCostPhp == null);
    const projectedCostPhp = costUnavailable
      ? null
      : Number(rationRows.reduce((sum, row) => sum + (Number(row.projectedCostPhp) || 0), 0).toFixed(2));
    return {
      ...period,
      predictedKg: Number(predictedKg.toFixed(3)),
      lowerKg: Number(lowerKg.toFixed(3)),
      upperKg: Number(upperKg.toFixed(3)),
      errorRange: [Number(Math.max(0, upperKg - predictedKg).toFixed(3)), Number(Math.max(0, predictedKg - lowerKg).toFixed(3))],
      projectedBagEquivalent: Number((predictedKg / 50).toFixed(3)),
      projectedBagCount: Math.ceil(predictedKg / 50),
      projectedCostPhp,
    };
  });
  const missingRations = rationForecasts.filter((ration) => ration.status !== 'forecasted').map((ration) => ration.rationCode);
  return {
    ...aggregate,
    forecast,
    evaluation: sumRationEvaluation(rationForecasts),
    limitations: [
      ...(aggregate.limitations || []),
      'Aggregate forecast, bag equivalents, and cost are calculated by summing the ration-level results.',
      ...(missingRations.length ? [`No ration forecast was available for: ${missingRations.join(', ')}.`] : []),
    ],
    reconciliationStatus: missingRations.length ? 'partial' : 'reconciled',
  };
};

const buildCalculatedMetrics = (forecastRows = [], rationForecasts = [], reconciliationStatus = 'reconciled') => forecastRows.map((period, index) => ({
  date: period.date,
  bagSizeKg: 50,
  totalForecastKg: Number(period.predictedKg),
  bagEquivalent: Number((Number(period.predictedKg) / 50).toFixed(3)),
  wholeBagsForTotalNeed: Math.ceil(Math.max(0, Number(period.predictedKg) || 0) / 50),
  estimatedCostPhp: period.projectedCostPhp == null ? null : Number(period.projectedCostPhp),
  costStatus: period.projectedCostPhp == null ? 'unavailable_missing_ration_price' : 'estimated_from_uploaded_ration_prices',
  reconciliationStatus,
  rationForecasts: rationForecasts.map((ration) => {
    const rationPeriod = ration.forecast?.[index];
    return {
      rationCode: ration.rationCode,
      feedStage: ration.feedStage || null,
      forecastKg: rationPeriod?.predictedKg == null ? null : Number(rationPeriod.predictedKg),
      bagEquivalent: rationPeriod?.projectedBagEquivalent == null ? null : Number(rationPeriod.projectedBagEquivalent),
      estimatedCostPhp: rationPeriod?.projectedCostPhp == null ? null : Number(rationPeriod.projectedCostPhp),
      status: rationPeriod ? 'forecasted' : ration.status,
    };
  }),
}));

const forecastFeedConsumption = (dailyRows, horizonDays = 7, windowDays = DEFAULT_WINDOW_DAYS, options = {}) => {
  const daily = dailyRows.slice(-Math.max(MIN_DAILY_POINTS, windowDays));
  if (daily.length < MIN_DAILY_POINTS) {
    return { status: 'insufficient_data', historyDays: daily.length, requiredHistoryDays: MIN_DAILY_POINTS, forecast: [], evaluation: null, history: daily, ...options };
  }
  const points = daily.map((row, index) => ({ x: index, y: row.quantityKg }));
  const holdoutCount = Math.max(3, Math.floor(points.length * 0.2));
  const training = points.slice(0, -holdoutCount);
  const holdout = points.slice(-holdoutCount);
  const model = regression(training);
  const errors = holdout.map((point) => point.y - model.predict(point.x));
  const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length;
  const residualMean = errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const residualStdDev = Math.sqrt(errors.reduce((sum, value) => sum + ((value - residualMean) ** 2), 0) / Math.max(1, errors.length - 1));
  const interval = Math.max(mae, residualStdDev * 1.96);
  const lastDate = new Date(`${daily[daily.length - 1].date}T00:00:00Z`);
  const pricePerKg = Number(options.averageRecentPricePer50kgBagPhp) > 0 ? Number(options.averageRecentPricePer50kgBagPhp) / 50 : null;
  const forecast = Array.from({ length: clamp(Number(horizonDays) || 7, 1, 14) }, (_, index) => {
    const date = new Date(lastDate);
    date.setUTCDate(date.getUTCDate() + index + 1);
    const predicted = Math.max(0, model.predict(points.length - 1 + index + 1));
    return {
      date: date.toISOString().slice(0, 10),
      predictedKg: Number(predicted.toFixed(3)),
      lowerKg: Number(Math.max(0, predicted - interval).toFixed(3)),
      upperKg: Number((predicted + interval).toFixed(3)),
      projectedBagEquivalent: Number((predicted / 50).toFixed(3)),
      projectedBagCount: Math.ceil(predicted / 50),
      projectedCostPhp: pricePerKg ? Number((predicted * pricePerKg).toFixed(2)) : null,
    };
  });
  return {
    status: 'forecasted',
    historyDays: daily.length,
    requiredHistoryDays: MIN_DAILY_POINTS,
    windowDays: daily.length,
    lastObservedDate: daily[daily.length - 1].date,
    evaluation: { holdoutDays: holdoutCount, meanAbsoluteErrorKg: Number(mae.toFixed(3)) },
    history: daily,
    forecast,
    limitations: options.limitations || ['Forecast is a transparent statistical baseline, not an AI-generated quantity.', 'Forecast does not replace recorded feed, inventory, expense, or FCR calculations.'],
    ...options,
  };
};

export const getFeedConsumptionForecast = async ({ ownerId, batchId, horizonDays = 7, horizonWeeks = 1, windowDays = DEFAULT_WINDOW_DAYS, source = 'recorded' } = {}) => {
  if (source === 'uploaded_historical') {
    const { dailyRows, weeklyRows, sourceBatchId } = loadUploadedHistoricalData({ batchId });
    const forecastRows = aggregateUploadedDailyWeeks(dailyRows);
    const rationRows = aggregateUploadedDailyWeeks(dailyRows, { byRation: true });
    const historicalSummary = summarizeUploadedHistory(dailyRows, forecastRows, weeklyRows);
    const grouped = new Map(Object.keys(FEED_RATION_STAGE_MAP).map((rationCode) => [rationCode, []]));
    rationRows.forEach((row) => {
      const rows = grouped.get(row.ration_code) || [];
      rows.push(row);
      grouped.set(row.ration_code, rows);
    });
    const rationForecastsWithEvaluation = [...grouped.entries()].map(([rationCode, rows]) => {
      const mapping = FEED_RATION_STAGE_MAP[rationCode] || {};
      const averageRecentPricePer50kgBagPhp = historicalSummary.averageRecentPricePer50kgBagPhpByRationCode[rationCode] ?? null;
      if (!rows.length) {
        return {
          rationCode,
          ...mapping,
          ...forecastUploadedWeeklyConsumption([], horizonWeeks, { averageRecentPricePer50kgBagPhp }, true),
        };
      }
      const rowsByWeek = new Map(rows.map((row) => [row.week_start, row]));
      const alignedRows = forecastRows.map((week) => {
        const rationWeek = rowsByWeek.get(week.week_start);
        return {
          ...week,
          ration_code: rationCode,
          actual_weekly_kg: rationWeek?.actual_weekly_kg || 0,
          planned_weekly_kg: rationWeek?.planned_weekly_kg || 0,
        };
      });
      return {
        rationCode,
        ...mapping,
        ...forecastUploadedWeeklyConsumption(alignedRows, horizonWeeks, { averageRecentPricePer50kgBagPhp }, true),
      };
    });
    const aggregateBase = forecastUploadedWeeklyConsumption(forecastRows, horizonWeeks, { historicalSummary });
    const aggregate = reconcileAggregateForecast(aggregateBase, rationForecastsWithEvaluation);
    const rationForecasts = rationForecastsWithEvaluation.map(({ evaluationRows, ...ration }) => ration);
    const reconciliationStatus = aggregate.reconciliationStatus || 'reconciled';
    return {
      success: true,
      batchId: batchId || 'all',
      dataType: 'uploaded_historical_feed_usage',
      provenance: {
        files: ['PrepAPig_5Y_Daily_Feed_Usage.csv', 'PrepAPig_5Y_Weekly_Forecast.csv', 'PrepAPig_5_Year_Synthetic_Feed_Dataset.xlsx'],
        label: 'Synthetic uploaded feed data',
        aggregation: `Daily rows summed into complete ISO calendar weeks ${sourceBatchId === 'all' ? 'across batches' : 'for the selected batch'}; active-range daily coverage is checked, and points are labeled by week-ending Sunday.`,
        selectedSourceBatchId: sourceBatchId === 'all' ? null : sourceBatchId,
      },
      historicalSummary,
      ...aggregate,
      rationForecasts,
      calculatedMetrics: buildCalculatedMetrics(aggregate.forecast, rationForecasts, reconciliationStatus),
      limitations: [...(aggregate.limitations || []), 'Uploaded data is synthetic and is not actual farm-recorded consumption.', 'Synthetic ration codes are linked to feed-stage names using the explicit feed-stage mapping.'],
      generatedAt: new Date().toISOString(),
    };
  }
  let query = supabase
    .from('feed_records')
    .select('batch_id,feeding_date,quantity_kg')
    .eq('owner_id', ownerId)
    .order('feeding_date', { ascending: true })
    .limit(5000);
  if (batchId && batchId !== 'all') query = query.eq('batch_id', batchId);
  const { data, error } = await query;
  if (error) throw error;
  const daily = aggregateDaily(data || []);
  const recordedForecast = forecastFeedConsumption(daily, horizonDays, windowDays);
  return {
    success: true,
    batchId: batchId || 'all',
    dataType: 'recorded_database_feed_usage',
    ...recordedForecast,
    calculatedMetrics: buildCalculatedMetrics(recordedForecast.forecast || [], [], 'not_applicable'),
    generatedAt: new Date().toISOString(),
  };
};

export { MIN_DAILY_POINTS, aggregateDaily, forecastFeedConsumption, regression, loadUploadedHistoricalData };
