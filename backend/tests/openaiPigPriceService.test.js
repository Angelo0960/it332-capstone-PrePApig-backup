import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePigPriceAnalysis } from '../services/openaiPigPriceService.js';

const withProviderEnv = async (run) => {
  const names = ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_RESPONSES_URL'];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.OPENAI_BASE_URL = 'https://provider.example/v1';
  process.env.OPENAI_MODEL = 'cx/test-model';
  delete process.env.OPENAI_RESPONSES_URL;
  try {
    return await run();
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
};

const makeResponse = () => ({
  ok: true,
  json: async () => ({
    output_text: JSON.stringify({
      pricePoints: [],
      analysis: 'The supplied test references do not contain a verified local offer.',
      suggestion: 'Confirm the current offer directly with a buyer.',
      limitations: ['Synthetic test input only.'],
    }),
  }),
});

test('pig-price analysis skips provider web_search when external search results are supplied', async () => {
  await withProviderEnv(async () => {
    let requestUrl;
    let requestBody;
    const result = await generatePigPriceAnalysis({
      locations: ['Calaca', 'Lemery', 'Balayan'],
      provincialReference: { location: 'Batangas', pricePhpPerKg: null },
      localPricePoints: [{ location: 'Calaca', pricePhpPerKg: 150, sourceUrl: 'https://example.test/price' }],
      webSearchAvailable: true,
      apiKey: 'test-key',
      fetchImpl: async (url, options) => {
        requestUrl = url;
        requestBody = JSON.parse(options.body);
        return makeResponse();
      },
    });

    assert.equal(new URL(requestUrl).pathname, '/v1/responses');
    assert.equal(Object.hasOwn(requestBody, 'tools'), false);
    assert.equal(result.success, true);
    assert.equal(result.provider, 'openai');
    assert.match(requestBody.input, /https:\/\/example\.test\/price/);
    assert.match(requestBody.input, /Do not perform additional web searches/);
  });
});

test('pig-price analysis keeps provider web_search when external search is unavailable', async () => {
  await withProviderEnv(async () => {
    let requestBody;
    await generatePigPriceAnalysis({
      locations: ['Calaca', 'Lemery', 'Balayan'],
      provincialReference: { location: 'Batangas', pricePhpPerKg: null },
      apiKey: 'test-key',
      fetchImpl: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return makeResponse();
      },
    });

    assert.deepEqual(requestBody.tools, [{ type: 'web_search' }]);
  });
});
