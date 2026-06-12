-- DB hardening (phase 2 of the June 2026 review):
--   1. Index hygiene — drop exact-duplicate and prefix-redundant indexes,
--      enforce uniqueness on profiles.share_code (lookup + enumeration guard).
--   2. Narrow reactions visibility — reaction rows are now visible/insertable
--      only when the underlying target row is visible to the user (the EXISTS
--      subqueries are RLS-filtered, so target visibility == reaction visibility).
--   3. Replace the "Authenticated users can view discoverable profiles" base-
--      table policy (which exposed every profiles column to any signed-in user)
--      with a SECURITY DEFINER search_profiles() RPC returning only safe fields.
--      Non-friend profile reads elsewhere go through the public_profiles view.

-- ── 1. Index hygiene ─────────────────────────────────────────────────────────
-- Exact duplicates:
DROP INDEX IF EXISTS public.idx_chat_messages_conversation_id;      -- = idx_chat_messages_conversation
DROP INDEX IF EXISTS public.idx_conversation_participants_user_id;  -- = idx_conversation_participants_user
DROP INDEX IF EXISTS public.idx_profiles_display_name_unique;       -- = profiles_display_name_unique_ci
-- Prefix-redundant (kept index covers the same leading columns):
DROP INDEX IF EXISTS public.idx_plans_feed_visibility;              -- ⊂ idx_plans_feed_visibility_date
DROP INDEX IF EXISTS public.idx_plans_user_id;                      -- ⊂ idx_plans_user_date_status
DROP INDEX IF EXISTS public.idx_plans_user_id_date;                 -- ⊂ idx_plans_user_date_status

-- share_code is looked up per-request and must not collide. (0 duplicates in
-- prod as of this migration. hang_requests.share_code stays non-unique: it
-- stores the *recipient's* code, so repeats are expected.)
DROP INDEX IF EXISTS public.idx_profiles_share_code;
CREATE UNIQUE INDEX profiles_share_code_unique ON public.profiles (share_code);

-- ── 2. Reactions: visibility follows the target ──────────────────────────────
DROP POLICY IF EXISTS "Authenticated read reactions" ON public.reactions;
CREATE POLICY "Users read reactions on visible targets" ON public.reactions
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (target_type = 'plan'    AND EXISTS (SELECT 1 FROM plans p          WHERE p.id  = target_id))
    OR (target_type = 'comment' AND EXISTS (SELECT 1 FROM plan_comments c  WHERE c.id  = target_id))
    OR (target_type = 'photo'   AND EXISTS (SELECT 1 FROM plan_photos ph   WHERE ph.id = target_id))
    OR (target_type = 'vibe'    AND EXISTS (SELECT 1 FROM vibe_sends v     WHERE v.id  = target_id))
    OR (target_type = 'message' AND EXISTS (SELECT 1 FROM chat_messages m  WHERE m.id  = target_id))
  );

DROP POLICY IF EXISTS "Users insert own reactions" ON public.reactions;
CREATE POLICY "Users insert own reactions" ON public.reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND (
         (target_type = 'plan'    AND EXISTS (SELECT 1 FROM plans p          WHERE p.id  = target_id))
      OR (target_type = 'comment' AND EXISTS (SELECT 1 FROM plan_comments c  WHERE c.id  = target_id))
      OR (target_type = 'photo'   AND EXISTS (SELECT 1 FROM plan_photos ph   WHERE ph.id = target_id))
      OR (target_type = 'vibe'    AND EXISTS (SELECT 1 FROM vibe_sends v     WHERE v.id  = target_id))
      OR (target_type = 'message' AND EXISTS (SELECT 1 FROM chat_messages m  WHERE m.id  = target_id))
    )
  );

-- ── 3. Profile search without exposing the whole profiles row ────────────────
CREATE OR REPLACE FUNCTION public.search_profiles(p_query text)
RETURNS TABLE (user_id uuid, display_name text, first_name text, last_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.display_name, p.first_name, p.last_name, p.avatar_url
  FROM profiles p
  WHERE p.discoverable = true
    AND p.user_id <> auth.uid()
    AND length(trim(p_query)) >= 2
    AND (p.display_name ILIKE '%' || trim(p_query) || '%'
         OR p.first_name ILIKE '%' || trim(p_query) || '%')
  LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view discoverable profiles" ON public.profiles;
