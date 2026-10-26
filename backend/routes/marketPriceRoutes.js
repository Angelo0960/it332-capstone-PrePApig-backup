import express from 'express';
import { fetchBatangasPigPrice } from '../services/pigPriceScraper.js';
import { generatePigPriceAnalysis } from '../services/openaiPigPriceService.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

import { rateLimit } from '../middlewares/rateLimit.js';

const marketPriceRouter = express.Router();

marketPriceRouter.get('/pigs', rateLimit({ limit: 60, windowMs: 60000 }), async (_req, res) => {
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

marketPriceRouter.post('/pigs/ai-analysis', authMiddleware, rateLimit({ limit: 5, windowMs: 600000, key: (req) => req.user.id }), async (req, res) => {
  try {
    if (req.body?.locations !== undefined && (!Array.isArray(req.body.locations) || req.body.locations.length > 20 || req.body.locations.some((location) => typeof location !== 'string' || !location.trim() || location.length > 100))) {
      return res.status(400).json({ success: false, message: 'locations must contain at most 20 non-empty strings of up to 100 characters' });
    }
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
      localPricePoints: priceData.pricePoints || [],
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('Error generating AI pig-price analysis:', error);
    const rawMessage = String(error.message || '');
    const isQuotaError = /quota|rate.?limit|resource.?exhausted|billing|insufficient\s+credits?|credit balance|payment required/i.test(rawMessage);
    const isMissingKey = rawMessage.includes('API key is not configured') || rawMessage.includes('No AI provider is configured');
    const status = isMissingKey ? 503 : isQuotaError ? 429 : error.providerStatus >= 400 && error.providerStatus < 500 ? error.providerStatus : 502;
    const message = isMissingKey
      ? rawMessage
      : isQuotaError
        ? 'AI provider credits or quota are unavailable. Local reference prices remain available. Add credits to the configured OpenRouter account, use a funded key, or configure OPENAI_API_KEY as a fallback.'
        : 'AI price analysis is temporarily unavailable. The local reference prices remain available.';
    res.status(status).json({
      success: false,
      message,
    });
  }
});

export default marketPriceRouter;
