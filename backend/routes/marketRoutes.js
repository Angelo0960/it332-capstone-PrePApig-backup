import express from "express";

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
    getPigMarketPrice
);


/*
 * Force a new Gemini + Google Search request.
 */
router.post(
    "/pig-price/refresh",
    refreshPigMarketPrice
);


export default router;