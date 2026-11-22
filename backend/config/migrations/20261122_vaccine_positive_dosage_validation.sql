-- Apply after 20261101_vaccine_stock_lots.sql.
-- Enforce whole positive dose counts and disallow vaccinations for empty batches
-- inside the stock-deduction transaction.
BEGIN;

ALTER TABLE public.vaccine_stock_lots
    ALTER COLUMN price_per_dose TYPE numeric(14,6);
ALTER TABLE public.vaccine_stocks
    ALTER COLUMN price_per_dose TYPE numeric(14,6);
ALTER TABLE public.vaccination_records
    ALTER COLUMN price_per_dose_at_usage TYPE numeric(14,6);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vaccination_records_dosage_positive_integer_check'
          AND conrelid = 'public.vaccination_records'::regclass
    ) THEN
        ALTER TABLE public.vaccination_records
            ADD CONSTRAINT vaccination_records_dosage_positive_integer_check
            CHECK (dosage IS NOT NULL AND dosage ~ '^([1-9]|[1-9][0-9]{1,3}|10000)$') NOT VALID;
    END IF;
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
    IF v_dosage <= 0 OR v_dosage <> trunc(v_dosage) OR v_dosage > 10000 THEN
        RAISE EXCEPTION 'Dosage must be a positive whole number from 1 to 10000';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.pig_batches
        WHERE id = v_batch_id AND owner_id = p_owner_id AND COALESCE(status, 'Active') = 'Active'
    ) THEN
        RAISE EXCEPTION 'Batch not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pigs WHERE batch_id = v_batch_id) THEN
        RAISE EXCEPTION 'Cannot record vaccination for batch with no pigs';
    END IF;

    SELECT COALESCE(SUM(stock_quantity), 0)
    INTO v_available
    FROM public.vaccine_stock_lots
    WHERE owner_id = p_owner_id
      AND vaccine_name = v_vaccine_name
      AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE);

    IF v_available < v_dosage THEN
        RAISE EXCEPTION 'Insufficient unexpired vaccine stock for %: available %, requested %', v_vaccine_name, v_available, v_dosage;
    END IF;

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

    INSERT INTO public.vaccination_records (
        owner_id, batch_id, vaccine_name, vaccination_date, next_due_date,
        administered_by, dosage, notes, status, price_per_dose_at_usage
    ) VALUES (
        p_owner_id, v_batch_id, v_vaccine_name,
        NULLIF(p_vaccination->>'vaccination_date', '')::date,
        NULLIF(p_vaccination->>'next_due_date', '')::date,
        p_vaccination->>'administered_by', (v_dosage::bigint)::text,
        p_vaccination->>'notes', p_vaccination->>'status', v_price
    ) RETURNING to_jsonb(vaccination_records.*) INTO v_record;

    RETURN jsonb_build_object(
        'record', v_record,
        'vaccine_stock', v_stock_row,
        'consumed_lots', v_consumed,
        'remaining_stock_quantity', (v_stock_row->>'stock_quantity')::numeric
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_vaccination_with_stock(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_vaccination_with_stock(uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
