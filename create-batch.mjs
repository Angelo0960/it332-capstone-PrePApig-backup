const API_BASE = 'http://localhost:5000';

async function main() {
  // 1. Register a test user
  console.log('Registering test user...');
  const registerRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@test.com', password: 'test123' })
  });
  
  const registerData = await registerRes.json();
  console.log('Register result:', registerData);
  
  if (!registerData.user) {
    console.log('User might already exist, trying login...');
  }
  
  // 2. Login with test user
  console.log('\nLogging in...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test@test.com', password: 'test123' })
  });
  
  const loginData = await loginRes.json();
  if (!loginData.token) {
    console.error('Login failed:', loginData);
    return;
  }
  
  const token = loginData.token;
  console.log('Login successful, user ID:', loginData.farmer?.id);
  
  // 3. Create batch
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
  
  console.log('\nCreating batch...');
  
  const batchRes = await fetch(`${API_BASE}/pigs/create`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(batchData)
  });
  
  const batchResult = await batchRes.json();
  console.log('\nBatch creation result:', JSON.stringify(batchResult, null, 2));
  
  if (batchResult.success) {
    console.log('\n✅ Batch created successfully!');
    console.log('Batch ID:', batchResult.data.id);
    console.log('Batch Code:', batchResult.data.batch_code);
    console.log('Date Acquired:', batchResult.data.date_acquired);
    console.log('Pig Count:', batchResult.data.pig_count);
    console.log('Breed:', batchResult.data.breed);
    console.log('Start Weight:', batchResult.data.start_weight);
    console.log('Current Weight:', batchResult.data.current_weight);
  } else {
    console.error('❌ Batch creation failed:', batchResult);
  }
}

main().catch(console.error);