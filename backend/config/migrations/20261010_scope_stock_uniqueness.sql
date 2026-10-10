-- Existing deployments may still have global uniqueness constraints on stock names.
-- Stock is owned data, so the uniqueness scope must include owner_id.
ALTER TABLE public.feed_stocks
  DROP CONSTRAINT IF EXISTS feed_stocks_feed_type_key;

ALTER TABLE public.vaccine_stocks
  DROP CONSTRAINT IF EXISTS vaccine_stocks_vaccine_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_stocks_owner_type
  ON public.feed_stocks (owner_id, feed_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vaccine_stocks_owner_name
  ON public.vaccine_stocks (owner_id, vaccine_name);