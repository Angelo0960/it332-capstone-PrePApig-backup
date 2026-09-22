import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_ID = 'FIND_YOUR_BATCH_ID'; // ← replace with BATCH-012's real UUID

// Get batch before
const { data: before, error: e1 } = await supabase
  .from('pig_batches')
  .select('*')
  .eq('batch_code', 'BATCH-012')
  .single();

if (e1) { console.error('Batch fetch error:', e1); process.exit(1); }

console.log('=== BEFORE ===');
console.log('id:', before.id);
console.log('current_weight:', before.current_weight);
console.log('weight_history:', JSON.stringify(before.weight_history));
console.log('current_fcr:', before.current_fcr);
console.log('date_acquired:', before.date_acquired);

// Insert a feed record
const { data: feed, error: e2 } = await supabase
  .from('feed_records')
  .insert([{
    batch_id: before.id,
    feed_type: 'Starter Mash',
    quantity_kg: 10,
    feeding_date: new Date().toISOString().split('T')[0],
    feeding_time: new Date().toLocaleTimeString(),
    notes: 'diagnostic test'
  }])
  .select()
  .single();

if (e2) { console.error('Feed insert error:', e2); process.exit(1); }
console.log('\n✅ Feed inserted:', feed.id);

// Wait a moment
await new Promise(r => setTimeout(r, 1500));

// Get batch after
const { data: after } = await supabase
  .from('pig_batches')
  .select('*')
  .eq('id', before.id)
  .single();

console.log('\n=== AFTER ===');
console.log('current_weight:', after.current_weight);
console.log('weight_history:', JSON.stringify(after.weight_history));
console.log('current_fcr:', after.current_fcr);
console.log('fcr_source:', after.fcr_source);

console.log('\n=== DIFF ===');
console.log('weight changed:', before.current_weight !== after.current_weight ? '✅ YES' : '❌ NO');
console.log('history changed:', JSON.stringify(before.weight_history) !== JSON.stringify(after.weight_history) ? '✅ YES' : '❌ NO');