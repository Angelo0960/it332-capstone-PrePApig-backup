const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export const getGeminiModel = (value = process.env.GEMINI_MODEL) => {
  const configuredModel = String(value || '').trim();
  return configuredModel || DEFAULT_GEMINI_MODEL;
};
