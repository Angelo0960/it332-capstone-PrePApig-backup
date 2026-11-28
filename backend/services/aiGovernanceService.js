import { createHash, randomUUID } from 'node:crypto';

export const AI_ANALYSIS_TTL_MS = 24 * 60 * 60 * 1000;
export const AI_ANALYSIS_LOCK_LEASE_MS = 120_000;
const DEFAULT_LOCK_WAIT_MS = 45_000;
const DEFAULT_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 30_000;

const MODEL_BUDGETS = Object.freeze({
  'gemini-3.6-flash': Object.freeze({ rpm: 4, daily: 16 }),
  'gemini-3.5-flash-lite': Object.freeze({ rpm: 12, daily: 400 }),
});
const SAFE_MESSAGES = Object.freeze({
  quota_rpm: 'Gemini is temporarily rate-limited. Please wait before trying again.',
  quota_daily: 'The Gemini daily request budget is exhausted. Try again after the quota window resets.',
  quota_unknown: 'AI provider quota is exhausted or unavailable. No automatic retry was made.',
  authentication: 'Gemini authentication failed. Check the backend API key configuration.',
  permission: 'The configured Gemini project or model does not have permission for this request.',
  network: 'Gemini could not be reached. Check the backend network and provider status.',
  provider_error: 'An AI provider rejected the request. Check the sanitized backend error log.',
  budget_unavailable: 'AI usage controls are temporarily unavailable; no Gemini request was sent.',
  request_in_progress: 'An identical AI analysis is already being generated. Try again shortly.',
});

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hashValue = (value) => sha256(JSON.stringify(canonicalize(value)));
const safeLog = (logger, level, event) => {
  try { logger?.[level]?.(JSON.stringify(event)); } catch { /* Logging must not change provider behavior. */ }
};

export class AiGovernanceError extends Error {
  constructor(category, { providerStatus = null, retryAfterSeconds = null, requestId = null } = {}) {
    super(SAFE_MESSAGES[category] || SAFE_MESSAGES.provider_error);
    this.name = 'AiGovernanceError';
    this.category = category;
    this.providerStatus = providerStatus;
    this.retryAfterSeconds = retryAfterSeconds;
    this.requestId = requestId;
  }
}

export const getGeminiModelBudget = (model) => {
  const normalized = String(model || '').trim().toLowerCase();
  if (normalized.startsWith('gemini-3.6-flash')) return { ...MODEL_BUDGETS['gemini-3.6-flash'] };
  if (normalized.startsWith('gemini-3.5-flash-lite')) return { ...MODEL_BUDGETS['gemini-3.5-flash-lite'] };
  // Unknown models use the smallest configured budget; never guess a higher quota.
  return { ...MODEL_BUDGETS['gemini-3.6-flash'] };
};

const errorText = (payload) => {
  const error = payload?.error || {};
  const details = Array.isArray(error.details) ? error.details : [];
  return [error.status, error.message, error.code, ...details.flatMap((item) => [item?.quotaId, item?.reason, item?.message, item?.retryDelay])]
    .filter(Boolean).join(' ').toLowerCase();
};

const parseRetryDelay = (value) => {
  if (value == null) return null;
  const seconds = Number.parseFloat(String(value).replace(/s$/i, ''));
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
};

export const classifyGeminiFailure = ({ status = null, payload = null, error = null, retryAfter = null } = {}) => {
  const text = errorText(payload) || String(error?.message || '').toLowerCase();
  let category = 'provider_error';
  if (status === 429 || /resource_exhausted/.test(text)) {
    if (/per.?day|daily|requests?.{0,12}per.?day|\brpd\b/.test(text)) category = 'quota_daily';
    else if (/per.?minute|requests?.{0,12}per.?minute|\brpm\b/.test(text)) category = 'quota_rpm';
    else category = 'quota_unknown';
  } else if (status === 401 || /unauthenticated|api.?key.{0,16}(invalid|not valid)|invalid.{0,16}api.?key/.test(text)) {
    category = 'authentication';
  } else if (status === 403 || /permission_denied|permission.{0,16}(denied|not granted)/.test(text)) {
    category = 'permission';
  } else if (!status || status >= 500 || error?.name === 'AbortError' || error instanceof TypeError) {
    category = 'network';
  }
  const retrySeconds = parseRetryDelay(retryAfter)
    ?? parseRetryDelay(payload?.error?.details?.find?.((detail) => detail?.retryDelay)?.retryDelay);
  return {
    category,
    retryable: category === 'quota_rpm' || status === 503,
    providerStatus: status || null,
    retryAfterSeconds: retrySeconds,
    message: SAFE_MESSAGES[category] || SAFE_MESSAGES.provider_error,
  };
};

let defaultSupabasePromise;
const getDefaultStorage = async () => {
  const { default: supabase } = await import('../config/supabase.js');
  return createSupabaseAiStorage(supabase);
};

export const createSupabaseAiStorage = (supabase) => ({
  async getAnalysisCache(cacheKey) {
    const { data, error } = await supabase.from('ai_analysis_cache')
      .select('cache_key,owner_id,feature,model,source_hash,response_json,generated_at,expires_at')
      .eq('cache_key', cacheKey).maybeSingle();
    if (error) throw new AiGovernanceError('budget_unavailable');
    return data ? {
      cacheKey: data.cache_key,
      ownerId: data.owner_id,
      feature: data.feature,
      model: data.model,
      sourceHash: data.source_hash,
      response: data.response_json,
      generatedAt: data.generated_at,
      expiresAt: data.expires_at,
    } : null;
  },
  async saveAnalysisCache(record) {
    // Successful writes opportunistically purge records that are no longer
    // eligible for reuse; expired same-input records remain available as a
    // temporary stale fallback until a replacement succeeds.
    await supabase.from('ai_analysis_cache').delete().lt('expires_at', new Date().toISOString()).catch(() => {});
    const { error } = await supabase.from('ai_analysis_cache').upsert({
      cache_key: record.cacheKey,
      owner_id: record.ownerId,
      feature: record.feature,
      model: record.model,
      source_hash: record.sourceHash,
      response_json: record.response,
      generated_at: record.generatedAt,
      expires_at: record.expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cache_key' });
    if (error) throw new AiGovernanceError('budget_unavailable');
  },
  async claimAnalysis(cacheKey, lockToken, leaseMs) {
    const { data, error } = await supabase.rpc('claim_ai_analysis_lock', {
      p_cache_key: cacheKey,
      p_lock_token: lockToken,
      p_lease_seconds: Math.ceil(leaseMs / 1000),
    });
    if (error) throw new AiGovernanceError('budget_unavailable');
    return data === true || data === 'true';
  },
  async releaseAnalysis(cacheKey, lockToken) {
    const { error } = await supabase.rpc('release_ai_analysis_lock', {
      p_cache_key: cacheKey,
      p_lock_token: lockToken,
    });
    if (error) throw new AiGovernanceError('budget_unavailable');
  },
  async reserveGeminiRequest(model, feature, budget, requestId) {
    const { data, error } = await supabase.rpc('reserve_gemini_api_request', {
      p_model: model,
      p_feature: feature,
      p_rpm_limit: budget.rpm,
      p_daily_limit: budget.daily,
      p_request_id: requestId,
    });
    if (error) throw new AiGovernanceError('budget_unavailable');
    const row = Array.isArray(data) ? data[0] : data;
    return row ? {
      allowed: row.allowed === true,
      usageId: row.usage_id,
      category: row.error_category || null,
      retryAfterSeconds: row.retry_after_seconds == null ? null : Number(row.retry_after_seconds),
      minuteCount: row.minute_count == null ? null : Number(row.minute_count),
      dailyCount: row.daily_count == null ? null : Number(row.daily_count),
    } : { allowed: false, category: 'budget_unavailable' };
  },
  async finishGeminiRequest(usageId, result) {
    const { error } = await supabase.from('gemini_api_usage').update({
      status: result.status,
      provider_status: result.providerStatus,
      error_category: result.errorCategory,
      duration_ms: result.durationMs,
      completed_at: new Date().toISOString(),
    }).eq('id', usageId);
    if (error) throw new AiGovernanceError('budget_unavailable');
  },
});

export const createAiGovernanceService = ({
  storage,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
  logger = console,
  lockWaitMs = DEFAULT_LOCK_WAIT_MS,
} = {}) => {
  let storagePromise;
  const resolveStorage = async () => {
    if (storage) return storage;
    if (!storagePromise) {
      if (!defaultSupabasePromise) defaultSupabasePromise = getDefaultStorage();
      storagePromise = defaultSupabasePromise;
    }
    return storagePromise;
  };
  const inFlight = new Map();

  const decorate = (response, state, record, error = null, extra = {}) => ({
    ...response,
    generatedAt: record.generatedAt,
    cacheMetadata: {
      state,
      generatedAt: record.generatedAt,
      expiresAt: record.expiresAt,
      error: error ? { category: error.category || 'provider_error', message: SAFE_MESSAGES[error.category] || SAFE_MESSAGES.provider_error } : null,
      ...extra,
    },
  });

  const readFresh = async (store, cacheKey, sourceHash) => {
    const record = await store.getAnalysisCache(cacheKey);
    if (!record || record.sourceHash !== sourceHash) return { record: null, fresh: false };
    return { record, fresh: Date.parse(record.expiresAt) > now() };
  };

  const waitForClaim = async (store, cacheKey, sourceHash, lockToken) => {
    const deadline = now() + lockWaitMs;
    do {
      const cached = await readFresh(store, cacheKey, sourceHash);
      if (cached.fresh) return { cached: cached.record };
      if (await store.claimAnalysis(cacheKey, lockToken, AI_ANALYSIS_LOCK_LEASE_MS, now())) return { claimed: true };
      await sleep(Math.min(500, Math.max(1, deadline - now())));
    } while (now() < deadline);
    return { claimed: false };
  };

  const runAnalysis = async ({ ownerId, feature, model, cacheScope, sourceData, promptVersion = 'v1', generate }) => {
    if (!ownerId || !feature || !model || cacheScope === undefined || typeof generate !== 'function') {
      throw new TypeError('ownerId, feature, model, cacheScope, and generate are required for cached AI analysis');
    }
    const sourceHash = hashValue({ promptVersion, sourceData });
    // Input fingerprints are part of the persisted key, so changed data never waits on
    // or returns an analysis generated from an older snapshot of the same scope.
    const cacheKey = sha256(JSON.stringify([String(ownerId), String(feature), String(model), String(cacheScope), sourceHash]));
    const inFlightKey = cacheKey;
    if (inFlight.has(inFlightKey)) return inFlight.get(inFlightKey);

    const operation = (async () => {
      const store = await resolveStorage();
      const cached = await store.getAnalysisCache(cacheKey);
      const matchingCache = cached?.sourceHash === sourceHash ? cached : null;
      if (matchingCache && Date.parse(matchingCache.expiresAt) > now()) return decorate(matchingCache.response, 'hit', matchingCache);

      const lockToken = randomUUID();
      let claimed = await store.claimAnalysis(cacheKey, lockToken, AI_ANALYSIS_LOCK_LEASE_MS, now());
      if (!claimed) {
        const waited = await waitForClaim(store, cacheKey, sourceHash, lockToken);
        if (waited.cached) return decorate(waited.cached.response, 'hit', waited.cached);
        claimed = waited.claimed === true;
      }
      if (!claimed) {
        if (matchingCache) return decorate(matchingCache.response, 'stale', matchingCache, null, { refreshPending: true });
        throw new AiGovernanceError('request_in_progress');
      }

      try {
        const response = await generate();
        const generatedAt = response?.generatedAt || new Date(now()).toISOString();
        const record = {
          cacheKey,
          ownerId: String(ownerId),
          feature: String(feature),
          model: String(model),
          sourceHash,
          response,
          generatedAt,
          expiresAt: new Date(now() + AI_ANALYSIS_TTL_MS).toISOString(),
        };
        try {
          await store.saveAnalysisCache(record);
          return decorate(response, 'generated', record);
        } catch {
          safeLog(logger, 'error', { event: 'ai_analysis_cache_write_failed', feature, model, cacheKey });
          return decorate(response, 'generated-unpersisted', record);
        }
      } catch (error) {
        if (matchingCache) return decorate(matchingCache.response, 'stale-fallback', matchingCache, error);
        throw error;
      } finally {
        await store.releaseAnalysis(cacheKey, lockToken).catch(() => {});
      }
    })();
    inFlight.set(inFlightKey, operation);
    try { return await operation; } finally {
      if (inFlight.get(inFlightKey) === operation) inFlight.delete(inFlightKey);
    }
  };

  const requestGemini = async ({ model, feature, apiKey, body, fetchImpl = fetch, maxRetries = DEFAULT_RETRIES, timeoutMs = 30000, signal, storage: requestStorage }) => {
    const store = requestStorage || await resolveStorage();
    const budget = getGeminiModelBudget(model);
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const requestId = randomUUID();
      let reservation;
      try {
        reservation = await store.reserveGeminiRequest(model, feature, budget, requestId, now());
      } catch {
        safeLog(logger, 'error', { event: 'gemini_usage_control_unavailable', feature, model, requestId });
        throw new AiGovernanceError('budget_unavailable', { requestId });
      }
      if (!reservation?.allowed) {
        const category = ['quota_rpm', 'quota_daily', 'quota_unknown', 'budget_unavailable'].includes(reservation?.category)
          ? reservation.category
          : 'budget_unavailable';
        safeLog(logger, 'warn', { event: 'gemini_request_blocked', feature, model, requestId, category, minuteCount: reservation?.minuteCount ?? null, dailyCount: reservation?.dailyCount ?? null });
        throw new AiGovernanceError(category, { requestId, retryAfterSeconds: reservation?.retryAfterSeconds });
      }

      const startedAt = now();
      safeLog(logger, 'info', { event: 'gemini_request_started', feature, model, requestId, attempt: attempt + 1, minuteCount: reservation.minuteCount ?? null, dailyCount: reservation.dailyCount ?? null });
      let status = null;
      const controller = new AbortController();
      const abortFromCaller = () => controller.abort();
      if (signal?.aborted) controller.abort();
      else signal?.addEventListener('abort', abortFromCaller, { once: true });
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        status = response.status;
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const failure = classifyGeminiFailure({ status: response.status, payload, retryAfter: response.headers?.get?.('retry-after') });
          await store.finishGeminiRequest(reservation.usageId, {
            status: 'failed', providerStatus: response.status, errorCategory: failure.category, durationMs: now() - startedAt,
          }).catch(() => {});
          safeLog(logger, 'warn', { event: 'gemini_request_failed', feature, model, requestId, attempt: attempt + 1, providerStatus: response.status, category: failure.category, durationMs: now() - startedAt });
          if (failure.retryable && attempt < maxRetries) {
            const providerDelayMs = failure.category === 'quota_rpm' ? (failure.retryAfterSeconds || 0) * 1000 : 0;
            if (providerDelayMs > MAX_RETRY_DELAY_MS) {
              throw new AiGovernanceError('quota_rpm', { providerStatus: response.status, retryAfterSeconds: failure.retryAfterSeconds, requestId });
            }
            const exponentialMs = Math.min(1000 * (2 ** attempt), MAX_RETRY_DELAY_MS);
            const jitteredMs = Math.min(MAX_RETRY_DELAY_MS, Math.round(exponentialMs * (0.9 + random() * 0.2)));
            await sleep(Math.max(providerDelayMs, jitteredMs));
            continue;
          }
          throw new AiGovernanceError(failure.category, { providerStatus: response.status, retryAfterSeconds: failure.retryAfterSeconds, requestId });
        }
        await store.finishGeminiRequest(reservation.usageId, { status: 'success', providerStatus: status, errorCategory: null, durationMs: now() - startedAt }).catch(() => {});
        safeLog(logger, 'info', { event: 'gemini_request_succeeded', feature, model, requestId, attempt: attempt + 1, durationMs: now() - startedAt, promptTokens: payload?.usageMetadata?.promptTokenCount ?? null, outputTokens: payload?.usageMetadata?.candidatesTokenCount ?? null });
        return { payload, requestId };
      } catch (error) {
        if (error instanceof AiGovernanceError) throw error;
        const failure = classifyGeminiFailure({ status, error });
        await store.finishGeminiRequest(reservation.usageId, {
          status: 'failed', providerStatus: status, errorCategory: failure.category, durationMs: now() - startedAt,
        }).catch(() => {});
        safeLog(logger, 'warn', { event: 'gemini_request_failed', feature, model, requestId, attempt: attempt + 1, providerStatus: status, category: failure.category, durationMs: now() - startedAt });
        const retryableTimeout = error?.name === 'AbortError' && !signal?.aborted;
        if (retryableTimeout && attempt < maxRetries) {
          const exponentialMs = Math.min(1000 * (2 ** attempt), MAX_RETRY_DELAY_MS);
          const jitteredMs = Math.min(MAX_RETRY_DELAY_MS, Math.round(exponentialMs * (0.9 + random() * 0.2)));
          await sleep(jitteredMs);
          continue;
        }
        throw new AiGovernanceError(failure.category, { providerStatus: status, requestId });
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abortFromCaller);
      }
    }
    throw new AiGovernanceError('quota_rpm');
  };

  return { runAnalysis, requestGemini };
};

export const aiGovernance = createAiGovernanceService();
export const runCachedAiAnalysis = (options) => aiGovernance.runAnalysis(options);
export const requestGeminiApi = (options) => aiGovernance.requestGemini(options);
