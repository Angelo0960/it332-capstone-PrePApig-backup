import 'dotenv/config';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const ENDPOINT_PATHS = Object.freeze({
  responses: 'responses',
  chatCompletions: 'chat/completions',
});

const validateHttpUrl = (value, variableName) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid absolute HTTP(S) URL`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${variableName} must use HTTP or HTTPS`);
  }
  return parsed.toString().replace(/\/$/, '');
};

export const isOpenAiBaseUrlConfigured = () => Boolean(String(process.env.OPENAI_BASE_URL || '').trim());

export const getOpenAiEndpointCandidates = (endpoint) => {
  const path = ENDPOINT_PATHS[endpoint];
  if (!path) throw new Error(`Unsupported OpenAI endpoint: ${endpoint}`);

  const overrideVariable = endpoint === 'responses'
    ? 'OPENAI_RESPONSES_URL'
    : 'OPENAI_CHAT_COMPLETIONS_URL';
  const overrideUrl = String(process.env[overrideVariable] || '').trim();
  const configuredBaseUrl = String(process.env.OPENAI_BASE_URL || '').trim();
  if (overrideUrl) {
    const validatedOverride = validateHttpUrl(overrideUrl, overrideVariable);
    if (!configuredBaseUrl) return [validatedOverride];
    try {
      const baseUrl = configuredBaseUrl.replace(/\/+$/, '');
      const validatedBaseUrl = validateHttpUrl(baseUrl, 'OPENAI_BASE_URL');
      const baseEndpoint = `${validatedBaseUrl}/${path}`;
      if (new URL(validatedOverride).origin === new URL(baseEndpoint).origin && validatedOverride !== baseEndpoint) {
        return [validatedOverride, baseEndpoint];
      }
    } catch {
      // A valid full override remains usable even if an unused base URL is invalid.
    }
    return [validatedOverride];
  }

  const baseUrl = (configuredBaseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '');
  const validatedBaseUrl = validateHttpUrl(baseUrl, 'OPENAI_BASE_URL');
  return [`${validatedBaseUrl}/${path}`];
};

export const getOpenAiEndpoint = (endpoint) => getOpenAiEndpointCandidates(endpoint)[0];

const endpointMetadata = (endpoint) => {
  const parsed = new URL(endpoint);
  return { host: parsed.host, path: parsed.pathname };
};

const isRetryableEndpointFailure = (error) => error.nonJsonResponse
  || error.providerStatus === 404
  || error.providerStatus === 405;

export const requestOpenAiJson = async ({ endpoint, fetchImpl = fetch, options, logger = console }) => {
  const endpoints = getOpenAiEndpointCandidates(endpoint);
  let lastError;
  for (let index = 0; index < endpoints.length; index += 1) {
    const url = endpoints[index];
    const metadata = endpointMetadata(url);
    try {
      const response = await fetchImpl(url, options);
      const contentType = response.headers?.get?.('content-type') || 'unknown';
      const body = await response.text();
      let payload;
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        const error = new Error(`OpenAI returned non-JSON content (HTTP ${response.status}; ${contentType})`);
        error.providerStatus = response.status;
        error.providerContentType = contentType;
        error.providerEndpointHost = metadata.host;
        error.providerEndpointPath = metadata.path;
        error.nonJsonResponse = true;
        throw error;
      }
      if (!response.ok) {
        const error = new Error(String(payload?.error?.message || `OpenAI returned HTTP ${response.status}`).slice(0, 300));
        error.providerStatus = response.status;
        error.providerCode = payload?.error?.code || payload?.error?.type || null;
        error.providerContentType = contentType;
        error.providerEndpointHost = metadata.host;
        error.providerEndpointPath = metadata.path;
        throw error;
      }
      return { payload, endpoint: url };
    } catch (error) {
      lastError = error;
      if (index >= endpoints.length - 1 || !isRetryableEndpointFailure(error)) throw error;
      const next = endpointMetadata(endpoints[index + 1]);
      logger.warn(JSON.stringify({
        event: 'openai_endpoint_fallback',
        endpoint: endpoint,
        fromHost: metadata.host,
        fromPath: metadata.path,
        providerStatus: error.providerStatus || null,
        contentType: error.providerContentType || null,
        toHost: next.host,
        toPath: next.path,
      }));
    }
  }
  throw lastError || new Error('OpenAI endpoint request failed');
};
