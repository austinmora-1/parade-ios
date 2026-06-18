-- Fix the SECURITY DEFINER "trusts caller-supplied user id" vulnerability class
-- (verified June 2026): functions that accept p_user_id / p_requester_user_id and
-- bypass RLS, callable by anon + authenticated. Without these guards, any caller
-- (including unauthenticated anon, whose key ships in the app bundle) could read
-- another user's dashboard/feed/trips by passing their UUID, and a logged-in user
-- could forge a one-sided "connected" friendship to an arbitrary victim.
--
-- Read RPCs: require p_user_id = auth.uid() (service_role bypasses for edge use).
-- RLS helpers (user_*_ids): return empty unless p_user_id = auth.uid(); they are
--   only ever called inside policies as fn((select auth.uid())), so this is a no-op
--   for legitimate use and closes direct cross-user enumeration. EXECUTE is left
--   granted to authenticated because RLS policy evaluation needs it.
-- get_display_names_for_users: resolves names of non-friends (request previews,
--   trip companions) so it cannot be self-scoped; require an authenticated caller.
-- accept_friend_request: the pending row must actually be from p_requester_user_id.

CREATE OR REPLACE FUNCTION public.accept_friend_request(p_friendship_id uuid, p_requester_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_accepter_id uuid;
  v_requester_name text;
  v_accepter_name text;
BEGIN
  v_accepter_id := auth.uid();
  IF v_accepter_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify this is a pending request sent TO the current user
  IF NOT EXISTS (
    SELECT 1 FROM friendships
    WHERE id = p_friendship_id
      AND friend_user_id = v_accepter_id
      AND user_id = p_requester_user_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Friend request not found or not pending';
  END IF;

  -- Update the sender's original record to connected
  UPDATE friendships
  SET status = 'connected', updated_at = now()
  WHERE id = p_friendship_id;

  -- Get names for the reciprocal record
  SELECT display_name INTO v_requester_name FROM profiles WHERE user_id = p_requester_user_id;
  SELECT display_name INTO v_accepter_name FROM profiles WHERE user_id = v_accepter_id;

  -- Create reciprocal friendship for the accepter (if not exists)
  INSERT INTO friendships (user_id, friend_user_id, friend_name, status)
  VALUES (v_accepter_id, p_requester_user_id, COALESCE(v_requester_name, 'Friend'), 'connected')
  ON CONFLICT DO NOTHING;

  -- Also update sender's record friend_name in case it was stale
  UPDATE friendships
  SET friend_name = COALESCE(v_accepter_name, friend_name), updated_at = now()
  WHERE user_id = p_requester_user_id AND friend_user_id = v_accepter_id AND status = 'pending';

  -- Mark any remaining pending record from sender -> accepter as connected too
  UPDATE friendships
  SET status = 'connected', updated_at = now()
  WHERE user_id = p_requester_user_id AND friend_user_id = v_accepter_id AND status = 'pending';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_conflicting_trips(p_user_id uuid)
 RETURNS TABLE(trip_a_id uuid, trip_a_name text, trip_a_location text, trip_a_start date, trip_a_end date, trip_a_participant_ids uuid[], trip_b_id uuid, trip_b_name text, trip_b_location text, trip_b_start date, trip_b_end date, trip_b_participant_ids uuid[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH trip_people AS (
    SELECT t.id AS trip_id, ARRAY(
      SELECT DISTINCT uid FROM (
        SELECT unnest(t.priority_friend_ids) AS uid
        UNION
        SELECT tp.friend_user_id FROM public.trip_participants tp WHERE tp.trip_id = t.id
        UNION
        SELECT tpp.user_id
          FROM public.trip_proposal_participants tpp
         WHERE t.proposal_id IS NOT NULL
           AND tpp.proposal_id = t.proposal_id
           AND tpp.user_id <> t.user_id
      ) s
      WHERE uid IS NOT NULL
    ) AS people
    FROM public.trips t
    WHERE t.user_id = p_user_id
  )
  SELECT
    a.id, a.name, a.location, a.start_date, a.end_date,
    COALESCE(pa.people, '{}'::uuid[]),
    b.id, b.name, b.location, b.start_date, b.end_date,
    COALESCE(pb.people, '{}'::uuid[])
  FROM public.trips a
  JOIN public.trips b
    ON a.user_id = b.user_id
   AND a.id < b.id
   AND a.start_date <= b.end_date
   AND a.end_date   >= b.start_date
  LEFT JOIN trip_people pa ON pa.trip_id = a.id
  LEFT JOIN trip_people pb ON pb.trip_id = b.id
  WHERE a.user_id = p_user_id
    AND (p_user_id = (SELECT auth.uid()) OR coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role')
    AND a.end_date >= CURRENT_DATE
    AND b.end_date >= CURRENT_DATE
  ORDER BY a.start_date;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_data(p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_avail_start date := (CURRENT_DATE - interval '7 days')::date;
  v_avail_end   date := (CURRENT_DATE + interval '35 days')::date;
  v_plan_start  date := (CURRENT_DATE - interval '14 days')::date;
  v_result      json;
BEGIN
  IF p_user_id IS DISTINCT FROM (SELECT auth.uid())
     AND coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: callers may only access their own data' USING ERRCODE = '42501';
  END IF;
  WITH
  own_plans AS (
    SELECT p.id, p.user_id, p.title, p.activity, p.date, p.time_slot,
      p.duration, p.start_time, p.end_time, p.location, p.notes,
      p.status, p.feed_visibility, p.source, p.source_timezone,
      p.end_date, p.recurring_plan_id, p.created_at
    FROM public.plans p WHERE p.user_id = p_user_id AND p.date >= v_plan_start ORDER BY p.date ASC LIMIT 200
  ),
  participated_plan_ids AS (
    SELECT pp.plan_id FROM public.plan_participants pp WHERE pp.friend_id = p_user_id
  ),
  participated_plans AS (
    SELECT p.id, p.user_id, p.title, p.activity, p.date, p.time_slot,
      p.duration, p.start_time, p.end_time, p.location, p.notes,
      p.status, p.feed_visibility, p.source, p.source_timezone,
      p.end_date, p.recurring_plan_id, p.created_at
    FROM public.plans p INNER JOIN participated_plan_ids pid ON pid.plan_id = p.id
    WHERE p.user_id <> p_user_id AND p.date >= v_plan_start ORDER BY p.date ASC LIMIT 200
  ),
  all_plan_ids AS (
    SELECT id FROM own_plans UNION SELECT id FROM participated_plans
  ),
  plan_participants_data AS (
    SELECT pp.plan_id, pp.friend_id, pp.status, pp.role, pp.responded_at
    FROM public.plan_participants pp WHERE pp.plan_id IN (SELECT id FROM all_plan_ids)
  ),
  participant_user_ids AS (
    SELECT DISTINCT pp.friend_id AS uid FROM plan_participants_data pp
    UNION SELECT DISTINCT pp2.user_id AS uid FROM participated_plans pp2
  ),
  participant_profiles AS (
    SELECT pr.user_id, pr.display_name, pr.avatar_url
    FROM public.profile_cache pr
    WHERE pr.user_id IN (SELECT uid FROM participant_user_ids) AND pr.user_id <> p_user_id
  ),
  outgoing_friendships AS (
    SELECT f.id, f.user_id, f.friend_user_id, f.friend_name, f.friend_email,
      f.status, f.is_pod_member, f.created_at, f.updated_at
    FROM public.friendships f WHERE f.user_id = p_user_id
  ),
  outgoing_friend_user_ids AS (
    SELECT DISTINCT f.friend_user_id AS uid FROM outgoing_friendships f WHERE f.friend_user_id IS NOT NULL
  ),
  outgoing_friend_profiles AS (
    SELECT pr.user_id, pr.avatar_url FROM public.profile_cache pr
    WHERE pr.user_id IN (SELECT uid FROM outgoing_friend_user_ids)
  ),
  incoming_friendships AS (
    SELECT f.id, f.user_id, f.friend_user_id, f.friend_name, f.status, f.created_at, f.updated_at
    FROM public.friendships f WHERE f.friend_user_id = p_user_id
  ),
  incoming_friend_user_ids AS (
    SELECT DISTINCT f.user_id AS uid FROM incoming_friendships f
  ),
  incoming_friend_profiles AS (
    SELECT pr.user_id, pr.display_name, pr.avatar_url FROM public.profile_cache pr
    WHERE pr.user_id IN (SELECT uid FROM incoming_friend_user_ids)
  ),
  avail_data AS (
    SELECT a.date, a.early_morning, a.late_morning, a.early_afternoon,
      a.late_afternoon, a.evening, a.late_night,
      a.location_status, a.trip_location, a.vibe,
      a.slot_location_early_morning, a.slot_location_late_morning,
      a.slot_location_early_afternoon, a.slot_location_late_afternoon,
      a.slot_location_evening, a.slot_location_late_night
    FROM public.availability a
    WHERE a.user_id = p_user_id AND a.date >= v_avail_start AND a.date <= v_avail_end
  ),
  caller_profile AS (
    SELECT pr.current_vibe, pr.location_status, pr.custom_vibe_tags,
      pr.vibe_gif_url, pr.default_work_days, pr.default_work_start_hour,
      pr.default_work_end_hour, pr.default_availability_status,
      pr.default_vibes, pr.home_address, pr.timezone
    FROM public.profiles pr WHERE pr.user_id = p_user_id
  )
  SELECT json_build_object(
    'own_plans',               COALESCE((SELECT json_agg(row_to_json(op)) FROM own_plans op), '[]'::json),
    'participated_plans',      COALESCE((SELECT json_agg(row_to_json(pp)) FROM participated_plans pp), '[]'::json),
    'plan_participants',       COALESCE((SELECT json_agg(row_to_json(pd)) FROM plan_participants_data pd), '[]'::json),
    'participant_profiles',    COALESCE((SELECT json_agg(row_to_json(prof)) FROM participant_profiles prof), '[]'::json),
    'outgoing_friendships',    COALESCE((SELECT json_agg(row_to_json(of2)) FROM outgoing_friendships of2), '[]'::json),
    'outgoing_friend_profiles',COALESCE((SELECT json_agg(row_to_json(ofp)) FROM outgoing_friend_profiles ofp), '[]'::json),
    'incoming_friendships',    COALESCE((SELECT json_agg(row_to_json(inf)) FROM incoming_friendships inf), '[]'::json),
    'incoming_friend_profiles',COALESCE((SELECT json_agg(row_to_json(ifp)) FROM incoming_friend_profiles ifp), '[]'::json),
    'availability',            COALESCE((SELECT json_agg(row_to_json(av)) FROM avail_data av), '[]'::json),
    'profile',                 (SELECT row_to_json(cp) FROM caller_profile cp)
  ) INTO v_result;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_data(p_user_id uuid, p_plan_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_avail_start date := (CURRENT_DATE - interval '7 days')::date;
  v_avail_end   date := (CURRENT_DATE + interval '35 days')::date;
  v_plan_start  date := (CURRENT_DATE - interval '14 days')::date;
  v_plan_limit  int := 200;
  v_result      json;
BEGIN
  IF p_user_id IS DISTINCT FROM (SELECT auth.uid())
     AND coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: callers may only access their own data' USING ERRCODE = '42501';
  END IF;
  WITH
  own_plans AS (
    SELECT p.id, p.user_id, p.title, p.activity, p.date, p.time_slot,
      p.duration, p.start_time, p.end_time, p.location, p.notes,
      p.status, p.feed_visibility, p.source, p.source_timezone,
      p.end_date, p.recurring_plan_id, p.created_at
    FROM public.plans p
    WHERE p.user_id = p_user_id
      AND p.date >= v_plan_start
      AND (p_plan_cursor IS NULL OR p.created_at < p_plan_cursor)
    ORDER BY p.date ASC
    LIMIT v_plan_limit
  ),
  participated_plan_ids AS (
    SELECT pp.plan_id FROM public.plan_participants pp WHERE pp.friend_id = p_user_id
  ),
  participated_plans AS (
    SELECT p.id, p.user_id, p.title, p.activity, p.date, p.time_slot,
      p.duration, p.start_time, p.end_time, p.location, p.notes,
      p.status, p.feed_visibility, p.source, p.source_timezone,
      p.end_date, p.recurring_plan_id, p.created_at
    FROM public.plans p INNER JOIN participated_plan_ids pid ON pid.plan_id = p.id
    WHERE p.user_id <> p_user_id
      AND p.date >= v_plan_start
      AND (p_plan_cursor IS NULL OR p.created_at < p_plan_cursor)
    ORDER BY p.date ASC
    LIMIT v_plan_limit
  ),
  all_plan_ids AS (
    SELECT id FROM own_plans UNION SELECT id FROM participated_plans
  ),
  plan_participants_data AS (
    SELECT pp.plan_id, pp.friend_id, pp.status, pp.role, pp.responded_at
    FROM public.plan_participants pp WHERE pp.plan_id IN (SELECT id FROM all_plan_ids)
  ),
  participant_user_ids AS (
    SELECT DISTINCT pp.friend_id AS uid FROM plan_participants_data pp
    UNION SELECT DISTINCT pp2.user_id AS uid FROM participated_plans pp2
  ),
  participant_profiles AS (
    SELECT pr.user_id, pr.display_name, pr.avatar_url
    FROM public.profile_cache pr
    WHERE pr.user_id IN (SELECT uid FROM participant_user_ids) AND pr.user_id <> p_user_id
  ),
  outgoing_friendships AS (
    SELECT f.id, f.user_id, f.friend_user_id, f.friend_name, f.friend_email,
      f.status, f.is_pod_member, f.created_at, f.updated_at
    FROM public.friendships f WHERE f.user_id = p_user_id
  ),
  outgoing_friend_user_ids AS (
    SELECT DISTINCT f.friend_user_id AS uid FROM outgoing_friendships f WHERE f.friend_user_id IS NOT NULL
  ),
  outgoing_friend_profiles AS (
    SELECT pr.user_id, pr.avatar_url FROM public.profile_cache pr
    WHERE pr.user_id IN (SELECT uid FROM outgoing_friend_user_ids)
  ),
  incoming_friendships AS (
    SELECT f.id, f.user_id, f.friend_user_id, f.friend_name, f.status, f.created_at, f.updated_at
    FROM public.friendships f WHERE f.friend_user_id = p_user_id
  ),
  incoming_friend_user_ids AS (
    SELECT DISTINCT f.user_id AS uid FROM incoming_friendships f
  ),
  incoming_friend_profiles AS (
    SELECT pr.user_id, pr.display_name, pr.avatar_url FROM public.profile_cache pr
    WHERE pr.user_id IN (SELECT uid FROM incoming_friend_user_ids)
  ),
  avail_data AS (
    SELECT a.date, a.early_morning, a.late_morning, a.early_afternoon,
      a.late_afternoon, a.evening, a.late_night,
      a.location_status, a.trip_location, a.vibe,
      a.slot_location_early_morning, a.slot_location_late_morning,
      a.slot_location_early_afternoon, a.slot_location_late_afternoon,
      a.slot_location_evening, a.slot_location_late_night
    FROM public.availability a
    WHERE a.user_id = p_user_id AND a.date >= v_avail_start AND a.date <= v_avail_end
  ),
  caller_profile AS (
    SELECT pr.current_vibe, pr.location_status, pr.custom_vibe_tags,
      pr.vibe_gif_url, pr.default_work_days, pr.default_work_start_hour,
      pr.default_work_end_hour, pr.default_availability_status,
      pr.default_vibes, pr.home_address, pr.timezone
    FROM public.profiles pr WHERE pr.user_id = p_user_id
  ),
  has_more AS (
    SELECT EXISTS (
      SELECT 1 FROM public.plans p
      WHERE (p.user_id = p_user_id OR p.id IN (SELECT plan_id FROM participated_plan_ids))
        AND p.date >= v_plan_start
        AND p.created_at < COALESCE(
          (SELECT MIN(created_at) FROM (SELECT created_at FROM own_plans UNION ALL SELECT created_at FROM participated_plans) sub),
          now()
        )
    ) AS val
  )
  SELECT json_build_object(
    'own_plans',               COALESCE((SELECT json_agg(row_to_json(op)) FROM own_plans op), '[]'::json),
    'participated_plans',      COALESCE((SELECT json_agg(row_to_json(pp)) FROM participated_plans pp), '[]'::json),
    'plan_participants',       COALESCE((SELECT json_agg(row_to_json(pd)) FROM plan_participants_data pd), '[]'::json),
    'participant_profiles',    COALESCE((SELECT json_agg(row_to_json(prof)) FROM participant_profiles prof), '[]'::json),
    'outgoing_friendships',    COALESCE((SELECT json_agg(row_to_json(of2)) FROM outgoing_friendships of2), '[]'::json),
    'outgoing_friend_profiles',COALESCE((SELECT json_agg(row_to_json(ofp)) FROM outgoing_friend_profiles ofp), '[]'::json),
    'incoming_friendships',    COALESCE((SELECT json_agg(row_to_json(inf)) FROM incoming_friendships inf), '[]'::json),
    'incoming_friend_profiles',COALESCE((SELECT json_agg(row_to_json(ifp)) FROM incoming_friend_profiles ifp), '[]'::json),
    'availability',            COALESCE((SELECT json_agg(row_to_json(av)) FROM avail_data av), '[]'::json),
    'profile',                 (SELECT row_to_json(cp) FROM caller_profile cp),
    'has_more_plans',          (SELECT val FROM has_more)
  ) INTO v_result;
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_display_names_for_users(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, first_name text, last_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.user_id, p.display_name, p.avatar_url, p.first_name, p.last_name
  FROM profiles p
  WHERE p.user_id = ANY(p_user_ids)
    AND ((SELECT auth.uid()) IS NOT NULL OR coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role');
$function$
;

CREATE OR REPLACE FUNCTION public.get_feed_plans(p_user_id uuid, p_limit integer DEFAULT 100)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  IF p_user_id IS DISTINCT FROM (SELECT auth.uid())
     AND coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: callers may only access their own data' USING ERRCODE = '42501';
  END IF;
  WITH connected_friends AS (
    SELECT friend_user_id
    FROM friendships
    WHERE user_id = p_user_id AND status = 'connected'
  ),
  participated_plan_ids AS (
    SELECT plan_id FROM plan_participants WHERE friend_id = p_user_id
  ),
  feed_plans AS (
    SELECT DISTINCT ON (p.id) p.*
    FROM plans p
    WHERE p.date < now()
      AND p.user_id <> p_user_id
      AND (
        (p.feed_visibility <> 'private' AND p.user_id IN (SELECT friend_user_id FROM connected_friends))
        OR p.id IN (SELECT plan_id FROM participated_plan_ids)
      )
    ORDER BY p.id, p.date DESC
    LIMIT p_limit
  ),
  ordered_plans AS (
    SELECT * FROM feed_plans ORDER BY date DESC
  ),
  all_user_ids AS (
    SELECT user_id AS uid FROM ordered_plans
    UNION
    SELECT pp.friend_id FROM plan_participants pp WHERE pp.plan_id IN (SELECT id FROM ordered_plans)
  ),
  profiles_lookup AS (
    SELECT user_id, display_name, avatar_url
    FROM profiles
    WHERE user_id IN (SELECT uid FROM all_user_ids)
  ),
  participants_lookup AS (
    SELECT pp.plan_id, pp.friend_id, pp.status, pp.role
    FROM plan_participants pp
    WHERE pp.plan_id IN (SELECT id FROM ordered_plans)
  )
  SELECT json_build_object(
    'plans', COALESCE((SELECT json_agg(row_to_json(op)) FROM ordered_plans op), '[]'::json),
    'participants', COALESCE((SELECT json_agg(row_to_json(pl)) FROM participants_lookup pl), '[]'::json),
    'profiles', COALESCE((SELECT json_agg(row_to_json(pr)) FROM profiles_lookup pr), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.merge_overlapping_trips(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS DISTINCT FROM (SELECT auth.uid())
     AND coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: callers may only access their own data' USING ERRCODE = '42501';
  END IF;
  -- Auto-merge disabled: deletions must go through the conflict dialog so the
  -- user can choose which trip to keep. See get_conflicting_trips().
  RETURN 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_conversation_ids(p_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT conversation_id FROM public.conversation_participants WHERE user_id = p_user_id AND p_user_id = (SELECT auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.user_participated_plan_ids(p_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT plan_id FROM public.plan_participants WHERE friend_id = p_user_id AND p_user_id = (SELECT auth.uid());
$function$
;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_data(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_data(uuid, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_data(uuid, timestamp with time zone) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_feed_plans(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feed_plans(uuid, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_conflicting_trips(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conflicting_trips(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.merge_overlapping_trips(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_overlapping_trips(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_display_names_for_users(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_display_names_for_users(uuid[]) TO authenticated, service_role;
