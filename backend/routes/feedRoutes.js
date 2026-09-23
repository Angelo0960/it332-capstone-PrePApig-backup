import * as feedController from '../controllers/feedController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const feedRouter = express.Router();

// Feed record routes
feedRouter.post('/create', authMiddleware, feedController.createFeedRecord);
feedRouter.get('/all', authMiddleware, feedController.getAllFeedRecords);
feedRouter.get('/batch/:batchId', authMiddleware, feedController.getFeedByBatch);
feedRouter.get('/summary', authMiddleware, feedController.getFeedSummary);

// Feed stock routes (must come BEFORE the generic :id)
feedRouter.get('/stock', authMiddleware, feedController.getFeedStock);
feedRouter.post('/stock/update', authMiddleware, feedController.updateFeedStock);

// Generic :id route – must come LAST
feedRouter.get('/:id', authMiddleware, feedController.getFeedRecordById);
feedRouter.put('/:id', authMiddleware, feedController.updateFeedRecord);
feedRouter.delete('/:id', authMiddleware, feedController.deleteFeedRecord);

export default feedRouter;