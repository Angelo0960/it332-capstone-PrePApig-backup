import supabase from '../config/supabase.js';

const analyticsFields = {
    batches: 'id,batch_code,pig_count,start_weight,current_weight,date_acquired,status,created_at',
    feeds: 'id,batch_id,feed_type,quantity_kg,feeding_date,feeding_time,notes,created_at',
    vaccinations: 'id,batch_id,vaccine_name,vaccination_date,next_due_date,administered_by,dosage,notes,status,created_at',
    expenses: 'id,batch_id,expense_type,amount,expense_date,description,created_at',
};

// Dashboard Summary
export const getDashboardReport = async (req, res) => {
    try {

        const [batches, expensesResult, feeds, vaccinations] = await Promise.all([
            supabase.from('pig_batches').select('id', { count: 'exact', head: true }).eq('owner_id', req.user.id),
            supabase.from('expenses').select('amount').eq('owner_id', req.user.id),
            supabase.from('feed_records').select('id', { count: 'exact', head: true }).eq('owner_id', req.user.id),
            supabase.from('vaccination_records').select('id', { count: 'exact', head: true }).eq('owner_id', req.user.id),
        ]);
        const queryErrors = [batches, expensesResult, feeds, vaccinations].filter((result) => result.error);
        if (queryErrors.length > 0) throw queryErrors[0].error;
        const totalBatches = batches.count;
        const totalFeedRecords = feeds.count;
        const totalVaccinations = vaccinations.count;
        const expenses = expensesResult.data || [];

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
            .select('*')
            .eq('owner_id', req.user.id);

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

export const getAnalyticsData = async (req, res) => {
    try {
        const from = req.query.from || '1900-01-01';
        const to = req.query.to || '2999-12-31';
        const [batches, feeds, vaccinations, expenses, feedStock, vaccineStock] = await Promise.all([
            supabase.from('pig_batches').select(analyticsFields.batches).eq('owner_id', req.user.id).order('created_at', { ascending: false }),
            supabase.from('feed_records').select(analyticsFields.feeds).eq('owner_id', req.user.id).gte('feeding_date', from).lte('feeding_date', to).order('feeding_date', { ascending: false }),
            supabase.from('vaccination_records').select(analyticsFields.vaccinations).eq('owner_id', req.user.id).gte('vaccination_date', from).lte('vaccination_date', to).order('vaccination_date', { ascending: false }),
            supabase.from('expenses').select(analyticsFields.expenses).eq('owner_id', req.user.id).gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending: false }),
            supabase.from('feed_stocks').select('feed_type,unit_price,stock_quantity').eq('owner_id', req.user.id),
            supabase.from('vaccine_stocks').select('vaccine_name,price_per_dose,stock_quantity').eq('owner_id', req.user.id),
        ]);
        const failed = [batches, feeds, vaccinations, expenses, feedStock, vaccineStock].find((result) => result.error);
        if (failed) throw failed.error;
        res.json({
            success: true,
            data: {
                batches: batches.data || [],
                feedRecords: feeds.data || [],
                vaccinationRecords: vaccinations.data || [],
                expenses: expenses.data || [],
                feedStock: feedStock.data || [],
                vaccineStock: vaccineStock.data || [],
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Expense Report
export const getExpenseReport = async (req, res) => {

    try {

        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .eq('owner_id', req.user.id);

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