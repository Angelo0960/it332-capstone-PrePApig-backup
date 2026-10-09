import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!process.env.SUPABASE_URL || !supabaseKey) {
  throw new Error('Supabase environment variables are not configured');
}

const supabase = createClient(process.env.SUPABASE_URL, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export default supabase;