-- Record feed usage and distribute the recorded feed quantity equally
-- across the batch's individual pigs in one database transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_feed_record_with_weight_gain(
    p_owner_id uuid,
    p_feed jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_batch_id uuid := NULLIF(p_feed->>'batch_id', '')::uuid;
    feed_quantity numeric := (p_feed->>'quantity_kg')::numeric;
    pig_total integer;
    weight_gain_per_pig numeric := 0;
    feed_row jsonb;
    batch_row jsonb;
BEGIN
    IF p_owner_id IS NULL OR v_batch_id IS NULL OR feed_quantity IS NULL OR feed_quantity <= 0 THEN
        RAISE EXCEPTION 'Owner, batch, and a positive feed quantity are required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.pig_batches
        WHERE id = v_batch_id AND owner_id = p_owner_id
    ) THEN
        RAISE EXCEPTION 'Batch not found';
    END IF;

    INSERT INTO public.feed_records (
        owner_id,
        batch_id,
        feed_type,
        quantity_kg,
        feeding_date,
        feeding_time,
        notes
    )
    VALUES (
        p_owner_id,
        v_batch_id,
        p_feed->>'feed_type',
        feed_quantity,
        (p_feed->>'feeding_date')::date,
        p_feed->>'feeding_time',
        p_feed->>'notes'
    )
    RETURNING to_jsonb(feed_records.*) INTO feed_row;

    SELECT count(*)::integer INTO pig_total
    FROM public.pigs
    WHERE batch_id = v_batch_id
      AND owner_id = p_owner_id;

    IF pig_total > 0 THEN
        weight_gain_per_pig := feed_quantity / pig_total;

        UPDATE public.pigs
        SET weight = weight + weight_gain_per_pig,
            updated_at = now()
        WHERE batch_id = v_batch_id
          AND owner_id = p_owner_id;

        UPDATE public.pig_batches
        SET current_weight = (
            SELECT round(avg(weight)::numeric, 2)
            FROM public.pigs
            WHERE batch_id = v_batch_id
              AND owner_id = p_owner_id
        )
        WHERE id = v_batch_id
          AND owner_id = p_owner_id;
    END IF;

    SELECT to_jsonb(pig_batches.*) INTO batch_row
    FROM public.pig_batches
    WHERE id = v_batch_id
      AND owner_id = p_owner_id;

    RETURN jsonb_build_object(
        'record', feed_row,
        'batch', batch_row,
        'weight_gain_per_pig', weight_gain_per_pig,
        'pig_count', pig_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_feed_record_with_weight_gain(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_feed_record_with_weight_gain(uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
