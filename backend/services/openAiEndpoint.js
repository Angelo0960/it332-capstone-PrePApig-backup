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

export const getOpenAiEndpoint = (endpoint) => {
  const path = ENDPOINT_PATHS[endpoint];
  if (!path) throw new Error(`Unsupported OpenAI endpoint: ${endpoint}`);

  const overrideVariable = endpoint === 'responses'
    ? 'OPENAI_RESPONSES_URL'
    : 'OPENAI_CHAT_COMPLETIONS_URL';
  const overrideUrl = String(process.env[overrideVariable] || '').trim();
  if (overrideUrl) return validateHttpUrl(overrideUrl, overrideVariable);

  const configuredBaseUrl = String(process.env.OPENAI_BASE_URL || '').trim();
  const baseUrl = (configuredBaseUrl || DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, '');
  const validatedBaseUrl = validateHttpUrl(baseUrl, 'OPENAI_BASE_URL');
  return `${validatedBaseUrl}/${path}`;
};
