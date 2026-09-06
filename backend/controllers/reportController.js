import supabase from '../config/supabase.js';
import { getCached, setCache, invalidateCache, CACHE_KEYS } from '../lib/supabaseCache.js';

async function computeDashboardReport() {
    const { count: totalBatches } = await supabase
        .from('pig_batches')
        .select('*', { count: 'exact', head: true });

    const { data: expenses } = await supabase
        .from('expenses')
        .select('amount');

    const { count: totalFeedRecords } = await supabase
        .from('feed_records')
        .select('*', { count: 'exact', head: true });

    const { count: totalVaccinations } = await supabase
        .from('vaccination_records')
        .select('*', { count: 'exact', head: true });

    const totalExpenses = expenses.reduce(
        (sum, item) => sum + Number(item.amount),
        0
    );

    return {
        totalBatches,
        totalFeedRecords,
        totalVaccinations,
        totalExpenses
    };
}

async function computeFeedSummary() {
    const { data, error } = await supabase
        .from('feed_records')
        .select('*');

    if (error) throw error;

    const totalFeed = data.reduce(
        (sum, item) => sum + Number(item.quantity_kg),
        0
    );

    return {
        totalFeedRecords: data.length,
        totalFeedConsumed: totalFeed,
        data
    };
}

async function computeExpenseSummary() {
    const { data, error } = await supabase
        .from('expenses')
        .select('*');

    if (error) throw error;

    const totalExpenses = data.reduce(
        (sum, item) => sum + Number(item.amount),
        0
    );

    return {
        totalRecords: data.length,
        totalExpenses,
        data
    };
}

export const getDashboardReport = async (req, res) => {
    try {
        const cached = await getCached('dashboard', CACHE_KEYS.dashboard);
        if (cached) {
            return res.status(200).json({
                success: true,
                report: cached,
                cached: true
            });
        }

        const report = await computeDashboardReport();
        await setCache('dashboard', report, CACHE_KEYS.dashboard);

        res.status(200).json({
            success: true,
            report,
            cached: false
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getFeedReport = async (req, res) => {
    try {
        const cached = await getCached('feed_summary', CACHE_KEYS.feedSummary);
        if (cached) {
            return res.json({
                success: true,
                ...cached,
                cached: true
            });
        }

        const summary = await computeFeedSummary();
        await setCache('feed_summary', summary, CACHE_KEYS.feedSummary);

        res.json({
            success: true,
            ...summary,
            cached: false
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getExpenseReport = async (req, res) => {
    try {
        const cached = await getCached('expense_summary', CACHE_KEYS.expenseSummary);
        if (cached) {
            return res.json({
                success: true,
                ...cached,
                cached: true
            });
        }

        const summary = await computeExpenseSummary();
        await setCache('expense_summary', summary, CACHE_KEYS.expenseSummary);

        res.json({
            success: true,
            ...summary,
            cached: false
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const invalidateReportCaches = async () => {
    await invalidateCache('dashboard', CACHE_KEYS.dashboard);
    await invalidateCache('feed_summary', CACHE_KEYS.feedSummary);
    await invalidateCache('expense_summary', CACHE_KEYS.expenseSummary);
};