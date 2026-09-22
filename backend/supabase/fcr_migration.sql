-- FCR & Weight History Migration
-- Run this in Supabase SQL Editor

-- Enable pgcrypto for gen_random_uuid if needed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add weight history tracking to pig_batches
ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS weight_history JSONB DEFAULT '[]'::jsonb;
-- Structure: [{date: "2026-09-15", weight: 45.5, source: "manual|auto_feed", notes: "..."}]

-- Add FCR tracking
ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS current_fcr DECIMAL(5,2);
ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_source VARCHAR(20) DEFAULT 'default'; -- 'default' | 'calculated' | 'manual'
ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_confidence VARCHAR(20); -- 'high' | 'medium' | 'low'
ALTER TABLE pig_batches ADD COLUMN IF NOT EXISTS fcr_data_points INTEGER DEFAULT 0;

-- Index for weight history queries
CREATE INDEX IF NOT EXISTS idx_pig_batches_weight_history ON pig_batches USING GIN (weight_history);

-- Grant permissions (adjust for your Supabase roles)
GRANT SELECT, INSERT, UPDATE, DELETE ON pig_batches TO anon, authenticated;