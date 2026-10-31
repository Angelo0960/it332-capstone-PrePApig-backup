-- Repair session-token permissions and expose session operations through
-- SECURITY DEFINER functions so backend login/logout validation does not
-- depend on direct table grants.
BEGIN;

CREATE TABLE IF NOT EXISTS public.session_tokens (
    jti uuid PRIMARY KEY,
    user_id uuid NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_tokens_user_idx
    ON public.session_tokens(user_id);

CREATE INDEX IF NOT EXISTS session_tokens_expiry_idx
    ON public.session_tokens(expires_at);

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.session_tokens
    TO service_role;

CREATE OR REPLACE FUNCTION public.create_session_token(
    p_jti uuid,
    p_user_id uuid,
    p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_jti IS NULL OR p_user_id IS NULL OR p_expires_at IS NULL THEN
        RAISE EXCEPTION 'Session token, user, and expiry are required';
    END IF;

    INSERT INTO public.session_tokens (
        jti,
        user_id,
        expires_at,
        revoked_at
    )
    VALUES (
        p_jti,
        p_user_id,
        p_expires_at,
        NULL
    )
    ON CONFLICT (jti)
    DO UPDATE SET
        user_id = EXCLUDED.user_id,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_session_token(
    p_jti uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_updated integer;
BEGIN
    UPDATE public.session_tokens
    SET revoked_at = now()
    WHERE jti = p_jti
      AND user_id = p_user_id
      AND revoked_at IS NULL;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_session_token(
    p_jti uuid,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.session_tokens
        WHERE jti = p_jti
          AND user_id = p_user_id
          AND revoked_at IS NULL
          AND expires_at > now()
    );
END;
$$;

REVOKE ALL ON FUNCTION
    public.create_session_token(uuid, uuid, timestamptz)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
    public.revoke_session_token(uuid, uuid)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
    public.validate_session_token(uuid, uuid)
FROM PUBLIC, anon, authenticated;

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
