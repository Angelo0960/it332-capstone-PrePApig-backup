#!/usr/bin/env node
/**
 * Add updated_at column to pig_batches via REST API
 */

import 'dotenv/config';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function addColumn() {
  const sql = `
    ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    
    -- Create index for weight history queries if not exists
    CREATE INDEX IF NOT EXISTS idx_pig_batches_weight_history ON pig_batches USING GIN (weight_history);
  `;

  console.log('Adding updated_at column to pig_batches...');
  
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

  // Verify by querying
  console.log('\nVerifying column exists...');
  const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/pig_batches?select=updated_at&limit=1`, {
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY
    }
  });
  
  if (verifyRes.ok) {
    console.log('✅ Column exists and accessible');
  } else {
    const err = await verifyRes.text();
    console.log('❌ Verify failed:', err);
    console.log('\nPlease run this SQL in Supabase Dashboard > SQL Editor:');
    console.log(sql);
  }
}

addColumn().catch(console.error);