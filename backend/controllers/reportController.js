import { collectPages } from '../services/pagination.js';
import supabase from '../config/supabase.js';
import protobuf from 'protobufjs';
import { fileURLToPath } from 'node:url';

const analyticsProto = protobuf.loadSync(fileURLToPath(new URL('../proto/analytics.proto', import.meta.url)));
const AnalyticsResponse = analyticsProto.lookupType('prepapig.analytics.AnalyticsResponse');

const analyticsFields = {
    batches: 'id,breed,age_on_acquisition,batch_code,pig_count,start_weight,current_weight,sale_price_per_kg,date_acquired,status,created_at',
    feeds: 'id,batch_id,feed_type,quantity_kg,feeding_date,feeding_time,notes,unit_price_at_usage,created_at',
    vaccinations: 'id,batch_id,vaccine_name,vaccination_date,next_due_date,administered_by,dosage,notes,status,price_per_dose_at_usage,created_at',
    expenses: 'id,batch_id,expense_type,amount,expense_date,description,created_at',
};

// Dashboard Summary
export const getDashboardReport = async (req, res) => {
    try {

        const [batches, expensesResult, feeds, vaccinations] = await Promise.all([
            supabase.from('pig_batches').select('id', { count: 'exact', head: true }).eq('owner_id', req.user.id),
            collectPages(() => supabase.from('expenses').select('id,amount').eq('owner_id', req.user.id).order('id')).then(data => ({ data })),
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
        res.status(error.status || 500).json({
            success: false,
            message: error.message
        });
    }
};

// Feed Report
export const getFeedReport = async (req, res) => {

    try {

        const data = await collectPages(() => supabase.from('feed_records').select('*').eq('owner_id', req.user.id).order('id'));

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

        res.status(error.status || 500).json({
            success: false,
            message: error.message
        });

    }

};

const loadAnalyticsData = async (req, onlyKey = null) => {
    const { from, to } = reportFilters(req);
    const specs = [
        ['pig_batches', analyticsFields.batches, null],
        ['feed_records', analyticsFields.feeds, 'feeding_date'],
        ['vaccination_records', analyticsFields.vaccinations, 'vaccination_date'],
        ['expenses', analyticsFields.expenses, 'expense_date'],
        ['feed_stocks', 'id,feed_type,unit_price,stock_quantity', null],
        ['vaccine_stocks', 'id,vaccine_name,price_per_dose,stock_quantity', null],
    ];
    const keys = ['batches', 'feedRecords', 'vaccinationRecords', 'expenses', 'feedStock', 'vaccineStock'];
    const results = await Promise.all(specs.map(([table, fields, date], index) => onlyKey && keys[index] !== onlyKey ? [] : collectPages(() => {
        let query = supabase.from(table).select(fields).eq('owner_id', req.user.id).order('id');
        if (date) query = query.gte(date, from).lte(date, to);
        if (req.query.batch_id && date) query = query.eq('batch_id', req.query.batch_id);
        if (req.query.batch_id && table === 'pig_batches') query = query.eq('id', req.query.batch_id);
        return query;
    })));
    return Object.fromEntries(keys.map((key, i) => [key, results[i]]));
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
    feedStock: data.feedStock.map((row) => ({ feedType: String(row.feed_type || ''), unitPrice: row.unit_price == null ? undefined : toNumber(row.unit_price), stockQuantity: toNumber(row.stock_quantity) })),
    vaccineStock: data.vaccineStock.map((row) => ({ vaccineName: String(row.vaccine_name || ''), pricePerDose: row.price_per_dose == null ? undefined : toNumber(row.price_per_dose), stockQuantity: toNumber(row.stock_quantity) })),
});

export const getAnalyticsData = async (req, res) => {
    try {
        const data = await loadAnalyticsData(req);
        res.json({
            success: true,
            data,
        });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Report unavailable" });
    }
};

export const getAnalyticsDataProto = async (req, res) => {
    try {
        const data = await loadAnalyticsData(req);
        const message = AnalyticsResponse.create(toProtoPayload(data));
        const buffer = AnalyticsResponse.encode(message).finish();
        res.type('application/x-protobuf').send(Buffer.from(buffer));
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.status ? error.message : "Report unavailable" });
    }
};

// Expense Report
export const getExpenseReport = async (req, res) => {

    try {

        const data = await collectPages(() => supabase.from('expenses').select('*').eq('owner_id', req.user.id).order('id'));

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

        res.status(error.status || 500).json({
            success: false,
            message: error.message
        });

    }

};
const reportFilters = (req) => {
    const from = req.query.from || '1900-01-01';
    const to = req.query.to || '2999-12-31';
    const valid = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!valid(from) || !valid(to) || from > to || (req.query.batch_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.query.batch_id))) {
        const error = new Error('Invalid date range or batch_id'); error.status = 400; throw error;
    }
    return { from, to };
};

export const getAnalyticsSummary = async (req, res, next) => {
    try {
        const { from, to } = reportFilters(req);
        const { data, error } = await supabase.rpc('phase4_analytics', { p_owner: req.user.id, p_from: from, p_to: to, p_batch: req.query.batch_id || null });
        if (error) throw error;
        res.json({ success: true, data: req.path.endsWith('timeseries') ? data.timeseries : data });
    } catch (error) { next(error); }
};

const csvCell = (value) => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
};
export const exportReport = async (req, res, next) => {
    try {
        const types = { growth: 'batches', feeds: 'feedRecords', vaccinations: 'vaccinationRecords', expenses: 'expenses' };
        const key = Object.hasOwn(types, req.query.type) ? types[req.query.type] : null;
        if (!key) return res.status(400).json({ success: false, message: 'type must be growth, feeds, vaccinations or expenses' });
        const data = await loadAnalyticsData(req, key);
        const rows = data[key];
        const headers = Object.keys(rows[0] || Object.fromEntries(analyticsFields[{ batches: 'batches', feedRecords: 'feeds', vaccinationRecords: 'vaccinations', expenses: 'expenses' }[key]].split(',').map(field => [field, null])));
        res.setHeader('Content-Disposition', `attachment; filename="${req.query.type}-report.csv"`);
        res.type('text/csv').send([headers.map(csvCell).join(','), ...rows.map(row => headers.map(field => csvCell(row[field])).join(','))].join('\r\n'));
    } catch (error) { next(error); }
};
