// Test script for /api/analytics endpoint
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testAnalytics() {
  try {
    // Test 1: Get batch counts
    const { count: totalBatches, error: batchesError } = await supabase
      .from('pig_batches')
      .select('*', { count: 'exact', head: true });
    
    if (batchesError) throw batchesError;
    console.log('✅ Total batches:', totalBatches);

    // Test 2: Get expenses
    const { data: expenses, error: expError } = await supabase
      .from('expenses')
      .select('amount');
    
    if (expError) throw expError;
    const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    console.log('✅ Total expenses:', totalExpenses);

    // Test 3: Get feed records count
    const { count: totalFeedRecords, error: feedError } = await supabase
      .from('feed_records')
      .select('*', { count: 'exact', head: true });
    
    if (feedError) throw feedError;
    console.log('✅ Total feed records:', totalFeedRecords);

    // Test 4: Get vaccination records count
    const { count: totalVaccinations, error: vacError } = await supabase
      .from('vaccination_records')
      .select('*', { count: 'exact', head: true });
    
    if (vacError) throw vacError;
    console.log('✅ Total vaccination records:', totalVaccinations);

    // Test 5: Get feed consumed
    const { data: feedRecords, error: frError } = await supabase
      .from('feed_records')
      .select('quantity_kg');
    
    if (frError) throw frError;
    const totalFeedConsumed = feedRecords.reduce((sum, r) => sum + Number(r.quantity_kg || 0), 0);
    console.log('✅ Total feed consumed:', totalFeedConsumed);

    console.log('\n🎯 All analytics data fetch tests passed!');
  } catch (err) {
    console.error('❌ Test failed:', err.message);
    process.exit(1);
  }
}

testAnalytics();