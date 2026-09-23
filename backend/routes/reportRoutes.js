import * as reportController from '../controllers/reportController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const reportRouter = express.Router();

reportRouter.get('/dashboard', authMiddleware, reportController.getDashboardReport);

reportRouter.get('/feeds', authMiddleware, reportController.getFeedReport);

reportRouter.get('/expenses', authMiddleware, reportController.getExpenseReport);

export default reportRouter;