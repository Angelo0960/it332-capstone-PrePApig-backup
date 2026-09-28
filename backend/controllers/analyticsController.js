import supabase from '../config/supabase.js';
import { 
  getPhaseFCR, 
  getCurrentFeedProgram, 
  getNextFeedChange,
  isFeedChangeDue,
  isFeedChangeSoon
} from '../lib/feedScheduleService.js';
import { getFullFeedProgram } from '../lib/feedProgram.js';
import { calculateDailyGainRate } from '../lib/forecastUtils.js';
import { TARGET_WEIGHT_KG } from '../controllers/forecastController.js';

export const getAllAnalytics = async (req, res) => {
  try {
    const {
      data: batches,
      error: batchesError
    } = await supabase
      .from('pig_batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (batchesError) throw batchesError;

    const batchIds = batches.map(b => b.id);

    // Fetch all related data in parallel
    const [
      feedRecords,
      vaccinationRecords,
      expenses,
      feedStock,
      vaccineStock
    ] = await Promise.all([
      supabase.from('feed_records').select('*').order('feeding_date', { ascending: false }),
      supabase.from('vaccination_records').select('*').order('vaccination_date', { ascending: false }),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
      supabase.from('feed_stocks').select('*'),
      supabase.from('vaccine_stocks').select('*')
    ]);

    // Calculate metrics
    const totalBatches = batches.length;
    const totalFeedRecords = feedRecords?.length || 0;
    const totalVaccinationRecords = vaccinationRecords?.length || 0;
    const totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Calculate total feed consumed
    const totalFeedConsumed = (feedRecords || []).reduce(
      (sum, r) => sum + Number(r.quantity_kg || 0),
      0
    );

    // Calculate vaccination summary
    const totalVaccinationDoses = (vaccinationRecords || []).reduce(
      (sum, r) => sum + Number(r.dosage || 0),
      0
    );
    const completedVaccinations = (vaccinationRecords || []).filter(
      (r) => r.status?.toLowerCase() === 'completed'
    ).length;
    const scheduledVaccinations = (vaccinationRecords || []).filter(
      (r) => r.status?.toLowerCase() === 'scheduled'
    ).length;

    // Get market price
    const { data: marketPrice } = await supabase
      .from('market_price_reports')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(1)
      .single();

    // Get current feed program
    const fullFeedProgram = getFullFeedProgram();

    // Calculate average stats per batch
    const avgBatchStats = batches.length > 0 ? {
      avgPigCount: Math.round(
        (batches.reduce((sum, b) => sum + Number(b.pig_count || 0), 0) / batches.length) * 100
      ) / 100,
      avgStartWeight: Math.round(
        (batches.reduce((sum, b) => sum + Number(b.start_weight || 0), 0) / batches.length) * 100
      ) / 100,
      activeBatches: batches.filter(b => b.status === 'Active').length,
      totalCurrentWeight: batches.reduce((sum, b) => sum + Number(b.current_weight || 0), 0)
    } : {
      avgPigCount: 0,
      avgStartWeight: 0,
      activeBatches: 0,
      totalCurrentWeight: 0
    };

    // Compute feed schedule for each batch
const batchesWithFeedSchedule = batches.map(batch => {
  const currentFeed = getCurrentFeedProgram(batch);
  const nextChange = getNextFeedChange(batch);
  const status = isFeedChangeDue(batch) ? 'overdue' : isFeedChangeSoon(batch, 3) ? 'soon' : 'ok';
  
  return {
    ...batch,
    currentFeed,
    nextFeedChange: nextChange || null,
    feedStatus: status,
    daysUntilFeedChange: nextChange?.daysUntil || null,
    feedMessage: status === 'overdue' ? 'Feed change overdue!' : status === 'soon' ? `Changes in ${nextChange?.daysUntil}d` : 'On track'
  };
});

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalBatches,
          totalFeedRecords,
          totalFeedConsumed: Math.round(totalFeedConsumed * 100) / 100,
          totalVaccinationRecords,
          totalVaccinationDoses,
          completedVaccinations,
          scheduledVaccinations,
          totalExpenses: Math.round(totalExpenses * 100) / 100,
          activeBatches: avgBatchStats.activeBatches,
          marketPrice: marketPrice || null
        },
        batches: batchesWithFeedSchedule.map(batch => ({
          id: batch.id,
          batch_code: batch.batch_code,
          status: batch.status,
          pig_count: batch.pig_count,
          start_weight: batch.start_weight,
          current_weight: batch.current_weight,
          date_acquired: batch.date_acquired,
          breed: batch.breed,
          currentFeed: batch.currentFeed,
          nextFeedChange: batch.nextFeedChange,
          feedStatus: batch.feedStatus,
          daysUntilFeedChange: batch.daysUntilFeedChange,
          feedMessage: batch.feedMessage
        })),
        feedProgram: fullFeedProgram,
        marketPrice: marketPrice || { price_min: 0, price_max: 0, price_unit: 'PHP/kg', reported_date: null }
      }
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

export const getBatchAnalytics = async (req, res) => {
  try {
    const { batchId } = req.params;

    // Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('pig_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }

    // Fetch related data
    const [
      feedRecords,
      vaccinationRecords,
      expenses,
      weightHistory
    ] = await Promise.all([
      supabase.from('feed_records').select('*').eq('batch_id', batchId).order('feeding_date', { ascending: true }),
      supabase.from('vaccination_records').select('*').eq('batch_id', batchId),
      supabase.from('expenses').select('*').eq('batch_id', batchId),
      supabase.from('pig_batches').select('weight_history').eq('id', batchId).single()
    ]);

    // Calculate feed consumption metrics
    const totalFeedConsumed = (feedRecords || []).reduce(
      (sum, r) => sum + Number(r.quantity_kg || 0),
      0
    );

    // Calculate vaccination summary
    const totalDoses = (vaccinationRecords || []).reduce(
      (sum, r) => sum + Number(r.dosage || 0),
      0
    );
    const completed = (vaccinationRecords || []).filter(
      (r) => r.status?.toLowerCase() === 'completed'
    ).length;
    const scheduled = (vaccinationRecords || []).filter(
      (r) => r.status?.toLowerCase() === 'scheduled'
    ).length;

    // Calculate expenses
    const totalBatchExpenses = (expenses || []).reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    );

    // Get feed schedule status
    const currentFeed = getPhaseFCR ? getPhaseFCR('Starter') : 2.8; // placeholder
    // Actually let's compute properly

    // Calculate FCR if we have weight history
    let fcr = null;
    let targetFCR = 2.8;
    const dailyGainRate = calculateDailyGainRate(batchWeightHistory || []);

    if (dailyGainRate && batch.current_weight) {
      // Simple FCR estimation
    }

    // Get market price for this batch
    const { data: marketPrice } = await supabase
      .from('market_price_reports')
      .select('*')
      .order('checked_at', { ascending: false })
      .limit(1)
      .single();

    // Get full feed program
    const fullFeedProgram = getFullFeedProgram();

    res.status(200).json({
      success: true,
      data: {
        batch: {
          id: batch.id,
          batch_code: batch.batch_code,
          status: batch.status,
          pig_count: batch.pig_count,
          start_weight: batch.start_weight,
          current_weight: batch.current_weight,
          date_acquired: batch.date_acquired,
          breed: batch.breed
        },
        summary: {
          totalFeedConsumed: Math.round(totalFeedConsumed * 100) / 100,
          totalDoses,
          completed,
          scheduled,
          totalBatchExpenses: Math.round(totalBatchExpenses * 100) / 100,
          daysSinceAcquired: batch.date_acquired ? Math.floor((new Date() - new Date(batch.date_acquired)) / (1000 * 60 * 60 * 24)) : 0
        },
        feedRecords: (feedRecords || []).map(r => ({
          id: r.id,
          feed_type: r.feed_type,
          quantity_kg: r.quantity_kg,
          feeding_date: r.feeding_date,
          feeding_time: r.feeding_time
        })),
        vaccinationRecords: (vaccinationRecords || []).map(v => ({
          id: v.id,
          vaccine_name: v.vaccine_name,
          vaccination_date: v.vaccination_date,
          next_due_date: v.next_due_date,
          dosage: v.dosage,
          administered_by: v.administered_by,
          status: v.status
        })),
        expenses: (expenses || []).map(e => ({
          id: e.id,
          expense_type: e.expense_type,
          amount: e.amount,
          expense_date: e.expense_date,
          description: e.description
        })),
        feedStock,
        vaccineStock,
        marketPrice: marketPrice || null,
        feedProgram: fullFeedProgram
      }
    });

  } catch (error) {
    console.error('Error fetching batch analytics:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};