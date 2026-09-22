#!/usr/bin/env node
/**
 * Test FCR Auto Weight Gain Functionality
 * Run: node backend/scripts/test_fcr_weight_gain.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFCRWeightGain() {
  console.log('🧪 Testing FCR Auto Weight Gain...\n');

  // 1. Get a test batch (prefer one with feed records)
  const { data: batches, error: batchError } = await supabase
    .from('pig_batches')
    .select('id, batch_code, date_acquired, pig_count, current_weight, start_weight, current_fcr, fcr_source, weight_history')
    .eq('status', 'Active')
    .limit(5);

  if (batchError || !batches || batches.length === 0) {
    console.error('❌ No active batches found');
    return;
  }

  console.log(`📦 Found ${batches.length} active batches:`);
  batches.forEach((b, i) => {
    console.log(`  ${i + 1}. ${b.batch_code} (${b.id})`);
    console.log(`     Weight: ${b.start_weight} → ${b.current_weight} kg | Pigs: ${b.pig_count}`);
    console.log(`     FCR: ${b.current_fcr || 'NULL'} (${b.fcr_source || 'NULL'})`);
    console.log(`     History entries: ${b.weight_history?.length || 0}`);
  });

  // Use first batch for testing
  const testBatch = batches[0];
  console.log(`\n🎯 Testing with: ${testBatch.batch_code} (${testBatch.id})`);

  // 2. Check current feed records
  const { data: feedRecords, error: feedError } = await supabase
    .from('feed_records')
    .select('id, feed_type, quantity_kg, feeding_date')
    .eq('batch_id', testBatch.id)
    .order('feeding_date', { ascending: true });

  if (feedError) {
    console.error('❌ Error fetching feed records:', feedError.message);
    return;
  }

  console.log(`\n📝 Existing feed records: ${feedRecords?.length || 0}`);
  feedRecords?.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f.feed_type} - ${f.quantity_kg} kg (${f.feeding_date})`);
  });

  // 3. Determine expected feed type for current phase
  const acquired = new Date(testBatch.date_acquired);
  const now = new Date();
  const diffDays = Math.floor((now - acquired) / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(diffDays / 7) + 1;

  let expectedFeedType, expectedFCR, phaseName;
  if (weeks <= 4) {
    phaseName = 'Starter';
    expectedFeedType = 'Starter Mash';
    expectedFCR = 2.0;
  } else if (weeks <= 10) {
    phaseName = 'Grower';
    expectedFeedType = 'Grower Pellet';
    expectedFCR = 2.8;
  } else if (weeks <= 15) {
    phaseName = 'Finisher 1';
    expectedFeedType = 'Finisher';
    expectedFCR = 2.5;
  } else {
    phaseName = 'Finisher 2';
    expectedFeedType = 'Finisher';
    expectedFCR = 2.5;
  }

  console.log(`\n📊 Batch Phase: Week ${weeks} (${phaseName})`);
  console.log(`   Expected Feed: ${expectedFeedType}`);
  console.log(`   Expected FCR: ${expectedFCR}`);

  // 4. Test feed recording with correct feed type
  const testFeedKg = 10; // 10 kg test feed
  const expectedGain = testFeedKg / expectedFCR;

  console.log(`\n🧪 Test: Recording ${testFeedKg} kg of ${expectedFeedType}`);
  console.log(`   Expected weight gain: ${expectedGain.toFixed(2)} kg`);
  console.log(`   Current weight: ${testBatch.current_weight} kg`);
  console.log(`   Expected new weight: ${(testBatch.current_weight + expectedGain).toFixed(2)} kg`);

  // 5. Record the feed
  const feedingDate = new Date().toISOString().split('T')[0];
  const feedingTime = new Date().toLocaleTimeString();

  console.log(`\n📤 Creating feed record...`);
  const { data: feedData, error: createError } = await supabase
    .from('feed_records')
    .insert([{
      batch_id: testBatch.id,
      feed_type: expectedFeedType,
      quantity_kg: testFeedKg,
      feeding_date: feedingDate,
      feeding_time: feedingTime,
      notes: 'FCR test feed'
    }])
    .select()
    .single();

  if (createError) {
    console.error('❌ Failed to create feed record:', createError.message);
    return;
  }

  console.log(`✅ Feed record created: ${feedData.id}`);

  // 6. Wait a moment for the trigger/processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 7. Check updated batch
  const { data: updatedBatch, error: updatedError } = await supabase
    .from('pig_batches')
    .select('current_weight, weight_history, current_fcr, fcr_source, fcr_confidence')
    .eq('id', testBatch.id)
    .single();

  if (updatedError) {
    console.error('❌ Failed to fetch updated batch:', updatedError.message);
    return;
  }

  console.log(`\n📈 Batch Updated:`);
  console.log(`   Previous weight: ${testBatch.current_weight} kg`);
  console.log(`   New weight: ${updatedBatch.current_weight} kg`);
  console.log(`   Actual gain: ${(updatedBatch.current_weight - testBatch.current_weight).toFixed(2)} kg`);
  console.log(`   Expected gain: ${expectedGain.toFixed(2)} kg`);
  console.log(`   Match: ${Math.abs(updatedBatch.current_weight - testBatch.current_weight - expectedGain) < 0.01 ? '✅ YES' : '❌ NO'}`);

  // 8. Check weight history
  const history = updatedBatch.weight_history || [];
  const lastEntry = history[history.length - 1];
  console.log(`\n📋 Weight History (last entry):`);
  console.log(`   Date: ${lastEntry?.date}`);
  console.log(`   Weight: ${lastEntry?.weight} kg`);
  console.log(`   Source: ${lastEntry?.source}`);
  console.log(`   Notes: ${lastEntry?.notes}`);

  // 9. Check FCR
  console.log(`\n📊 FCR Info:`);
  console.log(`   Current FCR: ${updatedBatch.current_fcr}`);
  console.log(`   Source: ${updatedBatch.fcr_source}`);
  console.log(`   Confidence: ${updatedBatch.fcr_confidence}`);

  // 10. Verify feed record was created
  const { data: newFeedRecords } = await supabase
    .from('feed_records')
    .select('*')
    .eq('batch_id', testBatch.id)
    .order('created_at', { ascending: false })
    .limit(1);

  console.log(`\n✅ Test Complete!`);
  console.log(`   Feed recorded: ${newFeedRecords[0]?.feed_type} - ${newFeedRecords[0]?.quantity_kg} kg`);
  console.log(`   Weight auto-updated: ${Math.abs(updatedBatch.current_weight - testBatch.current_weight - expectedGain) < 0.01 ? 'YES' : 'NO'}`);
  console.log(`   History entry added: ${lastEntry?.source === 'auto_feed' ? 'YES' : 'NO'}`);

  // Cleanup note
  console.log(`\n🧹 Note: Test feed record (${feedData.id}) remains in database.`);
  console.log(`   You may want to delete it manually if needed.`);
}

testFCRWeightGain().catch(console.error);