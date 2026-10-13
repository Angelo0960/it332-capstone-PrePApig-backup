import { getFinancialReport } from '../controllers/financialController.js';
import * as reportController from '../controllers/reportController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const reportRouter = express.Router();
reportRouter.use(authMiddleware);

reportRouter.get('/financial', getFinancialReport);

reportRouter.get('/dashboard', reportController.getDashboardReport);

reportRouter.get('/feeds', reportController.getFeedReport);

reportRouter.get('/expenses', reportController.getExpenseReport);
reportRouter.get('/analytics', reportController.getAnalyticsData);
reportRouter.get('/analytics.proto', reportController.getAnalyticsDataProto);

export default reportRouter;