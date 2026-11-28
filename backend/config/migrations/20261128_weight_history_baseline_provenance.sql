-- Preserve whether a legacy baseline can be attributed to batch acquisition data.
BEGIN;

ALTER TABLE public.pig_weight_history
    ADD COLUMN IF NOT EXISTS baseline_source text;

UPDATE public.pig_weight_history AS h
SET baseline_source = 'batch_start'
FROM public.pigs AS p
JOIN public.pig_batches AS b
  ON b.id = p.batch_id AND b.owner_id = p.owner_id
WHERE h.pig_id = p.id
  AND h.owner_id = p.owner_id
  AND h.is_baseline
  AND b.date_acquired IS NOT NULL
  AND b.start_weight IS NOT NULL
  AND h.weigh_in_date = b.date_acquired
  AND h.recorded_weight = b.start_weight
  AND h.age_days = GREATEST(0, COALESCE(b.age_on_acquisition, 0));

UPDATE public.pig_weight_history
SET baseline_source = 'legacy_snapshot'
WHERE is_baseline AND baseline_source IS NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
