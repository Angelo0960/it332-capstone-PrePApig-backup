import { pagination } from '../services/pagination.js';
import supabase from '../config/supabase.js';
import admin from '../config/firebase.js';

const getTodayInTimezone = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: process.env.APP_TIMEZONE || 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date()).reduce((result, part) => {
        if (part.type !== 'literal') result[part.type] = part.value;
        return result;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
};

// CREATE – inserts vaccination, deducts stock, sends notifications
export const createVaccination = async (req, res) => {
    try {
        const {
            batch_id,
            vaccine_name,
            vaccination_date,
            next_due_date,
            administered_by,
            dosage,
            notes,
            status
        } = req.body;

        const { data: result, error } = await supabase.rpc('create_vaccination_with_stock', {
            p_owner_id: req.user.id,
            p_vaccination: {
                batch_id,
                vaccine_name,
                vaccination_date,
                next_due_date,
                administered_by,
                dosage,
                notes,
                status,
            },
        });

        if (error) throw error;

        res.status(201).json({
            success: true,
            data: result?.record ? [result.record] : [],
            vaccine_stock: result?.vaccine_stock || null,
            remaining_stock_quantity: result?.remaining_stock_quantity == null
                ? null
                : Number(result.remaining_stock_quantity),
        });

        // Notifications are intentionally processed after the response so marking done stays fast.
        void (async () => {
            try {
                const { data: batchData, error: batchError } = await supabase
                    .from('pig_batches')
                    .select('owner_id, batch_code')
                    .eq('id', batch_id)
                    .single();

                if (batchError) {
                    console.warn('Could not fetch batch owner:', batchError.message);
                    return;
                }

                const ownerId = batchData?.owner_id;
                const batchCode = batchData?.batch_code || 'Batch';
                if (!ownerId) return;

                const { data: devices, error: deviceError } = await supabase
                    .from('user_devices')
                    .select('fcm_token')
                    .eq('user_id', ownerId);
                if (deviceError) {
                    console.warn('Could not fetch user devices:', deviceError.message);
                    return;
                }

                const title = '💉 Vaccination Recorded';
                const body = `${vaccine_name} for ${batchCode} has been administered.`;
                const tokens = [...new Set(devices.map((device) => device.fcm_token).filter(Boolean))];
                if (tokens.length > 0) {
                    await Promise.allSettled(tokens.map((token) => admin.messaging().send({
                        token,
                        data: { type: 'vaccination', batchId: batch_id, title, body },
                    })));
                }

                await supabase.from('notifications').insert([{
                    user_id: ownerId,
                    title,
                    message: body,
                    type: 'vaccination',
                    is_read: false,
                }]);
            } catch (notificationError) {
                console.error('Background vaccination notification failed:', notificationError.message);
            }
        })();

    } catch (error) {
        console.error('Error in createVaccination:', error);
        const rawMessage = String(error.message || '');
        const stockConflict = /insufficient vaccine stock|vaccine stock not found/i.test(rawMessage);
        const message = rawMessage.includes('vaccine_stocks.owner_id')
            ? 'Database migration required: run backend/config/migrations/20261010_vaccine_stock_owner.sql in Supabase.'
            : rawMessage.includes("'owner_id' column")
                ? 'Database migration required: run backend/config/migrations/20261009_owner_columns.sql in Supabase.'
                : stockConflict
                    ? rawMessage
                    : rawMessage || 'Unable to record vaccination';
        res.status(stockConflict ? 409 : 500).json({
            success: false,
            message
        });
    }
};

// VIEW ALL
export const getAllVaccinations = async (req, res) => {
    try {
        const { limit, offset } = pagination(req.query);
        let query = supabase
            .from('vaccination_records')
            .select('id,batch_id,vaccine_name,vaccination_date,next_due_date,administered_by,dosage,notes,status,price_per_dose_at_usage,created_at')
            .eq('owner_id', req.user.id)
            .gte('vaccination_date', req.query.from || '1900-01-01')
            .lte('vaccination_date', req.query.to || '2999-12-31')
            .order('vaccination_date', { ascending: false });
        query = query.order('id', { ascending: false }).range(offset, offset + limit - 1);
        const { data, error } = await query;

        if (error) throw error;

        res.status(200).json({
            success: true,
            pagination: { limit, offset },
            count: data.length,
            data
        });

    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            message: error.message
        });
    }
};

// VIEW BY ID
export const getVaccinationById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('vaccination_records')
            .select('*')
            .eq('id', id)
            .eq('owner_id', req.user.id)
            .single();

        if (error) throw error;

        res.status(200).json({
            success: true,
            data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// VIEW BY BATCH
export const getVaccinationsByBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { limit, offset } = pagination(req.query);

        let query = supabase
            .from('vaccination_records')
            .select('id,batch_id,vaccine_name,vaccination_date,next_due_date,administered_by,dosage,notes,status,price_per_dose_at_usage,created_at')
            .eq('batch_id', batchId)
            .eq('owner_id', req.user.id)
            .order('vaccination_date', { ascending: false });
        query = query.order('id', { ascending: false }).range(offset, offset + limit - 1);
        const { data, error } = await query;

        if (error) throw error;

        res.status(200).json({
            success: true,
            pagination: { limit, offset },
            count: data.length,
            data
        });

    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            message: error.message
        });
    }
};

// UPCOMING VACCINATIONS
export const getUpcomingVaccinations = async (req, res) => {
    try {
        const today = getTodayInTimezone();

        const { data, error } = await supabase
            .from('vaccination_records')
            .select('*')
            .gte('next_due_date', today)
            .eq('owner_id', req.user.id);

        if (error) throw error;

        res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// === VACCINE STOCK MANAGEMENT ===

// GET all vaccine stock
// GET vaccine stock – with proper error handling
export const getVaccineStock = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vaccine_stocks')
            .select('*')
            .eq('owner_id', req.user.id)
            .order('vaccine_name');

        if (error) {
            // If table doesn't exist, return empty array
            if (error.code === '42P01') { // relation does not exist
                return res.status(200).json({
                    success: true,
                    data: []
                });
            }
            throw error;
        }

        res.status(200).json({
            success: true,
            data: data || []
        });
    } catch (error) {
        console.error('Error fetching vaccine stock:', error);
        const messageText = String(error.message || '');
        const message = messageText.includes('vaccine_stocks.owner_id')
            ? 'Database migration required: run backend/config/migrations/20261010_vaccine_stock_owner.sql in Supabase.'
            : messageText.includes('vaccine_stocks_owner_name') || messageText.includes('ON CONFLICT')
                ? 'Database migration required: run backend/config/migrations/20261030_repair_vaccine_stock_upsert.sql in Supabase.'
                : messageText;
        res.status(500).json({
            success: false,
            message
        });
    }
};

// UPDATE (or insert) vaccine stock
export const updateVaccineStock = async (req, res) => {
    try {
        const { vaccine_name, stock_quantity, expiry_date, price_per_dose, notes } = req.body;
        if (!vaccine_name || (stock_quantity === undefined && price_per_dose === undefined && expiry_date === undefined && notes === undefined)) {
            return res.status(400).json({ success: false, message: 'Vaccine name and an update value are required' });
        }

        const { data: existing, error: existingError } = await supabase
            .from('vaccine_stocks')
            .select('stock_quantity,expiry_date,price_per_dose,notes')
            .eq('owner_id', req.user.id)
            .eq('vaccine_name', vaccine_name)
            .maybeSingle();
        if (existingError) throw existingError;

        const addedQuantity = stock_quantity === undefined ? 0 : Number(stock_quantity);
        if (!Number.isFinite(addedQuantity) || addedQuantity < 0) {
            return res.status(400).json({ success: false, message: 'Stock quantity must be non-negative' });
        }

        const { data, error } = await supabase
            .from('vaccine_stocks')
            .upsert({
                owner_id: req.user.id,
                vaccine_name,
                stock_quantity: Number(existing?.stock_quantity || 0) + addedQuantity,
                expiry_date: expiry_date === undefined ? existing?.expiry_date : expiry_date,
                price_per_dose: price_per_dose === undefined ? (existing?.price_per_dose ?? null) : price_per_dose,
                notes: notes === undefined ? existing?.notes : notes,
                updated_at: new Date()
            }, { onConflict: 'owner_id,vaccine_name' })
            .select();

        if (error) throw error;

        res.status(200).json({
            success: true,
            data
        });

    } catch (error) {
        const messageText = String(error.message || '');
        const message = messageText.includes('vaccine_stocks.owner_id')
            ? 'Database migration required: run backend/config/migrations/20261010_vaccine_stock_owner.sql in Supabase.'
            : messageText.includes('vaccine_stocks_owner_name') || messageText.includes('ON CONFLICT')
                ? 'Database migration required: run backend/config/migrations/20261030_repair_vaccine_stock_upsert.sql in Supabase.'
                : messageText;
        res.status(500).json({
            success: false,
            message
        });
    }
}

export const getVaccinationOverview = async (req, res) => {
    try {
        const [batches, records, stock] = await Promise.all([
            supabase.from('pig_batches').select('id,batch_code,pig_count,breed,age_on_acquisition,start_weight,current_weight,date_acquired,status,created_at').eq('owner_id', req.user.id).order('created_at', { ascending: false }).range(0, 24),
            supabase.from('vaccination_records').select('id,batch_id,vaccine_name,vaccination_date,next_due_date,administered_by,dosage,notes,status,price_per_dose_at_usage,created_at').eq('owner_id', req.user.id).order('vaccination_date', { ascending: false }).range(0, 24),
            supabase.from('vaccine_stocks').select('id,vaccine_name,stock_quantity,expiry_date,price_per_dose,notes,updated_at').eq('owner_id', req.user.id).order('vaccine_name'),
        ]);
        const failed = [batches, records, stock].find((result) => result.error);
        if (failed) throw failed.error;
        res.json({ success: true, data: { batches: batches.data || [], records: records.data || [], stock: stock.data || [] } });
    } catch (error) {
        console.error('Error fetching vaccination overview:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};