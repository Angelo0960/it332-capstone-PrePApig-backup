import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get the most recent batch that has feed records
const { data: feeds } = await supabase
  .from('feed_records')
  .select('batch_id')
  .order('created_at', { ascending: false })
  .limit(1);

if (!feeds?.length) {
  console.log('No feed records found');
  process.exit(0);
}

const BATCH_ID = feeds[0].batch_id;

const { data: batch } = await supabase
  .from('pig_batches')
  .select('batch_code, current_weight, pig_count, weight_history')
  .eq('id', BATCH_ID)
  .single();

console.log('=== BATCH ===');
console.log('Batch:', batch.batch_code);
console.log('Batch weight:', batch.current_weight);
console.log('Pig count:', batch.pig_count);
console.log('Expected per-pig:', batch.current_weight / batch.pig_count);
console.log('Weight history entries:', batch.weight_history?.length);

const { data: pigs, error } = await supabase
  .from('pigs')
  .select('id, weight, updated_at')
  .eq('batch_id', BATCH_ID);

console.log('\n=== INDIVIDUAL PIGS ===');
console.log('Count:', pigs?.length || 0);
console.log('Error:', error?.message || 'none');
pigs?.slice(0, 5).forEach(p => 
  console.log(`  ${p.weight}kg  updated: ${p.updated_at}`)
);