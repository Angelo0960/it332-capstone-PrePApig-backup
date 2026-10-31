import { pagination } from '../services/pagination.js';
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

        const { data: batch, error: batchError } = await supabase
            .from('pig_batches')
            .select('id')
            .eq('id', batch_id)
            .eq('owner_id', req.user.id)
            .single();
        if (batchError || !batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }

        // Record feed usage and distribute the quantity equally across the
        // batch's individual pigs atomically in PostgreSQL.
        const { data: result, error } = await supabase.rpc('create_feed_record_with_weight_gain', {
            p_owner_id: req.user.id,
            p_feed: {
                batch_id,
                feed_type,
                quantity_kg,
                feeding_date,
                feeding_time,
                notes,
            },
        });

        if (error) throw error;

        const savedRecord = result?.record || null;
        res.status(201).json({
            success: true,
            data: savedRecord ? [savedRecord] : [],
            batch: result?.batch || null,
            weight_gain: Number(result?.weight_gain || 0),
            weight_gain_per_pig: Number(result?.weight_gain_per_pig || 0),
            fcr: Number(result?.fcr || 0),
            fcr_source: result?.fcr_source || null,
            phase: result?.phase || null,
            pig_count: Number(result?.pig_count || 0),
            feed_stock: result?.feed_stock || null,
            remaining_stock_quantity: result?.remaining_stock_quantity == null ? null : Number(result.remaining_stock_quantity),
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

                const title = '🐖 Feeding Recorded';
                const body = `${feed_type} (${quantity_kg} kg) for ${batchCode} has been recorded.`;
                const tokens = [...new Set(devices.map((device) => device.fcm_token).filter(Boolean))];
                if (tokens.length > 0) {
                    await Promise.allSettled(tokens.map((token) => admin.messaging().send({
                        token,
                        data: { type: 'feed', batchId: batch_id, title, body },
                    })));
                }

                await supabase.from('notifications').insert([{
                    user_id: ownerId,
                    title,
                    message: body,
                    type: 'feed',
                    is_read: false,
                }]);
            } catch (notificationError) {
                console.error('Background feed notification failed:', notificationError.message);
            }
        })();

    } catch (error) {
        console.error('Error in createFeedRecord:', error);
        const message = String(error.message || '');
        const permissionDenied = message.toLowerCase().includes('permission denied for function create_feed_record_with_weight_gain');
        const stockConflict = /insufficient feed stock|feed stock not found/i.test(message);
        res.status(permissionDenied ? 503 : stockConflict ? 409 : 500).json({
            success: false,
            message: permissionDenied
                ? 'Feed RPC permission is not configured. Run backend/config/migrations/20261029_repair_feed_weight_rpc_grant.sql and backend/config/migrations/20261031_deduct_feed_stock_with_usage.sql in Supabase, then retry.'
                : stockConflict
                    ? message
                    : message || 'Unable to record feed usage',
        });
    }
};

// VIEW ALL
export const getAllFeedRecords = async (req, res) => {
    try {
        const { limit, offset } = pagination(req.query);
        let query = supabase
            .from('feed_records')
            .select('id,batch_id,feed_type,quantity_kg,feeding_date,feeding_time,notes,unit_price_at_usage,created_at')
            .eq('owner_id', req.user.id)
            .gte('feeding_date', req.query.from || '1900-01-01')
            .lte('feeding_date', req.query.to || '2999-12-31')
            .order('feeding_date', { ascending: false });
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
export const getFeedRecordById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('feed_records')
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
export const getFeedByBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const { limit, offset } = pagination(req.query);

        let query = supabase
            .from('feed_records')
            .select('id,batch_id,feed_type,quantity_kg,feeding_date,feeding_time,notes,unit_price_at_usage,created_at')
            .eq('batch_id', batchId)
            .eq('owner_id', req.user.id)
            .order('feeding_date', { ascending: false });
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

// UPDATE
export const updateFeedRecord = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('feed_records')
            .update({
                feed_type: req.body.feed_type,
                quantity_kg: req.body.quantity_kg,
                feeding_date: req.body.feeding_date,
                feeding_time: req.body.feeding_time,
                notes: req.body.notes,
            })
            .eq('id', id)
            .eq('owner_id', req.user.id)
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
            .eq('id', id)
            .eq('owner_id', req.user.id);

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
            .select('quantity_kg')
            .eq('owner_id', req.user.id);

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
            .eq('owner_id', req.user.id)
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
        if (!feed_type || (stock_quantity === undefined && unit_price === undefined)) {
            return res.status(400).json({ success: false, message: 'Feed type and an update value are required' });
        }

        const { data: existing, error: existingError } = await supabase
            .from('feed_stocks')
            .select('stock_quantity,unit_price,last_updated,notes')
            .eq('owner_id', req.user.id)
            .eq('feed_type', feed_type)
            .maybeSingle();
        if (existingError) throw existingError;

        const addedQuantity = stock_quantity === undefined ? 0 : Number(stock_quantity);
        if (!Number.isFinite(addedQuantity) || addedQuantity < 0) {
            return res.status(400).json({ success: false, message: 'Stock quantity must be non-negative' });
        }

        const { data, error } = await supabase
            .from('feed_stocks')
            .upsert({
                owner_id: req.user.id,
                feed_type,
                stock_quantity: Number(existing?.stock_quantity || 0) + addedQuantity,
                unit_price: unit_price === undefined ? (existing?.unit_price ?? null) : unit_price,
                last_updated: last_updated || existing?.last_updated || new Date().toISOString().split('T')[0],
                notes: notes === undefined ? existing?.notes : notes,
                updated_at: new Date()
            }, { onConflict: 'owner_id,feed_type' })
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

export const getFeedOverview = async (req, res) => {
    try {
        const [batches, records, stock, expenses] = await Promise.all([
            supabase.from('pig_batches').select('id,batch_code,pig_count,breed,age_on_acquisition,date_acquired,created_at').eq('owner_id', req.user.id).order('created_at', { ascending: false }).range(0, 24),
            supabase.from('feed_records').select('id,batch_id,feed_type,quantity_kg,feeding_date,feeding_time,notes,unit_price_at_usage,created_at').eq('owner_id', req.user.id).order('feeding_date', { ascending: false }).range(0, 24),
            supabase.from('feed_stocks').select('id,feed_type,stock_quantity,unit_price,last_updated,notes,updated_at').eq('owner_id', req.user.id).order('feed_type'),
            supabase.from('expenses').select('id,batch_id,expense_type,amount,expense_date,description,created_at').eq('owner_id', req.user.id).order('expense_date', { ascending: false }).range(0, 99),
        ]);
        const failed = [batches, records, stock, expenses].find((result) => result.error);
        if (failed) throw failed.error;
        res.json({ success: true, data: { batches: batches.data || [], records: records.data || [], stock: stock.data || [], expenses: expenses.data || [] } });
    } catch (error) {
        console.error('Error fetching feed overview:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};