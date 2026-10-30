import { pagination } from '../services/pagination.js';
import supabase from '../config/supabase.js';

const syncBatchAverageWeight = async (batchId, ownerId) => {
    const { data: pigs, error: pigsError } = await supabase
        .from('pigs')
        .select('weight')
        .eq('batch_id', batchId)
        .eq('owner_id', ownerId);
    if (pigsError) throw pigsError;

    const totalWeight = (pigs || []).reduce((sum, pig) => sum + Number(pig.weight || 0), 0);
    const averageWeight = pigs?.length ? Math.round((totalWeight / pigs.length) * 100) / 100 : 0;
    const { data, error } = await supabase
        .from('pig_batches')
        .update({ current_weight: averageWeight })
        .eq('id', batchId)
        .eq('owner_id', ownerId)
        .select('id,current_weight')
        .single();
    if (error) throw error;
    return data;
};

// ===== BATCH CRUD =====

export const createBatch = async (req, res) => {
    try {
        const {
            batch_code,
            pig_count,
            breed,
            start_weight,
            current_weight,
            sale_price_per_kg,
            age_on_acquisition,
            date_acquired,
            status
        } = req.body;

        const owner_id = req.user.id;

        // The RPC inserts the batch and its pigs in one database transaction.
        // A missing migration fails closed; never fall back to separate writes.
        const { data: newBatch, error: batchError } = await supabase.rpc('create_batch_with_pigs', {
            p_owner_id: owner_id,
            p_batch: {
                batch_code, pig_count, breed, start_weight, current_weight,
                sale_price_per_kg: sale_price_per_kg ?? null,
                age_on_acquisition: age_on_acquisition ?? 0,
                date_acquired, status,
            },
        });
        if (batchError) throw batchError;

        res.status(201).json({
            success: true,
            data: newBatch,
        });
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
        const { limit, offset } = pagination(req.query);
        let query = supabase
            .from('pig_batches')
            .select('id,batch_code,pig_count,breed,start_weight,current_weight,sale_price_per_kg,age_on_acquisition,date_acquired,status,created_at')
            .eq('owner_id', req.user.id)
            .order('created_at', { ascending: false });
        query = query.order('id', { ascending: false }).range(offset, offset + limit - 1);
        const { data: batches, error } = await query;

        if (error) throw error;

        res.status(200).json({
            success: true,
            pagination: { limit, offset },
            count: batches.length,
            data: batches
        });
    } catch (error) {
        console.error('Error fetching batches:', error);
        res.status(error.status || 500).json({
            success: false,
            message: error.message
        });
    }
};

export const getBatchFinancialSummary = async (req, res) => {
    try {
        const { data: batches, error: batchesError } = await supabase
            .from('pig_batches')
            .select('id,sale_price_per_kg,current_weight')
            .eq('owner_id', req.user.id);
        if (batchesError) throw batchesError;

        const batchIds = (batches || []).map((batch) => batch.id);
        if (batchIds.length === 0) return res.json({ success: true, data: [] });

        const [expensesResult, feedsResult, vaccinationsResult, feedStockResult, vaccineStockResult] = await Promise.all([
            supabase.from('expenses').select('batch_id,amount').eq('owner_id', req.user.id).in('batch_id', batchIds),
            supabase.from('feed_records').select('batch_id,feed_type,quantity_kg').eq('owner_id', req.user.id).in('batch_id', batchIds),
            supabase.from('vaccination_records').select('batch_id,vaccine_name,dosage').eq('owner_id', req.user.id).in('batch_id', batchIds),
            supabase.from('feed_stocks').select('feed_type,unit_price').eq('owner_id', req.user.id),
            supabase.from('vaccine_stocks').select('vaccine_name,price_per_dose').eq('owner_id', req.user.id),
        ]);
        const failed = [expensesResult, feedsResult, vaccinationsResult, feedStockResult, vaccineStockResult]
            .find((result) => result.error);
        if (failed) throw failed.error;

        const price = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
        const feedPrices = new Map((feedStockResult.data || []).map((stock) => [stock.feed_type, price(stock.unit_price)]));
        const vaccinePrices = new Map((vaccineStockResult.data || []).map((stock) => [stock.vaccine_name, price(stock.price_per_dose)]));
        const totals = new Map(batchIds.map((id) => [id, 0]));
        const unavailable = new Map(batchIds.map((id) => [id, new Set()]));
        for (const expense of expensesResult.data || []) totals.set(expense.batch_id, totals.get(expense.batch_id) + Number(expense.amount));
        const addCosts = (records, prices, nameField, quantityField, category) => {
            for (const record of records || []) {
                const unitPrice = prices.get(record[nameField]);
                const quantity = price(record[quantityField]);
                if (unitPrice == null || quantity == null) {
                    unavailable.get(record.batch_id).add(category);
                } else {
                    totals.set(record.batch_id, totals.get(record.batch_id) + quantity * unitPrice);
                }
            }
        };
        addCosts(feedsResult.data, feedPrices, 'feed_type', 'quantity_kg', 'feed');
        addCosts(vaccinationsResult.data, vaccinePrices, 'vaccine_name', 'dosage', 'vaccine');

        res.json({
            success: true,
            data: batches.map((batch) => ({
                batch_id: batch.id,
                current_weight: Number(batch.current_weight) || 0,
                sale_price_per_kg: Number(batch.sale_price_per_kg) || null,
                total_expenses: unavailable.get(batch.id).size ? null : Math.round(totals.get(batch.id) * 100) / 100,
                costs_available: unavailable.get(batch.id).size === 0,
                unavailable_costs: [...unavailable.get(batch.id)],
            })),
        });
    } catch (error) {
        console.error('Error fetching batch financial summary:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getBatchById = async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('pig_batches')
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
        console.error('Error fetching batch:', error);
        res.status(404).json({
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
            sale_price_per_kg,
            age_on_acquisition,
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
                sale_price_per_kg: sale_price_per_kg,
                age_on_acquisition,
                date_acquired,
                status
            })
            .eq('id', id)
            .eq('owner_id', req.user.id)
            .select();

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Batch updated successfully',
            data
        });
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
            .eq('id', id)
            .eq('owner_id', req.user.id);

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Batch deleted successfully'
        });
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
            .eq('status', 'Active')
            .eq('owner_id', req.user.id);

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
            .eq('owner_id', req.user.id)
            .select();

        if (error) throw error;

        res.status(200).json({
            success: true,
            message: 'Weight updated successfully',
            data
        });
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
            .select('pig_count,status')
            .eq('owner_id', req.user.id);

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
        const [batchResult, pigsResult] = await Promise.all([
            supabase
                .from('pig_batches')
                .select('id,batch_code,sale_price_per_kg,current_weight,start_weight,pig_count')
                .eq('id', batchId)
                .eq('owner_id', req.user.id)
                .single(),
            supabase
                .from('pigs')
                .select('id,batch_id,weight,health_status,notes,created_at,updated_at')
                .eq('batch_id', batchId)
                .eq('owner_id', req.user.id)
                .order('created_at', { ascending: true }),
        ]);

        const { data: batch, error: batchError } = batchResult;
        const { data: pigs, error: pigsError } = pigsResult;

        if (batchError || !batch) {
            console.error('Batch fetch error:', batchError);
            return res.status(404).json({
                success: false,
                message: 'Batch not found',
            });
        }

        if (pigsError) {
            if (pigsError.message?.includes("'owner_id' column")) {
                return res.status(500).json({
                    success: false,
                    message: 'Database migration required: run backend/config/migrations/20261009_owner_columns.sql in Supabase.',
                });
            }
            throw pigsError;
        }

        res.status(200).json({
            success: true,
            batch,
            data: pigs || [],
        });
    } catch (error) {
        console.error('Error fetching pigs:', error);
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

        const { data: batch, error: batchError } = await supabase
            .from('pig_batches')
            .select('id')
            .eq('id', batch_id)
            .eq('owner_id', req.user.id)
            .single();
        if (batchError || !batch) {
            return res.status(404).json({ success: false, message: 'Batch not found' });
        }

        const { data, error } = await supabase
            .from('pigs')
            .insert([{ batch_id, owner_id: req.user.id, weight, health_status, notes }])
            .select();

        if (error) {
            console.error('Pig insert error:', error);
            throw error;
        }

        const updatedBatch = await syncBatchAverageWeight(batch_id, req.user.id);

        res.status(201).json({
            success: true,
            data: data[0],
            batch: updatedBatch,
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

        const { data: existingPig, error: existingPigError } = await supabase
            .from('pigs')
            .select('id,batch_id')
            .eq('id', id)
            .eq('owner_id', req.user.id)
            .single();
        if (existingPigError) throw existingPigError;

        const { data, error } = await supabase
            .from('pigs')
            .update({ weight, health_status, notes, updated_at: new Date() })
            .eq('id', id)
            .eq('owner_id', req.user.id)
            .select();

        if (error) {
            console.error('Pig update error:', error);
            throw error;
        }

        const updatedBatch = await syncBatchAverageWeight(existingPig.batch_id, req.user.id);

        res.status(200).json({
            success: true,
            data: data[0],
            batch: updatedBatch,
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
        const { data: existingPig, error: existingPigError } = await supabase
            .from('pigs')
            .select('id,batch_id')
            .eq('id', id)
            .eq('owner_id', req.user.id)
            .single();
        if (existingPigError) throw existingPigError;

        const { error } = await supabase
            .from('pigs')
            .delete()
            .eq('id', id)
            .eq('owner_id', req.user.id);

        if (error) {
            console.error('Pig delete error:', error);
            throw error;
        }

        const updatedBatch = await syncBatchAverageWeight(existingPig.batch_id, req.user.id);

        res.status(200).json({
            success: true,
            message: 'Pig deleted successfully',
            batch: updatedBatch,
        });
    } catch (error) {
        console.error('Error deleting pig:', error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};