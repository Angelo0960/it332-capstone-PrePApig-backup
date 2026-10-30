import express from 'express';
import { fetchBatangasPigPrice } from '../services/pigPriceScraper.js';
import { generatePigPriceAnalysis } from '../services/openaiPigPriceService.js';
import { searchPigPricesWeb } from '../services/webPigPriceSearchService.js';
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
    let webSearchResult = null;
    if (process.env.SERPER_API_KEY || (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID)) {
      webSearchResult = await searchPigPricesWeb({ locations });
    }
    const configuredGeminiModel = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.8-flash'].includes(process.env.GEMINI_MODEL)
      ? 'gemini-3.5-flash-lite'
      : process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const configuredModel = process.env.GEMINI_API_KEY
      ? configuredGeminiModel
      : process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'openrouter/free';
    console.log(JSON.stringify({
      event: 'pig_price_ai_started',
      requestId: req.requestId,
      userId: req.user?.id,
      locations,
      provider: process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.OPENAI_API_KEY ? 'openai' : 'none',
      model: configuredModel,
      webSearchRequested: !/(?:\/free|:free)$/.test(configuredModel),
    }));

    let result;
    try {
      result = await generatePigPriceAnalysis({
        locations,
        provincialReference: {
          location: priceData.data.location,
          period: priceData.data.period,
          pricePhpPerKg: priceData.data.pricePhpPerKg,
          unit: priceData.data.unit,
        },
        localPricePoints: webSearchResult?.pricePoints || [],
      });
    } catch (error) {
      const webFound = webSearchResult?.pricePoints?.some((point) => point.pricePhpPerKg != null);
      if (!webFound) throw error;
      result = {
        ...webSearchResult,
        analysis: 'Prices were collected from public web-search snippets. They are liveweight price observations, not guaranteed buyer offers.',
        suggestion: 'Verify the posting date, location, unit, and current buyer offer before selling.',
        limitations: webSearchResult.limitations,
      };
    }
    if (webSearchResult) {
      const aiPoints = Array.isArray(result.pricePoints) ? result.pricePoints : [];
      const aiByLocation = new Map(aiPoints.map((point) => [String(point.location).toLowerCase(), point]));
      result.pricePoints = webSearchResult.pricePoints.map((webPoint) => {
        const aiPoint = aiByLocation.get(String(webPoint.location).toLowerCase());
        return aiPoint?.pricePhpPerKg != null ? aiPoint : webPoint;
      });
      result.sources = [...new Map([
        ...(result.sources || []),
        ...(webSearchResult.sources || []),
      ].filter((source) => source?.url).map((source) => [source.url, source])).values()];
      result.searchProvider = webSearchResult.provider;
    }

    console.log(JSON.stringify({
      event: 'pig_price_ai_succeeded',
      requestId: req.requestId,
      provider: result.provider,
      model: result.model,
      pricePointCount: result.pricePoints?.length || 0,
      sourceCount: result.sources?.length || 0,
    }));
    res.status(200).json(result);
  } catch (error) {
    console.error('Error generating AI pig-price analysis:', error);
    const rawMessage = String(error.message || '');
    const safeMessage = rawMessage.replace(/sk-(?:or-v1|proj|live)-[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 300);
    console.error(JSON.stringify({
      event: 'pig_price_ai_failed',
      requestId: req.requestId,
      provider: error.provider || (process.env.GEMINI_API_KEY ? 'gemini' : process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.OPENAI_API_KEY ? 'openai' : 'none'),
      model: error.model || process.env.GEMINI_MODEL || process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'openrouter/free',
      providerStatus: error.providerStatus || null,
      message: safeMessage,
    }));
    const isQuotaError = /quota|rate.?limit|resource.?exhausted|billing|insufficient\s+credits?|credit balance|payment required/i.test(rawMessage);
    const isMissingKey = rawMessage.includes('API key is not configured') || rawMessage.includes('No AI provider is configured');
    const status = isMissingKey ? 503 : isQuotaError ? 429 : error.providerStatus >= 400 && error.providerStatus < 500 ? error.providerStatus : 502;
    const message = isMissingKey
      ? rawMessage
      : isQuotaError
        ? 'AI provider credits or quota are unavailable. Local reference prices remain available. Configure a funded Gemini, OpenRouter, or OpenAI provider, then retry.'
        : 'AI price analysis is temporarily unavailable. The local reference prices remain available.';
    res.status(status).json({
      success: false,
      message,
      requestId: req.requestId,
    });
  }
});

export default marketPriceRouter;
