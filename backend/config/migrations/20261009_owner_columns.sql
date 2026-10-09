-- Apply this migration in Supabase for existing deployments.
-- It repairs ownership columns that may be missing when the original schema
-- was applied before the security migration.

ALTER TABLE public.pig_batches
  ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE public.feed_records
  ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE public.vaccination_records
  ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE public.pigs
  ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE public.feed_stocks
  ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE public.vaccine_stocks
  ADD COLUMN IF NOT EXISTS owner_id UUID;

-- Backfill individual pigs from their owning batch where possible.
UPDATE public.pigs AS p
SET owner_id = b.owner_id
FROM public.pig_batches AS b
WHERE p.batch_id = b.id
  AND p.owner_id IS NULL
  AND b.owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pig_batches_owner
  ON public.pig_batches (owner_id);

CREATE INDEX IF NOT EXISTS idx_feed_records_owner
  ON public.feed_records (owner_id);

CREATE INDEX IF NOT EXISTS idx_vaccination_records_owner
  ON public.vaccination_records (owner_id);

CREATE INDEX IF NOT EXISTS idx_expenses_owner
  ON public.expenses (owner_id);

CREATE INDEX IF NOT EXISTS idx_pigs_owner
  ON public.pigs (owner_id);

CREATE INDEX IF NOT EXISTS idx_feed_stocks_owner
  ON public.feed_stocks (owner_id);

CREATE INDEX IF NOT EXISTS idx_vaccine_stocks_owner
  ON public.vaccine_stocks (owner_id);

CREATE INDEX IF NOT EXISTS idx_pigs_batch_owner
  ON public.pigs (batch_id, owner_id);
