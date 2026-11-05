import { getFinancialReport } from '../controllers/financialController.js';
import * as reportController from '../controllers/reportController.js';
import { generateAiProfitAnalysis } from '../controllers/profitAnalysisController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { rateLimit } from '../middlewares/rateLimit.js';

const profitAiRateLimit = rateLimit({ limit: 10, windowMs: 15 * 60 * 1000, key: (req) => req.user?.id || req.ip });

const reportRouter = express.Router();
reportRouter.use(authMiddleware);

reportRouter.get('/financial', getFinancialReport);
reportRouter.post('/ai-profit-analysis', profitAiRateLimit, generateAiProfitAnalysis);

reportRouter.get('/dashboard', reportController.getDashboardReport);

reportRouter.get('/feeds', reportController.getFeedReport);

reportRouter.get('/expenses', reportController.getExpenseReport);
reportRouter.get('/sold-batches', reportController.getSoldBatchesReport);
reportRouter.get('/batch-weight-summary', reportController.getBatchWeightSummary);
reportRouter.get('/analytics', reportController.getAnalyticsData);
reportRouter.get('/analytics.proto', reportController.getAnalyticsDataProto);

reportRouter.get('/analytics/summary', reportController.getAnalyticsSummary);
reportRouter.get('/analytics/timeseries', reportController.getAnalyticsSummary);
reportRouter.get('/export', reportController.exportReport);

export default reportRouter;