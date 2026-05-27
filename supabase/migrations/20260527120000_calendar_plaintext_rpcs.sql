-- ─────────────────────────────────────────────────────────────────────────────
-- Calendar connection RPCs (plaintext variant for Project A)
--
-- The PWA project uses pgsodium-encrypted columns + SECURITY DEFINER RPCs
-- that require the function owner to hold the pgsodium_keyholder role.
-- That role isn't available on this Supabase project, so the encrypted
-- upsert path fails with "permission denied for table key".
--
-- For the iOS-only project we store calendar tokens in plaintext text
-- columns. The same RPC signatures are kept so the existing edge
-- functions (google-calendar-callback, google-calendar-events, etc.)
-- continue to work unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Make sure the table has plaintext text columns we can write to.
--    If the columns already exist as bytea (pgsodium), add new _plain text
--    columns; otherwise just keep going. Easiest path: add the columns if
--    missing and tell the RPCs to use them.

DO $$
BEGIN
  -- Add plaintext columns if they don't already exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calendar_connections' AND column_name = 'access_token_plain'
  ) THEN
    ALTER TABLE public.calendar_connections ADD COLUMN access_token_plain text;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calendar_connections' AND column_name = 'refresh_token_plain'
  ) THEN
    ALTER TABLE public.calendar_connections ADD COLUMN refresh_token_plain text;
  END IF;
END $$;

-- 2. Replace the upsert RPC with a plaintext version. Same signature so
--    callers don't need to change.
DROP FUNCTION IF EXISTS public.upsert_calendar_connection(uuid, text, text, text, timestamptz, text);
CREATE OR REPLACE FUNCTION public.upsert_calendar_connection(
  p_user_id uuid,
  p_provider text,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz,
  p_grant_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.calendar_connections (
    user_id, provider, access_token_plain, refresh_token_plain, expires_at, grant_id
  ) VALUES (
    p_user_id, p_provider, p_access_token, p_refresh_token, p_expires_at, p_grant_id
  )
  ON CONFLICT (user_id, provider) DO UPDATE
    SET access_token_plain  = EXCLUDED.access_token_plain,
        refresh_token_plain = EXCLUDED.refresh_token_plain,
        expires_at          = EXCLUDED.expires_at,
        grant_id            = EXCLUDED.grant_id,
        updated_at          = now();
END;
$function$;

-- 3. Replace get_calendar_tokens to read from the plaintext columns.
DROP FUNCTION IF EXISTS public.get_calendar_tokens(uuid, text);
CREATE OR REPLACE FUNCTION public.get_calendar_tokens(p_user_id uuid, p_provider text)
RETURNS TABLE (
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  grant_id text,
  ical_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    cc.access_token_plain  AS access_token,
    cc.refresh_token_plain AS refresh_token,
    cc.expires_at,
    cc.grant_id,
    cc.ical_url
  FROM public.calendar_connections cc
  WHERE cc.user_id = p_user_id AND cc.provider = p_provider;
END;
$function$;

-- 4. Replace update_calendar_access_token (used by refresh-token path).
DROP FUNCTION IF EXISTS public.update_calendar_access_token(uuid, text, text, timestamptz);
CREATE OR REPLACE FUNCTION public.update_calendar_access_token(
  p_user_id uuid,
  p_provider text,
  p_access_token text,
  p_expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.calendar_connections
     SET access_token_plain = p_access_token,
         expires_at         = p_expires_at,
         updated_at         = now()
   WHERE user_id = p_user_id AND provider = p_provider;
END;
$function$;

-- 5. Permissions
REVOKE ALL ON FUNCTION public.upsert_calendar_connection(uuid, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_calendar_tokens(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_calendar_access_token(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_calendar_connection(uuid, text, text, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_calendar_tokens(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_calendar_access_token(uuid, text, text, timestamptz) TO service_role;
