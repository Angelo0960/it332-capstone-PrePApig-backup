import supabase from '../config/supabase.js';
import {
  getFeedProgramByWeek,
  getFeedTargetForBatch,
  getFeedCostForecast,
  getFullFeedProgram,
  getActualVsPlanned,
  mapRationToFeedType
} from '../lib/feedProgram.js';
import { invalidateCache, CACHE_KEYS } from '../lib/supabaseCache.js';

// GET /api/feed-program/week/:week
export const getFeedProgramByWeekHandler = async (req, res) => {
  try {
    const week = parseInt(req.params.week);
    if (isNaN(week) || week < 1 || week > 26) {
      return res.status(400).json({
        success: false,
        message: 'Week must be between 1 and 26'
      });
    }

    const program = getFeedProgramByWeek(week);
    if (!program) {
      return res.status(404).json({
        success: false,
        message: 'Feed program not found for this week'
      });
    }

    res.json({
      success: true,
      data: program
    });
  } catch (error) {
    console.error('Error getting feed program by week:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// GET /api/feed-program/full
export const getFullFeedProgramHandler = async (req, res) => {
  try {
    const program = getFullFeedProgram();
    res.json({
      success: true,
      data: program
    });
  } catch (error) {
    console.error('Error getting full feed program:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// GET /api/feed-program/batch/:batchId/target
export const getBatchFeedTargetHandler = async (req, res) => {
  try {
    const { batchId } = req.params;
    
    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('pig_batches')
      .select('id, pig_count, date_acquired')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    // Calculate weeks since acquired
    const acquiredDate = new Date(batch.date_acquired);
    const now = new Date();
    const weeksSinceAcquired = Math.floor((now - acquiredDate) / (1000 * 60 * 60 * 24 * 7));

    const target = getFeedTargetForBatch(weeksSinceAcquired, batch.pig_count || 0);
    
    if (!target) {
      return res.status(400).json({
        success: false,
        message: 'Unable to calculate feed target'
      });
    }

    res.json({
      success: true,
      data: {
        batchId,
        weeksSinceAcquired,
        currentWeek: Math.max(1, Math.min(26, weeksSinceAcquired + 1)),
        ...target
      }
    });
  } catch (error) {
    console.error('Error getting batch feed target:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// GET /api/feed-program/batch/:batchId/cost-forecast
export const getBatchFeedCostForecastHandler = async (req, res) => {
  try {
    const { batchId } = req.params;
    const forecastWeeks = parseInt(req.query.weeks) || 4;

    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('pig_batches')
      .select('id, pig_count, date_acquired')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    // Get feed stocks for pricing
    const { data: feedStocks, error: stockError } = await supabase
      .from('feed_stocks')
      .select('feed_type, unit_price');

    if (stockError) {
      console.warn('Could not fetch feed stocks:', stockError);
    }

    const forecast = getFeedCostForecast(batch, feedStocks || [], forecastWeeks);
    
    if (forecast.error) {
      return res.status(400).json({
        success: false,
        message: forecast.error
      });
    }

    res.json({
      success: true,
      data: forecast
    });
  } catch (error) {
    console.error('Error getting feed cost forecast:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// GET /api/feed-program/batch/:batchId/actual-vs-planned
export const getBatchActualVsPlannedHandler = async (req, res) => {
  try {
    const { batchId } = req.params;
    const weeksToAnalyze = parseInt(req.query.weeks) || 4;

    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('pig_batches')
      .select('id, pig_count, date_acquired')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    // Get feed records for this batch
    const { data: feedRecords, error: feedError } = await supabase
      .from('feed_records')
      .select('quantity_kg, feeding_date')
      .eq('batch_id', batchId);

    if (feedError) {
      console.warn('Could not fetch feed records:', feedError);
    }

    const comparison = getActualVsPlanned(batch, feedRecords || [], weeksToAnalyze);
    
    if (comparison.error) {
      return res.status(400).json({
        success: false,
        message: comparison.error
      });
    }

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Error getting actual vs planned:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// GET /api/feed-program/ration-map
export const getRationMapHandler = async (req, res) => {
  try {
    // Get all unique rations from feed program
    const { data: feedStocks } = await supabase
      .from('feed_stocks')
      .select('feed_type');

    const availableFeedTypes = feedStocks ? feedStocks.map(s => s.feed_type) : [];
    
    // Map each ration to available feed types
    const rations = [...new Set([
      'Tmpbcs',
      'HGPSM',
      'HS-Premium',
      'HG-Premium'
    ])];

    const mapping = rations.map(ration => ({
      ration,
      mappedFeedType: mapRationToFeedType(ration),
      availableInStocks: availableFeedTypes.includes(mapRationToFeedType(ration))
    }));

    res.json({
      success: true,
      data: mapping
    });
  } catch (error) {
    console.error('Error getting ration map:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};