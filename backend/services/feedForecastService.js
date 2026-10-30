import supabase from '../config/supabase.js';

const MIN_DAILY_POINTS = 14;
const DEFAULT_WINDOW_DAYS = 28;
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

const forecastFeedConsumption = (dailyRows, horizonDays = 7, windowDays = DEFAULT_WINDOW_DAYS) => {
  const daily = dailyRows.slice(-Math.max(MIN_DAILY_POINTS, windowDays));
  if (daily.length < MIN_DAILY_POINTS) {
    return { status: 'insufficient_data', historyDays: daily.length, requiredHistoryDays: MIN_DAILY_POINTS, forecast: [], evaluation: null, history: daily };
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
  const forecast = Array.from({ length: clamp(Number(horizonDays) || 7, 1, 14) }, (_, index) => {
    const date = new Date(lastDate);
    date.setUTCDate(date.getUTCDate() + index + 1);
    const predicted = Math.max(0, model.predict(points.length - 1 + index + 1));
    return {
      date: date.toISOString().slice(0, 10),
      predictedKg: Number(predicted.toFixed(3)),
      lowerKg: Number(Math.max(0, predicted - interval).toFixed(3)),
      upperKg: Number((predicted + interval).toFixed(3)),
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
    limitations: ['Forecast uses recent recorded daily consumption only.', 'Forecast is not a replacement for the farm feeding schedule or caretaker judgment.'],
  };
};

export const getFeedConsumptionForecast = async ({ ownerId, batchId, horizonDays = 7, windowDays = DEFAULT_WINDOW_DAYS } = {}) => {
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

export { MIN_DAILY_POINTS, aggregateDaily, forecastFeedConsumption, regression };
