import supabase from '../config/supabase.js';
import { searchPigPricesWeb } from './webPigPriceSearchService.js';

const DEFAULT_LOCATIONS = ['Lemery', 'Calaca', 'Tuy', 'Balayan', 'Lian', 'Nasugbu', 'Taal'];
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache = { expiresAt: 0, value: null };
let refreshInFlight = null;

const normalizeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
};

const toObservation = (point, provider, retrievedAt = new Date().toISOString()) => {
  const price = normalizeNumber(point.pricePhpPerKg);
  if (price == null) return null;
  return {
    municipality: String(point.location || '').replace(/,\s*Batangas.*$/i, '').trim(),
    province: 'Batangas',
    price_min: normalizeNumber(point.priceMinPhpPerKg ?? price),
    price_max: normalizeNumber(point.priceMaxPhpPerKg ?? price),
    price_average: normalizeNumber(point.priceAveragePhpPerKg ?? price),
    price_type: point.priceType || 'liveweight/farmgate',
    unit: point.unit || 'PHP/kg liveweight',
    source_name: point.source || 'Google Search result',
    source_url: point.sourceUrl || 'unavailable',
    search_query: point.query || null,
    observed_date: /^\d{4}-\d{2}-\d{2}$/.test(String(point.observedDate || '')) ? point.observedDate : null,
    retrieved_at: retrievedAt,
    verification_status: point.verificationStatus || 'unverified',
    evidence: point.evidence || null,
    provider,
    raw_observation: point,
  };
};

const saveObservations = async (observations) => {
  if (!observations.length) return { inserted: 0, error: null };
  const { data, error } = await supabase
    .from('pig_market_prices')
    .upsert(observations, {
      onConflict: 'observation_key',
      ignoreDuplicates: true,
    })
    .select('id');
  return { inserted: data?.length || 0, error };
};

export const refreshPigMarketPrices = async ({
  locations = DEFAULT_LOCATIONS,
  fetchImpl = fetch,
} = {}) => {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const retrievedAt = new Date().toISOString();
    const search = await searchPigPricesWeb({ locations, fetchImpl });
    const observations = search.pricePoints.map((point) => toObservation(point, search.provider, retrievedAt)).filter(Boolean);
    const saved = await saveObservations(observations);
    if (saved.error) throw saved.error;
    const result = {
      success: true,
      ...search,
      observations,
      savedCount: saved.inserted,
      retrievedAt,
    };
    cache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
    return result;
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
};

export const getLatestPigMarketPrices = async ({
  locations = DEFAULT_LOCATIONS,
  from,
  to,
  limit = 200,
} = {}) => {
  let query = supabase
    .from('pig_market_prices')
    .select('id,municipality,province,price_min,price_max,price_average,price_type,unit,source_name,source_url,search_query,observed_date,retrieved_at,verification_status,evidence,provider')
    .in('municipality', locations)
    .order('observed_date', { ascending: false, nullsFirst: false })
    .order('retrieved_at', { ascending: false })
    .limit(Math.min(Number(limit) || 200, 1000));
  if (from) query = query.gte('observed_date', from);
  if (to) query = query.lte('observed_date', to);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

export const getCachedPigMarketRefresh = () => (
  cache.expiresAt > Date.now() ? cache.value : null
);

export const clearPigMarketPriceCache = () => {
  cache = { expiresAt: 0, value: null };
};

export { DEFAULT_LOCATIONS, normalizeNumber, toObservation };
