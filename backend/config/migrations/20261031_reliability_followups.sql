-- Reliability follow-up: atomic stock restocking and durable JWT sessions.
BEGIN;

CREATE OR REPLACE FUNCTION public.add_feed_stock(
    p_owner_id uuid,
    p_feed_type text,
    p_quantity numeric,
    p_unit_price numeric DEFAULT NULL,
    p_last_updated date DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row jsonb;
BEGIN
    IF p_owner_id IS NULL OR NULLIF(trim(p_feed_type), '') IS NULL OR p_quantity IS NULL OR p_quantity < 0 THEN
        RAISE EXCEPTION 'Owner, feed type, and a non-negative quantity are required';
    END IF;

    INSERT INTO public.feed_stocks (
        owner_id, feed_type, stock_quantity, unit_price, last_updated, notes, updated_at
    ) VALUES (
        p_owner_id, trim(p_feed_type), p_quantity, p_unit_price,
        COALESCE(p_last_updated, CURRENT_DATE), p_notes, now()
    )
    ON CONFLICT (owner_id, feed_type)
    DO UPDATE SET
        stock_quantity = public.feed_stocks.stock_quantity + EXCLUDED.stock_quantity,
        unit_price = COALESCE(EXCLUDED.unit_price, public.feed_stocks.unit_price),
        last_updated = COALESCE(EXCLUDED.last_updated, public.feed_stocks.last_updated),
        notes = COALESCE(EXCLUDED.notes, public.feed_stocks.notes),
        updated_at = now()
    RETURNING to_jsonb(feed_stocks.*) INTO v_row;

    RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_vaccine_stock(
    p_owner_id uuid,
    p_vaccine_name text,
    p_quantity numeric,
    p_expiry_date date DEFAULT NULL,
    p_price_per_dose numeric DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row jsonb;
BEGIN
    IF p_owner_id IS NULL OR NULLIF(trim(p_vaccine_name), '') IS NULL OR p_quantity IS NULL OR p_quantity < 0 THEN
        RAISE EXCEPTION 'Owner, vaccine name, and a non-negative quantity are required';
    END IF;

    INSERT INTO public.vaccine_stocks (
        owner_id, vaccine_name, stock_quantity, expiry_date, price_per_dose, notes, updated_at
    ) VALUES (
        p_owner_id, trim(p_vaccine_name), p_quantity, p_expiry_date,
        p_price_per_dose, p_notes, now()
    )
    ON CONFLICT (owner_id, vaccine_name)
    DO UPDATE SET
        stock_quantity = public.vaccine_stocks.stock_quantity + EXCLUDED.stock_quantity,
        expiry_date = COALESCE(EXCLUDED.expiry_date, public.vaccine_stocks.expiry_date),
        price_per_dose = COALESCE(EXCLUDED.price_per_dose, public.vaccine_stocks.price_per_dose),
        notes = COALESCE(EXCLUDED.notes, public.vaccine_stocks.notes),
        updated_at = now()
    RETURNING to_jsonb(vaccine_stocks.*) INTO v_row;

    RETURN v_row;
END;
$$;

CREATE TABLE IF NOT EXISTS public.session_tokens (
    jti uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_tokens_user_idx
    ON public.session_tokens(user_id);

CREATE INDEX IF NOT EXISTS session_tokens_expiry_idx
    ON public.session_tokens(expires_at);

REVOKE ALL ON public.session_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.session_tokens TO service_role;

REVOKE ALL ON FUNCTION public.add_feed_stock(uuid, text, numeric, numeric, date, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_feed_stock(uuid, text, numeric, numeric, date, text)
TO service_role;

REVOKE ALL ON FUNCTION public.add_vaccine_stock(uuid, text, numeric, date, numeric, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_vaccine_stock(uuid, text, numeric, date, numeric, text)
TO service_role;

COMMIT;
