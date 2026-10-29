-- Restore the earlier FCR-based feed-to-weight behavior atomically.
-- Feed quantity is converted to batch weight gain using the batch's effective FCR,
-- then the same gain is added to each owner-scoped individual pig.
BEGIN;

ALTER TABLE public.pig_batches
    ADD COLUMN IF NOT EXISTS weight_history jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS current_fcr numeric,
    ADD COLUMN IF NOT EXISTS fcr_source text,
    ADD COLUMN IF NOT EXISTS fcr_confidence text,
    ADD COLUMN IF NOT EXISTS fcr_data_points integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.create_feed_record_with_weight_gain(
    p_owner_id uuid,
    p_feed jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_batch_id uuid := NULLIF(p_feed->>'batch_id', '')::uuid;
    v_feed_quantity numeric := NULLIF(p_feed->>'quantity_kg', '')::numeric;
    v_feed_type text := NULLIF(p_feed->>'feed_type', '');
    v_feeding_date date := NULLIF(p_feed->>'feeding_date', '')::date;
    v_fcr numeric;
    v_fcr_source text;
    v_fcr_confidence text;
    v_phase text;
    v_feed_row jsonb;
    v_batch_row jsonb;
    v_pig_count integer;
    v_previous_weight numeric;
    v_new_weight numeric;
    v_weight_gain numeric;
    v_weight_gain_per_pig numeric;
    v_history jsonb;
BEGIN
    IF p_owner_id IS NULL OR v_batch_id IS NULL OR v_feed_quantity IS NULL OR v_feed_quantity <= 0 THEN
        RAISE EXCEPTION 'Owner, batch, and a positive feed quantity are required';
    END IF;

    IF v_feed_type IS NULL OR v_feeding_date IS NULL THEN
        RAISE EXCEPTION 'Feed type and feeding date are required';
    END IF;

    SELECT current_weight,
           COALESCE(weight_history, '[]'::jsonb),
           current_fcr,
           fcr_source,
           fcr_confidence,
           CASE
               WHEN date_acquired IS NULL THEN 'Starter'
               WHEN floor((v_feeding_date - date_acquired) / 7.0) + 1 <= 4 THEN 'Starter'
               WHEN floor((v_feeding_date - date_acquired) / 7.0) + 1 <= 10 THEN 'Grower'
               WHEN floor((v_feeding_date - date_acquired) / 7.0) + 1 <= 15 THEN 'Finisher 1'
               ELSE 'Finisher 2'
           END
    INTO v_previous_weight, v_history, v_fcr, v_fcr_source, v_fcr_confidence, v_phase
    FROM public.pig_batches
    WHERE id = v_batch_id AND owner_id = p_owner_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found';
    END IF;

    v_previous_weight := COALESCE(v_previous_weight, 0);

    IF v_fcr_source = 'manual' AND v_fcr IS NOT NULL AND v_fcr > 0 THEN
        v_fcr_source := 'manual';
    ELSIF v_fcr_source = 'calculated' AND v_fcr IS NOT NULL AND v_fcr > 0 THEN
        v_fcr_source := 'calculated';
    ELSE
        v_fcr := CASE v_phase
            WHEN 'Starter' THEN 2.0
            WHEN 'Grower' THEN 2.8
            WHEN 'Finisher 1' THEN 2.5
            WHEN 'Finisher 2' THEN 2.5
            ELSE 2.8
        END;
        v_fcr_source := 'default';
        v_fcr_confidence := 'low';
    END IF;

    v_weight_gain := round((v_feed_quantity / v_fcr)::numeric, 2);

    SELECT count(*)::integer INTO v_pig_count
    FROM public.pigs
    WHERE batch_id = v_batch_id AND owner_id = p_owner_id;

    IF v_pig_count = 0 THEN
        RAISE EXCEPTION 'Batch has no individual pigs to update';
    END IF;

    v_weight_gain_per_pig := round((v_weight_gain / v_pig_count)::numeric, 2);
    v_new_weight := round((v_previous_weight + v_weight_gain_per_pig)::numeric, 2);

    INSERT INTO public.feed_records (
        owner_id, batch_id, feed_type, quantity_kg, feeding_date, feeding_time, notes
    )
    VALUES (
        p_owner_id, v_batch_id, v_feed_type, v_feed_quantity, v_feeding_date,
        p_feed->>'feeding_time', p_feed->>'notes'
    )
    RETURNING to_jsonb(feed_records.*) INTO v_feed_row;

    UPDATE public.pigs
    SET weight = round((COALESCE(weight, 0) + v_weight_gain_per_pig)::numeric, 2),
        updated_at = now()
    WHERE batch_id = v_batch_id AND owner_id = p_owner_id;

    SELECT round(avg(weight)::numeric, 2) INTO v_new_weight
    FROM public.pigs
    WHERE batch_id = v_batch_id AND owner_id = p_owner_id;

    v_history := v_history || jsonb_build_array(jsonb_build_object(
        'date', v_feeding_date::text,
        'weight', v_new_weight,
        'source', 'auto_feed',
        'notes', format('Auto-calculated from feed: %skg (FCR: %s, total gain: %skg, per pig: %skg)', v_feed_quantity, v_fcr, v_weight_gain, v_weight_gain_per_pig)
    ));

    UPDATE public.pig_batches
    SET current_weight = v_new_weight,
        weight_history = v_history,
        current_fcr = v_fcr,
        fcr_source = v_fcr_source,
        fcr_confidence = COALESCE(v_fcr_confidence, 'low'),
        fcr_data_points = COALESCE(fcr_data_points, 0) + 1
    WHERE id = v_batch_id AND owner_id = p_owner_id
    RETURNING to_jsonb(pig_batches.*) INTO v_batch_row;

    RETURN jsonb_build_object(
        'record', v_feed_row,
        'batch', v_batch_row,
        'weight_gain', v_weight_gain,
        'weight_gain_per_pig', v_weight_gain_per_pig,
        'fcr', v_fcr,
        'fcr_source', v_fcr_source,
        'phase', v_phase,
        'pig_count', v_pig_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_feed_record_with_weight_gain(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_feed_record_with_weight_gain(uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
