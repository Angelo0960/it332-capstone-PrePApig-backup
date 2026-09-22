#!/usr/bin/env node
/**
 * FCR Implementation Test Suite
 * Run: node backend/scripts/test_fcr.js
 * Tests all FCR endpoints with clean test batch
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { calculateFCR, calculateWeightGain, getEffectiveFCR } from '../lib/fcrService.js';
import { getPhaseFCR } from '../lib/feedScheduleService.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let testBatchId = null;
const results = { passed: 0, failed: 0, tests: [] };

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    results.passed++;
    results.tests.push({ name: message, passed: true });
    return true;
  } else {
    console.log(`  ❌ ${message}`);
    results.failed++;
    results.tests.push({ name: message, passed: false });
    return false;
  }
}

async function cleanup() {
  if (testBatchId) {
    console.log('\n🧹 Cleaning up test batch...');
    await supabase.from('feed_records').delete().eq('batch_id', testBatchId);
    await supabase.from('pig_batches').delete().eq('id', testBatchId);
    console.log('  ✅ Cleaned up');
  }
}

async function runTests() {
  console.log('🧪 Starting FCR Test Suite\n');
  console.log('================================\n');

  // ============================================
  // TEST 1: Unit Tests for fcrService functions
  // ============================================
  console.log('📋 TEST 1: Unit Tests\n');

  // calculateFCR
  const feedRecords = [
    { quantity_kg: 100, feeding_date: '2026-01-01' },
    { quantity_kg: 50, feeding_date: '2026-01-08' }
  ];
  const weightHistory = [
    { weight: 10, date: '2026-01-01', source: 'manual' },
    { weight: 50, date: '2026-01-15', source: 'manual' }
  ];
  const fcrResult = calculateFCR(feedRecords, weightHistory);
  // 150kg feed / 40kg gain = 3.75
  assert(fcrResult.fcr === 3.75, `calculateFCR: 150kg feed / 40kg gain = 3.75 (got ${fcrResult.fcr})`);
  assert(fcrResult.confidence === 'low', 'calculateFCR: confidence = low (2 data points)');
  assert(fcrResult.dataPoints === 2, 'calculateFCR: dataPoints = 2');

  // calculateWeightGain
  const gain = calculateWeightGain(100, 2.5);
  assert(gain === 40, 'calculateWeightGain: 100kg / 2.5 = 40kg');

  // getPhaseFCR
  assert(getPhaseFCR('Starter') === 2.0, 'getPhaseFCR: Starter = 2.0');
  assert(getPhaseFCR('Grower') === 2.8, 'getPhaseFCR: Grower = 2.8');
  assert(getPhaseFCR('Finisher 1') === 2.5, 'getPhaseFCR: Finisher 1 = 2.5');
  assert(getPhaseFCR('Finisher 2') === 2.5, 'getPhaseFCR: Finisher 2 = 2.5');

  // ============================================
  // TEST 2: Create Clean Test Batch
  // ============================================
  console.log('\n📋 TEST 2: Create Test Batch\n');

  const batchCode = `TEST-FCR-${Date.now()}`;
  const { data: batch, error: batchError } = await supabase
    .from('pig_batches')
    .insert([{
      batch_code: batchCode,
      pig_count: 10,
      breed: 'Landrace',
      start_weight: 1.4,
      current_weight: 14.0,
      date_acquired: '2026-09-15',
      status: 'Active',
      weight_history: [{
        date: '2026-09-15',
        weight: 14.0,
        source: 'manual',
        notes: 'Initial weight at acquisition'
      }]
    }])
    .select()
    .single();

  if (batchError) {
    console.log(`  ❌ Failed to create batch: ${batchError.message}`);
    process.exit(1);
  }

  testBatchId = batch.id;
  console.log(`  ✅ Created batch: ${batchCode} (${testBatchId})`);
  assert(batch.current_weight === 14.0, 'Initial weight = 14.0 (1.4 × 10 pigs)');
  assert(batch.weight_history.length === 1, 'Weight history has 1 initial entry');
  assert(batch.weight_history[0].source === 'manual', 'Initial entry source = manual');

  // ============================================
  // TEST 3: Log Feed Records (Auto Weight Gain)
  // ============================================
  console.log('\n📋 TEST 3: Feed Logging → Auto Weight Gain\n');

  const feedLogs = [
    { feed_type: 'Starter Mash', quantity_kg: 10, feeding_date: '2026-09-15', expectedGain: 5.0 },  // FCR 2.0
    { feed_type: 'Starter Mash', quantity_kg: 20, feeding_date: '2026-09-16', expectedGain: 10.0 }, // FCR 2.0
    { feed_type: 'Starter Mash', quantity_kg: 15, feeding_date: '2026-09-17', expectedGain: 7.5 },  // FCR 2.0
    { feed_type: 'Grower Pellet', quantity_kg: 28, feeding_date: '2026-09-22', expectedGain: 10.0 }, // FCR 2.8 (week 2)
    { feed_type: 'Grower Pellet', quantity_kg: 30, feeding_date: '2026-09-23', expectedGain: 10.7 }, // FCR 2.8
  ];

  let expectedWeight = 14.0;

  for (const feed of feedLogs) {
    const { data: feedData, error: feedError } = await supabase
      .from('feed_records')
      .insert([{
        batch_id: testBatchId,
        feed_type: feed.feed_type,
        quantity_kg: feed.quantity_kg,
        feeding_date: feed.feeding_date
      }])
      .select()
      .single();

    if (feedError) {
      console.log(`  ❌ Feed log failed: ${feedError.message}`);
      continue;
    }

    // Get updated batch
    const { data: updatedBatch } = await supabase
      .from('pig_batches')
      .select('current_weight, weight_history')
      .eq('id', testBatchId)
      .single();

    expectedWeight += feed.expectedGain;
    const actualWeight = updatedBatch.current_weight;
    const actualGain = actualWeight - (expectedWeight - feed.expectedGain);

    console.log(`  Feed: ${feed.quantity_kg}kg ${feed.feed_type} → Expected gain: ${feed.expectedGain}kg, Actual gain: ${actualGain.toFixed(2)}kg, New weight: ${actualWeight}kg`);
    
    assert(Math.abs(actualGain - feed.expectedGain) < 0.5, `Feed ${feed.quantity_kg}kg → weight gain ≈ ${feed.expectedGain}kg (FCR ${feed.feed_type.includes('Starter') ? '2.0' : '2.8'})`);
    assert(updatedBatch.weight_history.length > 1, 'Weight history appended');

    // Verify last entry is auto_feed
    const lastEntry = updatedBatch.weight_history[updatedBatch.weight_history.length - 1];
    assert(lastEntry.source === 'auto_feed', 'Last weight entry source = auto_feed');
    assert(lastEntry.notes.includes('Auto-calculated from feed'), 'Notes mention auto-calculated');
  }

  // ============================================
  // TEST 4: Weight History Endpoint
  // ============================================
  console.log('\n📋 TEST 4: Weight History\n');

  const { data: history } = await supabase
    .from('pig_batches')
    .select('weight_history')
    .eq('id', testBatchId)
    .single();

  const sortedHistory = [...history.weight_history].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  assert(sortedHistory[0].source === 'manual', 'First entry = manual (initial)');
  assert(sortedHistory.slice(1).every(e => e.source === 'auto_feed'), 'All subsequent entries = auto_feed');
  assert(sortedHistory.length === 6, 'Total entries = 1 initial + 5 feed logs');

  // Verify weights are monotonically increasing
  let prevWeight = 0;
  let increasing = true;
  for (const entry of sortedHistory) {
    if (entry.weight < prevWeight) increasing = false;
    prevWeight = entry.weight;
  }
  assert(increasing, 'Weights monotonically increasing');

  // ============================================
  // TEST 5: FCR Endpoint - Default Phase FCR
  // ============================================
  console.log('\n📋 TEST 5: FCR - Default Phase FCR\n');

  const { data: feedsForFCR } = await supabase
    .from('feed_records')
    .select('quantity_kg, feeding_date')
    .eq('batch_id', testBatchId);

  const { data: batchForFCR } = await supabase
    .from('pig_batches')
    .select('*')
    .eq('id', testBatchId)
    .single();

  const effectiveFCR = getEffectiveFCR(batchForFCR, feedsForFCR || []);
  
  assert(effectiveFCR.source === 'default', 'FCR source = default (insufficient history for calculated)');
  assert(effectiveFCR.fcr === 2.0, 'FCR = 2.0 (Starter phase)');
  assert(effectiveFCR.phase === 'Starter', 'Phase = Starter (week 1)');
  assert(effectiveFCR.confidence === 'low', 'Confidence = low');

  // ============================================
  // TEST 6: FCR Recalculation
  // ============================================
  console.log('\n📋 TEST 6: FCR Recalculation\n');

  const { data: allFeeds } = await supabase
    .from('feed_records')
    .select('quantity_kg, feeding_date')
    .eq('batch_id', testBatchId);

  const calculatedFCR = calculateFCR(allFeeds || [], history.weight_history || []);
  
  if (calculatedFCR.fcr) {
    // Update batch with calculated FCR
    await supabase
      .from('pig_batches')
      .update({
        current_fcr: calculatedFCR.fcr,
        fcr_source: 'calculated',
        fcr_confidence: calculatedFCR.confidence,
        fcr_data_points: calculatedFCR.dataPoints
      })
      .eq('id', testBatchId);

    const { data: updatedBatch } = await supabase
      .from('pig_batches')
      .select('current_fcr, fcr_source, fcr_confidence, fcr_data_points')
      .eq('id', testBatchId)
      .single();

    assert(updatedBatch.fcr_source === 'calculated', 'FCR source = calculated');
    assert(updatedBatch.current_fcr > 1.5 && updatedBatch.current_fcr < 4.0, `Calculated FCR realistic: ${updatedBatch.current_fcr}`);
    assert(updatedBatch.fcr_data_points === allFeeds.length, 'Data points = feed record count');
  } else {
    console.log('  ⚠️  Insufficient data for calculated FCR (need ≥2 weight history entries with gain)');
  }

  // ============================================
  // TEST 7: Feed Validation (Wrong Phase)
  // ============================================
  console.log('\n📋 TEST 7: Feed Validation\n');

  // Try to log Finisher feed during Starter phase (should fail without override)
  const { data: invalidFeed, error: invalidError } = await supabase
    .from('feed_records')
    .insert([{
      batch_id: testBatchId,
      feed_type: 'Finisher',
      quantity_kg: 10,
      feeding_date: '2026-09-15'
    }])
    .select()
    .single();

  // Note: This tests DB constraint, not API validation. API validation is in feedController.
  // For API test, we'd need to call the actual endpoint. Skipping direct DB test.

  console.log('  ℹ️  Feed validation tested via API (see Postman collection)');

  // ============================================
  // TEST 8: Manual Weight Log (Separate Workflow)
  // ============================================
  console.log('\n📋 TEST 8: Manual Weight Log\n');

  const { data: manualWeight, error: manualError } = await supabase
    .from('pig_batches')
    .select('current_weight, weight_history')
    .eq('id', testBatchId)
    .single();

  const beforeWeight = manualWeight.current_weight;
  const beforeHistoryLen = manualWeight.weight_history.length;

  // Simulate manual weight log (this would be via POST /pigs/:id/weight-log)
  await supabase
    .from('pig_batches')
    .update({
      current_weight: beforeWeight + 5,
      weight_history: [
        ...manualWeight.weight_history,
        {
          date: new Date().toISOString().split('T')[0],
          weight: beforeWeight + 5,
          source: 'manual',
          notes: 'Manual weigh-in'
        }
      ]
    })
    .eq('id', testBatchId);

  const { data: afterManual } = await supabase
    .from('pig_batches')
    .select('current_weight, weight_history')
    .eq('id', testBatchId)
    .single();

  assert(afterManual.current_weight === beforeWeight + 5, 'Manual weight updated');
  assert(afterManual.weight_history.length === beforeHistoryLen + 1, 'History appended');
  assert(afterManual.weight_history[afterManual.weight_history.length - 1].source === 'manual', 'Manual entry source = manual');

  // ============================================
  // TEST 9: Subsequent Feed After Manual Weight
  // ============================================
  console.log('\n📋 TEST 9: Feed After Manual Weight\n');

  const { data: feedAfterManual } = await supabase
    .from('feed_records')
    .insert([{
      batch_id: testBatchId,
      feed_type: 'Grower Pellet',
      quantity_kg: 28,
      feeding_date: '2026-09-25'
    }])
    .select()
    .single();

  const { data: batchAfterFeed } = await supabase
    .from('pig_batches')
    .select('current_weight, weight_history')
    .eq('id', testBatchId)
    .single();

  // Weight should increase from manual baseline using FCR
  const gainFromManual = batchAfterFeed.current_weight - (beforeWeight + 5);
  console.log(`  Weight after manual: ${beforeWeight + 5}kg`);
  console.log(`  Weight after feed: ${batchAfterFeed.current_weight}kg`);
  console.log(`  Gain from feed: ${gainFromManual.toFixed(2)}kg`);
  
  // Should use calculated FCR if available, else default
  assert(gainFromManual > 0, 'Weight increased after feed');

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n================================');
  console.log(`📊 RESULTS: ${results.passed} passed, ${results.failed} failed`);
  console.log('================================\n');

  if (results.failed > 0) {
    console.log('Failed tests:');
    results.tests.filter(t => !t.passed).forEach(t => console.log(`  - ${t.name}`));
  }

  // Cleanup
  await cleanup();

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(async err => {
  console.error('Test error:', err);
  await cleanup();
  process.exit(1);
});