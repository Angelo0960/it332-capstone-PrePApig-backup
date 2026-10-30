-- Repair permissions and cleanup behavior for the backend harvest/sales ledger.
-- Run this after 20261013_financial_reliability.sql in Supabase SQL Editor.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.harvest_sales TO service_role;

ALTER TABLE public.harvest_sales
    ALTER COLUMN batch_id DROP NOT NULL;

ALTER TABLE public.harvest_sales
    DROP CONSTRAINT IF EXISTS harvest_sales_batch_id_fkey;

ALTER TABLE public.harvest_sales
    ADD CONSTRAINT harvest_sales_batch_id_fkey
    FOREIGN KEY (batch_id) REFERENCES public.pig_batches(id) ON DELETE SET NULL;

ALTER TABLE public.harvest_sales ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
