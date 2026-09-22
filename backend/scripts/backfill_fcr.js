#!/usr/bin/env node
/**
 * Backfill FCR for existing batches
 * Run after FCR migration: node backend/scripts/backfill_fcr.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getPhaseFCR } from '../lib/feedScheduleService.js';
import { calculateFCR, getEffectiveFCR } from '../lib/fcrService.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function backfillFCR() {
  console.log('🔄 Starting FCR backfill...');

  // Get all batches with feed records
  const { data: batches, error: batchError } = await supabase
    .from('pig_batches')
    .select('id, batch_code, date_acquired, pig_count, current_weight, start_weight, weight_history, current_fcr, fcr_source');

  if (batchError) {
    console.error('❌ Error fetching batches:', batchError.message);
    return;
  }

  console.log(`📊 Found ${batches.length} batches`);

  for (const batch of batches) {
    console.log(`\n📦 Processing batch: ${batch.batch_code} (${batch.id})`);

    // Get feed records for this batch
    const { data: feedRecords, error: feedError } = await supabase
      .from('feed_records')
      .select('quantity_kg, feeding_date')
      .eq('batch_id', batch.id)
      .order('feeding_date', { ascending: true });

    if (feedError) {
      console.error(`  ❌ Error fetching feed records: ${feedError.message}`);
      continue;
    }

    if (!feedRecords || feedRecords.length === 0) {
      console.log(`  ⚠️  No feed records, skipping`);
      continue;
    }

    console.log(`  📝 Found ${feedRecords.length} feed records`);

    // Calculate FCR from history
    const weightHistory = batch.weight_history || [];
    const result = calculateFCR(feedRecords, weightHistory);

    if (!result.fcr) {
      console.log(`  ⚠️  Insufficient data for FCR calculation (need weight history with ≥2 entries)`);
      
      // Initialize with phase default FCR
      const acquired = new Date(batch.date_acquired);
      const now = new Date();
      const diffDays = Math.floor((now - acquired) / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(diffDays / 7) + 1;
      
      let phase = 'Starter';
      if (weeks > 15) phase = 'Finisher 2';
      else if (weeks > 10) phase = 'Finisher 1';
      else if (weeks > 4) phase = 'Grower';
      
      const defaultFCR = getPhaseFCR(phase);
      
      // Set default FCR
      const { error: updateError } = await supabase
        .from('pig_batches')
        .update({
          current_fcr: defaultFCR,
          fcr_source: 'default',
          fcr_confidence: 'low',
          fcr_data_points: 0
        })
        .eq('id', batch.id);

      if (updateError) {
        console.error(`  ❌ Error setting default FCR: ${updateError.message}`);
      } else {
        console.log(`  ✅ Set default FCR: ${defaultFCR} (phase: ${phase})`);
      }
      continue;
    }

    console.log(`  📈 Calculated FCR: ${result.fcr} (confidence: ${result.confidence}, dataPoints: ${result.dataPoints})`);

    // Update batch with calculated FCR
    const { error: updateError } = await supabase
      .from('pig_batches')
      .update({
        current_fcr: result.fcr,
        fcr_source: 'calculated',
        fcr_confidence: result.confidence,
        fcr_data_points: result.dataPoints
      })
      .eq('id', batch.id);

    if (updateError) {
      console.error(`  ❌ Error updating FCR: ${updateError.message}`);
    } else {
      console.log(`  ✅ Updated FCR to ${result.fcr}`);
    }

    // Initialize weight history if empty but we have start_weight
    if ((!weightHistory || weightHistory.length === 0) && batch.start_weight) {
      const initialHistory = [{
        date: batch.date_acquired ? batch.date_acquired.split('T')[0] : new Date().toISOString().split('T')[0],
        weight: batch.start_weight,
        source: 'manual',
        notes: 'Initial weight at acquisition'
      }];

      // Add current weight if different from start
      if (batch.current_weight && batch.current_weight !== batch.start_weight) {
        initialHistory.push({
          date: new Date().toISOString().split('T')[0],
          weight: batch.current_weight,
          source: 'manual',
          notes: 'Current weight (manual entry)'
        });
      }

      const { error: historyError } = await supabase
        .from('pig_batches')
        .update({ weight_history: initialHistory })
        .eq('id', batch.id);

      if (historyError) {
        console.error(`  ❌ Error initializing weight history: ${historyError.message}`);
      } else {
        console.log(`  ✅ Initialized weight history with ${initialHistory.length} entries`);
      }
    }
  }

  console.log('\n✅ FCR backfill complete!');
}

backfillFCR().catch(console.error);