import { getLatestPigMarketPrices } from './pigMarketPriceHistoryService.js';

const MIN_HISTORY_POINTS = 8;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const linearRegression = (points) => {
  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;
  const denominator = points.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
  const slope = denominator === 0 ? 0 : points.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0) / denominator;
  const intercept = meanY - (slope * meanX);
  return { slope, intercept, predict: (x) => intercept + (slope * x) };
};

const toPoint = (row) => {
  const date = row.observed_date || row.retrieved_at;
  const y = Number(row.price_average);
  const time = new Date(date).getTime();
  return Number.isFinite(time) && Number.isFinite(y) ? { date: date.slice(0, 10), x: time, y } : null;
};

const forecastLocation = (municipality, rows, horizonWeeks) => {
  const points = rows.map(toPoint).filter(Boolean).sort((a, b) => a.x - b.x);
  if (points.length < MIN_HISTORY_POINTS) {
    return { municipality, status: 'insufficient_data', historyPoints: points.length, requiredHistoryPoints: MIN_HISTORY_POINTS, forecast: [], evaluation: null };
  }
  const holdoutCount = Math.max(2, Math.floor(points.length * 0.2));
  const training = points.slice(0, -holdoutCount);
  const holdout = points.slice(-holdoutCount);
  const model = linearRegression(training);
  const errors = holdout.map((point) => point.y - model.predict(point.x));
  const mae = errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length;
  const residualStdDev = Math.sqrt(errors.reduce((sum, value) => sum + ((value - (errors.reduce((a, b) => a + b, 0) / errors.length)) ** 2), 0) / Math.max(1, errors.length - 1));
  const lastDate = new Date(points[points.length - 1].x);
  const forecast = Array.from({ length: clamp(Number(horizonWeeks) || 4, 1, 12) }, (_, index) => {
    const date = new Date(lastDate);
    date.setDate(date.getDate() + ((index + 1) * 7));
    const predicted = clamp(model.predict(date.getTime()), 0, 1000);
    const interval = Math.max(residualStdDev * 1.96, mae);
    return {
      weekStart: date.toISOString().slice(0, 10),
      predictedPricePhpPerKg: Number(predicted.toFixed(2)),
      lowerPhpPerKg: Number(clamp(predicted - interval, 0, 1000).toFixed(2)),
      upperPhpPerKg: Number(clamp(predicted + interval, 0, 1000).toFixed(2)),
    };
  });
  return {
    municipality,
    status: 'forecasted',
    historyPoints: points.length,
    lastObservedDate: points[points.length - 1].date,
    evaluation: { holdoutPoints: holdoutCount, meanAbsoluteErrorPhpPerKg: Number(mae.toFixed(2)) },
    forecast,
    limitations: ['Statistical trend forecast, not a guaranteed buyer quote.', 'Forecast quality depends on dated, comparable observations.'],
  };
};

export const forecastPigMarketPrices = async ({ locations, horizonWeeks = 4 } = {}) => {
  const rows = await getLatestPigMarketPrices({ locations, limit: 1000 });
  const grouped = rows.reduce((map, row) => {
    const list = map.get(row.municipality) || [];
    list.push(row);
    map.set(row.municipality, list);
    return map;
  }, new Map());
  const requested = locations?.length ? locations : [...grouped.keys()];
  return {
    success: true,
    horizonWeeks: clamp(Number(horizonWeeks) || 4, 1, 12),
    methodology: 'linear trend with chronological holdout evaluation and 95% residual interval',
    results: requested.map((location) => forecastLocation(location, grouped.get(location) || [], horizonWeeks)),
    generatedAt: new Date().toISOString(),
  };
};

export { MIN_HISTORY_POINTS, linearRegression, forecastLocation };
