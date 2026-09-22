#!/usr/bin/env node
/**
 * Fix Batch 10 - Clean weight history, reset FCR to phase default
 * Run: node backend/scripts/fix_batch10.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixBatch10() {
  const batchId = '47e64333-05e9-4822-a785-2ad01a6eed43'; // BATCH-010
  
  // Get current batch
  const {data: batch} = await supabase.from('pig_batches').select('*').eq('id', batchId).single();
  console.log('Current state:');
  console.log('  current_weight:', batch.current_weight);
  console.log('  start_weight:', batch.start_weight);
  console.log('  pig_count:', batch.pig_count);
  console.log('  weight_history entries:', batch.weight_history?.length);
  batch.weight_history?.forEach((h, i) => {
    console.log(`    ${i}: ${h.date} ${h.source} ${h.weight}kg - ${h.notes}`);
  });
  console.log('  current_fcr:', batch.current_fcr);
  console.log('  fcr_source:', batch.fcr_source);
  
  // Get feed records
  const {data: feeds} = await supabase.from('feed_records').select('quantity_kg, feeding_date, feed_type').eq('batch_id', batchId).order('feeding_date');
  console.log('\nFeed records:');
  let totalFeed = 0;
  feeds?.forEach(f => {
    totalFeed += Number(f.quantity_kg);
    console.log(' ', f.feeding_date, f.feed_type, f.quantity_kg, 'kg');
  });
  console.log('Total feed:', totalFeed, 'kg');
  
  // Determine phase from acquisition date
  const acquired = new Date(batch.date_acquired);
  const now = new Date();
  const diffDays = Math.floor((now - acquired) / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(diffDays / 7) + 1;
  console.log('\nBatch age:', diffDays, 'days,', weeks, 'weeks');
  
  let phase = 'Starter';
  if (weeks > 15) phase = 'Finisher 2';
  else if (weeks > 10) phase = 'Finisher 1';
  else if (weeks > 4) phase = 'Grower';
  console.log('Phase:', phase);
  
  const phaseFCR = phase === 'Starter' ? 2.0 : phase === 'Grower' ? 2.8 : 2.5;
  console.log('Phase FCR:', phaseFCR);
  
  // Clean weight history - keep only initial entry
  const initialEntry = batch.weight_history?.find(h => h.notes?.includes('Initial') || h.notes?.includes('acquisition'));
  const cleanHistory = initialEntry ? [initialEntry] : [{
    date: batch.date_acquired?.split('T')[0] || '2026-09-15',
    weight: batch.start_weight,
    source: 'manual',
    notes: 'Initial weight at acquisition'
  }];
  
  // Calculate expected weight from all feed using phase FCR
  const expectedGain = totalFeed / phaseFCR;
  const expectedWeight = batch.start_weight + expectedGain;
  console.log('\nExpected weight gain:', expectedGain.toFixed(2), 'kg');
  console.log('Expected total weight:', expectedWeight.toFixed(2), 'kg');
  
  // Update batch with clean history and realistic FCR
  const {error} = await supabase.from('pig_batches').update({
    weight_history: cleanHistory,
    current_fcr: phaseFCR,
    fcr_source: 'default',
    fcr_confidence: 'low',
    fcr_data_points: 0,
    current_weight: expectedWeight
  }).eq('id', batchId);
  
  if (error) {
    console.log('\nError:', error.message);
  } else {
    console.log('\nFixed! Batch reset to:');
    console.log('  current_weight:', expectedWeight.toFixed(2));
    console.log('  current_fcr:', phaseFCR);
    console.log('  fcr_source: default');
    console.log('  weight_history entries:', cleanHistory.length);
  }
}

fixBatch10().catch(console.error);