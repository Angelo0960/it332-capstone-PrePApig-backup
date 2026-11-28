const clip = (value, limit = 80) => String(value || '').replace(/[\r\n\t]+/g, ' ').slice(0, limit) || null;

const sanitizeErrorMessage = (value) => String(value || 'Unknown error')
  .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
  .replace(/\b(?:api[_-]?key|token|password)\s*[:=]\s*[^\s,;]+/gi, '[REDACTED]')
  .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED]')
  .replace(/[\r\n\t]+/g, ' ')
  .slice(0, 240);

export const logProfitAiDiagnostic = ({
  logger = console,
  level = 'error',
  event,
  requestId,
  stage,
  durationMs = null,
  error = null,
  category = null,
  now = Date.now,
}) => {
  const elapsed = Number(durationMs);
  const payload = {
    event,
    timestamp: new Date(now()).toISOString(),
    requestId: requestId || null,
    stage: clip(stage),
    durationMs: Number.isFinite(elapsed) ? Math.max(0, elapsed) : null,
  };

  const safeCategory = clip(category || error?.category);
  if (safeCategory) payload.category = safeCategory;

  if (error) {
    const status = Number(error.providerStatus ?? error.status);
    const provider = clip(error.provider);
    const model = clip(error.model);
    const providerCode = clip(error.providerCode);
    Object.assign(payload, {
      errorName: clip(error.name),
      errorCode: clip(error.code),
      providerStatus: Number.isFinite(status) ? status : null,
      errorMessage: sanitizeErrorMessage(error.message),
    });
    if (provider) payload.provider = provider;
    if (model) payload.model = model;
    if (providerCode) payload.providerCode = providerCode;
  }

  try {
    logger?.[level]?.(JSON.stringify(payload));
  } catch {
    // Logging failures must not change the request result.
  }
  return payload;
};

export const runProfitAiStage = async ({ requestId, stage, run, logger = console, now = Date.now }) => {
  const startedAt = now();
  try {
    const result = await run();
    logProfitAiDiagnostic({
      logger,
      level: 'info',
      event: 'profit_ai_stage_completed',
      requestId,
      stage,
      durationMs: now() - startedAt,
      now,
    });
    return result;
  } catch (error) {
    logProfitAiDiagnostic({
      logger,
      level: 'error',
      event: 'profit_ai_stage_failed',
      requestId,
      stage,
      durationMs: now() - startedAt,
      error,
      now,
    });
    throw error;
  }
};
