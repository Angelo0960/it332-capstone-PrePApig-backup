import * as analyticsController from '../controllers/analyticsController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/batch/:batchId', authMiddleware, analyticsController.getBatchAnalytics);
router.get('/', authMiddleware, analyticsController.getAllAnalytics);

export default router;