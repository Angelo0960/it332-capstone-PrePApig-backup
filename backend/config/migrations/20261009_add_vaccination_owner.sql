-- Apply this migration in the Supabase SQL editor for existing deployments.
ALTER TABLE public.vaccination_records
  ADD COLUMN IF NOT EXISTS owner_id UUID;

CREATE INDEX IF NOT EXISTS idx_vaccination_records_owner
  ON public.vaccination_records (owner_id);

CREATE INDEX IF NOT EXISTS idx_vaccination_records_owner_date
  ON public.vaccination_records (owner_id, vaccination_date DESC);
