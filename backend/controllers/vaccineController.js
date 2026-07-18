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

        // 1. Insert the vaccination record
        const { data, error } = await supabase
            .from('vaccination_records')
            .insert([{
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

        if (error) throw error;

        // 2. Deduct from vaccine stock (if dosage is provided)
        if (dosage) {
            const dosageNum = Number(dosage) || 0;
            if (dosageNum > 0) {
                // Get current stock
                const { data: stockData, error: stockError } = await supabase
                    .from('vaccine_stocks')
                    .select('stock_quantity')
                    .eq('vaccine_name', vaccine_name)
                    .single();

                if (!stockError && stockData) {
                    const newQuantity = Math.max(0, stockData.stock_quantity - dosageNum);
                    await supabase
                        .from('vaccine_stocks')
                        .update({ 
                            stock_quantity: newQuantity,
                            updated_at: new Date()
                        })
                        .eq('vaccine_name', vaccine_name);
                }
            }
        }

        // 3. Get the batch owner and batch code
        const { data: batchData, error: batchError } = await supabase
            .from('pig_batches')
            .select('owner_id, batch_code')
            .eq('id', batch_id)
            .single();

        if (batchError) {
            console.warn('Could not fetch batch owner:', batchError.message);
            return res.status(201).json({ success: true, data });
        }

        const ownerId = batchData?.owner_id;
        const batchCode = batchData?.batch_code || 'Batch';

        // 4. Skip notification if no owner or admin
        if (!ownerId || ownerId === 'admin') {
            console.log('Skipping notification – no real owner');
            return res.status(201).json({ success: true, data });
        }

        // 5. Get user's FCM tokens
        const { data: devices, error: deviceError } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', ownerId);

        if (deviceError) {
            console.warn('Could not fetch user devices:', deviceError.message);
            return res.status(201).json({ success: true, data });
        }

        const tokens = devices.map(d => d.fcm_token).filter(Boolean);

        // 6. Send push notifications (fire-and-forget)
        const title = `💉 Vaccination Recorded`;
        const body = `${vaccine_name} for ${batchCode} has been administered.`;

        if (tokens.length > 0) {
            const messages = tokens.map(token => ({
                notification: { title, body },
                token,
                data: {
                    type: 'vaccination',
                    batchId: batch_id,
                },
            }));

            Promise.allSettled(
                messages.map(msg =>
                    admin.messaging().send(msg).catch(async err => {
                        console.error(`FCM send error for token ${msg.token}:`, err.message);
                        if (err.code === 'messaging/invalid-registration-token') {
                            await supabase.from('user_devices').delete().eq('fcm_token', msg.token);
                        }
                    })
                )
            ).then(results => {
                const succeeded = results.filter(r => r.status === 'fulfilled').length;
                console.log(`📨 Notifications sent: ${succeeded}/${tokens.length}`);
            });
        }

        // 7. Save notification in database for history
        await supabase
            .from('notifications')
            .insert([{
                user_id: ownerId,
                title,
                message: body,
                type: 'vaccination',
                is_read: false,
            }])
            .select();

        res.status(201).json({
            success: true,
            data
        });

    } catch (error) {
        console.error('Error in createVaccination:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// VIEW ALL
export const getAllVaccinations = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('vaccination_records')
            .select('*')
            .order('vaccination_date', { ascending: false });

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

        const { data, error } = await supabase
            .from('vaccination_records')
            .select('*')
            .eq('batch_id', batchId);

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
            .gte('next_due_date', today);

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
        if (!vaccine_name || stock_quantity === undefined) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const { data, error } = await supabase
            .from('vaccine_stocks')
            .upsert({
                vaccine_name,
                stock_quantity,
                expiry_date,
                price_per_dose,
                notes,
                updated_at: new Date()
            }, { onConflict: 'vaccine_name' })
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