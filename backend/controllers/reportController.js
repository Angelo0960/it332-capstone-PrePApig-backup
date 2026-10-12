import supabase from '../config/supabase.js';
import protobuf from 'protobufjs';
import { fileURLToPath } from 'node:url';

const analyticsProto = protobuf.loadSync(fileURLToPath(new URL('../proto/analytics.proto', import.meta.url)));
const AnalyticsResponse = analyticsProto.lookupType('prepapig.analytics.AnalyticsResponse');

const analyticsFields = {
    batches: 'id,batch_code,pig_count,start_weight,current_weight,sale_price_per_kg,date_acquired,status,created_at',
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

const loadAnalyticsData = async (req) => {
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
    return {
        batches: batches.data || [],
        feedRecords: feeds.data || [],
        vaccinationRecords: vaccinations.data || [],
        expenses: expenses.data || [],
        feedStock: feedStock.data || [],
        vaccineStock: vaccineStock.data || [],
    };
};

const toNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const toProtoPayload = (data) => ({
    batches: data.batches.map((row) => ({
        id: String(row.id || ''), batchCode: String(row.batch_code || ''), pigCount: Number(row.pig_count || 0),
        breed: String(row.breed || ''), startWeight: toNumber(row.start_weight), currentWeight: toNumber(row.current_weight),
        salePricePerKg: String(row.sale_price_per_kg ?? ''), dateAcquired: String(row.date_acquired || ''),
        status: String(row.status || ''), createdAt: String(row.created_at || ''),
    })),
    feedRecords: data.feedRecords.map((row) => ({
        id: String(row.id || ''), batchId: String(row.batch_id || ''), feedType: String(row.feed_type || ''),
        quantityKg: toNumber(row.quantity_kg), feedingDate: String(row.feeding_date || ''), feedingTime: String(row.feeding_time || ''),
        notes: String(row.notes || ''), createdAt: String(row.created_at || ''),
    })),
    vaccinationRecords: data.vaccinationRecords.map((row) => ({
        id: String(row.id || ''), batchId: String(row.batch_id || ''), vaccineName: String(row.vaccine_name || ''),
        vaccinationDate: String(row.vaccination_date || ''), nextDueDate: String(row.next_due_date || ''),
        administeredBy: String(row.administered_by || ''), dosage: String(row.dosage || ''), notes: String(row.notes || ''),
        status: String(row.status || ''), createdAt: String(row.created_at || ''),
    })),
    expenses: data.expenses.map((row) => ({
        id: String(row.id || ''), batchId: String(row.batch_id || ''), expenseType: String(row.expense_type || ''),
        amount: toNumber(row.amount), expenseDate: String(row.expense_date || ''), description: String(row.description || ''),
        createdAt: String(row.created_at || ''),
    })),
    feedStock: data.feedStock.map((row) => ({ feedType: String(row.feed_type || ''), unitPrice: toNumber(row.unit_price), stockQuantity: toNumber(row.stock_quantity) })),
    vaccineStock: data.vaccineStock.map((row) => ({ vaccineName: String(row.vaccine_name || ''), pricePerDose: toNumber(row.price_per_dose), stockQuantity: toNumber(row.stock_quantity) })),
});

export const getAnalyticsData = async (req, res) => {
    try {
        const data = await loadAnalyticsData(req);
        res.json({
            success: true,
            data,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getAnalyticsDataProto = async (req, res) => {
    try {
        const data = await loadAnalyticsData(req);
        const message = AnalyticsResponse.create(toProtoPayload(data));
        const buffer = AnalyticsResponse.encode(message).finish();
        res.type('application/x-protobuf').send(Buffer.from(buffer));
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