-- Make sale ledger/status changes and pig/batch aggregate changes atomic.
-- Run in Supabase SQL Editor after existing PrepAPig migrations.
BEGIN;

CREATE OR REPLACE FUNCTION public.mutate_harvest_sale(
    p_owner_id uuid,
    p_action text,
    p_sale_id uuid,
    p_sale jsonb,
    p_close_batch boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sale jsonb;
    v_old_batch_id uuid;
    v_new_batch_id uuid;
    v_batch_id uuid;
    v_batch_closed boolean := false;
BEGIN
    IF p_owner_id IS NULL OR p_action NOT IN ('create', 'update', 'delete') THEN
        RAISE EXCEPTION 'Invalid sale mutation';
    END IF;

    IF p_action IN ('update', 'delete') THEN
        IF p_sale_id IS NULL THEN RAISE EXCEPTION 'Sale ID is required'; END IF;
        SELECT s.batch_id
          INTO v_old_batch_id
          FROM public.harvest_sales s
         WHERE s.id = p_sale_id AND s.owner_id = p_owner_id
         FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Harvest/sale not found'; END IF;
    END IF;

    IF p_action <> 'delete' THEN
        IF p_sale IS NULL OR NULLIF(p_sale->>'batch_id', '') IS NULL THEN
            RAISE EXCEPTION 'Batch is required';
        END IF;
        v_new_batch_id := (p_sale->>'batch_id')::uuid;
    END IF;

    -- Lock all involved owner-scoped batches in a stable order to serialize status changes.
    FOR v_batch_id IN
        SELECT DISTINCT candidate
          FROM unnest(ARRAY[v_old_batch_id, v_new_batch_id]) AS candidates(candidate)
         WHERE candidate IS NOT NULL
         ORDER BY candidate
    LOOP
        PERFORM 1 FROM public.pig_batches
         WHERE id = v_batch_id AND owner_id = p_owner_id
         FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;
    END LOOP;

    IF p_action = 'create' THEN
        INSERT INTO public.harvest_sales (
            owner_id, batch_id, harvest_date, pig_count, total_weight_kg,
            sale_date, revenue, buyer, notes
        ) VALUES (
            p_owner_id, v_new_batch_id,
            NULLIF(p_sale->>'harvest_date', '')::date,
            NULLIF(p_sale->>'pig_count', '')::integer,
            NULLIF(p_sale->>'total_weight_kg', '')::numeric,
            NULLIF(p_sale->>'sale_date', '')::date,
            NULLIF(p_sale->>'revenue', '')::numeric,
            p_sale->>'buyer', p_sale->>'notes'
        ) RETURNING to_jsonb(harvest_sales.*) INTO v_sale;
    ELSIF p_action = 'update' THEN
        UPDATE public.harvest_sales
           SET batch_id = v_new_batch_id,
               harvest_date = NULLIF(p_sale->>'harvest_date', '')::date,
               pig_count = NULLIF(p_sale->>'pig_count', '')::integer,
               total_weight_kg = NULLIF(p_sale->>'total_weight_kg', '')::numeric,
               sale_date = NULLIF(p_sale->>'sale_date', '')::date,
               revenue = NULLIF(p_sale->>'revenue', '')::numeric,
               buyer = p_sale->>'buyer',
               notes = p_sale->>'notes'
         WHERE id = p_sale_id AND owner_id = p_owner_id
         RETURNING to_jsonb(harvest_sales.*) INTO v_sale;
        IF NOT FOUND THEN RAISE EXCEPTION 'Harvest/sale not found'; END IF;
    ELSE
        DELETE FROM public.harvest_sales
         WHERE id = p_sale_id AND owner_id = p_owner_id
         RETURNING to_jsonb(harvest_sales.*) INTO v_sale;
        IF NOT FOUND THEN RAISE EXCEPTION 'Harvest/sale not found'; END IF;
    END IF;

    -- Reconcile both the previous and current batch against the committed ledger state.
    FOR v_batch_id IN
        SELECT DISTINCT candidate
          FROM unnest(ARRAY[v_old_batch_id, v_new_batch_id]) AS candidates(candidate)
         WHERE candidate IS NOT NULL
         ORDER BY candidate
    LOOP
        UPDATE public.pig_batches b
           SET status = CASE
               WHEN v_batch_id = v_new_batch_id AND p_close_batch THEN 'Sold'
               WHEN EXISTS (
                   SELECT 1 FROM public.harvest_sales s
                    WHERE s.owner_id = p_owner_id AND s.batch_id = v_batch_id
                      AND s.sale_date IS NOT NULL AND s.revenue IS NOT NULL
               ) THEN 'Sold'
               WHEN b.status = 'Sold' THEN 'Active'
               ELSE b.status
           END
         WHERE b.id = v_batch_id AND b.owner_id = p_owner_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Batch status could not be reconciled'; END IF;
    END LOOP;

    IF v_new_batch_id IS NOT NULL THEN
        SELECT status = 'Sold' INTO v_batch_closed
          FROM public.pig_batches
         WHERE id = v_new_batch_id AND owner_id = p_owner_id;
    END IF;

    RETURN jsonb_build_object(
        'sale', v_sale,
        'batch_deleted', false,
        'batch_closed', COALESCE(v_batch_closed, false)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_harvest_sale(uuid, text, uuid, jsonb, boolean)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_harvest_sale(uuid, text, uuid, jsonb, boolean)
TO service_role;

CREATE OR REPLACE FUNCTION public.mutate_pig_and_sync_batch(
    p_owner_id uuid,
    p_action text,
    p_pig_id uuid,
    p_pig jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_batch_id uuid;
    v_existing_batch_id uuid;
    v_pig jsonb;
    v_batch jsonb;
    v_count integer;
    v_average numeric;
BEGIN
    IF p_owner_id IS NULL OR p_action NOT IN ('create', 'update', 'delete') THEN
        RAISE EXCEPTION 'Invalid pig mutation';
    END IF;

    IF p_action = 'create' THEN
        IF p_pig IS NULL OR NULLIF(p_pig->>'batch_id', '') IS NULL
           OR NULLIF(p_pig->>'weight', '') IS NULL THEN
            RAISE EXCEPTION 'Batch ID and weight are required';
        END IF;
        v_batch_id := (p_pig->>'batch_id')::uuid;
    ELSE
        IF p_pig_id IS NULL THEN RAISE EXCEPTION 'Pig ID is required'; END IF;
        SELECT batch_id INTO v_batch_id
          FROM public.pigs
         WHERE id = p_pig_id AND owner_id = p_owner_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pig not found'; END IF;
    END IF;

    -- Serialize all pig mutations for this batch before writing or recalculating.
    PERFORM 1 FROM public.pig_batches
     WHERE id = v_batch_id AND owner_id = p_owner_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;

    IF p_action = 'create' THEN
        INSERT INTO public.pigs (batch_id, owner_id, weight, health_status, notes)
        VALUES (
            v_batch_id, p_owner_id,
            (p_pig->>'weight')::numeric,
            COALESCE(NULLIF(p_pig->>'health_status', ''), 'Healthy'),
            p_pig->>'notes'
        ) RETURNING to_jsonb(pigs.*) INTO v_pig;
    ELSIF p_action = 'update' THEN
        SELECT batch_id INTO v_existing_batch_id
          FROM public.pigs
         WHERE id = p_pig_id AND owner_id = p_owner_id
         FOR UPDATE;
        IF NOT FOUND OR v_existing_batch_id <> v_batch_id THEN RAISE EXCEPTION 'Pig not found'; END IF;
        UPDATE public.pigs
           SET weight = CASE WHEN p_pig ? 'weight' THEN (p_pig->>'weight')::numeric ELSE weight END,
               health_status = CASE WHEN p_pig ? 'health_status' THEN p_pig->>'health_status' ELSE health_status END,
               notes = CASE WHEN p_pig ? 'notes' THEN p_pig->>'notes' ELSE notes END,
               updated_at = NOW()
         WHERE id = p_pig_id AND owner_id = p_owner_id
         RETURNING to_jsonb(pigs.*) INTO v_pig;
    ELSE
        DELETE FROM public.pigs
         WHERE id = p_pig_id AND owner_id = p_owner_id
         RETURNING to_jsonb(pigs.*) INTO v_pig;
        IF NOT FOUND THEN RAISE EXCEPTION 'Pig not found'; END IF;
    END IF;

    SELECT COUNT(*)::integer, COALESCE(AVG(weight), 0)
      INTO v_count, v_average
      FROM public.pigs
     WHERE batch_id = v_batch_id AND owner_id = p_owner_id;

    UPDATE public.pig_batches
       SET current_weight = ROUND(v_average, 2), pig_count = v_count
     WHERE id = v_batch_id AND owner_id = p_owner_id
     RETURNING to_jsonb(pig_batches.*) INTO v_batch;
    IF NOT FOUND THEN RAISE EXCEPTION 'Batch aggregates could not be synchronized'; END IF;

    RETURN jsonb_build_object('pig', v_pig, 'batch', v_batch);
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_pig_and_sync_batch(uuid, text, uuid, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_pig_and_sync_batch(uuid, text, uuid, jsonb)
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
