CREATE TABLE IF NOT EXISTS public.pig_market_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality text NOT NULL,
  province text NOT NULL DEFAULT 'Batangas',
  price_min numeric(10,2),
  price_max numeric(10,2),
  price_average numeric(10,2),
  price_type text NOT NULL DEFAULT 'liveweight/farmgate',
  unit text NOT NULL DEFAULT 'PHP/kg liveweight',
  source_name text NOT NULL,
  source_url text NOT NULL,
  search_query text,
  observed_date date,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  verification_status text NOT NULL DEFAULT 'unverified',
  evidence text,
  provider text,
  raw_observation jsonb NOT NULL DEFAULT '{}'::jsonb,
  observation_key text GENERATED ALWAYS AS (
    municipality || '|' || source_url || '|' || COALESCE(observed_date::text, 'unavailable') || '|' ||
    COALESCE(price_min::text, 'unavailable') || '|' || COALESCE(price_max::text, 'unavailable') || '|' || price_type
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pig_market_prices_nonnegative CHECK (
    (price_min IS NULL OR price_min >= 0) AND
    (price_max IS NULL OR price_max >= 0) AND
    (price_average IS NULL OR price_average >= 0)
  ),
  CONSTRAINT pig_market_prices_range_valid CHECK (
    price_min IS NULL OR price_max IS NULL OR price_min <= price_max
  ),
  CONSTRAINT pig_market_prices_verification_valid CHECK (
    verification_status IN ('verified', 'partially_verified', 'unverified', 'unavailable')
  )
);

CREATE INDEX IF NOT EXISTS pig_market_prices_municipality_date_idx
  ON public.pig_market_prices (municipality, observed_date DESC, retrieved_at DESC);

CREATE INDEX IF NOT EXISTS pig_market_prices_observed_date_idx
  ON public.pig_market_prices (observed_date DESC, retrieved_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS pig_market_prices_observation_unique_idx
  ON public.pig_market_prices (observation_key);

ALTER TABLE public.pig_market_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pig_market_prices_read_authenticated ON public.pig_market_prices;
CREATE POLICY pig_market_prices_read_authenticated
  ON public.pig_market_prices FOR SELECT
  TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.pig_market_prices FROM anon, authenticated;
GRANT SELECT ON public.pig_market_prices TO authenticated;
GRANT ALL ON public.pig_market_prices TO service_role;

CREATE OR REPLACE FUNCTION public.set_pig_market_prices_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pig_market_prices_updated_at ON public.pig_market_prices;
CREATE TRIGGER pig_market_prices_updated_at
  BEFORE UPDATE ON public.pig_market_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_pig_market_prices_updated_at();
