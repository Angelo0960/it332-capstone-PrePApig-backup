const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export const getGeminiModel = (value = process.env.GEMINI_MODEL) => {
  const configuredModel = String(value || '').trim();
  return configuredModel || DEFAULT_GEMINI_MODEL;
};
