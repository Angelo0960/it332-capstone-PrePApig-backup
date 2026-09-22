#!/usr/bin/env node
/**
 * Backfill individual pigs for batches missing them
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfillPigs() {
  console.log('🔄 Backfilling pigs for batches with 0 pigs...\n');
  
  const {data: batches} = await supabase.from('pig_batches').select('*').order('created_at');
  
  for (const batch of batches) {
    const {data: existingPigs} = await supabase.from('pigs').select('id').eq('batch_id', batch.id);
    const existingCount = existingPigs?.length || 0;
    
    if (existingCount === 0 && batch.pig_count > 0) {
      console.log(`📦 ${batch.batch_code}: Creating ${batch.pig_count} pigs...`);
      
      const avgWeight = batch.current_weight ? batch.current_weight / batch.pig_count : (batch.start_weight || 1.4);
      
      const pigs = [];
      for (let i = 0; i < batch.pig_count; i++) {
        pigs.push({
          batch_id: batch.id,
          weight: avgWeight,
          health_status: 'Healthy',
          notes: `Auto‑generated on batch creation (breed: ${batch.breed || 'Unknown'})`,
        });
      }
      
      const { error } = await supabase.from('pigs').insert(pigs);
      
      if (error) {
        console.log(`  ❌ Error: ${error.message}`);
      } else {
        console.log(`  ✅ Created ${pigs.length} pigs at ${avgWeight.toFixed(2)}kg each`);
      }
    } else if (existingCount > 0) {
      console.log(`  ✅ ${batch.batch_code}: Already has ${existingCount} pigs`);
    } else {
      console.log(`  ⏭️  ${batch.batch_code}: pig_count=0, skipping`);
    }
  }
  
  // Verify
  console.log('\n=== VERIFICATION ===');
  const {data: verifyBatches} = await supabase.from('pig_batches').select('id, batch_code, pig_count').order('created_at');
  for (const b of verifyBatches) {
    const {data: pigs} = await supabase.from('pigs').select('id').eq('batch_id', b.id);
    const count = pigs?.length || 0;
    const status = count === b.pig_count ? '✅' : (count === 0 ? '❌ EMPTY' : '⚠️ MISMATCH');
    console.log(`  ${b.batch_code}: ${count}/${b.pig_count} pigs ${status}`);
  }
  
  console.log('\n✅ Backfill complete!');
}

backfillPigs().catch(console.error);