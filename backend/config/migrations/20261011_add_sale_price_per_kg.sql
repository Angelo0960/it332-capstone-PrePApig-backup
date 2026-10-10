ALTER TABLE public.pig_batches
  ADD COLUMN IF NOT EXISTS sale_price_per_kg NUMERIC(10,2);
