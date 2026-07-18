import supabase from '../config/supabase.js';

// Dashboard Summary
export const getDashboardReport = async (req, res) => {
    try {

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

        res.status(200).json({
            success: true,
            report: {
                totalBatches,
                totalFeedRecords,
                totalVaccinations,
                totalExpenses
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Feed Report
export const getFeedReport = async (req, res) => {

    try {

        const { data, error } = await supabase
            .from('feed_records')
            .select('*');

        if (error) throw error;

        const totalFeed = data.reduce(
            (sum, item) => sum + Number(item.quantity_kg),
            0
        );

        res.json({
            success: true,
            totalFeedRecords: data.length,
            totalFeedConsumed: totalFeed,
            data
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};

// Expense Report
export const getExpenseReport = async (req, res) => {

    try {

        const { data, error } = await supabase
            .from('expenses')
            .select('*');

        if (error) throw error;

        const totalExpenses = data.reduce(
            (sum, item) => sum + Number(item.amount),
            0
        );

        res.json({
            success: true,
            totalRecords: data.length,
            totalExpenses,
            data
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

};