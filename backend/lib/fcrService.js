import { getPhaseFCR } from './feedScheduleService.js';

/**
 * Calculate FCR from historical feed records and weight history
 */
export function calculateFCR(feedRecords, weightHistory) {
  if (!feedRecords || feedRecords.length === 0 || !weightHistory || weightHistory.length < 2) {
    return { fcr: null, confidence: 'none', dataPoints: 0 };
  }

  const totalFeedKg = feedRecords.reduce((sum, record) => sum + Number(record.quantity_kg || 0), 0);

  const sortedHistory = [...weightHistory].sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstWeight = sortedHistory[0]?.weight;
  const lastWeight = sortedHistory[sortedHistory.length - 1]?.weight;

  if (!firstWeight || !lastWeight || lastWeight <= firstWeight) {
    return { fcr: null, confidence: 'none', dataPoints: feedRecords.length };
  }

  const totalWeightGainKg = lastWeight - firstWeight;
  const fcr = totalFeedKg / totalWeightGainKg;

  const dataPoints = feedRecords.length;
  let confidence = 'low';
  if (dataPoints >= 10) confidence = 'high';
  else if (dataPoints >= 5) confidence = 'medium';

  return {
    fcr: Math.round(fcr * 100) / 100,
    confidence,
    dataPoints
  };
}

/**
 * Calculate weight gain from feed amount and FCR
 */
export function calculateWeightGain(feedKg, fcr) {
  if (!feedKg || !fcr || fcr <= 0) return 0;
  return Math.round((feedKg / fcr) * 100) / 100;
}

/**
 * Get effective FCR for a batch
 */
export function getEffectiveFCR(batch, feedRecords = []) {
  const phase = getCurrentPhase(batch);
  const defaultFCR = getPhaseFCR(phase);

  if (batch.current_fcr && batch.fcr_source === 'manual') {
    return {
      fcr: Number(batch.current_fcr),
      source: 'manual',
      confidence: 'high',
      dataPoints: batch.fcr_data_points || 0,
      phase
    };
  }

  if (batch.fcr_source === 'calculated' && batch.current_fcr) {
    return {
      fcr: Number(batch.current_fcr),
      source: 'calculated',
      confidence: batch.fcr_confidence || 'low',
      dataPoints: batch.fcr_data_points || 0,
      phase
    };
  }

  if (batch.fcr_source === 'default' || !batch.fcr_source) {
    return {
      fcr: defaultFCR,
      source: 'default',
      confidence: 'low',
      dataPoints: 0,
      phase
    };
  }

  if (feedRecords.length > 0 && batch.weight_history && batch.weight_history.length >= 2) {
    const calculated = calculateFCR(feedRecords, batch.weight_history);
    if (calculated.fcr) {
      return {
        fcr: calculated.fcr,
        source: 'calculated',
        confidence: calculated.confidence,
        dataPoints: calculated.dataPoints,
        phase
      };
    }
  }

  return {
    fcr: defaultFCR,
    source: 'default',
    confidence: 'low',
    dataPoints: 0,
    phase
  };
}

function getCurrentPhase(batch) {
  if (!batch?.date_acquired) return 'Starter';
  const acquired = new Date(batch.date_acquired);
  const now = new Date();
  const diffMs = now - acquired;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(diffDays / 7) + 1;

  if (weeks <= 4) return 'Starter';
  if (weeks <= 10) return 'Grower';
  if (weeks <= 15) return 'Finisher 1';
  return 'Finisher 2';
}

/**
 * Update batch weight from feed entry + sync individual pigs
 * HARDENED: auto-generates pigs if missing, logs clearly, and returns full status.
 */
export async function updateBatchWeightFromFeed(supabase, batchId, feedKg, fcr) {
  console.log('🔧 [updateBatchWeightFromFeed] start', { batchId, feedKg, fcr });

  const weightGain = calculateWeightGain(feedKg, fcr);
  if (weightGain <= 0) {
    console.warn('❌ [updateBatchWeightFromFeed] invalid weight gain:', { feedKg, fcr, weightGain });
    return { success: false, message: 'Invalid weight gain calculation' };
  }

  const { data: batch, error: batchError } = await supabase
    .from('pig_batches')
    .select('current_weight, weight_history, pig_count')
    .eq('id', batchId)
    .single();

  if (batchError || !batch) {
    console.error('❌ [updateBatchWeightFromFeed] batch fetch failed:', batchError);
    return { success: false, message: batchError?.message || 'Batch not found' };
  }

  const currentWeight = Number(batch.current_weight || 0);
  const newWeight = Math.round((currentWeight + weightGain) * 100) / 100;
  const pigCount = Number(batch.pig_count || 0);

  const newHistoryEntry = {
    date: new Date().toISOString().split('T')[0],
    weight: newWeight,
    source: 'auto_feed',
    notes: `Auto-calculated from feed: ${feedKg}kg (FCR: ${fcr})`
  };

  const updatedHistory = [...(batch.weight_history || []), newHistoryEntry];

  console.log('📝 [updateBatchWeightFromFeed] updating batch', {
    currentWeight,
    newWeight,
    weightGain,
    historyLen: updatedHistory.length
  });

  const { data, error } = await supabase
    .from('pig_batches')
    .update({
      current_weight: newWeight,
      weight_history: updatedHistory,
    })
    .eq('id', batchId)
    .select()
    .single();

  if (error) {
    console.error('❌ [updateBatchWeightFromFeed] batch update failed:', error);
    return { success: false, message: error.message };
  }

  // ─── Sync individual pigs ────────────────────────────────────
  if (pigCount > 0) {
    const weightPerPig = Math.round((newWeight / pigCount) * 100) / 100;

    // Check if pigs exist for this batch
    const { data: existingPigs, error: countError } = await supabase
      .from('pigs')
      .select('id')
      .eq('batch_id', batchId);

    if (countError) {
      console.warn('⚠️ [updateBatchWeightFromFeed] pig check failed:', countError.message);
    } else if (!existingPigs || existingPigs.length === 0) {
      // Auto-generate pigs at current average weight
      const newPigs = Array.from({ length: pigCount }, () => ({
        batch_id: batchId,
        weight: weightPerPig,
        health_status: 'Healthy',
        notes: 'Auto-generated during feed weight sync',
      }));
      const { error: insertError } = await supabase.from('pigs').insert(newPigs);
      if (insertError) {
        console.warn('⚠️ [updateBatchWeightFromFeed] auto-generate pigs failed:', insertError.message);
      } else {
        console.log(`✅ [updateBatchWeightFromFeed] auto-generated ${pigCount} pigs at ${weightPerPig}kg`);
      }
    } else {
      const { error: pigError } = await supabase
        .from('pigs')
        .update({ weight: weightPerPig, updated_at: new Date().toISOString() })
        .eq('batch_id', batchId);

      if (pigError) {
        console.warn('⚠️ [updateBatchWeightFromFeed] pig sync failed:', pigError.message);
      } else {
        console.log(`✅ [updateBatchWeightFromFeed] synced ${existingPigs.length} pigs to ${weightPerPig}kg`);
      }
    }
  }

  return {
    success: true,
    data: {
      batch_id: batchId,
      previous_weight: currentWeight,
      new_weight: newWeight,
      weight_gain: weightGain,
      fcr,
      feed_kg: feedKg
    }
  };
}

/**
 * Recalculate and update FCR for a batch from all history
 */
export async function recalculateBatchFCR(supabase, batchId, feedRecords) {
  const { data: batch, error: batchError } = await supabase
    .from('pig_batches')
    .select('weight_history')
    .eq('id', batchId)
    .single();

  if (batchError || !batch) {
    return { success: false, message: batchError?.message || 'Batch not found' };
  }

  const result = calculateFCR(feedRecords, batch.weight_history || []);

  if (!result.fcr) {
    return { success: false, message: 'Insufficient data for FCR calculation' };
  }

  const { data, error } = await supabase
    .from('pig_batches')
    .update({
      current_fcr: result.fcr,
      fcr_source: 'calculated',
      fcr_confidence: result.confidence,
      fcr_data_points: result.dataPoints,
    })
    .eq('id', batchId)
    .select()
    .single();

  if (error) {
    return { success: false, message: error.message };
  }

  return {
    success: true,
    data: {
      current_fcr: result.fcr,
      fcr_source: 'calculated',
      fcr_confidence: result.confidence,
      fcr_data_points: result.dataPoints
    }
  };
}

/**
 * Add manual weight entry to batch history
 */
export async function addManualWeightEntry(supabase, batchId, weight, notes = '') {
  const { data: batch, error: batchError } = await supabase
    .from('pig_batches')
    .select('current_weight, weight_history, pig_count')
    .eq('id', batchId)
    .single();

  if (batchError || !batch) {
    return { success: false, message: batchError?.message || 'Batch not found' };
  }

  const previousWeight = Number(batch.current_weight || 0);
  const weightGain = weight > previousWeight ? Math.round((weight - previousWeight) * 100) / 100 : 0;

  const newHistoryEntry = {
    date: new Date().toISOString().split('T')[0],
    weight,
    source: 'manual',
    notes: notes || `Manual entry: ${weight}kg`
  };

  const updatedHistory = [...(batch.weight_history || []), newHistoryEntry];

  const { data, error } = await supabase
    .from('pig_batches')
    .update({
      current_weight: weight,
      weight_history: updatedHistory,
    })
    .eq('id', batchId)
    .select()
    .single();

  if (error) {
    return { success: false, message: error.message };
  }

  // Sync pigs
  const pigCount = Number(batch.pig_count || 0);
  if (pigCount > 0) {
    const weightPerPig = Math.round((weight / pigCount) * 100) / 100;
    const { error: pigError } = await supabase
      .from('pigs')
      .update({ weight: weightPerPig, updated_at: new Date().toISOString() })
      .eq('batch_id', batchId);
    if (pigError) {
      console.warn('⚠️ [addManualWeightEntry] pig sync failed:', pigError.message);
    } else {
      console.log(`✅ [addManualWeightEntry] synced pigs to ${weightPerPig}kg`);
    }
  }

  return {
    success: true,
    data: {
      batch_id: batchId,
      previous_weight: previousWeight,
      new_weight: weight,
      weight_gain: weightGain,
      fcr: null,
      source: 'manual'
    }
  };
}

/**
 * Get FCR trend data for charting
 */
export function getFCRTrend(feedRecords, weightHistory) {
  if (!feedRecords || !weightHistory || weightHistory.length < 2) return [];

  const weeklyData = {};

  feedRecords.forEach(record => {
    const date = new Date(record.feeding_date);
    const weekKey = `${date.getFullYear()}-W${String(Math.ceil(date.getDate() / 7)).padStart(2, '0')}`;
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { feedKg: 0, startWeight: null, endWeight: null };
    }
    weeklyData[weekKey].feedKg += Number(record.quantity_kg || 0);
  });

  weightHistory.forEach(entry => {
    const date = new Date(entry.date);
    const weekKey = `${date.getFullYear()}-W${String(Math.ceil(date.getDate() / 7)).padStart(2, '0')}`;
    if (!weeklyData[weekKey]) {
      weeklyData[weekKey] = { feedKg: 0, startWeight: null, endWeight: null };
    }
    if (weeklyData[weekKey].startWeight === null || entry.weight < weeklyData[weekKey].startWeight) {
      weeklyData[weekKey].startWeight = entry.weight;
    }
    if (weeklyData[weekKey].endWeight === null || entry.weight > weeklyData[weekKey].endWeight) {
      weeklyData[weekKey].endWeight = entry.weight;
    }
  });

  const trend = Object.entries(weeklyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, data]) => {
      const gain = (data.endWeight || 0) - (data.startWeight || 0);
      const fcr = gain > 0 ? data.feedKg / gain : null;
      return {
        week,
        fcr: fcr ? Math.round(fcr * 100) / 100 : null,
        feed_kg: data.feedKg,
        weight_gain: Math.round(gain * 100) / 100
      };
    })
    .filter(d => d.fcr !== null);

  return trend;
}