import express from "express";
import { authMiddleware } from '../middlewares/authMiddleware.js';

import {
    getPigMarketPrice,
    refreshPigMarketPrice,
} from "../controllers/marketController.js";


const router = express.Router();


/*
 * Get latest cached market report.
 */
router.get(
    "/pig-price",
    authMiddleware,
    getPigMarketPrice
);


/*
 * Force a new Gemini + Google Search request.
 */
router.post(
    "/pig-price/refresh",
    authMiddleware,
    refreshPigMarketPrice
);


export default router;