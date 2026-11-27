-- Preserve individual-pig weigh-ins separately from the batch-average history.
-- Run in Supabase SQL Editor after the existing PrepAPig migrations.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pig_weight_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pig_id uuid NOT NULL REFERENCES public.pigs(id) ON DELETE CASCADE,
    owner_id uuid NOT NULL,
    weigh_in_date date NOT NULL,
    age_days integer NOT NULL CHECK (age_days >= 0),
    recorded_weight numeric(10, 2) NOT NULL CHECK (recorded_weight >= 0),
    is_baseline boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pig_weight_history_owner_pig_date
    ON public.pig_weight_history (owner_id, pig_id, weigh_in_date DESC, created_at DESC);

ALTER TABLE public.pig_weight_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pig_weight_history_owner_policy ON public.pig_weight_history;
CREATE POLICY pig_weight_history_owner_policy ON public.pig_weight_history
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pig_weight_history TO service_role;

-- Existing values cannot be reconstructed as a true historical series. Seed one
-- snapshot for each pig using its current weight and last update timestamp.
INSERT INTO public.pig_weight_history (
    pig_id, owner_id, weigh_in_date, age_days, recorded_weight, is_baseline, created_at
)
SELECT
    p.id,
    p.owner_id,
    snapshot.weigh_in_date,
    GREATEST(
        0,
        COALESCE(b.age_on_acquisition, 0)
            + (snapshot.weigh_in_date - COALESCE(b.date_acquired, b.created_at::date))
    ),
    p.weight,
    true,
    COALESCE(p.updated_at, p.created_at, now())
FROM public.pigs p
JOIN public.pig_batches b
  ON b.id = p.batch_id AND b.owner_id = p.owner_id
CROSS JOIN LATERAL (
    SELECT COALESCE(p.updated_at, p.created_at, now())::date AS weigh_in_date
) snapshot
WHERE p.weight IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.pig_weight_history h WHERE h.pig_id = p.id
  );

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
    v_age_on_acquisition integer;
    v_date_acquired date;
    v_weigh_in_date date := CURRENT_DATE;
    v_age_days integer;
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
            pig_id, owner_id, weigh_in_date, age_days, recorded_weight
        ) VALUES (
            (v_pig->>'id')::uuid,
            p_owner_id,
            v_weigh_in_date,
            v_age_days,
            (p_pig->>'weight')::numeric
        );
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

        IF p_pig ? 'weight' THEN
            INSERT INTO public.pig_weight_history (
                pig_id, owner_id, weigh_in_date, age_days, recorded_weight
            ) VALUES (
                p_pig_id,
                p_owner_id,
                v_weigh_in_date,
                v_age_days,
                (p_pig->>'weight')::numeric
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
