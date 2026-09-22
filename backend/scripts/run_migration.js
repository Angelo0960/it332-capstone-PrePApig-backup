import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vhinqhqgxljchdurlbqx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoaW5xaHFneGxqY2hkdXJsYnF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjMzMDYsImV4cCI6MjA5NzIzOTMwNn0.KV3o5RFyi5M4eqOlW04HlZxqbXUIGA_iGD27tQuPj8k'
);

async function runMigration() {
  console.log('🔄 Running FCR migration...\n');

  // Migration statements
  const statements = [
    `ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS weight_history JSONB DEFAULT '[]'::jsonb;`,
    `ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS current_fcr DECIMAL(5,2);`,
    `ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_source VARCHAR(20) DEFAULT 'default';`,
    `ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_confidence VARCHAR(20);`,
    `ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_data_points INTEGER DEFAULT 0;`,
    `CREATE INDEX IF NOT EXISTS idx_pig_batches_weight_history ON pig_batches USING GIN (weight_history);`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON pig_batches TO anon, authenticated;`
  ];

  for (const sql of statements) {
    console.log(`Executing: ${sql.substring(0, 80)}...`);
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
      console.error(`  ❌ Error: ${error.message}`);
    } else {
      console.log(`  ✅ Success`);
    }
  }

  console.log('\n✅ Migration complete!');
  
  // Verify
  const { data, error } = await supabase.from('pig_batches').select('id, batch_code, weight_history, current_fcr, fcr_source').limit(1);
  if (error) {
    console.error('Verification error:', error.message);
  } else {
    console.log('Verification:', data);
  }
}

runMigration().catch(console.error);