import * as feedController from '../controllers/feedController.js';
import express from 'express';

const feedRouter = express.Router();

// Feed record routes
feedRouter.post('/create', feedController.createFeedRecord);
feedRouter.get('/all', feedController.getAllFeedRecords);
feedRouter.get('/batch/:batchId', feedController.getFeedByBatch);
feedRouter.get('/summary', feedController.getFeedSummary);

// Feed stock routes (must come BEFORE the generic :id)
feedRouter.get('/stock', feedController.getFeedStock);
feedRouter.post('/stock/update', feedController.updateFeedStock);

// Generic :id route – must come LAST
feedRouter.get('/:id', feedController.getFeedRecordById);
feedRouter.put('/:id', feedController.updateFeedRecord);
feedRouter.delete('/:id', feedController.deleteFeedRecord);

export default feedRouter;