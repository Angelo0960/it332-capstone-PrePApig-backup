-- Backfill ownership for legacy records created before owner-scoped queries.
-- Only rows whose batch has an unambiguous owner are updated.
BEGIN;

UPDATE public.feed_records AS f
SET owner_id = b.owner_id
FROM public.pig_batches AS b
WHERE f.batch_id = b.id
  AND f.owner_id IS NULL
  AND b.owner_id IS NOT NULL;

UPDATE public.vaccination_records AS v
SET owner_id = b.owner_id
FROM public.pig_batches AS b
WHERE v.batch_id = b.id
  AND v.owner_id IS NULL
  AND b.owner_id IS NOT NULL;

UPDATE public.expenses AS e
SET owner_id = b.owner_id
FROM public.pig_batches AS b
WHERE e.batch_id = b.id
  AND e.owner_id IS NULL
  AND b.owner_id IS NOT NULL;

UPDATE public.pigs AS p
SET owner_id = b.owner_id
FROM public.pig_batches AS b
WHERE p.batch_id = b.id
  AND p.owner_id IS NULL
  AND b.owner_id IS NOT NULL;

COMMIT;
