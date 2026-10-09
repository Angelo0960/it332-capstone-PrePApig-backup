import * as reportController from '../controllers/reportController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const reportRouter = express.Router();
reportRouter.use(authMiddleware);

reportRouter.get('/dashboard', reportController.getDashboardReport);

reportRouter.get('/feeds', reportController.getFeedReport);

reportRouter.get('/expenses', reportController.getExpenseReport);
reportRouter.get('/analytics', reportController.getAnalyticsData);

export default reportRouter;