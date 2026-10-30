import supabase from '../config/supabase.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const numeric = (value) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
const fields = 'id,batch_id,harvest_date,pig_count,total_weight_kg,sale_date,revenue,buyer,notes,created_at';

// Paginate explicitly so financial totals never silently stop at the Supabase row cap.
export const readAll = async (makeQuery) => {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
        const { data, error } = await makeQuery().range(offset, offset + 499);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 500) return rows;
    }
};

export const listSales = async (req, res) => {
    try {
        if (req.query.batch_id && !uuid.test(req.query.batch_id)) return res.status(400).json({ success: false, message: 'Invalid batch ID' });
        const data = await readAll(() => {
            let query = supabase.from('harvest_sales').select(fields).eq('owner_id', req.user.id).order('harvest_date', { ascending: false }).order('id');
            if (req.query.batch_id) query = query.eq('batch_id', req.query.batch_id);
            return query;
        });
        res.json({ success: true, data });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

export const saveSale = async (req, res) => {
    try {
        const { batch_id, harvest_date, pig_count, total_weight_kg, sale_date = null, revenue = null, buyer = null, notes = null, delete_batch = false } = req.body;
        if (!uuid.test(batch_id) || req.params.id && !uuid.test(req.params.id)
            || !validDate(harvest_date) || !numeric(pig_count) || !Number.isSafeInteger(Number(pig_count)) || Number(pig_count) <= 0 || Number(pig_count) > 2147483647
            || !numeric(total_weight_kg) || Number(total_weight_kg) < 0.01 || Number(total_weight_kg) >= 10000000000
            || (sale_date === null ? revenue !== null : !validDate(sale_date) || sale_date < harvest_date || !numeric(revenue) || Number(revenue) < 0 || Number(revenue) >= 1000000000000)
            || buyer !== null && (typeof buyer !== 'string' || buyer.length > 500)
            || notes !== null && (typeof notes !== 'string' || notes.length > 5000)) {
            return res.status(400).json({ success: false, message: 'Valid batch, harvest date, positive pig count/weight and paired sale date/revenue are required' });
        }
        const { data: batch, error: batchError } = await supabase.from('pig_batches').select('id').eq('owner_id', req.user.id).eq('id', batch_id).maybeSingle();
        if (batchError) throw batchError;
        if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });
        const record = { batch_id, harvest_date, pig_count: Number(pig_count), total_weight_kg: Number(total_weight_kg), sale_date, revenue: revenue === null ? null : Number(revenue), buyer, notes };
        const query = req.params.id
            ? supabase.from('harvest_sales').update(record).eq('owner_id', req.user.id).eq('id', req.params.id)
            : supabase.from('harvest_sales').insert({ ...record, owner_id: req.user.id });
        const { data, error } = await query.select(fields).maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).json({ success: false, message: 'Harvest/sale not found' });
        if (delete_batch === true) {
            const { error: deleteError } = await supabase
                .from('pig_batches')
                .delete()
                .eq('id', batch_id)
                .eq('owner_id', req.user.id);
            if (deleteError) throw deleteError;
        }
        res.status(req.params.id ? 200 : 201).json({ success: true, data, batch_deleted: delete_batch === true });
    } catch (error) {
        const message = String(error.message || '');
        const migrationMissing = message.includes('harvest_sales') && (message.includes('schema cache') || message.includes('does not exist') || message.toLowerCase().includes('permission denied'));
        res.status(500).json({
            success: false,
            message: migrationMissing
                ? 'Harvest sales permissions are not configured. Run backend/config/migrations/20261013_financial_reliability.sql and backend/config/migrations/20261030_repair_harvest_sales_permissions.sql in Supabase SQL Editor, then retry.'
                : message,
        });
    }
};

export const deleteSale = async (req, res) => {
    if (!uuid.test(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid record ID' });
    const { data, error } = await supabase.from('harvest_sales').delete().eq('owner_id', req.user.id).eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(500).json({ success: false, message: error.message });
    if (!data) return res.status(404).json({ success: false, message: 'Harvest/sale not found' });
    res.json({ success: true });
};
