import * as vaccinationController from '../controllers/vaccineController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const vaccinationRouter = express.Router();

// Specific routes (order matters)
vaccinationRouter.post('/create', authMiddleware, vaccinationController.createVaccination);
vaccinationRouter.get('/all', authMiddleware, vaccinationController.getAllVaccinations);
vaccinationRouter.get('/stock', authMiddleware, vaccinationController.getVaccineStock);
vaccinationRouter.post('/stock/update', authMiddleware, vaccinationController.updateVaccineStock);
vaccinationRouter.get('/batch/:batchId', authMiddleware, vaccinationController.getVaccinationsByBatch);
vaccinationRouter.get('/upcoming', authMiddleware, vaccinationController.getUpcomingVaccinations);

// Generic :id route – must come LAST
vaccinationRouter.get('/:id', authMiddleware, vaccinationController.getVaccinationById);

export default vaccinationRouter;