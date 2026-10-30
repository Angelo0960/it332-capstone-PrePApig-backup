-- Repair permissions for the backend harvest/sales ledger.
-- Run this after 20261013_financial_reliability.sql in Supabase SQL Editor.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.harvest_sales TO service_role;

ALTER TABLE public.harvest_sales ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
