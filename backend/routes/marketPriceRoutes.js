import express from 'express';
import { fetchBatangasPigPrice } from '../services/pigPriceScraper.js';

const marketPriceRouter = express.Router();

marketPriceRouter.get('/pigs', async (_req, res) => {
  try {
    const result = await fetchBatangasPigPrice();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error scraping pig prices:', error);
    res.status(502).json({
      success: false,
      message: 'Pig price source is temporarily unavailable',
    });
  }
});

export default marketPriceRouter;
