import * as feedController from '../controllers/feedController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateBody } from '../middlewares/validate.js';
import { getFeedConsumptionForecast } from '../services/feedForecastService.js';
import { generateFeedForecastAnalysis, buildStockContext } from '../services/feedForecastAiService.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import supabase from '../config/supabase.js';

const feedRouter = express.Router();
feedRouter.use(authMiddleware);

// Feed record routes
feedRouter.post('/create', validateBody({ required: ['batch_id', 'feed_type', 'quantity_kg', 'feeding_date'], nonNegative: ['quantity_kg'] }), feedController.createFeedRecord);
feedRouter.get('/all', feedController.getAllFeedRecords);
feedRouter.get('/overview', feedController.getFeedOverview);
feedRouter.get('/batch/:batchId', feedController.getFeedByBatch);
feedRouter.get('/summary', feedController.getFeedSummary);
feedRouter.get('/forecast', async (req, res) => {
  try {
    const result = await getFeedConsumptionForecast({
      ownerId: req.user.id,
      batchId: req.query.batch_id || 'all',
      horizonDays: req.query.horizon_days,
      horizonWeeks: req.query.horizon_weeks,
      windowDays: req.query.window_days,
      source: req.query.source || 'recorded',
    });
    res.json(result);
  } catch (error) {
    console.error(JSON.stringify({ event: 'feed_forecast_failed', requestId: req.requestId, message: error.message }));
    res.status(502).json({ success: false, message: 'Feed consumption forecast is unavailable', requestId: req.requestId });
  }
});

feedRouter.post('/forecast/ai-analysis', rateLimit({ limit: 5, windowMs: 600000, key: (req) => req.user.id }), async (req, res) => {
  try {
    const forecast = await getFeedConsumptionForecast({ ownerId: req.user.id, batchId: req.body?.batch_id || 'all', horizonWeeks: req.body?.horizon_weeks || 1, source: 'uploaded_historical' });
    if (forecast.status !== 'forecasted') {
      return res.json({ success: true, available: false, forecast, aiAnalysis: null, aiAnalysisError: 'A statistical feed forecast is not available for this selection.' });
    }
    const { data: feedStocks, error: stockError } = await supabase
      .from('feed_stocks')
      .select('feed_type,stock_quantity,unit_price,last_updated')
      .eq('owner_id', req.user.id)
      .order('feed_type');
    if (stockError && stockError.code !== '42P01') throw stockError;
    const stocks = stockError?.code === '42P01' ? null : (feedStocks || []);
    forecast.feedStockSnapshot = buildStockContext(stocks, forecast.forecast || [], forecast.rationForecasts || []);
    try {
      const analysis = await generateFeedForecastAnalysis({
        ownerId: req.user.id,
        cacheScope: [req.body?.batch_id || 'all', req.body?.horizon_weeks || 1, 'uploaded_historical'].join(':'),
        forecast,
        feedStocks: stocks,
        stockContext: forecast.feedStockSnapshot,
      });
      res.json({ success: true, available: true, aiAnalysis: analysis, aiAnalysisError: analysis.cacheMetadata?.error?.message || null, errorCategory: analysis.cacheMetadata?.error?.category || null, forecast });
    } catch (error) {
      console.error(JSON.stringify({ event: 'feed_forecast_ai_failed', requestId: req.requestId, category: error.category || 'provider_error' }));
      res.json({ success: true, available: true, aiAnalysis: null, aiAnalysisError: error.message || 'Feed forecast AI analysis is temporarily unavailable', errorCategory: error.category || 'provider_error', forecast });
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'feed_forecast_ai_failed', requestId: req.requestId, message: String(error.message || '').slice(0, 300) }));
    const message = String(error.message || '');
    const missingKey = message.includes('API key is not configured') || message.includes('No AI provider is configured');
    res.status(missingKey ? 503 : 502).json({ success: false, message: missingKey ? 'Feed forecast AI analysis is not configured' : 'Feed forecast AI analysis is temporarily unavailable', requestId: req.requestId });
  }
});

// Feed stock routes (must come BEFORE the generic :id)
feedRouter.get('/stock', feedController.getFeedStock);
feedRouter.post('/stock/update', validateBody({ required: ['feed_type'], nonNegative: ['stock_quantity', 'unit_price'], nullable: ['unit_price'] }), feedController.updateFeedStock);

// Generic :id route – must come LAST
feedRouter.get('/:id', feedController.getFeedRecordById);
feedRouter.put('/:id', validateBody({ update: true, forbidden: ['batch_id'], nonNegative: ['quantity_kg'] }), feedController.updateFeedRecord);
feedRouter.delete('/:id', feedController.deleteFeedRecord);

export default feedRouter;