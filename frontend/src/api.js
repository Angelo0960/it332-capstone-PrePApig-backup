// src/api.js

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

// Helper to get the auth token from localStorage
export const getAuthHeaders = () => {
  const token = localStorage.getItem('token');

  return token
    ? {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
    : {
        'Content-Type': 'application/json',
      };
};

export const api = {
  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message || `Login failed (${res.status})`);
    }

    return res.json();
  },
};

const getInitialAnalyticsRange = () => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return `from=${start.toISOString().slice(0, 10)}&to=${end.toISOString().slice(0, 10)}`;
};

const mapOverviewBatches = (batches = []) => batches.map((batch) => {
  const sourceDate = batch.date_acquired || batch.created_at;
  const day = sourceDate
    ? (Number(batch.age_on_acquisition) || 0)
      + Math.max(0, Math.floor((Date.now() - new Date(sourceDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  return {
    id: batch.id,
    name: batch.batch_code || `Batch ${batch.id}`,
    batch_code: batch.batch_code,
    day,
    pigCount: batch.pig_count || 0,
    breed: batch.breed,
    startWeight: batch.start_weight,
    currentWeight: batch.current_weight,
    dateAcquired: batch.date_acquired,
    date_acquired: batch.date_acquired,
    sale_price_per_kg: batch.sale_price_per_kg,
    status: batch.status,
    age_on_acquisition: batch.age_on_acquisition || 0,
  };
});

// Warm the authenticated screen caches while the application shell loads.
// Each screen still performs its own stale-while-revalidate request when mounted.
export const preloadInitialData = async () => {
  const token = localStorage.getItem('token');
  if (!token || token === 'null' || token === 'undefined') return;

  const { getUserCacheKey, writeCache } = await import('./utils/cache.js');
  const userKey = getUserCacheKey();
  const headers = getAuthHeaders();
  const analyticsRange = getInitialAnalyticsRange();

  const request = async (path) => {
    const response = await fetch(`${API_BASE}${path}`, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload.success) throw new Error(payload.message || 'Preload request failed');
    return payload.data || {};
  };

  const [feedResult, vaccinationResult, analyticsResult, financialResult] = await Promise.allSettled([
    request('/feeds/overview'),
    request('/vaccinations/overview'),
    request(`/reports/analytics?${analyticsRange}`),
    request(`/reports/financial?${analyticsRange}`),
  ]);

  const feed = feedResult.status === 'fulfilled' ? feedResult.value : null;
  const vaccination = vaccinationResult.status === 'fulfilled' ? vaccinationResult.value : null;
  const analytics = analyticsResult.status === 'fulfilled' ? analyticsResult.value : null;
  const financial = financialResult.status === 'fulfilled' ? financialResult.value : null;
  const sourceBatches = feed?.batches || vaccination?.batches || analytics?.batches || [];
  const mappedBatches = mapOverviewBatches(sourceBatches);

  if (mappedBatches.length > 0) {
    writeCache(`batches:${userKey}`, mappedBatches);
    // Dashboard still supports this legacy cache key for immediate rendering.
    localStorage.setItem(`prepapig:batches:${userKey}`, JSON.stringify(mappedBatches));
  }

  if (feed) {
    writeCache(`feed-records:${userKey}:all`, feed.records || []);
    writeCache(`feed-stock:${userKey}`, feed.stock || []);
    writeCache(`feed-expenses:${userKey}`, feed.expenses || []);
  }

  if (vaccination) {
    writeCache(`vaccination-records:${userKey}:all`, vaccination.records || []);
    writeCache(`vaccine-stock:${userKey}`, vaccination.stock || []);
  }

  if (analytics) {
    writeCache(`analytics:${userKey}:Last 30 days`, {
      batches: analytics.batches || [],
      feedRecords: analytics.feedRecords || [],
      vaccinationRecords: analytics.vaccinationRecords || [],
      expenses: analytics.expenses || [],
      feedStock: analytics.feedStock || [],
    });
  }

  if (financial) {
    writeCache(`analytics-financial:${userKey}:Last 30 days:all`, financial);
  }
};

// FCM token registration
export const registerFcmToken = async (token) => {
  const res = await fetch(`${API_BASE}/notifications/register-token`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ token }),
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.message || 'Failed to register token');
  }

  return res.json();
};