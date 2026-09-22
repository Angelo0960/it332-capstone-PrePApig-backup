#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getPhaseFCR } from '../lib/feedScheduleService.js';
import { calculateFCR } from '../lib/fcrService.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function getPhaseForWeeks(weeks) {
  if (weeks <= 4) return 'Starter';
  if (weeks <= 10) return 'Grower';
  if (weeks <= 15) return 'Finisher 1';
  return 'Finisher 2';
}

async function backfillFCR() {
  console.log('Starting FCR backfill v2...');

  const { data: batches, error: batchError } = await supabase
    .from('pig_batches')
    .select('id, batch_code, date_acquired, pig_count, current_weight, start_weight, weight_history, current_fcr, fcr_source');

  if (batchError) {
    console.error('Error fetching batches:', batchError.message);
    return;
  }

  console.log('Found ' + batches.length + ' batches');

  for (const batch of batches) {
    console.log('Processing: ' + batch.batch_code + ' (' + batch.id + ')');

    const { data: feedRecords, error: feedError } = await supabase
      .from('feed_records')
      .select('quantity_kg, feeding_date')
      .eq('batch_id', batch.id)
      .order('feeding_date', { ascending: true });

    if (feedError) {
      console.error('  Feed error: ' + feedError.message);
      continue;
    }

    if (!feedRecords || feedRecords.length === 0) {
      console.log('  No feed records, skipping');
      continue;
    }

    console.log('  Feed records: ' + feedRecords.length);

    let weightHistory = batch.weight_history || [];
    if (weightHistory.length === 0 && batch.start_weight) {
      const initialHistory = [{
        date: batch.date_acquired ? batch.date_acquired.split('T')[0] : new Date().toISOString().split('T')[0],
        weight: batch.start_weight,
        source: 'manual',
        notes: 'Initial weight at acquisition'
      }];

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
        console.error('  History init error: ' + historyError.message);
      } else {
        console.log('  Initialized weight history (' + initialHistory.length + ' entries)');
        weightHistory = initialHistory;
      }
    }

    const result = calculateFCR(feedRecords, weightHistory);

    const acquired = new Date(batch.date_acquired);
    const now = new Date();
    const diffDays = Math.floor((now - acquired) / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(diffDays / 7) + 1;
    const phase = getPhaseForWeeks(weeks);
    const defaultFCR = getPhaseFCR(phase);

    let finalFCR, source, confidence, dataPoints;

    if (result.fcr) {
      finalFCR = result.fcr;
      source = 'calculated';
      confidence = result.confidence;
      dataPoints = result.dataPoints;
      console.log('  Calculated FCR: ' + finalFCR + ' (' + confidence + ', ' + dataPoints + ' pts)');
    } else {
      finalFCR = defaultFCR;
      source = 'default';
      confidence = 'low';
      dataPoints = 0;
      console.log('  Using default FCR: ' + defaultFCR + ' (phase: ' + phase + ', week: ' + weeks + ')');
    }

    const { error: updateError } = await supabase
      .from('pig_batches')
      .update({
        current_fcr: finalFCR,
        fcr_source: source,
        fcr_confidence: confidence,
        fcr_data_points: dataPoints
      })
      .eq('id', batch.id);

    if (updateError) {
      console.error('  Update error: ' + updateError.message);
    } else {
      console.log('  FCR set to ' + finalFCR + ' (' + source + ')');
    }
  }

  console.log('FCR backfill complete!');
}

backfillFCR().catch(console.error);
