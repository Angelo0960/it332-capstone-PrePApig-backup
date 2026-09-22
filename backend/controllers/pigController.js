import supabase from '../config/supabase.js';
import { invalidateCache, CACHE_KEYS, invalidateReportCaches } from '../lib/supabaseCache.js';
import { 
  getCurrentFeedProgram, 
  getNextFeedChange, 
  getFeedScheduleStatus,
  getAllFeedChanges,
  getCompleteFeedSchedule,
  getPhaseFCR,
  validateFeedRation
} from '../lib/feedScheduleService.js';
import { 
  getEffectiveFCR, 
  calculateFCR, 
  getFCRTrend,
  addManualWeightEntry,
  recalculateBatchFCR
} from '../lib/fcrService.js';

// ===== BATCH CRUD =====

export const createBatch = async (req, res) => {
    try {
        const {
            batch_code,
            pig_count,
            breed,
            start_weight,
            current_weight,
            date_acquired,
            status
        } = req.body;

        const owner_id = req.user.id;

        // 1. Insert the batch
        const { data: batchData, error: batchError } = await supabase
            .from('pig_batches')
            .insert([{
                batch_code,
                pig_count,
                breed,
                start_weight,
                current_weight,
                date_acquired,
                status,
                owner_id
            }])
            .select();

        if (batchError) {
            console.error('Batch insert error:', batchError);
            throw batchError;
        }

        const newBatch = batchData[0];

        // 2. Auto‑generate individual pigs
        const totalPigs = pig_count || 0;
        const totalWeight = current_weight || 0;
        const avgWeight = totalPigs > 0 ? totalWeight / totalPigs : 0;

        if (totalPigs > 0) {
            const pigs = [];
            for (let i = 0; i < totalPigs; i++) {
                pigs.push({
                    batch_id: newBatch.id,
                    weight: avgWeight,
                    health_status: 'Healthy',
                    notes: `Auto‑generated on batch creation (breed: ${breed || 'Unknown'})`,
                });
            }

            const { error: pigError } = await supabase
                .from('pigs')
                .insert(pigs);

            if (pigError) {
                console.warn('Failed to auto‑generate pigs:', pigError);
                // Don't fail the request – the batch already exists
            }
        }

        res.status(201).json({
            success: true,
            data: newBatch,
        });

        await invalidateCache('dashboard', CACHE_KEYS.dashboard);
        await invalidateCache('batch_list', CACHE_KEYS.batchList(req.user.id));

    } catch (error) {
        console.error('Error creating batch:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            details: error.details || null,
        });
    }
};

export const getAllBatches = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pig_batches')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Add feed schedule info to each batch
        const dataWithFeed = data.map(batch => {
            const currentFeed = getCurrentFeedProgram(batch);
            const nextChange = getNextFeedChange(batch);
            const status = getFeedScheduleStatus(batch);
            
            return {
                ...batch,
                currentFeed,
                nextFeedChange: nextChange || null,
                feedStatus: status?.status || 'unknown',
                daysUntilFeedChange: status?.daysUntil,
                feedMessage: status?.message
            };
        });

        res.status(200).json({
            success: true,
            count: dataWithFeed.length,
            data: dataWithFeed
        });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getBatchById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('pig_batches')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // Add complete feed schedule
        const schedule = getCompleteFeedSchedule(data);

        res.status(200).json({
            success: true,
            data: {
                ...data,
                feedSchedule: schedule
            }
        });
    } catch (error) {
        console.error('Error fetching batch:', error);
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

export const getBatchFeedSchedule = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('pig_batches')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        const schedule = getCompleteFeedSchedule(data);

        res.status(200).json({
            success: true,
            data: schedule
        });
    } catch (error) {
        console.error('Error fetching batch feed schedule:', error);
        res.status(404).json({
            success: false,
            message: error.message
        });
    }
};

export const validateBatchFeedRation = async (req, res) => {
    try {
        const { id } = req.params;
        const { feed_type, override = false } = req.body;

        if (!feed_type) {
            return res.status(400).json({
                success: false,
                message: 'feed_type is required'
            });
        }

        const { data, error } = await supabase
            .from('pig_batches')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        const validation = validateFeedRation(data, feed_type);
        
        // Check if user has manual override (could be stored in localStorage or DB)
        // For now, just return validation with override flag
        validation.overrideUsed = override;

        res.status(200).json({
            success: true,
            data: validation
        });
    } catch (error) {
        console.error('Error validating feed ration:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const updateBatch = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            batch_code,
            pig_count,
            breed,
            start_weight,
            current_weight,
            date_acquired,
            status
        } = req.body;

        const { data, error } = await supabase
            .from('pig_batches')
            .update({
                batch_code,
                pig_count,
                breed,
                start_weight,
                current_weight,
                date_acquired,
                status
            })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Batch updated successfully',
            data
        });

        await invalidateCache('dashboard', CACHE_KEYS.dashboard);
        await invalidateCache('batch_list', CACHE_KEYS.batchList(req.user.id));

    } catch (error) {
        console.error('Error updating batch:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const deleteBatch = async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('pig_batches')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Batch deleted successfully'
        });

        await invalidateCache('dashboard', CACHE_KEYS.dashboard);
        await invalidateCache('batch_list', CACHE_KEYS.batchList(req.user.id));

    } catch (error) {
        console.error('Error deleting batch:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getActiveBatches = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pig_batches')
            .select('*')
            .eq('status', 'Active');

        if (error) throw error;

        res.status(200).json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error('Error fetching active batches:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const updateWeight = async (req, res) => {
    try {
        const { id } = req.params;
        const { current_weight } = req.body;

        const { data, error } = await supabase
            .from('pig_batches')
            .update({ current_weight })
            .eq('id', id)
            .select();

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Weight updated successfully',
            data
        });

        await invalidateCache('dashboard', CACHE_KEYS.dashboard);

    } catch (error) {
        console.error('Error updating weight:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getBatchSummary = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pig_batches')
            .select('*');

        if (error) throw error;

        const totalBatches = data.length;
        const totalPigs = data.reduce(
            (sum, batch) => sum + Number(batch.pig_count),
            0
        );

        const activeBatches = data.filter(
            batch => batch.status === 'Active'
        ).length;

        res.status(200).json({
            success: true,
            summary: {
                totalBatches,
                totalPigs,
                activeBatches
            }
        });
    } catch (error) {
        console.error('Error fetching summary:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ===== INDIVIDUAL PIG MANAGEMENT =====

export const getPigsByBatch = async (req, res) => {
    try {
        const { batchId } = req.params;

        // 1. Get batch info (to auto‑generate if missing)
        const { data: batch, error: batchError } = await supabase
            .from('pig_batches')
            .select('pig_count, current_weight')
            .eq('id', batchId)
            .single();

        if (batchError) {
            console.error('Batch fetch error:', batchError);
            return res.status(404).json({
                success: false,
                message: 'Batch not found',
            });
        }

        // 2. Get existing pigs
        let { data: pigs, error: pigsError } = await supabase
            .from('pigs')
            .select('*')
            .eq('batch_id', batchId)
            .order('created_at', { ascending: true });

        if (pigsError) {
            // If table doesn't exist, return empty array
            if (pigsError.code === '42P01') {
                return res.status(200).json({
                    success: true,
                    data: [],
                });
            }
            throw pigsError;
        }

        // 3. If no pigs exist, auto‑generate them (fallback)
        if (!pigs || pigs.length === 0) {
            const pigCount = batch.pig_count || 0;
            const totalWeight = batch.current_weight || 0;
            const avgWeight = pigCount > 0 ? totalWeight / pigCount : 0;

            const newPigs = [];
            for (let i = 0; i < pigCount; i++) {
                newPigs.push({
                    batch_id: batchId,
                    weight: avgWeight,
                    health_status: 'Healthy',
                    notes: 'Auto‑generated (fallback)',
                });
            }

            if (newPigs.length > 0) {
                const { data: inserted, error: insertError } = await supabase
                    .from('pigs')
                    .insert(newPigs)
                    .select();

                if (insertError) {
                    console.error('Pig insert error:', insertError);
                    return res.status(200).json({
                        success: true,
                        data: [],
                    });
                }

                pigs = inserted;
            } else {
                pigs = [];
            }
        }

        res.status(200).json({
            success: true,
            data: pigs,
        });
    } catch (error) {
        console.error('Error fetching/generating pigs:', error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const createPig = async (req, res) => {
    try {
        const { batch_id, weight, health_status, notes } = req.body;
        if (!batch_id || weight === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Batch ID and weight are required',
            });
        }

        const { data, error } = await supabase
            .from('pigs')
            .insert([{ batch_id, weight, health_status, notes }])
            .select();

        if (error) {
            console.error('Pig insert error:', error);
            throw error;
        }

        res.status(201).json({
            success: true,
            data: data[0],
        });
    } catch (error) {
        console.error('Error creating pig:', error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const updatePig = async (req, res) => {
    try {
        const { id } = req.params;
        const { weight, health_status, notes } = req.body;

        const { data, error } = await supabase
            .from('pigs')
            .update({ weight, health_status, notes, updated_at: new Date() })
            .eq('id', id)
            .select();

        if (error) {
            console.error('Pig update error:', error);
            throw error;
        }

        res.status(200).json({
            success: true,
            data: data[0],
        });
    } catch (error) {
        console.error('Error updating pig:', error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const deletePig = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('pigs')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Pig delete error:', error);
            throw error;
        }

        res.status(200).json({
            success: true,
            message: 'Pig deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting pig:', error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

// ===== WEIGHT HISTORY & FCR ENDPOINTS =====

export const getWeightHistory = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('pig_batches')
            .select('weight_history, current_weight')
            .eq('id', id)
            .single();

        if (error) throw error;

        const history = data?.weight_history || [];
        const sortedHistory = [...history].sort((a, b) => new Date(a.date) - new Date(b.date));

        res.status(200).json({
            success: true,
            data: sortedHistory
        });
    } catch (error) {
        console.error('Error fetching weight history:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const logWeight = async (req, res) => {
    try {
        const { id } = req.params;
        const { weight, notes } = req.body;

        if (weight === undefined || weight === null) {
            return res.status(400).json({
                success: false,
                message: 'Weight is required'
            });
        }

        const result = await addManualWeightEntry(supabase, id, Number(weight), notes || '');

        if (!result.success) {
            return res.status(400).json(result);
        }

        await invalidateCache('dashboard', CACHE_KEYS.dashboard);

        res.status(200).json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error logging weight:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getFCR = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: batch, error: batchError } = await supabase
            .from('pig_batches')
            .select('*')
            .eq('id', id)
            .single();

        if (batchError || !batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }

        const { data: feedRecords } = await supabase
            .from('feed_records')
            .select('quantity_kg, feeding_date')
            .eq('batch_id', id);

        const effectiveFCR = getEffectiveFCR(batch, feedRecords || []);
        const trend = getFCRTrend(feedRecords || [], batch.weight_history || []);

        // Get target FCR for current phase
        const phase = effectiveFCR.phase;
        const targetFCR = getPhaseFCR(phase);

        // Determine trend direction
        let trendDirection = 'stable';
        if (trend.length >= 2) {
            const recent = trend.slice(-3);
            const avgRecent = recent.reduce((sum, t) => sum + t.fcr, 0) / recent.length;
            const older = trend.slice(-6, -3);
            if (older.length > 0) {
                const avgOlder = older.reduce((sum, t) => sum + t.fcr, 0) / older.length;
                if (avgRecent < avgOlder - 0.1) trendDirection = 'improving';
                else if (avgRecent > avgOlder + 0.1) trendDirection = 'worsening';
            }
        }

        res.status(200).json({
            success: true,
            data: {
                current_fcr: effectiveFCR.fcr,
                fcr_source: effectiveFCR.source,
                confidence: effectiveFCR.confidence,
                data_points: effectiveFCR.dataPoints,
                phase: effectiveFCR.phase,
                target_fcr: targetFCR,
                trend: trendDirection,
                history: trend.map(t => ({ week: t.week, fcr: t.fcr }))
            }
        });
    } catch (error) {
        console.error('Error fetching FCR:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const recalculateFCR = async (req, res) => {
    try {
        const { id } = req.params;

        const { data: feedRecords } = await supabase
            .from('feed_records')
            .select('quantity_kg, feeding_date')
            .eq('batch_id', id);

        const result = await recalculateBatchFCR(supabase, id, feedRecords || []);

        if (!result.success) {
            return res.status(400).json(result);
        }

        await invalidateCache('dashboard', CACHE_KEYS.dashboard);

        res.status(200).json({
            success: true,
            data: result.data
        });
    } catch (error) {
        console.error('Error recalculating FCR:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};