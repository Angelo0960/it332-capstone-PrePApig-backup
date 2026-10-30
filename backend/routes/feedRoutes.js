import * as feedController from '../controllers/feedController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateBody } from '../middlewares/validate.js';
import { getFeedConsumptionForecast } from '../services/feedForecastService.js';
import { generateFeedForecastAnalysis } from '../services/feedForecastAiService.js';
import { rateLimit } from '../middlewares/rateLimit.js';

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
    const forecast = await getFeedConsumptionForecast({ ownerId: req.user.id, batchId: req.body?.batch_id || 'all', horizonWeeks: req.body?.horizon_weeks || 4, source: 'uploaded_historical' });
    const analysis = await generateFeedForecastAnalysis({ forecast });
    res.json({ ...analysis, forecast: { status: forecast.status, granularity: forecast.granularity, historicalSummary: forecast.historicalSummary, evaluation: forecast.evaluation, provenance: forecast.provenance } });
  } catch (error) {
    console.error(JSON.stringify({ event: 'feed_forecast_ai_failed', requestId: req.requestId, message: String(error.message || '').slice(0, 300) }));
    const missingKey = String(error.message || '').includes('API key is not configured');
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