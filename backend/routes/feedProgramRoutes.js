import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import {
  getFeedProgramByWeekHandler,
  getFullFeedProgramHandler,
  getBatchFeedTargetHandler,
  getBatchFeedCostForecastHandler,
  getBatchActualVsPlannedHandler,
  getRationMapHandler
} from '../controllers/feedProgramController.js';

const router = express.Router();

// Public feed program endpoints (no auth required for reference data)
router.get('/week/:week', getFeedProgramByWeekHandler);
router.get('/full', getFullFeedProgramHandler);
router.get('/ration-map', getRationMapHandler);

// Batch-specific endpoints (require authentication)
router.get('/batch/:batchId/target', authMiddleware, getBatchFeedTargetHandler);
router.get('/batch/:batchId/cost-forecast', authMiddleware, getBatchFeedCostForecastHandler);
router.get('/batch/:batchId/actual-vs-planned', authMiddleware, getBatchActualVsPlannedHandler);

export default router;