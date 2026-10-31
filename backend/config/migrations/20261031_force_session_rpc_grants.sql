-- Force ownership and execution privileges for session RPCs.
-- Run this after the session-token migration in Supabase SQL Editor.
BEGIN;

ALTER FUNCTION public.create_session_token(uuid, uuid, timestamptz)
    OWNER TO postgres;

ALTER FUNCTION public.revoke_session_token(uuid, uuid)
    OWNER TO postgres;

ALTER FUNCTION public.validate_session_token(uuid, uuid)
    OWNER TO postgres;

GRANT USAGE ON SCHEMA public TO service_role;

GRANT EXECUTE ON FUNCTION
    public.create_session_token(uuid, uuid, timestamptz)
TO service_role;

GRANT EXECUTE ON FUNCTION
    public.revoke_session_token(uuid, uuid)
TO service_role;

GRANT EXECUTE ON FUNCTION
    public.validate_session_token(uuid, uuid)
TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
