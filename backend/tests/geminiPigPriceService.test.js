import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePigPriceAnalysis } from '../services/geminiPigPriceService.js';

test('Gemini price analysis sends nearby locations and search grounding', async () => {
  let request;
  const result = await generatePigPriceAnalysis({
    apiKey: 'test-key',
    locations: ['Calaca', 'Lemery', 'Balayan', 'Tuy'],
    provincialReference: { pricePhpPerKg: 172.73, period: '2026-06' },
    fetchImpl: async (_url, options) => {
      request = { url: _url, options };
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: { parts: [{ text: JSON.stringify({
              pricePoints: [
                { location: 'Lemery', pricePhpPerKg: 180, status: 'found' },
                { location: 'Balayan', pricePhpPerKg: 178, status: 'found' },
                { location: 'Nasugbu', pricePhpPerKg: null, status: 'unavailable' },
              ],
              analysis: 'Three locations were checked.',
              suggestion: 'Use the comparable liveweight sources.',
              limitations: ['Local quotes may change.'],
            }) }] },
            groundingMetadata: {
              groundingChunks: [{ web: { title: 'Local source', uri: 'https://example.test/source' } }],
            },
          }],
        }),
      };
    },
  });

  const body = JSON.parse(request.options.body);
  assert.equal(result.success, true);
  assert.equal(result.sources.length, 1);
  assert.equal(result.pricePoints.length, 3);
  assert.equal(result.suggestion, 'Use the comparable liveweight sources.');
  assert.deepEqual(body.tools, [{ google_search: {} }]);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.match(body.contents[0].parts[0].text, /at least 3 different nearby locations/);
  assert.match(body.contents[0].parts[0].text, /Lemery/);
});

test('Gemini analysis requires an API key', async () => {
  await assert.rejects(
    generatePigPriceAnalysis({ apiKey: '', locations: ['Calaca', 'Lemery', 'Balayan'] }),
    /GEMINI_API_KEY is not configured/
  );
});
