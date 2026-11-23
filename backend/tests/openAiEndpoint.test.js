import assert from 'node:assert/strict';
import test from 'node:test';
import { requestOpenAiJson } from '../services/openAiEndpoint.js';

const withOpenAiEndpointEnv = async (values, run) => {
  const names = ['OPENAI_BASE_URL', 'OPENAI_RESPONSES_URL', 'OPENAI_CHAT_COMPLETIONS_URL'];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) {
    if (Object.hasOwn(values, name)) process.env[name] = values[name];
    else delete process.env[name];
  }
  try {
    return await run();
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
};

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

test('same-origin endpoint override retries the derived base endpoint on HTML 404', async () => {
  await withOpenAiEndpointEnv({
    OPENAI_BASE_URL: 'https://provider.example/v1',
    OPENAI_CHAT_COMPLETIONS_URL: 'https://provider.example/wrong/chat',
  }, async () => {
    const requestedPaths = [];
    const warnings = [];
    const result = await requestOpenAiJson({
      endpoint: 'chatCompletions',
      options: { method: 'POST', headers: { Authorization: 'Bearer test-only' }, body: '{}' },
      logger: { warn: (message) => warnings.push(JSON.parse(message)) },
      fetchImpl: async (url) => {
        requestedPaths.push(new URL(url).pathname);
        if (requestedPaths.length === 1) {
          return new Response('<!doctype html><title>not found</title>', {
            status: 404,
            headers: { 'Content-Type': 'text/html' },
          });
        }
        return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
      },
    });

    assert.deepEqual(requestedPaths, ['/wrong/chat', '/v1/chat/completions']);
    assert.equal(result.payload.choices[0].message.content, 'ok');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].fromPath, '/wrong/chat');
    assert.equal(warnings[0].toPath, '/v1/chat/completions');
    assert.equal(JSON.stringify(warnings).includes('test-only'), false);
  });
});

test('endpoint override on another origin is not retried to the configured base', async () => {
  await withOpenAiEndpointEnv({
    OPENAI_BASE_URL: 'https://provider.example/v1',
    OPENAI_CHAT_COMPLETIONS_URL: 'https://other-provider.example/v1/chat/completions',
  }, async () => {
    const requested = [];
    await assert.rejects(
      requestOpenAiJson({
        endpoint: 'chatCompletions',
        options: { method: 'POST', headers: { Authorization: 'Bearer test-only' }, body: '{}' },
        logger: { warn: () => assert.fail('must not retry across provider origins') },
        fetchImpl: async (url) => {
          requested.push(url);
          return new Response('<!doctype html><title>gateway unavailable</title>', {
            status: 502,
            headers: { 'Content-Type': 'text/html' },
          });
        },
      }),
      (error) => error.providerStatus === 502
        && error.providerContentType === 'text/html'
        && error.providerEndpointHost === 'other-provider.example'
        && error.providerEndpointPath === '/v1/chat/completions',
    );
    assert.equal(requested.length, 1);
  });
});

test('JSON authorization errors retain status and do not retry', async () => {
  await withOpenAiEndpointEnv({ OPENAI_BASE_URL: 'https://provider.example/v1' }, async () => {
    let requestCount = 0;
    await assert.rejects(
      requestOpenAiJson({
        endpoint: 'chatCompletions',
        options: { method: 'POST', headers: { Authorization: 'Bearer test-only' }, body: '{}' },
        logger: { warn: () => assert.fail('authorization failures must not retry') },
        fetchImpl: async () => {
          requestCount += 1;
          return jsonResponse({ error: { message: 'denied', code: 'access_denied' } }, 403);
        },
      }),
      (error) => error.providerStatus === 403 && error.providerCode === 'access_denied',
    );
    assert.equal(requestCount, 1);
  });
});
