import express from 'express';
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

// Batch-specific endpoints (require auth via middleware in app.js)
router.get('/batch/:batchId/target', getBatchFeedTargetHandler);
router.get('/batch/:batchId/cost-forecast', getBatchFeedCostForecastHandler);
router.get('/batch/:batchId/actual-vs-planned', getBatchActualVsPlannedHandler);

export default router;