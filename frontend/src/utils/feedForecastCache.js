export const shouldFetchFeedForecast = ({ cached, isFresh, isRetrySuppressed = false }) => {
  if (!cached || !isFresh) return true;
  if (cached.status !== 'forecasted') return false;

  const analysis = cached.aiAnalysis;
  const hasSuccessfulAnalysis = analysis?.success === true
    && typeof analysis.analysis === 'string'
    && analysis.analysis.trim().length > 0;

  if (hasSuccessfulAnalysis) return false;
  return !isRetrySuppressed;
};
