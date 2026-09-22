import supabase from '../config/supabase.js';
import { invalidateCache, CACHE_KEYS } from '../lib/supabaseCache.js';
import { 
  linearRegression, 
  movingAverage, 
  calculateDaysToMarket, 
  projectFeedNeeds, 
  projectFeedCost, 
  projectProfitability,
  calculateDailyGainRate,
  getConfidenceLabel
} from '../lib/forecastUtils.js';

const TARGET_WEIGHT_KG = process.env.FORECAST_TARGET_WEIGHT_KG ? Number(process.env.FORECAST_TARGET_WEIGHT_KG) : 95;

// GET /api/forecast/batch/:id/days-to-market
export const getDaysToMarket = async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: batch, error: batchError } = await supabase
      .from('pig_batches')
      .select('current_weight, weight_history, date_acquired, pig_count, breed')
      .eq('id', id)
      .single();
    
    if (batchError || !batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    
    const dailyGainRate = calculateDailyGainRate(batch.weight_history);
    const result = calculateDaysToMarket({
      currentWeight: Number(batch.current_weight || 0),
      targetWeight: TARGET_WEIGHT_KG,
      dailyGainRate
    });
    
    // Linear regression details for confidence
    let rSquared = 0;
    if (batch.weight_history && batch.weight_history.length >= 2) {
      const sorted = [...batch.weight_history].sort((a, b) => new Date(a.date) - new Date(b.date));
      const x = sorted.map((_, i) => i);
      const y = sorted.map(h => h.weight);
      const lr = linearRegression(x, y);
      rSquared = lr.rSquared;
    }
    
    res.status(200).json({
      success: true,
      data: {
        batch_id: id,
        current_weight: Number(batch.current_weight || 0),
        target_weight: TARGET_WEIGHT_KG,
        daily_gain_rate: dailyGainRate ? Math.round(dailyGainRate * 100) / 100 : null,
        estimated_days_to_market: result.estimatedDays,
        estimated_market_date: result.estimatedDate,
        confidence: result.confidence || getConfidenceLabel(rSquared, batch.weight_history?.length || 0),
        r_squared: Math.round(rSquared * 100) / 100
      }
    });
  } catch (error) {
    console.error('Error in getDaysToMarket:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/forecast/batch/:id/feed-needs?days=30
export const getFeedNeeds = async (req, res) => {
  try {
    const { id } = req.params;
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    
    const { data: batch, error: batchError } = await supabase
      .from('pig_batches')
      .select('pig_count, date_acquired')
      .eq('id', id)
      .single();
    
    if (batchError || !batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    
    const { data: feedRecords } = await supabase
      .from('feed_records')
      .select('quantity_kg, feeding_date, feed_type')
      .eq('batch_id', id)
      .order('feeding_date', { ascending: true });
    
    const forecast = projectFeedNeeds(feedRecords || [], days);
    
    res.status(200).json({
      success: true,
      data: {
        batch_id: id,
        forecast_days: days,
        ...forecast
      }
    });
  } catch (error) {
    console.error('Error in getFeedNeeds:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/forecast/batch/:id/feed-cost?days=30
export const getFeedCost = async (req, res) => {
  try {
    const { id } = req.params;
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    
    const { data: batch, error: batchError } = await supabase
      .from('pig_batches')
      .select('pig_count')
      .eq('id', id)
      .single();
    
    if (batchError || !batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    
    const { data: feedRecords } = await supabase
      .from('feed_records')
      .select('quantity_kg, feeding_date, feed_type')
      .eq('batch_id', id);
    
    const { data: feedStocks } = await supabase
      .from('feed_stocks')
      .select('feed_type, unit_price');
    
    const feedForecast = projectFeedNeeds(feedRecords || [], days);
    const costForecast = projectFeedCost(feedForecast, feedStocks || []);
    
    res.status(200).json({
      success: true,
      data: {
        batch_id: id,
        forecast_days: days,
        ...feedForecast,
        ...costForecast
      }
    });
  } catch (error) {
    console.error('Error in getFeedCost:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/forecast/batch/:id/profitability
export const getProfitability = async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: batch, error: batchError } = await supabase
      .from('pig_batches')
      .select('current_weight, pig_count, date_acquired, weight_history')
      .eq('id', id)
      .single();
    
    if (batchError || !batch) {
      return res.status(404).json({ success: false, message: 'Batch not found' });
    }
    
    const { data: feedRecords } = await supabase
      .from('feed_records')
      .select('quantity_kg, feeding_date, feed_type')
      .eq('batch_id', id);
    
    const { data: feedStocks } = await supabase
      .from('feed_stocks')
      .select('feed_type, unit_price');
    
    const { data: expenses } = await supabase
      .from('expenses')
      .select('amount')
      .eq('batch_id', id);
    
    const currentExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    
    const dailyGainRate = calculateDailyGainRate(batch.weight_history);
    const feedForecast = projectFeedNeeds(feedRecords || [], 90); // 90 days for cost projection
    const costForecast = projectFeedCost(feedForecast, feedStocks || []);
    
    // Market price - could be enhanced with market price service
    const marketPrice = 190; // PHP/kg default
    
    const profitability = projectProfitability({
      currentWeight: Number(batch.current_weight || 0),
      targetWeight: TARGET_WEIGHT_KG,
      dailyGainRate,
      pigCount: Number(batch.pig_count || 0),
      projectedFeedCost: costForecast.projectedCostPhp,
      currentExpenses,
      marketPrice
    });
    
    res.status(200).json({
      success: true,
      data: {
        batch_id: id,
        estimated_market_date: profitability.estimatedMarketDate,
        days_to_market: profitability.daysToMarket,
        scenarios: profitability.scenarios
      }
    });
  } catch (error) {
    console.error('Error in getProfitability:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};