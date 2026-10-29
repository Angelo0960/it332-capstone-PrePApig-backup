-- Repair migration for deployments where the Phase 1 migration was skipped or aborted.
-- Run this in the Supabase SQL Editor before using Add Batch.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_batch_with_pigs(p_owner_id uuid, p_batch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    new_batch public.pig_batches%ROWTYPE;
    pig_total integer := (p_batch->>'pig_count')::integer;
BEGIN
    IF p_owner_id IS NULL OR pig_total IS NULL OR pig_total < 0 OR pig_total > 10000 THEN
        RAISE EXCEPTION 'Invalid owner or pig count';
    END IF;

    INSERT INTO public.pig_batches (
        owner_id,
        batch_code,
        pig_count,
        breed,
        start_weight,
        current_weight,
        sale_price_per_kg,
        age_on_acquisition,
        date_acquired,
        status
    )
    VALUES (
        p_owner_id,
        p_batch->>'batch_code',
        pig_total,
        p_batch->>'breed',
        (p_batch->>'start_weight')::numeric,
        (p_batch->>'current_weight')::numeric,
        (p_batch->>'sale_price_per_kg')::numeric,
        COALESCE((p_batch->>'age_on_acquisition')::integer, 0),
        (p_batch->>'date_acquired')::date,
        COALESCE(p_batch->>'status', 'Active')
    )
    RETURNING * INTO new_batch;

    INSERT INTO public.pigs (batch_id, owner_id, weight, health_status, notes)
    SELECT
        new_batch.id,
        p_owner_id,
        COALESCE(new_batch.current_weight, 0) / NULLIF(pig_total, 0),
        'Healthy',
        'Auto-generated on batch creation'
    FROM generate_series(1, pig_total);

    RETURN to_jsonb(new_batch);
END;
$$;

REVOKE ALL ON FUNCTION public.create_batch_with_pigs(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_batch_with_pigs(uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
