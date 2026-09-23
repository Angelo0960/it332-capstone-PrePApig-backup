import * as forecastController from '../controllers/forecastController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const forecastRouter = express.Router();

// Forecast endpoints
forecastRouter.get('/batch/:id/days-to-market', authMiddleware, forecastController.getDaysToMarket);
forecastRouter.get('/batch/:id/feed-needs', authMiddleware, forecastController.getFeedNeeds);
forecastRouter.get('/batch/:id/feed-cost', authMiddleware, forecastController.getFeedCost);
forecastRouter.get('/batch/:id/profitability', authMiddleware, forecastController.getProfitability);

export default forecastRouter;