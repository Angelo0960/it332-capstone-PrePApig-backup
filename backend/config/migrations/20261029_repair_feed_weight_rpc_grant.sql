-- Repair execution permissions for the feed mark-as-done RPC.
--
-- The backend uses SUPABASE_SERVICE_ROLE_KEY. Existing environments may have
-- the function body but not the EXECUTE grant because the original migration
-- was not applied completely or the function was recreated later.
BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.create_feed_record_with_weight_gain(uuid,jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Missing RPC public.create_feed_record_with_weight_gain(uuid, jsonb). Run 20261029_restore_fcr_feed_weight.sql first.';
    END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.create_feed_record_with_weight_gain(uuid, jsonb) TO service_role;

-- Keep the RPC available only to the server-side role. Do not grant direct
-- execution to browser roles because the function updates pig weights and the
-- batch aggregate atomically.
REVOKE EXECUTE ON FUNCTION public.create_feed_record_with_weight_gain(uuid, jsonb) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
