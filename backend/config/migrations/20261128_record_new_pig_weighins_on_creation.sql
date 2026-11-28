-- Record a pig's first observed weight on the date it is added. Only use the
-- acquisition date/weight for a historical baseline when that source is known.
BEGIN;

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
    v_old_weight numeric;
    v_pig jsonb;
    v_batch jsonb;
    v_count integer;
    v_average numeric;
    v_age_on_acquisition integer;
    v_date_acquired date;
    v_weigh_in_date date := CURRENT_DATE;
    v_age_days integer;
BEGIN
    IF p_owner_id IS NULL OR p_action IS NULL OR p_action NOT IN ('create', 'update', 'delete') THEN
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
    SELECT age_on_acquisition, COALESCE(date_acquired, created_at::date)
      INTO v_age_on_acquisition, v_date_acquired
      FROM public.pig_batches
     WHERE id = v_batch_id AND owner_id = p_owner_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found'; END IF;

    v_age_days := GREATEST(
        0,
        COALESCE(v_age_on_acquisition, 0)
            + (v_weigh_in_date - COALESCE(v_date_acquired, v_weigh_in_date))
    );

    IF p_action = 'create' THEN
        INSERT INTO public.pigs (batch_id, owner_id, weight, health_status, notes)
        VALUES (
            v_batch_id, p_owner_id,
            (p_pig->>'weight')::numeric,
            COALESCE(NULLIF(p_pig->>'health_status', ''), 'Healthy'),
            p_pig->>'notes'
        ) RETURNING to_jsonb(pigs.*) INTO v_pig;

        INSERT INTO public.pig_weight_history (
            pig_id, owner_id, weigh_in_date, age_days, recorded_weight, is_baseline, created_at
        ) VALUES (
            (v_pig->>'id')::uuid,
            p_owner_id,
            v_weigh_in_date,
            v_age_days,
            (p_pig->>'weight')::numeric,
            false,
            now()
        );
    ELSIF p_action = 'update' THEN
        SELECT batch_id, weight INTO v_existing_batch_id, v_old_weight
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

        IF p_pig ? 'weight' AND (p_pig->>'weight')::numeric IS DISTINCT FROM v_old_weight THEN
            INSERT INTO public.pig_weight_history (
                pig_id, owner_id, weigh_in_date, age_days, recorded_weight, is_baseline
            ) VALUES (
                p_pig_id,
                p_owner_id,
                v_weigh_in_date,
                v_age_days,
                (p_pig->>'weight')::numeric,
                false
            );
        END IF;
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
