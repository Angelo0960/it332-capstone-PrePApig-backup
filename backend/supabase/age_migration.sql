-- Pig Age Migration
-- Run this in Supabase SQL Editor (safe to re-run).
--
-- Adds the age captured in the "Add New Batch" modal so it is no longer
-- discarded, and adds the `age` column on `pigs` that the controller
-- already reads/writes.

-- Age (in days) the pigs were when the batch was acquired.
-- The batch's current age is: age_on_acquisition + days since date_acquired
ALTER TABLE pig_batches
    ADD COLUMN IF NOT EXISTS age_on_acquisition INTEGER NOT NULL DEFAULT 0;

-- Age (in days) of an individual pig at the time it was recorded.
ALTER TABLE pigs
    ADD COLUMN IF NOT EXISTS age INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN pig_batches.age_on_acquisition IS 'Pig age in days on the acquisition date; current age = this + days since date_acquired';
COMMENT ON COLUMN pigs.age IS 'Pig age in days when the pig record was created';

-- Backfill any batches that already exist so the new column is never NULL.
UPDATE pig_batches SET age_on_acquisition = 0 WHERE age_on_acquisition IS NULL;

-- Grant permissions (adjust for your Supabase roles)
GRANT SELECT, INSERT, UPDATE, DELETE ON pig_batches TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pigs TO anon, authenticated;
