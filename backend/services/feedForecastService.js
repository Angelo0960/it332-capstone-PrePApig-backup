import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import supabase from '../config/supabase.js';

const MIN_DAILY_POINTS = 14;
const DEFAULT_WINDOW_DAYS = 28;
const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/data');
const MAX_SOURCE_DATE = new Date().toISOString().slice(0, 10);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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

const readCsv = (filename) => {
  const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8').replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(',');
  return lines.map((line) => {
    const values = line.split(',');
    return headers.reduce((row, header, index) => ({ ...row, [header]: values[index] ?? '' }), {});
  });
};

const loadUploadedHistoricalData = ({ batchId } = {}) => {
  const dailyRows = readCsv('PrepAPig_5Y_Daily_Feed_Usage.csv')
    .filter((row) => row.date <= MAX_SOURCE_DATE)
    .filter((row) => !batchId || batchId === 'all' || row.batch_id === batchId)
    .map((row) => ({ feeding_date: row.date, quantity_kg: Number(row.actual_feed_kg), planned_kg: Number(row.planned_daily_kg_per_pig) * Number(row.active_pigs), dataType: row.data_type }));
  const weeklyRows = readCsv('PrepAPig_5Y_Weekly_Forecast.csv')
    .filter((row) => row.week_start <= MAX_SOURCE_DATE)
    .filter((row) => !batchId || batchId === 'all' || row.batch_id === batchId);
  return { dailyRows, weeklyRows };
};

const summarizeUploadedHistory = (dailyRows, weeklyRows) => {
  const actualKg = dailyRows.reduce((sum, row) => sum + (Number(row.quantity_kg) || 0), 0);
  const plannedKg = dailyRows.reduce((sum, row) => sum + (Number(row.planned_kg) || 0), 0);
  const recent = weeklyRows.slice(-12);
  const avgPricePerBag = recent.length ? recent.reduce((sum, row) => sum + Number(row.price_per_50kg_bag_php || 0), 0) / recent.length : null;
  const dates = dailyRows.map((row) => row.feeding_date).sort();
  return {
    actualKg: Number(actualKg.toFixed(3)), plannedKg: Number(plannedKg.toFixed(3)), varianceKg: Number((actualKg - plannedKg).toFixed(3)),
    actualBagEquivalent: Number((actualKg / 50).toFixed(3)), plannedBagEquivalent: Number((plannedKg / 50).toFixed(3)),
    averageRecentPricePer50kgBagPhp: avgPricePerBag ? Number(avgPricePerBag.toFixed(2)) : null,
    sourceRows: dailyRows.length, sourceDateStart: dates[0] || null, sourceDateEnd: dates.at(-1) || null,
  };
};

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
    limitations: options.limitations || ['Forecast is a transparent statistical baseline, not an AI-generated quantity.', 'Uploaded source data is synthetic historical input and must not be treated as verified farm measurements.', 'Forecast does not replace recorded feed, inventory, expense, or FCR calculations.'],
    ...options,
  };
};

export const getFeedConsumptionForecast = async ({ ownerId, batchId, horizonDays = 7, windowDays = DEFAULT_WINDOW_DAYS, source = 'recorded' } = {}) => {
  if (source === 'uploaded_historical') {
    const { dailyRows, weeklyRows } = loadUploadedHistoricalData({ batchId });
    const historicalSummary = summarizeUploadedHistory(dailyRows, weeklyRows);
    return {
      success: true,
      batchId: batchId || 'all',
      dataType: 'uploaded_synthetic_historical_feed_usage',
      provenance: { files: ['PrepAPig_5Y_Daily_Feed_Usage.csv', 'PrepAPig_5Y_Weekly_Forecast.csv', 'PrepAPig_5_Year_Synthetic_Feed_Dataset.xlsx'], label: 'Synthetic historical input supplied by the user' },
      historicalSummary,
      ...forecastFeedConsumption(aggregateDaily(dailyRows), horizonDays, windowDays, { averageRecentPricePer50kgBagPhp: historicalSummary.averageRecentPricePer50kgBagPhp, historicalSummary }),
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
  return {
    success: true,
    batchId: batchId || 'all',
    dataType: 'recorded_database_feed_usage',
    ...forecastFeedConsumption(daily, horizonDays, windowDays),
    generatedAt: new Date().toISOString(),
  };
};

export { MIN_DAILY_POINTS, aggregateDaily, forecastFeedConsumption, regression, loadUploadedHistoricalData };
