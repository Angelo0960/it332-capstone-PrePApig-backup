import * as reportController from '../controllers/reportController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const reportRouter = express.Router();
reportRouter.use(authMiddleware);

reportRouter.get('/dashboard', reportController.getDashboardReport);

reportRouter.get('/feeds', reportController.getFeedReport);

reportRouter.get('/expenses', reportController.getExpenseReport);
reportRouter.get('/analytics', reportController.getAnalyticsData);
reportRouter.get('/analytics.proto', reportController.getAnalyticsDataProto);

reportRouter.get('/analytics/summary', reportController.getAnalyticsSummary);
reportRouter.get('/analytics/timeseries', reportController.getAnalyticsSummary);
reportRouter.get('/export', reportController.exportReport);

export default reportRouter;