-- Account linking / legacy-account claim (July 2026).
--
-- Lets the CURRENT signed-in account (B, phone/apple, proven by JWT) claim and
-- absorb an OLD dormant legacy EMAIL account (A) that shares an email A proves
-- ownership of via a 6-digit code. A is merged into B, then A is deleted.
--
-- This migration ships the SQL half of the feature:
--   * account_claim_challenges / account_merge_log tables (service-role only)
--   * find_claimable_account()  — resolves the dormant legacy account for an email
--   * preview_account_merge()   — read-only dry run of what a merge would touch
--   * merge_account()           — the atomic merge, writes an audit row, returns jsonb
--
-- All three functions are SECURITY DEFINER and revoked from end users; only the
-- edge functions (service-role) may call them. merge_account runs entirely inside
-- the implicit function transaction, so any RAISE rolls the whole merge back.
--
-- Product / correctness decisions baked in (from the June/July 2026 merge
-- investigation):
--   * TRIPS ARE MOVED, not deleted (a trip is real history worth keeping).
--   * plans: calendar imports are DELETED (they re-sync on B's own connection and
--     would collide on (user_id, source, source_event_id)); native plans are MOVED.
--     The calendar discriminator mirrors lib/planSource.ts.
--   * availability / calendar_connections / push_subscriptions / rate_limit_log /
--     caches are DELETED — they regenerate or would collide on their unique keys.
--   * friendships repoint in BOTH directions, deleting collisions and the A<->B
--     self-edges that a merge would otherwise create.
--   * every uniquely-constrained membership/vote table is COLLIDE-THEN-MOVE: the
--     A row that would collide with an existing B row on the unique key is deleted,
--     then the survivors are repointed.
--
-- merge_account neutralizes enforce_plan_participant_update (BEFORE UPDATE on
-- plans, raises 42501 unless auth.uid() is NULL or = OLD.user_id) by blanking the
-- request JWT claims so auth.uid() resolves to NULL for the duration of the txn.

-- ============================================================================
-- Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.account_claim_challenges (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  uuid NOT NULL,
  target_email  text NOT NULL,
  target_user_id uuid NOT NULL,
  code_hash     text NOT NULL,
  expires_at    timestamptz NOT NULL,
  attempts      int NOT NULL DEFAULT 0,
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Lookup path used by confirm-account-claim: latest unconsumed challenge for a
-- (requester, lower(email)) pair.
CREATE INDEX IF NOT EXISTS idx_account_claim_challenges_lookup
  ON public.account_claim_challenges (requester_id, lower(target_email), created_at DESC);

CREATE TABLE IF NOT EXISTS public.account_merge_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merge_from   uuid NOT NULL,
  merge_into   uuid NOT NULL,
  merged_email text,
  counts       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Service-role only: RLS on, deliberately NO policies, so anon/authenticated
-- clients can never read or write these rows. The edge functions use the
-- service-role key, which bypasses RLS.
ALTER TABLE public.account_claim_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_merge_log        ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- find_claimable_account(p_email, p_requester)
--   Returns the id of an auth.users row whose lower(email) = lower(p_email),
--   id <> p_requester, and which has NO row in auth.identities (a dormant legacy
--   email account, never an active phone/apple account). NULL if none.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.find_claimable_account(p_email text, p_requester uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE lower(u.email) = lower(p_email)
    AND u.id <> p_requester
    AND NOT EXISTS (
      SELECT 1 FROM auth.identities i WHERE i.user_id = u.id
    )
  ORDER BY u.created_at ASC
  LIMIT 1;
$$;

-- ============================================================================
-- preview_account_merge(merge_from, merge_into)
--   Read-only dry run: for each affected table, the action the merge would take
--   and how many merge_from rows are involved. Never mutates anything.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.preview_account_merge(merge_from uuid, merge_into uuid)
RETURNS TABLE (table_name text, action text, rows_affected bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- plans: native MOVE vs calendar-import DELETE
  SELECT 'plans'::text, 'MOVE'::text, count(*)::bigint
    FROM plans
    WHERE user_id = merge_from
      AND (source IS NULL OR lower(source) NOT IN
           ('google','gcal','ical','apple','nylas','outlook'))
  UNION ALL
  SELECT 'plans', 'DELETE (calendar import)', count(*)::bigint
    FROM plans
    WHERE user_id = merge_from
      AND source IS NOT NULL
      AND lower(source) IN ('google','gcal','ical','apple','nylas','outlook')
  UNION ALL
  SELECT 'plan_participants', 'DEDUP+MOVE', count(*)::bigint
    FROM plan_participants WHERE friend_id = merge_from
  UNION ALL
  SELECT 'friendships', 'REPOINT (both directions)', count(*)::bigint
    FROM friendships WHERE user_id = merge_from OR friend_user_id = merge_from
  UNION ALL
  SELECT 'trips', 'MOVE', count(*)::bigint
    FROM trips WHERE user_id = merge_from
  UNION ALL
  SELECT 'pods', 'MOVE', count(*)::bigint
    FROM pods WHERE user_id = merge_from
  UNION ALL
  SELECT 'pod_members', 'COLLIDE-MOVE', count(*)::bigint
    FROM pod_members WHERE friend_user_id = merge_from
  UNION ALL
  SELECT 'recurring_plans', 'MOVE', count(*)::bigint
    FROM recurring_plans WHERE user_id = merge_from
  UNION ALL
  SELECT 'conversations', 'MOVE', count(*)::bigint
    FROM conversations WHERE created_by = merge_from
  UNION ALL
  SELECT 'conversation_participants', 'COLLIDE-MOVE', count(*)::bigint
    FROM conversation_participants WHERE user_id = merge_from
  UNION ALL
  SELECT 'chat_messages', 'MOVE', count(*)::bigint
    FROM chat_messages WHERE sender_id = merge_from
  UNION ALL
  SELECT 'message_reactions', 'COLLIDE-MOVE', count(*)::bigint
    FROM message_reactions WHERE user_id = merge_from
  UNION ALL
  SELECT 'plan_comments', 'MOVE', count(*)::bigint
    FROM plan_comments WHERE user_id = merge_from
  UNION ALL
  SELECT 'plan_photos', 'MOVE', count(*)::bigint
    FROM plan_photos WHERE uploaded_by = merge_from
  UNION ALL
  SELECT 'plan_invites', 'MOVE', count(*)::bigint
    FROM plan_invites WHERE invited_by = merge_from OR accepted_by = merge_from
  UNION ALL
  SELECT 'plan_participant_requests', 'COLLIDE-MOVE', count(*)::bigint
    FROM plan_participant_requests WHERE friend_user_id = merge_from OR requested_by = merge_from
  UNION ALL
  SELECT 'plan_change_requests', 'MOVE', count(*)::bigint
    FROM plan_change_requests WHERE proposed_by = merge_from
  UNION ALL
  SELECT 'plan_change_responses', 'MOVE', count(*)::bigint
    FROM plan_change_responses WHERE participant_id = merge_from
  UNION ALL
  SELECT 'plan_proposal_votes', 'COLLIDE-MOVE', count(*)::bigint
    FROM plan_proposal_votes WHERE user_id = merge_from
  UNION ALL
  SELECT 'plan_reminders_sent', 'COLLIDE-MOVE', count(*)::bigint
    FROM plan_reminders_sent WHERE user_id = merge_from
  UNION ALL
  SELECT 'open_invites', 'MOVE', count(*)::bigint
    FROM open_invites WHERE user_id = merge_from
  UNION ALL
  SELECT 'open_invite_responses', 'COLLIDE-MOVE', count(*)::bigint
    FROM open_invite_responses WHERE user_id = merge_from
  UNION ALL
  SELECT 'hang_requests', 'MOVE', count(*)::bigint
    FROM hang_requests WHERE user_id = merge_from OR sender_id = merge_from
  UNION ALL
  SELECT 'feedback', 'MOVE', count(*)::bigint
    FROM feedback WHERE user_id = merge_from
  UNION ALL
  SELECT 'notifications', 'MOVE (actor) / CASCADE-DELETE (recipient)', count(*)::bigint
    FROM notifications WHERE actor_id = merge_from OR user_id = merge_from
  UNION ALL
  SELECT 'weekly_intentions', 'COLLIDE-MOVE', count(*)::bigint
    FROM weekly_intentions WHERE user_id = merge_from
  UNION ALL
  SELECT 'trip_participants', 'COLLIDE-MOVE', count(*)::bigint
    FROM trip_participants WHERE friend_user_id = merge_from
  UNION ALL
  SELECT 'trip_proposals', 'MOVE', count(*)::bigint
    FROM trip_proposals WHERE created_by = merge_from OR host_user_id = merge_from
  UNION ALL
  SELECT 'trip_proposal_participants', 'COLLIDE-MOVE', count(*)::bigint
    FROM trip_proposal_participants WHERE user_id = merge_from
  UNION ALL
  SELECT 'trip_proposal_votes', 'COLLIDE-MOVE', count(*)::bigint
    FROM trip_proposal_votes WHERE user_id = merge_from
  UNION ALL
  SELECT 'trip_proposal_invites', 'MOVE', count(*)::bigint
    FROM trip_proposal_invites WHERE invited_by = merge_from OR accepted_by = merge_from
  UNION ALL
  SELECT 'trip_activity_suggestions', 'MOVE', count(*)::bigint
    FROM trip_activity_suggestions WHERE suggested_by = merge_from
  UNION ALL
  SELECT 'trip_activity_votes', 'COLLIDE-MOVE', count(*)::bigint
    FROM trip_activity_votes WHERE user_id = merge_from
  UNION ALL
  SELECT 'vibe_sends', 'MOVE', count(*)::bigint
    FROM vibe_sends WHERE sender_id = merge_from
  UNION ALL
  SELECT 'vibe_comments', 'MOVE', count(*)::bigint
    FROM vibe_comments WHERE user_id = merge_from
  UNION ALL
  SELECT 'vibe_reactions', 'COLLIDE-MOVE', count(*)::bigint
    FROM vibe_reactions WHERE user_id = merge_from
  UNION ALL
  SELECT 'vibe_send_recipients', 'MOVE', count(*)::bigint
    FROM vibe_send_recipients WHERE recipient_id = merge_from
  UNION ALL
  SELECT 'availability', 'DELETE', count(*)::bigint
    FROM availability WHERE user_id = merge_from
  UNION ALL
  SELECT 'calendar_connections', 'DELETE', count(*)::bigint
    FROM calendar_connections WHERE user_id = merge_from
  UNION ALL
  SELECT 'push_subscriptions', 'DELETE', count(*)::bigint
    FROM push_subscriptions WHERE user_id = merge_from
  UNION ALL
  SELECT 'rate_limit_log', 'DELETE', count(*)::bigint
    FROM rate_limit_log WHERE user_id = merge_from
  UNION ALL
  SELECT 'last_hung_out_cache', 'DELETE', count(*)::bigint
    FROM last_hung_out_cache WHERE user_id = merge_from OR friend_user_id = merge_from
  UNION ALL
  SELECT 'smart_nudges', 'DELETE', count(*)::bigint
    FROM smart_nudges WHERE user_id = merge_from OR friend_user_id = merge_from
  UNION ALL
  SELECT 'push_tokens', 'CASCADE-DELETE', count(*)::bigint
    FROM push_tokens WHERE user_id = merge_from
  UNION ALL
  SELECT 'reactions', 'CASCADE-DELETE', count(*)::bigint
    FROM reactions WHERE user_id = merge_from
  UNION ALL
  SELECT 'trips.priority_friend_ids', 'ARRAY-REWRITE', count(*)::bigint
    FROM trips WHERE merge_from = ANY(priority_friend_ids)
  UNION ALL
  SELECT 'profiles.close_friend_ids', 'ARRAY-REWRITE', count(*)::bigint
    FROM profiles WHERE merge_from = ANY(close_friend_ids)
  UNION ALL
  SELECT 'profiles.allowed_hang_request_friend_ids', 'ARRAY-REWRITE', count(*)::bigint
    FROM profiles WHERE merge_from = ANY(allowed_hang_request_friend_ids);
$$;

-- ============================================================================
-- merge_account(merge_from, merge_into)
--   Atomically absorb merge_from (A) into merge_into (B). Captures per-table
--   counts, writes ONE account_merge_log row BEFORE mutating, performs the merge,
--   deletes A, and returns the counts jsonb. Any error rolls the whole thing back.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_account(merge_from uuid, merge_into uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email    text;
  v_counts   jsonb;
  v_friends  bigint;
  v_plans    bigint;
  v_trips    bigint;
  v_pods     bigint;
  v_messages bigint;
  v_photos   bigint;
  v_comments bigint;
BEGIN
  -- ── Guards ────────────────────────────────────────────────────────────────
  IF merge_from IS NULL OR merge_into IS NULL THEN
    RAISE EXCEPTION 'merge_account: merge_from and merge_into are required';
  END IF;
  IF merge_from = merge_into THEN
    RAISE EXCEPTION 'merge_account: merge_from and merge_into must differ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = merge_from) THEN
    RAISE EXCEPTION 'merge_account: source account % does not exist', merge_from;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = merge_into) THEN
    RAISE EXCEPTION 'merge_account: target account % does not exist', merge_into;
  END IF;
  -- ── Safety interlock: merge_from MUST be a dormant legacy account (no
  --    auth.identities row). This is the same predicate find_claimable_account
  --    enforces, repeated here at the DB layer so that even a mis-called RPC
  --    (e.g. swapped arguments) can NEVER delete an ACTIVE phone/apple account.
  --    The irreversible DELETE below depends on this holding.
  IF EXISTS (SELECT 1 FROM auth.identities WHERE user_id = merge_from) THEN
    RAISE EXCEPTION
      'merge_account: source % is an active account (has an identity); refusing to merge/delete it',
      merge_from;
  END IF;

  -- ── Serialize concurrent merges touching either id (stable order = no deadlock)
  PERFORM pg_advisory_xact_lock(hashtext(least(merge_from, merge_into)::text));
  PERFORM pg_advisory_xact_lock(hashtext(greatest(merge_from, merge_into)::text));

  -- ── Neutralize enforce_plan_participant_update: with the request JWT claims
  --    blanked, auth.uid() resolves to NULL and the BEFORE UPDATE on plans trigger
  --    short-circuits to RETURN NEW instead of raising 42501. Local to this txn.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims',    '', true);

  -- ── Capture counts BEFORE mutating (for the audit row + return value) ───────
  -- "friends restored": A's connected friendships, excluding the trivial A<->B
  -- self-edge (which collapses to nothing on merge).
  SELECT count(*) INTO v_friends
    FROM friendships
    WHERE user_id = merge_from
      AND status = 'connected'
      AND friend_user_id IS DISTINCT FROM merge_into;
  SELECT count(*) INTO v_plans
    FROM plans WHERE user_id = merge_from
      AND (source IS NULL OR lower(source) NOT IN
           ('google','gcal','ical','apple','nylas','outlook'));
  SELECT count(*) INTO v_trips    FROM trips        WHERE user_id = merge_from;
  SELECT count(*) INTO v_pods     FROM pods         WHERE user_id = merge_from;
  SELECT count(*) INTO v_messages FROM chat_messages WHERE sender_id = merge_from;
  SELECT count(*) INTO v_photos   FROM plan_photos  WHERE uploaded_by = merge_from;
  SELECT count(*) INTO v_comments FROM plan_comments WHERE user_id = merge_from;

  SELECT email INTO v_email FROM auth.users WHERE id = merge_from;

  v_counts := jsonb_build_object(
    'friends',  v_friends,
    'plans',    v_plans,
    'trips',    v_trips,
    'pods',     v_pods,
    'messages', v_messages,
    'photos',   v_photos,
    'comments', v_comments
  );

  -- Audit row written BEFORE the mutation, inside the same txn: if the merge
  -- raises below, this insert rolls back with it (no orphan log rows).
  INSERT INTO account_merge_log (merge_from, merge_into, merged_email, counts)
  VALUES (merge_from, merge_into, v_email, v_counts);

  -- ══ Mutations ══════════════════════════════════════════════════════════════

  -- plans: delete calendar imports, move native plans (trigger already neutralized)
  DELETE FROM plans
    WHERE user_id = merge_from
      AND source IS NOT NULL
      AND lower(source) IN ('google','gcal','ical','apple','nylas','outlook');
  UPDATE plans SET user_id = merge_into
    WHERE user_id = merge_from;

  -- plans.proposed_by (no unique) simple move
  UPDATE plans SET proposed_by = merge_into WHERE proposed_by = merge_from;

  -- plan_participants (friend_id, no unique): dedup on plan_id, then move
  DELETE FROM plan_participants a
    WHERE a.friend_id = merge_from
      AND EXISTS (SELECT 1 FROM plan_participants b
                    WHERE b.plan_id = a.plan_id AND b.friend_id = merge_into);
  UPDATE plan_participants SET friend_id = merge_into WHERE friend_id = merge_from;

  -- friendships: repoint BOTH directions, deleting collisions and A<->B self-edges.
  -- (a) rows where someone is friends with A (friend_user_id = merge_from)
  DELETE FROM friendships f
    WHERE f.friend_user_id = merge_from
      AND (f.user_id = merge_into  -- would become a B->B self-edge
           OR EXISTS (SELECT 1 FROM friendships g
                        WHERE g.user_id = f.user_id
                          AND g.friend_user_id = merge_into));
  UPDATE friendships SET friend_user_id = merge_into WHERE friend_user_id = merge_from;
  -- (b) A's own friendship rows (user_id = merge_from)
  DELETE FROM friendships f
    WHERE f.user_id = merge_from
      AND (f.friend_user_id = merge_into  -- would become a B->B self-edge
           OR (f.friend_user_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM friendships g
                             WHERE g.user_id = merge_into
                               AND g.friend_user_id = f.friend_user_id)));
  UPDATE friendships SET user_id = merge_into WHERE user_id = merge_from;

  -- ── Uniquely-constrained membership / vote tables: COLLIDE-THEN-MOVE ────────
  DELETE FROM conversation_participants a
    WHERE a.user_id = merge_from
      AND EXISTS (SELECT 1 FROM conversation_participants b
                    WHERE b.conversation_id = a.conversation_id AND b.user_id = merge_into);
  UPDATE conversation_participants SET user_id = merge_into WHERE user_id = merge_from;

  DELETE FROM plan_participant_requests a
    WHERE a.friend_user_id = merge_from
      AND EXISTS (SELECT 1 FROM plan_participant_requests b
                    WHERE b.plan_id = a.plan_id
                      AND b.friend_user_id = merge_into
                      AND b.status = a.status);
  UPDATE plan_participant_requests SET friend_user_id = merge_into WHERE friend_user_id = merge_from;

  DELETE FROM pod_members a
    WHERE a.friend_user_id = merge_from
      AND EXISTS (SELECT 1 FROM pod_members b
                    WHERE b.pod_id = a.pod_id AND b.friend_user_id = merge_into);
  UPDATE pod_members SET friend_user_id = merge_into WHERE friend_user_id = merge_from;

  DELETE FROM trip_participants a
    WHERE a.friend_user_id = merge_from
      AND EXISTS (SELECT 1 FROM trip_participants b
                    WHERE b.trip_id = a.trip_id AND b.friend_user_id = merge_into);
  UPDATE trip_participants SET friend_user_id = merge_into WHERE friend_user_id = merge_from;

  DELETE FROM weekly_intentions a
    WHERE a.user_id = merge_from
      AND EXISTS (SELECT 1 FROM weekly_intentions b
                    WHERE b.week_start = a.week_start AND b.user_id = merge_into);
  UPDATE weekly_intentions SET user_id = merge_into WHERE user_id = merge_from;

  DELETE FROM plan_proposal_votes a
    WHERE a.user_id = merge_from
      AND EXISTS (SELECT 1 FROM plan_proposal_votes b
                    WHERE b.option_id = a.option_id AND b.user_id = merge_into);
  UPDATE plan_proposal_votes SET user_id = merge_into WHERE user_id = merge_from;

  DELETE FROM trip_proposal_participants a
    WHERE a.user_id = merge_from
      AND EXISTS (SELECT 1 FROM trip_proposal_participants b
                    WHERE b.proposal_id = a.proposal_id AND b.user_id = merge_into);
  UPDATE trip_proposal_participants SET user_id = merge_into WHERE user_id = merge_from;

  DELETE FROM trip_proposal_votes a
    WHERE a.user_id = merge_from
      AND EXISTS (SELECT 1 FROM trip_proposal_votes b
                    WHERE b.date_id = a.date_id AND b.user_id = merge_into);
  UPDATE trip_proposal_votes SET user_id = merge_into WHERE user_id = merge_from;

  DELETE FROM trip_activity_votes a
    WHERE a.user_id = merge_from
      AND EXISTS (SELECT 1 FROM trip_activity_votes b
                    WHERE b.suggestion_id = a.suggestion_id AND b.user_id = merge_into);
  UPDATE trip_activity_votes SET user_id = merge_into WHERE user_id = merge_from;

  DELETE FROM open_invite_responses a
    WHERE a.user_id = merge_from
      AND EXISTS (SELECT 1 FROM open_invite_responses b
                    WHERE b.open_invite_id = a.open_invite_id AND b.user_id = merge_into);
  UPDATE open_invite_responses SET user_id = merge_into WHERE user_id = merge_from;

  DELETE FROM message_reactions a
    WHERE a.user_id = merge_from
      AND EXISTS (SELECT 1 FROM message_reactions b
                    WHERE b.message_id = a.message_id
                      AND b.user_id = merge_into
                      AND b.emoji = a.emoji);
  UPDATE message_reactions SET user_id = merge_into WHERE user_id = merge_from;

  DELETE FROM vibe_reactions a
    WHERE a.user_id = merge_from
      AND EXISTS (SELECT 1 FROM vibe_reactions b
                    WHERE b.vibe_send_id = a.vibe_send_id
                      AND b.user_id = merge_into
                      AND b.emoji = a.emoji);
  UPDATE vibe_reactions SET user_id = merge_into WHERE user_id = merge_from;

  DELETE FROM plan_reminders_sent a
    WHERE a.user_id = merge_from
      AND EXISTS (SELECT 1 FROM plan_reminders_sent b
                    WHERE b.plan_id = a.plan_id AND b.user_id = merge_into);
  UPDATE plan_reminders_sent SET user_id = merge_into WHERE user_id = merge_from;

  -- ── Simple MOVE columns (no unique constraint on the user column) ───────────
  UPDATE recurring_plans          SET user_id       = merge_into WHERE user_id       = merge_from;
  UPDATE pods                     SET user_id       = merge_into WHERE user_id       = merge_from;
  UPDATE hang_requests            SET user_id       = merge_into WHERE user_id       = merge_from;
  UPDATE hang_requests            SET sender_id     = merge_into WHERE sender_id     = merge_from;
  UPDATE feedback                 SET user_id       = merge_into WHERE user_id       = merge_from;
  UPDATE conversations            SET created_by    = merge_into WHERE created_by    = merge_from;
  UPDATE chat_messages            SET sender_id     = merge_into WHERE sender_id     = merge_from;
  UPDATE plan_comments            SET user_id       = merge_into WHERE user_id       = merge_from;
  UPDATE plan_invites             SET invited_by    = merge_into WHERE invited_by    = merge_from;
  UPDATE plan_invites             SET accepted_by   = merge_into WHERE accepted_by   = merge_from;
  UPDATE plan_participant_requests SET requested_by = merge_into WHERE requested_by  = merge_from;
  UPDATE plan_change_requests     SET proposed_by   = merge_into WHERE proposed_by   = merge_from;
  -- dedup: one response per participant per change request (no DB unique enforces it)
  DELETE FROM plan_change_responses a WHERE a.participant_id = merge_from
     AND EXISTS (SELECT 1 FROM plan_change_responses b
                 WHERE b.participant_id = merge_into AND b.change_request_id = a.change_request_id);
  UPDATE plan_change_responses    SET participant_id = merge_into WHERE participant_id = merge_from;
  UPDATE plan_photos              SET uploaded_by   = merge_into WHERE uploaded_by   = merge_from;
  UPDATE open_invites             SET user_id       = merge_into WHERE user_id       = merge_from;
  UPDATE trips                    SET user_id       = merge_into WHERE user_id       = merge_from;
  UPDATE trip_proposals           SET created_by    = merge_into WHERE created_by    = merge_from;
  UPDATE trip_proposals           SET host_user_id  = merge_into WHERE host_user_id  = merge_from;
  UPDATE trip_proposal_invites    SET invited_by    = merge_into WHERE invited_by    = merge_from;
  UPDATE trip_proposal_invites    SET accepted_by   = merge_into WHERE accepted_by   = merge_from;
  UPDATE trip_activity_suggestions SET suggested_by = merge_into WHERE suggested_by  = merge_from;
  UPDATE vibe_sends               SET sender_id     = merge_into WHERE sender_id     = merge_from;
  UPDATE vibe_comments            SET user_id       = merge_into WHERE user_id       = merge_from;
  -- dedup: one recipient row per vibe per user (no DB unique enforces it)
  DELETE FROM vibe_send_recipients a WHERE a.recipient_id = merge_from
     AND EXISTS (SELECT 1 FROM vibe_send_recipients b
                 WHERE b.recipient_id = merge_into AND b.vibe_send_id = a.vibe_send_id);
  UPDATE vibe_send_recipients     SET recipient_id  = merge_into WHERE recipient_id  = merge_from;
  UPDATE notifications            SET actor_id      = merge_into WHERE actor_id      = merge_from;

  -- ── Rewrite inbound uuid[] arrays: replace merge_from -> merge_into, dedup ───
  -- The `x <> user_id` guard drops the self-reference that would otherwise be
  -- created when the array belongs to B and already listed A (you can't be your
  -- own priority-friend / close-friend). For every other owner, merge_into is a
  -- legitimate element and is kept.
  UPDATE trips
    SET priority_friend_ids = (
      SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
      FROM unnest(array_replace(priority_friend_ids, merge_from, merge_into)) AS x
      WHERE x <> user_id)
    WHERE merge_from = ANY(priority_friend_ids);

  UPDATE profiles
    SET close_friend_ids = (
      SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
      FROM unnest(array_replace(close_friend_ids, merge_from, merge_into)) AS x
      WHERE x <> user_id)
    WHERE merge_from = ANY(close_friend_ids);

  UPDATE profiles
    SET allowed_hang_request_friend_ids = (
      SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
      FROM unnest(array_replace(allowed_hang_request_friend_ids, merge_from, merge_into)) AS x
      WHERE x <> user_id)
    WHERE merge_from = ANY(allowed_hang_request_friend_ids);

  -- ── DELETE regenerate/collide rows tied to A ────────────────────────────────
  DELETE FROM availability          WHERE user_id = merge_from;
  DELETE FROM calendar_connections  WHERE user_id = merge_from;
  DELETE FROM push_subscriptions    WHERE user_id = merge_from;
  DELETE FROM rate_limit_log        WHERE user_id = merge_from;
  DELETE FROM last_hung_out_cache   WHERE user_id = merge_from OR friend_user_id = merge_from;
  DELETE FROM smart_nudges          WHERE user_id = merge_from OR friend_user_id = merge_from;

  -- ── Finally delete A. Cascades profiles / push_tokens / reactions /
  --    notifications(user_id) via their auth.users FKs. ─────────────────────────
  DELETE FROM auth.users WHERE id = merge_from;

  RETURN v_counts;
END;
$$;

-- ============================================================================
-- Lock down execution: end users (anon/authenticated) may NEVER call these.
-- The edge functions use the service-role key. We revoke from the end-user roles
-- per the contract, and explicitly (re)grant service_role so the edge RPCs work
-- even though the default PUBLIC grant is stripped.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.find_claimable_account(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_account_merge(uuid, uuid)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_account(uuid, uuid)          FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.find_claimable_account(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_account_merge(uuid, uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_account(uuid, uuid)          TO service_role;
