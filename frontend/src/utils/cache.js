const CACHE_PREFIX = 'prepapig:cache:';

export const getUserCacheKey = () => {
  const token = localStorage.getItem('token');
  if (!token) return 'current';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id || payload.email || 'current';
  } catch {
    return 'current';
  }
};

export const readCache = (key, maxAgeMs = 5 * 60 * 1000) => {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`)
      || localStorage.getItem(`prepapig:${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Array.isArray(entry)) return entry;
    if (!entry || Date.now() - entry.savedAt > maxAgeMs) return null;
    return entry.data;
  } catch {
    return null;
  }
};

export const writeCache = (key, data) => {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Caching is optional; private browsing or a full storage quota should not break the UI.
  }
};
