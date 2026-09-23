import * as pigBatchController from '../controllers/pigController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const pigBatchRouter = express.Router();

// Batch CRUD
pigBatchRouter.post('/create', authMiddleware, pigBatchController.createBatch);
pigBatchRouter.get('/all', authMiddleware, pigBatchController.getAllBatches);
pigBatchRouter.get('/active', authMiddleware, pigBatchController.getActiveBatches);
pigBatchRouter.get('/summary', authMiddleware, pigBatchController.getBatchSummary);

// Feed schedule endpoints
pigBatchRouter.get('/:id/feed-schedule', authMiddleware, pigBatchController.getBatchFeedSchedule);
pigBatchRouter.post('/:id/validate-ration', authMiddleware, pigBatchController.validateBatchFeedRation);

// Individual pig management – MUST COME BEFORE the generic :id
pigBatchRouter.get('/batch/:batchId/pigs', authMiddleware, pigBatchController.getPigsByBatch);
pigBatchRouter.post('/pig', authMiddleware, pigBatchController.createPig);
pigBatchRouter.put('/pig/:id', authMiddleware, pigBatchController.updatePig);
pigBatchRouter.delete('/pig/:id', authMiddleware, pigBatchController.deletePig);

// Weight history & FCR endpoints – MUST COME BEFORE generic :id
pigBatchRouter.get('/:id/weight-history', authMiddleware, pigBatchController.getWeightHistory);
pigBatchRouter.post('/:id/weight-log', authMiddleware, pigBatchController.logWeight);
pigBatchRouter.get('/:id/fcr', authMiddleware, pigBatchController.getFCR);
pigBatchRouter.post('/:id/fcr/recalculate', authMiddleware, pigBatchController.recalculateFCR);

// Batch by ID – MUST COME LAST
pigBatchRouter.get('/:id', authMiddleware, pigBatchController.getBatchById);
pigBatchRouter.put('/:id', authMiddleware, pigBatchController.updateBatch);
pigBatchRouter.delete('/:id', authMiddleware, pigBatchController.deleteBatch);
pigBatchRouter.patch('/:id/weight', authMiddleware, pigBatchController.updateWeight);

export default pigBatchRouter;