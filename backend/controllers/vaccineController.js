import supabase from '../config/supabase.js';
import admin from '../config/firebase.js';

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

        const { data: batch, error: batchError } = await supabase
            .from('pig_batches')
            .select('id')
            .eq('id', batch_id)
            .eq('owner_id', req.user.id)
            .single();
        if (batchError || !batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }

        // Deduct stock before creating the record. If the record insert fails,
        // restore the previous quantity so the two operations stay consistent.
        const dosageNum = Number(dosage) || 0;
        let previousStock = null;
        let stockUpdated = false;
        if (dosageNum > 0) {
            const { data: stockData, error: stockError } = await supabase
                .from('vaccine_stocks')
                .select('stock_quantity')
                .eq('vaccine_name', vaccine_name)
                .eq('owner_id', req.user.id)
                .maybeSingle();
            if (stockError) throw stockError;
            if (stockData) {
                previousStock = Number(stockData.stock_quantity) || 0;
                const { error: updateError } = await supabase
                    .from('vaccine_stocks')
                    .update({
                        stock_quantity: Math.max(0, previousStock - dosageNum),
                        updated_at: new Date()
                    })
                    .eq('vaccine_name', vaccine_name)
                    .eq('owner_id', req.user.id);
                if (updateError) throw updateError;
                stockUpdated = true;
            }
        }

        const { data, error } = await supabase
            .from('vaccination_records')
            .insert([{
                owner_id: req.user.id,
                batch_id,
                vaccine_name,
                vaccination_date,
                next_due_date,
                administered_by,
                dosage,
                notes,
                status
            }])
            .select();

        if (error) {
            if (stockUpdated) {
                await supabase
                    .from('vaccine_stocks')
                    .update({ stock_quantity: previousStock, updated_at: new Date() })
                    .eq('vaccine_name', vaccine_name)
                    .eq('owner_id', req.user.id);
            }
            throw error;
        }

        res.status(201).json({
            success: true,
            data
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
                const tokens = devices.map((device) => device.fcm_token).filter(Boolean);
                if (tokens.length > 0) {
                    await Promise.allSettled(tokens.map((token) => admin.messaging().send({
                        notification: { title, body },
                        token,
                        data: { type: 'vaccination', batchId: batch_id },
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
        const message = error.message?.includes("'owner_id' column")
            ? 'Database migration required: run backend/config/migrations/20261009_add_vaccination_owner.sql in Supabase.'
            : error.message;
        res.status(500).json({
            success: false,
            message
        });
    }
};

// VIEW ALL
export const getAllVaccinations = async (req, res) => {
    try {
        const limit = req.query.limit ? Math.min(Math.max(Number(req.query.limit) || 100, 1), 500) : null;
        const offset = Math.max(Number(req.query.offset) || 0, 0);
        let query = supabase
            .from('vaccination_records')
            .select('id,batch_id,vaccine_name,vaccination_date,next_due_date,administered_by,dosage,notes,status,created_at')
            .eq('owner_id', req.user.id)
            .gte('vaccination_date', req.query.from || '1900-01-01')
            .lte('vaccination_date', req.query.to || '2999-12-31')
            .order('vaccination_date', { ascending: false });
        if (limit !== null) query = query.range(offset, offset + limit - 1);
        const { data, error } = await query;

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
        const limit = req.query.limit ? Math.min(Math.max(Number(req.query.limit) || 100, 1), 500) : null;
        const offset = Math.max(Number(req.query.offset) || 0, 0);

        let query = supabase
            .from('vaccination_records')
            .select('id,batch_id,vaccine_name,vaccination_date,next_due_date,administered_by,dosage,notes,status,created_at')
            .eq('batch_id', batchId)
            .eq('owner_id', req.user.id)
            .order('vaccination_date', { ascending: false });
        if (limit !== null) query = query.range(offset, offset + limit - 1);
        const { data, error } = await query;

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

// UPCOMING VACCINATIONS
export const getUpcomingVaccinations = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

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
        res.status(500).json({
            success: false,
            message: error.message
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
                price_per_dose: price_per_dose === undefined ? existing?.price_per_dose : price_per_dose,
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
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};