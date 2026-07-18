import * as vaccinationController from '../controllers/vaccineController.js';
import express from 'express';

const vaccinationRouter = express.Router();

// Specific routes (order matters)
vaccinationRouter.post('/create', vaccinationController.createVaccination);
vaccinationRouter.get('/all', vaccinationController.getAllVaccinations);
vaccinationRouter.get('/stock', vaccinationController.getVaccineStock);
vaccinationRouter.post('/stock/update', vaccinationController.updateVaccineStock); // ✅ NEW
vaccinationRouter.get('/batch/:batchId', vaccinationController.getVaccinationsByBatch);
vaccinationRouter.get('/upcoming', vaccinationController.getUpcomingVaccinations);

// Generic :id route – must come LAST
vaccinationRouter.get('/:id', vaccinationController.getVaccinationById);

export default vaccinationRouter;