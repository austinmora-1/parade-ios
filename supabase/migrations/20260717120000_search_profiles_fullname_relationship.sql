-- XPE-303: full-name search + relationship status in one round trip.
-- search_profiles previously matched the whole query against display_name or
-- first_name only, so "Austin Mora" found nobody and the client had to make a
-- second query to learn whether each result was already a friend. This version:
--   * splits the query into whitespace tokens; every token must match
--     display_name OR first_name OR last_name (ILIKE %token%),
--   * returns the caller's relationship to each row ('connected',
--     'pending_outgoing', 'pending_incoming', 'none') plus the friendships row
--     id for pending_incoming so the client can accept in place,
--   * ranks prefix matches first, then by display_name.
-- Guards are unchanged from 20260612100000_db_hardening: discoverable only,
-- never the caller themselves, minimum 2-char query, LIMIT 20, and EXECUTE
-- restricted to authenticated.
--
-- The return table changes, so the old signature must be dropped first
-- (CREATE OR REPLACE cannot change a function's result type).

DROP FUNCTION IF EXISTS public.search_profiles(text);

CREATE FUNCTION public.search_profiles(p_query text)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  first_name text,
  last_name text,
  avatar_url text,
  relationship text,
  incoming_friendship_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    p.display_name,
    p.first_name,
    p.last_name,
    p.avatar_url,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'connected'
          AND ((f.user_id = auth.uid() AND f.friend_user_id = p.user_id)
            OR (f.user_id = p.user_id AND f.friend_user_id = auth.uid()))
      ) THEN 'connected'
      WHEN EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = 'pending'
          AND f.user_id = auth.uid()
          AND f.friend_user_id = p.user_id
      ) THEN 'pending_outgoing'
      WHEN inc.id IS NOT NULL THEN 'pending_incoming'
      ELSE 'none'
    END AS relationship,
    inc.id AS incoming_friendship_id
  FROM profiles p
  LEFT JOIN LATERAL (
    SELECT f.id
    FROM friendships f
    WHERE f.status = 'pending'
      AND f.user_id = p.user_id
      AND f.friend_user_id = auth.uid()
    LIMIT 1
  ) inc ON true
  WHERE p.discoverable = true
    AND p.user_id <> auth.uid()
    AND length(trim(p_query)) >= 2
    AND (
      SELECT bool_and(COALESCE(
        p.display_name ILIKE '%' || tok || '%'
        OR p.first_name ILIKE '%' || tok || '%'
        OR p.last_name ILIKE '%' || tok || '%'
      , false))
      FROM unnest(regexp_split_to_array(trim(p_query), E'\\s+')) AS tok
    )
  ORDER BY
    COALESCE(
      p.display_name ILIKE trim(p_query) || '%'
      OR p.first_name ILIKE trim(p_query) || '%'
      OR p.last_name ILIKE trim(p_query) || '%'
    , false) DESC,
    p.display_name NULLS LAST
  LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;
