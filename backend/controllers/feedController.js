import supabase from '../config/supabase.js';
import admin from '../config/firebase.js';
import { invalidateCache, CACHE_KEYS, invalidateReportCaches } from '../lib/supabaseCache.js';
import { validateFeedRation } from '../lib/feedScheduleService.js';
import { getEffectiveFCR, updateBatchWeightFromFeed } from '../lib/fcrService.js';

// CREATE FEED RECORD – now creates a notification + auto weight gain
// CREATE FEED RECORD – now creates a notification + auto weight gain
export const createFeedRecord = async (req, res) => {
    try {
        const {
            batch_id,
            feed_type,
            quantity_kg,
            feeding_date,
            feeding_time,
            notes,
            override = false
        } = req.body;

        console.log('🟢 [createFeedRecord] incoming:', {
            batch_id, feed_type, quantity_kg, feeding_date, override
        });

        // Validate feed ration if batch_id provided
        let validation = null;
        let batchData = null;

        if (batch_id && feed_type) {
            const { data, error: batchError } = await supabase
                .from('pig_batches')
                .select('*')
                .eq('id', batch_id)
                .single();

            if (batchError) {
                console.warn('⚠️ [createFeedRecord] batch fetch error:', batchError.message);
            }

            if (!batchError && data) {
                batchData = data;

                console.log('🔍 [createFeedRecord] batch loaded:', {
                    id: data.id,
                    batch_code: data.batch_code,
                    current_weight: data.current_weight,
                    pig_count: data.pig_count,
                    fcr_source: data.fcr_source,
                    current_fcr: data.current_fcr,
                    weight_history_len: (data.weight_history || []).length
                });

                validation = validateFeedRation(batchData, feed_type);

                // BLOCK if feed type doesn't match expected ration (no override allowed)
                if (!validation.valid && !override) {
                    return res.status(400).json({
                        success: false,
                        message: 'Feed type does not match expected ration for this batch phase',
                        validation
                    });
                }
                validation.overrideUsed = override;
            }
        }

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

        console.log('✅ [createFeedRecord] feed inserted:', data?.[0]?.id);

        // 2. Auto-calculate weight gain if batch_id provided
        let weightUpdate = null;
        if (batch_id && batchData) {
            const { data: feedRecords } = await supabase
                .from('feed_records')
                .select('quantity_kg, feeding_date')
                .eq('batch_id', batch_id);

            const effectiveFCR = getEffectiveFCR(batchData, feedRecords || []);

            console.log('📊 [createFeedRecord] effective FCR:', effectiveFCR);

            weightUpdate = await updateBatchWeightFromFeed(
                supabase,
                batch_id,
                Number(quantity_kg),
                effectiveFCR.fcr
            );

            console.log('📈 [createFeedRecord] weight update result:', weightUpdate);
        } else {
            console.warn('⚠️ [createFeedRecord] skipping weight update — batch_id or batchData missing', {
                batch_id,
                hasBatchData: !!batchData
            });
        }

        // 3. Get batch owner + code for notification
        let ownerId = null;
        let batchCode = 'Batch';
        if (batch_id) {
            const { data: batchInfo } = await supabase
                .from('pig_batches')
                .select('owner_id, batch_code')
                .eq('id', batch_id)
                .single();

            if (batchInfo) {
                ownerId = batchInfo.owner_id;
                batchCode = batchInfo.batch_code || 'Batch';
            }
        }

        // 4. Skip notification if no owner or admin
        if (!ownerId || ownerId === 'admin') {
            console.log('Skipping notification – no real owner');
            return res.status(201).json({
                success: true,
                data,
                validation,
                weightUpdate,
                expectedGain: weightUpdate?.data?.weight_gain || 0,
                fcr: weightUpdate?.data?.fcr || null
            });
        }

        // 5. Get user's FCM tokens
        const { data: devices } = await supabase
            .from('user_devices')
            .select('fcm_token')
            .eq('user_id', ownerId);

        const tokens = devices ? devices.map(d => d.fcm_token).filter(Boolean) : [];

        // 6. Build notification
        const title = `🐖 Feeding Recorded`;
        const body = `${feed_type} (${quantity_kg} kg) for ${batchCode} has been recorded.`;

        // 7. Send push (fire-and-forget)
        if (tokens.length > 0) {
            const messages = tokens.map(token => ({
                notification: { title, body },
                token,
                data: { type: 'feed', batchId: batch_id },
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

        // 8. Save notification in DB
        await supabase
            .from('notifications')
            .insert([{
                user_id: ownerId,
                title,
                message: body,
                type: 'feed',
                is_read: false,
            }]);

        await invalidateCache('feed_summary', CACHE_KEYS.feedSummary);
        await invalidateCache('dashboard', CACHE_KEYS.dashboard);
        await invalidateCache('batch_list', CACHE_KEYS.batchList(req.user?.id || 'anonymous'));
        await invalidateCache('batch_list', CACHE_KEYS.batchSummary);
        if (batch_id) {
            await invalidateCache('feed_summary', CACHE_KEYS.feedByBatch(batch_id));
        }

        res.status(201).json({
            success: true,
            data,
            validation,
            weightUpdate,
            expectedGain: weightUpdate?.data?.weight_gain || 0,
            fcr: weightUpdate?.data?.fcr || null
        });

    } catch (error) {
        console.error('❌ [createFeedRecord] error:', error);
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

        await invalidateCache('feed_summary', CACHE_KEYS.feedSummary);
        await invalidateCache('dashboard', CACHE_KEYS.dashboard);
        await invalidateCache('batch_list', CACHE_KEYS.batchList(req.user.id));

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

        await invalidateCache('feed_summary', CACHE_KEYS.feedSummary);
        await invalidateCache('dashboard', CACHE_KEYS.dashboard);
        await invalidateCache('batch_list', CACHE_KEYS.batchList(req.user.id));

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