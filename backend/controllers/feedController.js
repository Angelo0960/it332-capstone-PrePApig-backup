import supabase from '../config/supabase.js';
import admin from '../config/firebase.js'; // for push notifications

// CREATE FEED RECORD – now creates a notification
export const createFeedRecord = async (req, res) => {
    try {
        const {
            batch_id,
            feed_type,
            quantity_kg,
            feeding_date,
            feeding_time,
            notes
        } = req.body;

        // 1. Insert the feed record
        const { data, error } = await supabase
            .from('feed_records')
            .insert([{
                batch_id,
                feed_type,
                quantity_kg,
                feeding_date,
                feeding_time,
                notes
            }])
            .select();

        if (error) throw error;

        // 2. Get the batch owner and batch code
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

        // 3. Skip notification if no owner or admin
        if (!ownerId || ownerId === 'admin') {
            console.log('Skipping notification – no real owner');
            return res.status(201).json({ success: true, data });
        }

        // 4. Get user's FCM tokens (if push notifications are used)
        const { data: devices, error: deviceError } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', ownerId);

        if (deviceError) {
            console.warn('Could not fetch user devices:', deviceError.message);
            // Continue without push, but we'll still save the notification
        }

        const tokens = devices ? devices.map(d => d.fcm_token).filter(Boolean) : [];

        // 5. Build notification title and body
        const title = `🐖 Feeding Recorded`;
        const body = `${feed_type} (${quantity_kg} kg) for ${batchCode} has been recorded.`;

        // 6. Send push notifications (fire-and-forget)
        if (tokens.length > 0) {
            const messages = tokens.map(token => ({
                notification: { title, body },
                token,
                data: {
                    type: 'feed',
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
                console.log(`📨 Feed notification sent: ${succeeded}/${tokens.length}`);
            });
        }

        // 7. Save notification in database for history
        await supabase
            .from('notifications')
            .insert([{
                user_id: ownerId,
                title,
                message: body,
                type: 'feed',
                is_read: false,
            }])
            .select();

        res.status(201).json({
            success: true,
            data
        });

    } catch (error) {
        console.error('Error in createFeedRecord:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// VIEW ALL
export const getAllFeedRecords = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('feed_records')
            .select('*')
            .order('feeding_date', { ascending: false });

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
export const getFeedRecordById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('feed_records')
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
export const getFeedByBatch = async (req, res) => {
    try {
        const { batchId } = req.params;

        const { data, error } = await supabase
            .from('feed_records')
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

// UPDATE
export const updateFeedRecord = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('feed_records')
            .update(req.body)
            .eq('id', id)
            .select();

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Feed record updated successfully',
            data
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// DELETE
export const deleteFeedRecord = async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('feed_records')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Feed record deleted successfully'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// SUMMARY
export const getFeedSummary = async (req, res) => {
    try {

        const { data, error } = await supabase
            .from('feed_records')
            .select('*');

        if (error) throw error;

        const totalRecords = data.length;

        const totalFeedConsumed = data.reduce(
            (sum, item) => sum + Number(item.quantity_kg),
            0
        );

        res.status(200).json({
            success: true,
            summary: {
                totalRecords,
                totalFeedConsumed
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ============================================================
// FEED STOCK MANAGEMENT (if you have this table)
// ============================================================

export const getFeedStock = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('feed_stocks')
            .select('*')
            .order('feed_type');

        if (error) {
            if (error.code === '42P01') {
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
        console.error('Error fetching feed stock:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const updateFeedStock = async (req, res) => {
    try {
        const { feed_type, stock_quantity, unit_price, last_updated, notes } = req.body;
        if (!feed_type || stock_quantity === undefined) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const { data, error } = await supabase
            .from('feed_stocks')
            .upsert({
                feed_type,
                stock_quantity,
                unit_price,
                last_updated: last_updated || new Date().toISOString().split('T')[0],
                notes,
                updated_at: new Date()
            }, { onConflict: 'feed_type' })
            .select();

        if (error) throw error;

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.error('Error updating feed stock:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};