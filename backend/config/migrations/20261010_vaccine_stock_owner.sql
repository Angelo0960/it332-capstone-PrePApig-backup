-- Apply this migration in the Supabase SQL editor for existing deployments
-- where vaccine stock queries report a missing owner_id column.
ALTER TABLE public.vaccine_stocks
  ADD COLUMN IF NOT EXISTS owner_id UUID;

CREATE INDEX IF NOT EXISTS idx_vaccine_stocks_owner
  ON public.vaccine_stocks (owner_id);

CREATE INDEX IF NOT EXISTS idx_vaccine_stocks_owner_name
  ON public.vaccine_stocks (owner_id, vaccine_name);
