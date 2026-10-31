-- Insert the sale ledger row and delete the sold batch in one transaction.
-- Run in Supabase SQL Editor after the harvest_sales migrations.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_harvest_sale_and_delete_batch(
    p_owner_id uuid,
    p_sale jsonb,
    p_delete_batch boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_batch_id uuid := NULLIF(p_sale->>'batch_id', '')::uuid;
    v_sale jsonb;
    v_batch jsonb;
BEGIN
    IF p_owner_id IS NULL OR v_batch_id IS NULL THEN
        RAISE EXCEPTION 'Owner and batch are required';
    END IF;

    -- Lock the owner-scoped batch before writing the ledger.
    SELECT to_jsonb(pig_batches.*)
    INTO v_batch
    FROM public.pig_batches
    WHERE id = v_batch_id
      AND owner_id = p_owner_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found';
    END IF;

    INSERT INTO public.harvest_sales (
        owner_id,
        batch_id,
        harvest_date,
        pig_count,
        total_weight_kg,
        sale_date,
        revenue,
        buyer,
        notes
    )
    VALUES (
        p_owner_id,
        v_batch_id,
        NULLIF(p_sale->>'harvest_date', '')::date,
        NULLIF(p_sale->>'pig_count', '')::integer,
        NULLIF(p_sale->>'total_weight_kg', '')::numeric,
        NULLIF(p_sale->>'sale_date', '')::date,
        NULLIF(p_sale->>'revenue', '')::numeric,
        p_sale->>'buyer',
        p_sale->>'notes'
    )
    RETURNING to_jsonb(harvest_sales.*)
    INTO v_sale;

    IF p_delete_batch THEN
        -- Retain the batch as a historical record. Active-batch queries exclude Sold.
        UPDATE public.pig_batches
        SET status = 'Sold'
        WHERE id = v_batch_id
          AND owner_id = p_owner_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Batch could not be marked as sold';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'sale', v_sale,
        'batch', v_batch,
        'batch_deleted', false,
        'batch_closed', p_delete_batch
    );
END;
$$;

REVOKE ALL ON FUNCTION
    public.create_harvest_sale_and_delete_batch(uuid, jsonb, boolean)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.create_harvest_sale_and_delete_batch(uuid, jsonb, boolean)
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
