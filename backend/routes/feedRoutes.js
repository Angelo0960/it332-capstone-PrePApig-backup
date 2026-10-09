import * as feedController from '../controllers/feedController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateBody } from '../middlewares/validate.js';

const feedRouter = express.Router();
feedRouter.use(authMiddleware);

// Feed record routes
feedRouter.post('/create', validateBody({ required: ['batch_id', 'feed_type', 'quantity_kg', 'feeding_date'], nonNegative: ['quantity_kg'] }), feedController.createFeedRecord);
feedRouter.get('/all', feedController.getAllFeedRecords);
feedRouter.get('/batch/:batchId', feedController.getFeedByBatch);
feedRouter.get('/summary', feedController.getFeedSummary);

// Feed stock routes (must come BEFORE the generic :id)
feedRouter.get('/stock', feedController.getFeedStock);
feedRouter.post('/stock/update', validateBody({ required: ['feed_type', 'stock_quantity'], nonNegative: ['stock_quantity', 'unit_price'] }), feedController.updateFeedStock);

// Generic :id route – must come LAST
feedRouter.get('/:id', feedController.getFeedRecordById);
feedRouter.put('/:id', feedController.updateFeedRecord);
feedRouter.delete('/:id', feedController.deleteFeedRecord);

export default feedRouter;