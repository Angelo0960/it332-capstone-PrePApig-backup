-- Optimize ownership-scoped financial queries and batch-code uniqueness.
-- Run after existing owner-column migrations.

ALTER TABLE public.pig_batches
    DROP CONSTRAINT IF EXISTS pig_batches_batch_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pig_batches_owner_batch_code
    ON public.pig_batches (owner_id, batch_code);

CREATE INDEX IF NOT EXISTS idx_expenses_owner_batch_date
    ON public.expenses (owner_id, batch_id, expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_feed_records_owner_batch_date
    ON public.feed_records (owner_id, batch_id, feeding_date DESC);

CREATE INDEX IF NOT EXISTS idx_vaccination_records_owner_batch_date
    ON public.vaccination_records (owner_id, batch_id, vaccination_date DESC);
