// Forecasting utilities - linear regression, moving averages, etc.
import * as ss from 'simple-statistics';

/**
 * Linear regression for weight gain prediction
 * Returns { slope (daily gain), intercept, rSquared }
 */
export function linearRegression(x, y) {
  if (x.length !== y.length || x.length < 2) {
    return { slope: 0, intercept: 0, rSquared: 0 };
  }
  
  // Use simple-statistics linear regression
  const points = x.map((xi, i) => [xi, y[i]]);
  const lr = ss.linearRegression(points);
  const rSquared = ss.rSquared(y, points.map(p => lr.m * p[0] + lr.b));
  
  return { 
    slope: lr.m, 
    intercept: lr.b, 
    rSquared: Math.max(0, Math.min(1, rSquared)) 
  };
}

/**
 * Moving average with optional window
 */
export function movingAverage(data, window = 7) {
  if (!data.length) return [];
  
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    result.push(avg);
  }
  return result;
}

/**
 * Weighted moving average (more weight to recent)
 */
export function weightedMovingAverage(data, window = 7) {
  if (!data.length) return [];
  
  const result = [];
  const weights = Array.from({ length: window }, (_, i) => i + 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const sliceWeights = weights.slice(-slice.length);
    const weightedSum = slice.reduce((a, b, j) => a + b * sliceWeights[j], 0);
    result.push(weightedSum / sliceWeights.reduce((a, b) => a + b, 0));
  }
  return result;
}

/**
 * Calculate days to market weight
 * @param {Object} params - { currentWeight, targetWeight, dailyGainRate }
 * @returns {Object} { estimatedDays, estimatedDate, confidence }
 */
export function calculateDaysToMarket({ currentWeight, targetWeight = 95, dailyGainRate }) {
  if (!dailyGainRate || dailyGainRate <= 0 || currentWeight >= targetWeight) {
    return { estimatedDays: 0, estimatedDate: null, confidence: 'none' };
  }
  
  const days = Math.ceil((targetWeight - currentWeight) / dailyGainRate);
  const estimatedDate = new Date();
  estimatedDate.setDate(estimatedDate.getDate() + days);
  
  let confidence = 'low';
  if (dailyGainRate > 0.7) confidence = 'high';
  else if (dailyGainRate > 0.4) confidence = 'medium';
  
  return {
    estimatedDays: days,
    estimatedDate: estimatedDate.toISOString().split('T')[0],
    confidence
  };
}

/**
 * Project feed needs for N days
 * @param {Array} feedRecords - [{ quantity_kg, feeding_date, feed_type }]
 * @param {number} days - Forecast horizon
 * @returns {Object} { avgDailyKg, projectedTotalKg, byFeedType, confidence }
 */
export function projectFeedNeeds(feedRecords, days = 30) {
  if (!feedRecords || feedRecords.length === 0) {
    return { avgDailyKg: 0, projectedTotalKg: 0, byFeedType: {}, confidence: 'none' };
  }
  
  // Group by date
  const dailyTotals = {};
  feedRecords.forEach(r => {
    const date = r.feeding_date;
    if (!dailyTotals[date]) dailyTotals[date] = 0;
    dailyTotals[date] += Number(r.quantity_kg || 0);
  });
  
  const dailyValues = Object.values(dailyTotals);
  const avgDaily = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
  
  // 7-day and 30-day moving averages for trend
  const sortedDates = Object.keys(dailyTotals).sort();
  const sortedValues = sortedDates.map(d => dailyTotals[d]);
  const ma7 = movingAverage(sortedValues, 7);
  const ma30 = movingAverage(sortedValues, 30);
  
  // Trend adjustment (compare recent vs older)
  let trendFactor = 1;
  if (ma7.length >= 7 && ma30.length >= 30) {
    const recent = ma7[ma7.length - 1];
    const older = ma30[ma30.length - 7];
    if (older > 0) trendFactor = recent / older;
  }
  
  const adjustedDaily = avgDaily * trendFactor;
  const projectedTotal = adjustedDaily * days;
  
  // By feed type
  const byType = {};
  feedRecords.forEach(r => {
    const type = r.feed_type || 'Unknown';
    if (!byType[type]) byType[type] = 0;
    byType[type] += Number(r.quantity_kg || 0);
  });
  
  const totalFeed = Object.values(byType).reduce((a, b) => a + b, 0);
  const projectedByType = {};
  Object.entries(byType).forEach(([type, kg]) => {
    projectedByType[type] = Math.round((kg / totalFeed) * projectedTotal);
  });
  
  let confidence = 'low';
  if (feedRecords.length >= 30) confidence = 'high';
  else if (feedRecords.length >= 14) confidence = 'medium';
  
  return {
    avgDailyKg: Math.round(adjustedDaily * 100) / 100,
    projectedTotalKg: Math.round(projectedTotal),
    byFeedType: projectedByType,
    confidence
  };
}

/**
 * Project feed cost based on consumption forecast and current prices
 * @param {Object} feedForecast - Output from projectFeedNeeds
 * @param {Array} feedStocks - [{ feed_type, unit_price }]
 * @returns {Object} { projectedCost, breakdown }
 */
export function projectFeedCost(feedForecast, feedStocks = []) {
  const breakdown = {};
  let totalCost = 0;
  
  Object.entries(feedForecast.byFeedType || {}).forEach(([type, kg]) => {
    const stock = feedStocks.find(s => s.feed_type === type);
    const unitPrice = stock?.unit_price || 0;
    const subtotal = kg * unitPrice;
    breakdown[type] = {
      kg: Math.round(kg),
      unitPrice: Math.round(unitPrice * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100
    };
    totalCost += subtotal;
  });
  
  return {
    projectedCostPhp: Math.round(totalCost * 100) / 100,
    breakdown
  };
}

/**
 * Profitability projection with scenarios
 * @param {Object} params - { currentWeight, targetWeight, dailyGainRate, pigCount, projectedFeedCost, currentExpenses, marketPrice }
 * @returns {Object} { scenarios }
 */
export function projectProfitability({
  currentWeight,
  targetWeight = 95,
  dailyGainRate,
  pigCount,
  projectedFeedCost,
  currentExpenses = 0,
  marketPrice = 190 // PHP/kg
}) {
  const daysToMarket = dailyGainRate > 0 ? Math.ceil((targetWeight - currentWeight) / dailyGainRate) : 0;
  const estimatedMarketDate = new Date();
  estimatedMarketDate.setDate(estimatedMarketDate.getDate() + daysToMarket);
  
  const totalWeight = targetWeight * pigCount;
  const totalRevenue = (p => p * marketPrice)(totalWeight);
  
  // Estimate remaining expenses (proportional to days)
  const dailyExpenseRate = currentExpenses / Math.max(1, daysToMarket);
  const remainingExpenses = dailyExpenseRate * daysToMarket;
  
  const scenarios = {
    conservative: {
      marketPricePhpKg: Math.round(marketPrice * 0.9),
      totalRevenue: Math.round(totalRevenue * 0.9),
      totalFeedCost: Math.round(projectedFeedCost),
      totalExpenses: Math.round(currentExpenses + remainingExpenses),
      netProfit: 0,
      profitPerPig: 0
    },
    expected: {
      marketPricePhpKg: marketPrice,
      totalRevenue: Math.round(totalRevenue),
      totalFeedCost: Math.round(projectedFeedCost),
      totalExpenses: Math.round(currentExpenses + remainingExpenses),
      netProfit: 0,
      profitPerPig: 0
    },
    optimistic: {
      marketPricePhpKg: Math.round(marketPrice * 1.1),
      totalRevenue: Math.round(totalRevenue * 1.1),
      totalFeedCost: Math.round(projectedFeedCost),
      totalExpenses: Math.round(currentExpenses + remainingExpenses),
      netProfit: 0,
      profitPerPig: 0
    }
  };
  
  Object.values(scenarios).forEach(s => {
    s.netProfit = s.totalRevenue - s.totalFeedCost - s.totalExpenses;
    s.profitPerPig = pigCount > 0 ? Math.round(s.netProfit / pigCount) : 0;
  });
  
  return {
    estimatedMarketDate: estimatedMarketDate.toISOString().split('T')[0],
    daysToMarket,
    scenarios
  };
}

/**
 * Get daily gain rate from weight history
 */
export function calculateDailyGainRate(weightHistory) {
  if (!weightHistory || weightHistory.length < 2) return null;
  
  const sorted = [...weightHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  
  const daysDiff = (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24);
  if (daysDiff <= 0) return null;
  
  return (last.weight - first.weight) / daysDiff;
}

export function getConfidenceLabel(rSquared, dataPoints) {
  if (dataPoints < 5) return 'low';
  if (rSquared > 0.8 && dataPoints >= 14) return 'high';
  if (rSquared > 0.5 && dataPoints >= 7) return 'medium';
  return 'low';
}