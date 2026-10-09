import express from 'express';
import { fetchBatangasPigPrice } from '../services/pigPriceScraper.js';
import { generatePigPriceAnalysis } from '../services/geminiPigPriceService.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

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

marketPriceRouter.post('/pigs/ai-analysis', authMiddleware, async (req, res) => {
  try {
    const priceData = await fetchBatangasPigPrice();
    const locations = Array.isArray(req.body?.locations) && req.body.locations.length > 0
      ? req.body.locations
      : priceData.priceSourceLocations;

    const result = await generatePigPriceAnalysis({
      locations,
      provincialReference: {
        location: priceData.data.location,
        period: priceData.data.period,
        pricePhpPerKg: priceData.data.pricePhpPerKg,
        unit: priceData.data.unit,
      },
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error generating Gemini pig-price analysis:', error);
    const status = error.message.startsWith('Gemini API key is not configured') ? 503 : 502;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
});

export default marketPriceRouter;
