import * as pigBatchController from '../controllers/pigController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const pigBatchRouter = express.Router();

// Batch CRUD
pigBatchRouter.post('/create', authMiddleware, pigBatchController.createBatch);
pigBatchRouter.get('/all', pigBatchController.getAllBatches);
pigBatchRouter.get('/active', pigBatchController.getActiveBatches);
pigBatchRouter.get('/summary', pigBatchController.getBatchSummary);

// Individual pig management – MUST COME BEFORE the generic :id
pigBatchRouter.get('/batch/:batchId/pigs', pigBatchController.getPigsByBatch);
pigBatchRouter.post('/pig', pigBatchController.createPig);
pigBatchRouter.put('/pig/:id', pigBatchController.updatePig);
pigBatchRouter.delete('/pig/:id', pigBatchController.deletePig);

// Batch by ID – MUST COME LAST
pigBatchRouter.get('/:id', pigBatchController.getBatchById);
pigBatchRouter.put('/:id', pigBatchController.updateBatch);
pigBatchRouter.delete('/:id', pigBatchController.deleteBatch);
pigBatchRouter.patch('/:id/weight', pigBatchController.updateWeight);

export default pigBatchRouter;