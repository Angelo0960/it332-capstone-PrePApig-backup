BEGIN;
CREATE TABLE IF NOT EXISTS public.audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 owner_id uuid, entity_table text NOT NULL, entity_id uuid,
 operation text NOT NULL, changed_fields text[] NOT NULL DEFAULT '{}'
);
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_events FROM anon, authenticated;
GRANT SELECT ON public.audit_events TO service_role;
CREATE INDEX IF NOT EXISTS audit_events_owner_time ON public.audit_events(owner_id, occurred_at DESC, id DESC);
CREATE OR REPLACE FUNCTION public.phase4_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE previous jsonb; current_row jsonb; fields text[];
BEGIN
 previous := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
 current_row := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
 SELECT array_agg(key ORDER BY key) INTO fields FROM jsonb_object_keys(previous || current_row) key
 WHERE previous->key IS DISTINCT FROM current_row->key;
 INSERT INTO public.audit_events(owner_id,entity_table,entity_id,operation,changed_fields)
 VALUES (coalesce(current_row->>'owner_id',previous->>'owner_id')::uuid,TG_TABLE_NAME,
 coalesce(current_row->>'id',previous->>'id')::uuid,TG_OP,coalesce(fields,'{}'));
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['pig_batches','pigs','feed_records','vaccination_records','expenses','feed_stocks','vaccine_stocks'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS phase4_audit_trigger ON public.%I',table_name);
 EXECUTE format('CREATE TRIGGER phase4_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.phase4_audit()',table_name);
 END LOOP;
END $$;

-- Backend service role only: owner comes from verified application authentication.
CREATE OR REPLACE FUNCTION public.phase4_analytics(p_owner uuid, p_from date, p_to date, p_batch uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH f AS (SELECT * FROM feed_records WHERE owner_id=p_owner AND feeding_date BETWEEN p_from AND p_to AND (p_batch IS NULL OR batch_id=p_batch)),
v AS (SELECT * FROM vaccination_records WHERE owner_id=p_owner AND vaccination_date BETWEEN p_from AND p_to AND (p_batch IS NULL OR batch_id=p_batch)),
e AS (SELECT * FROM expenses WHERE owner_id=p_owner AND expense_date BETWEEN p_from AND p_to AND (p_batch IS NULL OR batch_id=p_batch)),
daily AS (SELECT feeding_date AS date, sum(quantity_kg) AS actual FROM f GROUP BY feeding_date),
monthly AS (SELECT to_char(expense_date,'YYYY-MM') AS month,sum(amount) AS expenses FROM e GROUP BY 1)
SELECT jsonb_build_object(
 'summary', jsonb_build_object(
 'feedRecords',(SELECT count(*) FROM f),'feedConsumed',(SELECT coalesce(sum(quantity_kg),0) FROM f),
 'vaccinations',(SELECT count(*) FROM v),'completed',(SELECT count(*) FROM v WHERE lower(status)='completed'),
 'scheduled',(SELECT count(*) FROM v WHERE lower(status)='scheduled'),
 'manualExpenses',(SELECT coalesce(sum(amount),0) FROM e),
 'batches',(SELECT count(*) FROM pig_batches WHERE owner_id=p_owner AND (p_batch IS NULL OR id=p_batch))),
 'timeseries',jsonb_build_object(
 'feed',coalesce((SELECT jsonb_agg(to_jsonb(daily) ORDER BY date) FROM daily),'[]'::jsonb),
 'monthlyExpenses',coalesce((SELECT jsonb_agg(to_jsonb(monthly) ORDER BY month) FROM monthly),'[]'::jsonb)),
 'limitations',jsonb_build_array('Monthly revenue and profit unavailable: no dated sale transactions exist.','Inventory prices are current values, not historical consumption costs.'));
$$;
REVOKE ALL ON FUNCTION public.phase4_analytics(uuid,date,date,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phase4_analytics(uuid,date,date,uuid) TO service_role;
CREATE INDEX IF NOT EXISTS phase4_batches_page ON pig_batches(owner_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS phase4_feeds_page ON feed_records(owner_id, feeding_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS phase4_vaccines_page ON vaccination_records(owner_id, vaccination_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS phase4_expenses_page ON expenses(owner_id, expense_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS phase4_notifications_page ON notifications(user_id, created_at DESC, id DESC);
COMMIT;
