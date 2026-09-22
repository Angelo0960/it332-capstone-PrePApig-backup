import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vhinqhqgxljchdurlbqx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoaW5xaHFneGxqY2hkdXJsYnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjMzMDYsImV4cCI6MjA5NzIzOTMwNn0.KV3o5RFyi5M4eqOlW04HlZxqbXUIGA_iGD27tQuPj8k'
);

// Check feed records
const { data, error } = await supabase.from('feed_records').select('*').order('batch_id');
console.log('Feed records error:', error?.message);
console.log('Feed records count:', data?.length);
data?.forEach(f => console.log(`  ${f.batch_id} - ${f.feed_type} - ${f.quantity_kg}kg - ${f.feeding_date}`));