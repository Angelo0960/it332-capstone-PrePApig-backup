-- Repair vaccine-stock upsert support for existing Supabase deployments.
-- Run after 20261010_vaccine_stock_owner.sql.

ALTER TABLE public.vaccine_stocks
  ADD COLUMN IF NOT EXISTS owner_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS vaccine_stocks_owner_name_unique_idx
  ON public.vaccine_stocks (owner_id, vaccine_name);

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vaccine_stocks TO service_role;

NOTIFY pgrst, 'reload schema';
