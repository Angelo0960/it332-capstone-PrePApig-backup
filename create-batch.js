const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function createBatch() {
  const API_BASE = 'http://localhost:5000';
  
  // 1. Login as admin
  console.log('Logging in as admin...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin', password: 'admin' })
  });
  
  const loginData = await loginRes.json();
  if (!loginData.token) {
    console.error('Login failed:', loginData);
    return;
  }
  
  const token = loginData.token;
  console.log('Login successful, token:', token.substring(0, 20) + '...');
  
  // 2. Create batch
  const today = new Date().toISOString().split('T')[0];
  const batchData = {
    batch_code: `BATCH-${Date.now().toString().slice(-6)}`,
    pig_count: 25,
    breed: 'Landrace',
    start_weight: 1.4,
    current_weight: 1.4,
    date_acquired: today,
    status: 'Active'
  };
  
  console.log('Creating batch with data:', batchData);
  
  const batchRes = await fetch(`${API_BASE}/pigs/create`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(batchData)
  });
  
  const batchData2 = await batchRes.json();
  console.log('Batch creation result:', JSON.stringify(batchData2, null, 2));
  
  if (batchData2.success) {
    console.log('\n✅ Batch created successfully!');
    console.log('Batch ID:', batchData2.data.id);
    console.log('Batch Code:', batchData2.data.batch_code);
    console.log('Date Acquired:', batchData2.data.date_acquired);
    console.log('Pig Count:', batchData2.data.pig_count);
    console.log('Breed:', batchData2.data.breed);
  } else {
    console.error('❌ Batch creation failed:', batchData2);
  }
}

createBatch().catch(console.error);