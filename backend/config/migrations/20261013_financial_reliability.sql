-- Additive ledger: no sales or harvests inferred from existing batches.
CREATE TABLE IF NOT EXISTS public.harvest_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    batch_id UUID REFERENCES public.pig_batches(id) ON DELETE SET NULL,
    harvest_date DATE NOT NULL,
    pig_count INTEGER NOT NULL CHECK (pig_count > 0),
    total_weight_kg NUMERIC(12,2) NOT NULL CHECK (total_weight_kg > 0),
    sale_date DATE,
    revenue NUMERIC(14,2),
    buyer TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((sale_date IS NULL AND revenue IS NULL) OR
           (sale_date IS NOT NULL AND sale_date >= harvest_date AND revenue IS NOT NULL AND revenue >= 0))
);
CREATE INDEX IF NOT EXISTS harvest_sales_owner_date_idx ON public.harvest_sales(owner_id, sale_date);
ALTER TABLE public.harvest_sales ENABLE ROW LEVEL SECURITY;
-- Backend uses its service credential and enforces JWT ownership; no direct client grants.
REVOKE ALL ON public.harvest_sales FROM anon, authenticated;

GRANT ALL ON public.harvest_sales TO service_role;
