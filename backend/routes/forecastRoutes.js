import * as forecastController from '../controllers/forecastController.js';
import express from 'express';

const forecastRouter = express.Router();

// Forecast endpoints
forecastRouter.get('/batch/:id/days-to-market', forecastController.getDaysToMarket);
forecastRouter.get('/batch/:id/feed-needs', forecastController.getFeedNeeds);
forecastRouter.get('/batch/:id/feed-cost', forecastController.getFeedCost);
forecastRouter.get('/batch/:id/profitability', forecastController.getProfitability);

export default forecastRouter;