import * as vaccinationController from '../controllers/vaccineController.js';
import express from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { validateBody } from '../middlewares/validate.js';

const vaccinationRouter = express.Router();
vaccinationRouter.use(authMiddleware);

// Specific routes (order matters)
vaccinationRouter.post('/create', validateBody({ required: ['batch_id', 'vaccine_name', 'vaccination_date'], nonNegative: ['dosage'] }), vaccinationController.createVaccination);
vaccinationRouter.get('/all', vaccinationController.getAllVaccinations);
vaccinationRouter.get('/stock', vaccinationController.getVaccineStock);
vaccinationRouter.post('/stock/update', validateBody({ required: ['vaccine_name', 'stock_quantity'], nonNegative: ['stock_quantity', 'price_per_dose'] }), vaccinationController.updateVaccineStock); // ✅ NEW
vaccinationRouter.get('/batch/:batchId', vaccinationController.getVaccinationsByBatch);
vaccinationRouter.get('/upcoming', vaccinationController.getUpcomingVaccinations);

// Generic :id route – must come LAST
vaccinationRouter.get('/:id', vaccinationController.getVaccinationById);

export default vaccinationRouter;