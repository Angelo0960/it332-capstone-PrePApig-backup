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

const supabaseUrl = process.env.SUPABASE_URL;
console.info('Supabase server client configured', {
  urlHost: new URL(supabaseUrl).host,
  keyRole: keyPayload.role,
  keyIssuer: keyPayload.iss || null,
});

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const supabaseAuthKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseAuthKey) {
  throw new Error('SUPABASE_ANON_KEY must be configured for Supabase password authentication');
}

export const supabaseAuth = createClient(supabaseUrl, supabaseAuthKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default supabase;