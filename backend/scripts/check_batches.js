import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vhinqhqgxljchdurlbqx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoaW5xaHFneGxqY2hkdXJsYnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjMzMDYsImV4cCI6MjA5NzIzOTMwNn0.KV3o5RFyi5M4eqOlW04HlZxqbXUIGA_iGD27tQuPj8k'
);

// Check batches with more details
const { data, error } = await supabase.from('pig_batches').select('id, batch_code, status, date_acquired, current_weight, weight_history, current_fcr, fcr_source');
console.log('Error:', error?.message);
data?.forEach(b => {
  console.log(`  ${b.batch_code} (${b.id})`);
  console.log(`    status: ${b.status}, weight: ${b.current_weight}`);
  console.log(`    date_acquired: ${b.date_acquired}`);
  console.log(`    fcr: ${b.current_fcr}, source: ${b.fcr_source}`);
  console.log(`    history: ${b.weight_history?.length || 0} entries`);
  console.log('');
});