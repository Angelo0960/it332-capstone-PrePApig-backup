import supabase from '../config/supabase.js';

const CACHE_TABLES = {
    dashboard: 'dashboard_cache',
    feed_summary: 'feed_summary_cache',
    expense_summary: 'expense_summary_cache',
    batch_list: 'batch_list_cache',
    generic: 'api_cache',
};

const DEFAULT_TTL_MINUTES = {
    dashboard: 5,
    feed_summary: 10,
    expense_summary: 10,
    batch_list: 5,
    generic: 5,
};

function getTableName(cacheType) {
    return CACHE_TABLES[cacheType] || CACHE_TABLES.generic;
}

function getDefaultTTL(cacheType) {
    return DEFAULT_TTL_MINUTES[cacheType] || DEFAULT_TTL_MINUTES.generic;
}

export async function getCached(cacheType, key = 'default') {
    const table = getTableName(cacheType);
    try {
        const { data, error } = await supabase
            .from(table)
            .select('data, expires_at')
            .eq('key', key)
            .maybeSingle();

        if (error) {
            console.error(`Cache get error (${table}.${key}):`, error.message);
            return null;
        }

        if (!data) return null;

        const now = new Date();
        const expiresAt = new Date(data.expires_at);

        if (expiresAt <= now) {
            await supabase.from(table).delete().eq('key', key);
            return null;
        }

        return data.data;
    } catch (err) {
        console.error(`Cache get exception (${table}.${key}):`, err.message);
        return null;
    }
}

export async function setCache(cacheType, data, key = 'default', ttlMinutes = null) {
    const table = getTableName(cacheType);
    const ttl = ttlMinutes ?? getDefaultTTL(cacheType);
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

    try {
        const { error } = await supabase
            .from(table)
            .upsert({
                key,
                data,
                expires_at: expiresAt.toISOString(),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });

        if (error) {
            console.error(`Cache set error (${table}.${key}):`, error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error(`Cache set exception (${table}.${key}):`, err.message);
        return false;
    }
}

export async function invalidateCache(cacheType, key = 'default') {
    const table = getTableName(cacheType);
    try {
        const { error } = await supabase
            .from(table)
            .delete()
            .eq('key', key);

        if (error) {
            console.error(`Cache invalidate error (${table}.${key}):`, error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error(`Cache invalidate exception (${table}.${key}):`, err.message);
        return false;
    }
}

export async function invalidateAllCaches() {
    const tables = Object.values(CACHE_TABLES);
    try {
        for (const table of tables) {
            await supabase.from(table).delete().neq('key', '');
        }
        return true;
    } catch (err) {
        console.error('Cache invalidate all exception:', err.message);
        return false;
    }
}

export async function invalidateReportCaches() {
    try {
        await invalidateCache('dashboard', CACHE_KEYS.dashboard);
        await invalidateCache('feed_summary', CACHE_KEYS.feedSummary);
        await invalidateCache('expense_summary', CACHE_KEYS.expenseSummary);
        return true;
    } catch (err) {
        console.error('Cache invalidate reports exception:', err.message);
        return false;
    }
}

export async function cleanExpiredCaches() {
    try {
        const { error } = await supabase.rpc('clean_expired_cache');
        if (error) {
            console.error('Clean expired caches error:', error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Clean expired caches exception:', err.message);
        return false;
    }
}

export const CACHE_KEYS = {
    dashboard: 'dashboard',
    feedSummary: 'feed_summary',
    expenseSummary: 'expense_summary',
    batchList: (ownerId) => `batches_${ownerId}`,
    batchSummary: 'batch_summary',
    feedByBatch: (batchId) => `feed_batch_${batchId}`,
    expenseByBatch: (batchId) => `expense_batch_${batchId}`,
    vaccinationByBatch: (batchId) => `vaccination_batch_${batchId}`,
};