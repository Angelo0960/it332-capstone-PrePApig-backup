import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.env.SUPABASE_URL || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured; the backend cannot use SUPABASE_ANON_KEY for server operations');
}

const decodeJwtPayload = (token) => {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

const keyPayload = decodeJwtPayload(supabaseKey);
if (keyPayload?.role !== 'service_role') {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is not a service_role JWT; update the deployed backend environment variable without logging the key');
}

const supabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default supabase;