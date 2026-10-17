import supabase from '../config/supabase.js';
import { readAll, validDate } from './salesController.js';

export const getFinancialReport = async (req, res) => {
    const { from = '1900-01-01', to = '2999-12-31', batch_id } = req.query;
    if (!validDate(from) || !validDate(to) || from > to || batch_id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batch_id)) {
        return res.status(400).json({ success: false, message: 'Invalid date range or batch ID' });
    }
    try {
        const query = (table, fields, date) => {
            let q = supabase.from(table).select(fields).eq('owner_id', req.user.id).gte(date, from).lte(date, to).order(date).order('id');
            if (batch_id) q = q.eq('batch_id', batch_id);
            return q;
        };
        const [salesResult, expensesResult] = await Promise.allSettled([
            readAll(() => query('harvest_sales', 'id,sale_date,revenue,batch_id', 'sale_date')),
            readAll(() => query('expenses', 'id,expense_date,amount,batch_id', 'expense_date')),
        ]);
        if (expensesResult.status === 'rejected') throw expensesResult.reason;

        const salesAvailable = salesResult.status === 'fulfilled';
        const sales = salesAvailable ? salesResult.value : [];
        const expenses = expensesResult.value;
        const months = new Map();
        const month = (date) => {
            const key = date.slice(0, 7);
            if (!months.has(key)) months.set(key, { month: key, revenue: 0, expenses: 0, profit: 0 });
            return months.get(key);
        };
        for (const row of sales) month(row.sale_date).revenue += Number(row.revenue);
        for (const row of expenses) month(row.expense_date).expenses += Number(row.amount);
        const round = (value) => Math.round(value * 100) / 100;
        const recordedExpenses = round(expenses.reduce((sum, row) => sum + Number(row.amount), 0));
        const actualRevenue = salesAvailable
            ? round(sales.reduce((sum, row) => sum + Number(row.revenue), 0))
            : null;
        const recordedProfit = salesAvailable
            ? round(actualRevenue - recordedExpenses)
            : null;
        res.json({ success: true, data: {
            from, to, actualRevenue, recordedExpenses, recordedProfit,
            saleCount: salesAvailable ? sales.length : null,
            salesAvailable,
            basis: salesAvailable
                ? 'Recorded sales minus recorded expenses by transaction date. Excludes unrecorded costs; not full accounting profit.'
                : 'Recorded expenses loaded. Recorded sales are unavailable until the harvest_sales migration/table is available.',
            monthly: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((row) => ({ ...row, revenue: round(row.revenue), expenses: round(row.expenses), profit: salesAvailable ? round(row.revenue - row.expenses) : null })),
        } });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
