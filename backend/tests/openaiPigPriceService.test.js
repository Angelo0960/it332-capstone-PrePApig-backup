import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePigPriceAnalysis } from '../services/openaiPigPriceService.js';

const withProviderEnv = async (run) => {
  const names = ['OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_RESPONSES_URL', 'OPENAI_CHAT_COMPLETIONS_URL'];
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

const makeResponse = () => new Response(JSON.stringify({
  output_text: JSON.stringify({
    pricePoints: [],
    analysis: 'The supplied test references do not contain a verified local offer.',
    suggestion: 'Confirm the current offer directly with a buyer.',
    limitations: ['Synthetic test input only.'],
  }),
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

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

test('pig-price analysis falls back to Chat Completions when Responses returns HTML', async () => {
  await withProviderEnv(async () => {
    const requested = [];
    const result = await generatePigPriceAnalysis({
      locations: ['Calaca'],
      provincialReference: { location: 'Batangas', pricePhpPerKg: null },
      localPricePoints: [{ location: 'Calaca', pricePhpPerKg: 150, sourceUrl: 'https://example.test/price' }],
      webSearchAvailable: true,
      apiKey: 'test-key',
      fetchImpl: async (url, options) => {
        requested.push({ url, body: JSON.parse(options.body) });
        if (requested.length === 1) {
          return new Response('<!doctype html><title>not found</title>', {
            status: 404,
            headers: { 'Content-Type': 'text/html' },
          });
        }
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            pricePoints: [],
            analysis: 'No verified local offer was present in the supplied references.',
            suggestion: 'Confirm the offer directly before selling.',
            limitations: ['Synthetic test input only.'],
          }) } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });

    assert.deepEqual(requested.map(({ url }) => new URL(url).pathname), ['/v1/responses', '/v1/chat/completions']);
    assert.equal(requested[1].body.model, 'cx/test-model');
    assert.equal(requested[1].body.stream, false);
    assert.equal(result.success, true);
    assert.equal(result.provider, 'openai');
    assert.match(result.analysis, /No verified local offer/);
  });
});

test('pig-price analysis reports upstream status for non-JSON errors after fallback', async () => {
  await withProviderEnv(async () => {
    const requestedPaths = [];
    await assert.rejects(
      generatePigPriceAnalysis({
        locations: ['Calaca'],
        provincialReference: { location: 'Batangas', pricePhpPerKg: null },
        webSearchAvailable: true,
        apiKey: 'test-key',
        fetchImpl: async (url) => {
          requestedPaths.push(new URL(url).pathname);
          return new Response('<!doctype html><title>gateway unavailable</title>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          });
        },
      }),
      (error) => error.providerStatus === 502
        && error.providerContentType === 'text/html'
        && error.providerEndpointPath === '/v1/chat/completions',
    );
    assert.deepEqual(requestedPaths, ['/v1/responses', '/v1/chat/completions']);
  });
});
