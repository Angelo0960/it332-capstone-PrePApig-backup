import supabase from '../config/supabase.js';
import {
  getPhaseFCR,
  getCurrentFeedProgram,
  getNextFeedChange,
  getBatchAgeDays,
  isFeedChangeDue,
  isFeedChangeSoon,
} from '../lib/feedScheduleService.js';
import { getFullFeedProgram } from '../lib/feedProgram.js';
import { calculateDailyGainRate } from '../lib/forecastUtils.js';
import { TARGET_WEIGHT_KG } from '../controllers/forecastController.js';

// ─────────────────────────────────────────────────────────────
// GET /api/analytics
// ─────────────────────────────────────────────────────────────
export const getAllAnalytics = async (req, res) => {
  try {
    // 1. Fetch batches
    const { data: batches, error: batchesError } = await supabase
      .from('pig_batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (batchesError) throw batchesError;

    const safeBatches = batches || [];

    // 2. Fetch all related data in parallel (each returns { data, error })
    const [
      feedRes,
      vaccRes,
      expRes,
      feedStockRes,
      vaccineStockRes,
      marketPriceRes,
    ] = await Promise.all([
      supabase
        .from('feed_records')
        .select('*')
        .order('feeding_date', { ascending: false }),
      supabase
        .from('vaccination_records')
        .select('*')
        .order('vaccination_date', { ascending: false }),
      supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false }),
      supabase.from('feed_stocks').select('*'),
      supabase.from('vaccine_stocks').select('*'),
      supabase
        .from('market_price_reports')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // Log partial fetch errors (non-fatal)
    [feedRes, vaccRes, expRes, feedStockRes, vaccineStockRes, marketPriceRes].forEach(
      (r) => {
        if (r?.error) console.error('Supabase fetch error:', r.error);
      }
    );

    const feedRecords = feedRes.data || [];
    const vaccinationRecords = vaccRes.data || [];
    const expenses = expRes.data || [];
    const feedStock = feedStockRes.data || [];
    const vaccineStock = vaccineStockRes.data || [];
    const marketPrice = marketPriceRes.data || null;

    // 3. Metrics
    const totalBatches = safeBatches.length;
    const totalFeedRecords = feedRecords.length;
    const totalVaccinationRecords = vaccinationRecords.length;

    const totalExpenses = expenses.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    );

    const totalFeedConsumed = feedRecords.reduce(
      (sum, r) => sum + Number(r.quantity_kg || 0),
      0
    );

    const totalVaccinationDoses = vaccinationRecords.reduce(
      (sum, r) => sum + Number(r.dosage || 0),
      0
    );

    const completedVaccinations = vaccinationRecords.filter(
      (r) => r.status?.toLowerCase() === 'completed'
    ).length;

    const scheduledVaccinations = vaccinationRecords.filter(
      (r) => r.status?.toLowerCase() === 'scheduled'
    ).length;

    const fullFeedProgram = getFullFeedProgram();

    // 4. Average batch stats
    const avgBatchStats =
      safeBatches.length > 0
        ? {
            avgPigCount:
              Math.round(
                (safeBatches.reduce(
                  (sum, b) => sum + Number(b.pig_count || 0),
                  0
                ) /
                  safeBatches.length) *
                  100
              ) / 100,
            avgStartWeight:
              Math.round(
                (safeBatches.reduce(
                  (sum, b) => sum + Number(b.start_weight || 0),
                  0
                ) /
                  safeBatches.length) *
                  100
              ) / 100,
            activeBatches: safeBatches.filter((b) => b.status === 'Active')
              .length,
            totalCurrentWeight: safeBatches.reduce(
              (sum, b) => sum + Number(b.current_weight || 0),
              0
            ),
          }
        : {
            avgPigCount: 0,
            avgStartWeight: 0,
            activeBatches: 0,
            totalCurrentWeight: 0,
          };

    // 5. Feed schedule per batch (guarded)
    const batchesWithFeedSchedule = safeBatches.map((batch) => {
      let currentFeed = null;
      let nextChange = null;
      let status = 'ok';

      try {
        currentFeed = getCurrentFeedProgram(batch);
        nextChange = getNextFeedChange(batch);
        status = isFeedChangeDue(batch)
          ? 'overdue'
          : isFeedChangeSoon(batch, 3)
          ? 'soon'
          : 'ok';
      } catch (err) {
        console.error(
          'Feed schedule calculation failed for batch',
          batch.id,
          err
        );
      }

      return {
        ...batch,
        currentFeed,
        nextFeedChange: nextChange || null,
        feedStatus: status,
        daysUntilFeedChange: nextChange?.daysUntil ?? null,
        feedMessage:
          status === 'overdue'
            ? 'Feed change overdue!'
            : status === 'soon'
            ? `Changes in ${nextChange?.daysUntil}d`
            : 'On track',
      };
    });

    // 6. Response
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
          marketPrice,
        },
        batches: batchesWithFeedSchedule.map((batch) => ({
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
          feedMessage: batch.feedMessage,
        })),
        // ✅ Raw collections needed by AnalyticsReportScreen
        feedRecords,
        vaccinationRecords,
        expenses,
        feedStock,
        vaccineStock,
        feedProgram: fullFeedProgram,
        marketPrice:
          marketPrice || {
            price_min: 0,
            price_max: 0,
            price_unit: 'PHP/kg',
            reported_date: null,
          },
      },
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/analytics/batch/:batchId
// ─────────────────────────────────────────────────────────────
export const getBatchAnalytics = async (req, res) => {
  try {
    const { batchId } = req.params;

    // 1. Get batch info
    const { data: batch, error: batchError } = await supabase
      .from('pig_batches')
      .select('*')
      .eq('id', batchId)
      .single();

    if (batchError || !batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found',
      });
    }

    // 2. Fetch related data in parallel
    const [
      feedRes,
      vaccRes,
      expRes,
      feedStockRes,
      vaccineStockRes,
      priceRes,
    ] = await Promise.all([
      supabase
        .from('feed_records')
        .select('*')
        .eq('batch_id', batchId)
        .order('feeding_date', { ascending: true }),
      supabase
        .from('vaccination_records')
        .select('*')
        .eq('batch_id', batchId),
      supabase.from('expenses').select('*').eq('batch_id', batchId),
      supabase.from('feed_stocks').select('*'),
      supabase.from('vaccine_stocks').select('*'),
      supabase
        .from('market_price_reports')
        .select('*')
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    [feedRes, vaccRes, expRes, feedStockRes, vaccineStockRes, priceRes].forEach(
      (r) => {
        if (r?.error) console.error('Supabase fetch error:', r.error);
      }
    );

    const feedRecords = feedRes.data || [];
    const vaccinationRecords = vaccRes.data || [];
    const expenses = expRes.data || [];
    const feedStock = feedStockRes.data || [];
    const vaccineStock = vaccineStockRes.data || [];
    const marketPrice = priceRes.data || null;

    // 3. Metrics
    const totalFeedConsumed = feedRecords.reduce(
      (sum, r) => sum + Number(r.quantity_kg || 0),
      0
    );

    const totalDoses = vaccinationRecords.reduce(
      (sum, r) => sum + Number(r.dosage || 0),
      0
    );

    const completed = vaccinationRecords.filter(
      (r) => r.status?.toLowerCase() === 'completed'
    ).length;

    const scheduled = vaccinationRecords.filter(
      (r) => r.status?.toLowerCase() === 'scheduled'
    ).length;

    const totalBatchExpenses = expenses.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    );

    // 4. Weight history & daily gain
    const batchWeightHistory = Array.isArray(batch.weight_history)
      ? batch.weight_history
      : [];

    const dailyGainRate = calculateDailyGainRate(batchWeightHistory);

    // FCR (optional — placeholder, expand later)
    let fcr = null;
    const targetFCR = getPhaseFCR ? getPhaseFCR('Starter') : 2.8;

    // 5. Feed program
    const fullFeedProgram = getFullFeedProgram();

    // 6. Response
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
          age_on_acquisition: batch.age_on_acquisition || 0,
          breed: batch.breed,
        },
        summary: {
          totalFeedConsumed: Math.round(totalFeedConsumed * 100) / 100,
          totalDoses,
          completed,
          scheduled,
          totalBatchExpenses:
            Math.round(totalBatchExpenses * 100) / 100,
          dailyGainRate,
          fcr,
          targetFCR,
          daysSinceAcquired: getBatchAgeDays(
            batch.date_acquired,
            batch.age_on_acquisition
          ),
        },
        feedRecords: feedRecords.map((r) => ({
          id: r.id,
          feed_type: r.feed_type,
          quantity_kg: r.quantity_kg,
          feeding_date: r.feeding_date,
          feeding_time: r.feeding_time,
        })),
        vaccinationRecords: vaccinationRecords.map((v) => ({
          id: v.id,
          vaccine_name: v.vaccine_name,
          vaccination_date: v.vaccination_date,
          next_due_date: v.next_due_date,
          dosage: v.dosage,
          administered_by: v.administered_by,
          status: v.status,
        })),
        expenses: expenses.map((e) => ({
          id: e.id,
          expense_type: e.expense_type,
          amount: e.amount,
          expense_date: e.expense_date,
          description: e.description,
        })),
        feedStock,
        vaccineStock,
        marketPrice,
        feedProgram: fullFeedProgram,
      },
    });
  } catch (error) {
    console.error('Error fetching batch analytics:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};