const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

const PREVIOUS_DEFAULT_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
]);

export const getGeminiModel = (value = process.env.GEMINI_MODEL) => {
  const configuredModel = String(value || '').trim();
  if (!configuredModel || PREVIOUS_DEFAULT_MODELS.has(configuredModel)) {
    return DEFAULT_GEMINI_MODEL;
  }
  return configuredModel;
};
