-- ─────────────────────────────────────────────────────────────────────────────
-- push_tokens — native (APNs / FCM via Expo) push notification tokens.
--
-- Distinct from push_subscriptions which is web-push (the PWA uses that).
-- The iOS app's usePushToken hook upserts a row here after acquiring an
-- Expo push token from getExpoPushTokenAsync().
--
-- Edge functions that send pushes (send-push-notification, plan-reminders,
-- etc.) should join through this table for native deliveries.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL,
  platform   text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_id  text,                 -- optional, for multi-device dedup
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One row per (user, token) — token can be reissued on a new device
  CONSTRAINT push_tokens_user_token_uniq UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON public.push_tokens (user_id);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_push_tokens_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_push_tokens_updated_at ON public.push_tokens;
CREATE TRIGGER trg_push_tokens_updated_at
  BEFORE UPDATE ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_push_tokens_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see / write their own token rows
DROP POLICY IF EXISTS "Users select own push_tokens" ON public.push_tokens;
CREATE POLICY "Users select own push_tokens"
  ON public.push_tokens FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own push_tokens" ON public.push_tokens;
CREATE POLICY "Users insert own push_tokens"
  ON public.push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own push_tokens" ON public.push_tokens;
CREATE POLICY "Users update own push_tokens"
  ON public.push_tokens FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own push_tokens" ON public.push_tokens;
CREATE POLICY "Users delete own push_tokens"
  ON public.push_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Edge functions running as the service_role bypass RLS and can read any row
-- to deliver pushes (the service_role implicitly bypasses RLS — no policy needed).

COMMENT ON TABLE public.push_tokens IS
  'Native push notification tokens (Expo / APNs / FCM). One row per user+token.';
COMMENT ON COLUMN public.push_tokens.token IS
  'ExponentPushToken[xxx] string from getExpoPushTokenAsync().';
COMMENT ON COLUMN public.push_tokens.platform IS
  'Source platform: ios | android | web. Used for routing in push delivery functions.';
COMMENT ON COLUMN public.push_tokens.device_id IS
  'Optional iOS identifierForVendor or Android equivalent for multi-device dedup.';
