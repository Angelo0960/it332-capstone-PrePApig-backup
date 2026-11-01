BEGIN;

CREATE TABLE IF NOT EXISTS public.vaccine_stock_lots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL,
    vaccine_name varchar(100) NOT NULL,
    stock_quantity numeric(10,2) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    expiry_date date,
    price_per_dose numeric(10,2),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vaccine_stock_lots_owner_name_expiry_idx
    ON public.vaccine_stock_lots (owner_id, vaccine_name, expiry_date NULLS LAST, created_at);

ALTER TABLE public.vaccine_stock_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vaccine_stock_lots_owner_policy ON public.vaccine_stock_lots;
CREATE POLICY vaccine_stock_lots_owner_policy ON public.vaccine_stock_lots
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

INSERT INTO public.vaccine_stock_lots (
    owner_id, vaccine_name, stock_quantity, expiry_date, price_per_dose, notes
)
SELECT owner_id, vaccine_name, stock_quantity, expiry_date, price_per_dose, notes
FROM public.vaccine_stocks
WHERE owner_id IS NOT NULL
  AND stock_quantity > 0
  AND NOT EXISTS (
      SELECT 1
      FROM public.vaccine_stock_lots lots
      WHERE lots.owner_id = vaccine_stocks.owner_id
        AND lots.vaccine_name = vaccine_stocks.vaccine_name
  );

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

    INSERT INTO public.vaccine_stock_lots (
        owner_id, vaccine_name, stock_quantity, expiry_date, price_per_dose, notes, updated_at
    ) VALUES (
        p_owner_id, trim(p_vaccine_name), p_quantity, p_expiry_date,
        p_price_per_dose, p_notes, now()
    ) RETURNING to_jsonb(vaccine_stock_lots.*) INTO v_row;

    INSERT INTO public.vaccine_stocks (
        owner_id, vaccine_name, stock_quantity, expiry_date, price_per_dose, notes, updated_at
    ) VALUES (
        p_owner_id, trim(p_vaccine_name), p_quantity, p_expiry_date,
        p_price_per_dose, p_notes, now()
    )
    ON CONFLICT (owner_id, vaccine_name)
    DO UPDATE SET
        stock_quantity = public.vaccine_stocks.stock_quantity + EXCLUDED.stock_quantity,
        expiry_date = CASE
            WHEN public.vaccine_stocks.expiry_date IS NULL THEN EXCLUDED.expiry_date
            WHEN EXCLUDED.expiry_date IS NULL THEN public.vaccine_stocks.expiry_date
            ELSE LEAST(public.vaccine_stocks.expiry_date, EXCLUDED.expiry_date)
        END,
        price_per_dose = COALESCE(EXCLUDED.price_per_dose, public.vaccine_stocks.price_per_dose),
        notes = COALESCE(EXCLUDED.notes, public.vaccine_stocks.notes),
        updated_at = now();

    RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_vaccination_with_stock(
    p_owner_id uuid,
    p_vaccination jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_batch_id uuid := NULLIF(p_vaccination->>'batch_id', '')::uuid;
    v_vaccine_name text := NULLIF(p_vaccination->>'vaccine_name', '');
    v_dosage numeric := COALESCE(NULLIF(p_vaccination->>'dosage', '')::numeric, 0);
    v_remaining numeric := v_dosage;
    v_available numeric;
    v_price numeric;
    v_cost numeric := 0;
    v_priced_quantity numeric := 0;
    v_record jsonb;
    v_stock_row jsonb;
    v_lot record;
    v_take numeric;
    v_consumed jsonb := '[]'::jsonb;
BEGIN
    IF p_owner_id IS NULL OR v_batch_id IS NULL OR v_vaccine_name IS NULL THEN
        RAISE EXCEPTION 'Owner, batch, and vaccine name are required';
    END IF;
    IF v_dosage < 0 THEN RAISE EXCEPTION 'Dosage cannot be negative'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.pig_batches
        WHERE id = v_batch_id AND owner_id = p_owner_id AND COALESCE(status, 'Active') = 'Active'
    ) THEN
        RAISE EXCEPTION 'Batch not found';
    END IF;

    SELECT COALESCE(SUM(stock_quantity), 0)
    INTO v_available
    FROM public.vaccine_stock_lots
    WHERE owner_id = p_owner_id
      AND vaccine_name = v_vaccine_name
      AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE);

    IF v_dosage > 0 AND v_available < v_dosage THEN
        RAISE EXCEPTION 'Insufficient unexpired vaccine stock for %: available %, requested %', v_vaccine_name, v_available, v_dosage;
    END IF;

    IF v_dosage > 0 THEN
        FOR v_lot IN
            SELECT * FROM public.vaccine_stock_lots
            WHERE owner_id = p_owner_id
              AND vaccine_name = v_vaccine_name
              AND stock_quantity > 0
              AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
            ORDER BY expiry_date NULLS LAST, created_at, id
            FOR UPDATE
        LOOP
            EXIT WHEN v_remaining <= 0;
            v_take := LEAST(v_remaining, v_lot.stock_quantity);
            UPDATE public.vaccine_stock_lots
            SET stock_quantity = stock_quantity - v_take, updated_at = now()
            WHERE id = v_lot.id;
            v_remaining := v_remaining - v_take;
            IF v_lot.price_per_dose IS NOT NULL THEN
                v_cost := v_cost + (v_take * v_lot.price_per_dose);
                v_priced_quantity := v_priced_quantity + v_take;
            END IF;
            v_consumed := v_consumed || jsonb_build_object(
                'lot_id', v_lot.id, 'quantity', v_take, 'expiry_date', v_lot.expiry_date,
                'price_per_dose', v_lot.price_per_dose
            );
        END LOOP;

        v_price := CASE WHEN v_priced_quantity = v_dosage THEN v_cost / v_dosage ELSE NULL END;

        UPDATE public.vaccine_stocks
        SET stock_quantity = stock_quantity - v_dosage,
            expiry_date = (
                SELECT MIN(expiry_date) FROM public.vaccine_stock_lots
                WHERE owner_id = p_owner_id AND vaccine_name = v_vaccine_name AND stock_quantity > 0
            ),
            updated_at = now()
        WHERE owner_id = p_owner_id AND vaccine_name = v_vaccine_name
        RETURNING to_jsonb(vaccine_stocks.*) INTO v_stock_row;
    END IF;

    INSERT INTO public.vaccination_records (
        owner_id, batch_id, vaccine_name, vaccination_date, next_due_date,
        administered_by, dosage, notes, status, price_per_dose_at_usage
    ) VALUES (
        p_owner_id, v_batch_id, v_vaccine_name,
        NULLIF(p_vaccination->>'vaccination_date', '')::date,
        NULLIF(p_vaccination->>'next_due_date', '')::date,
        p_vaccination->>'administered_by', p_vaccination->>'dosage',
        p_vaccination->>'notes', p_vaccination->>'status', v_price
    ) RETURNING to_jsonb(vaccination_records.*) INTO v_record;

    RETURN jsonb_build_object(
        'record', v_record,
        'vaccine_stock', v_stock_row,
        'consumed_lots', v_consumed,
        'remaining_stock_quantity', CASE WHEN v_stock_row IS NULL THEN v_available ELSE (v_stock_row->>'stock_quantity')::numeric END
    );
END;
$$;

REVOKE ALL ON public.vaccine_stock_lots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vaccine_stock_lots TO service_role;
REVOKE ALL ON FUNCTION public.add_vaccine_stock(uuid, text, numeric, date, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_vaccine_stock(uuid, text, numeric, date, numeric, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_vaccination_with_stock(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_vaccination_with_stock(uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
