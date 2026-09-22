import 'dotenv/config';
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://vhinqhqgxljchdurlbqx.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoaW5xaHFneGxqY2hkdXJsYnF4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTY2MzMwNiwiZXhwIjoyMDk3MjM5MzA2fQ.FIXED_KEY_NEEDED';

const sql = `
-- FCR & Weight History Migration
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS weight_history JSONB DEFAULT '[]'::jsonb;
ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS current_fcr DECIMAL(5,2);
ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_source VARCHAR(20) DEFAULT 'default';
ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_confidence VARCHAR(20);
ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_data_points INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_pig_batches_weight_history ON pig_batches USING GIN (weight_history);
GRANT SELECT, INSERT, UPDATE, DELETE ON pig_batches TO anon, authenticated;
`;

async function runMigration() {
  console.log('🔄 Running FCR migration via REST API...\n');
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY
    },
    body: JSON.stringify({ sql })
  });

  const result = await response.text();
  console.log('Response:', response.status, result);
}

runMigration().catch(console.error);