-- Fix two access-control bugs on public.plans (found in the June 2026 RLS audit).
--
-- 1. "Authenticated friends can view plans" granted every connected friend
--    SELECT on ALL of a user's plans with no feed_visibility check. Because
--    permissive policies OR together, it made feed_visibility = 'private'
--    meaningless (2,140 of 2,146 plans were private at the time of the fix).
--    The remaining SELECT policies already cover every legitimate path:
--      - "Users can view their own plans"            (owner)
--      - "Users can view plans they are invited to"  (participants)
--      - "Friends can view public plans"             (feed_visibility = 'friends')
--      - "Pod members can view pod-shared plans"     (feed_visibility = 'pod:%')
--    The dashboard RPC (get_dashboard_data) is SECURITY DEFINER and unaffected.
DROP POLICY IF EXISTS "Authenticated friends can view plans" ON public.plans;

-- 2. "Participants can update non-time plan fields" promises a column
--    restriction that RLS cannot express: participants could update ANY
--    column, including date/time and user_id (taking ownership of the plan).
--    Enforce the restriction with a BEFORE UPDATE trigger. Participants keep
--    the fields the app legitimately lets them touch (status — accept flows
--    flip proposed→confirmed — plus title/activity/location/notes).
CREATE OR REPLACE FUNCTION public.enforce_plan_participant_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Owner edits and non-API contexts (service role / triggers: auth.uid() is
  -- NULL) are unrestricted.
  IF auth.uid() IS NULL OR auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id                  IS DISTINCT FROM OLD.user_id
     OR NEW.date                  IS DISTINCT FROM OLD.date
     OR NEW.end_date              IS DISTINCT FROM OLD.end_date
     OR NEW.time_slot             IS DISTINCT FROM OLD.time_slot
     OR NEW.start_time            IS DISTINCT FROM OLD.start_time
     OR NEW.end_time              IS DISTINCT FROM OLD.end_time
     OR NEW.duration              IS DISTINCT FROM OLD.duration
     OR NEW.feed_visibility       IS DISTINCT FROM OLD.feed_visibility
     OR NEW.blocks_availability   IS DISTINCT FROM OLD.blocks_availability
     OR NEW.source                IS DISTINCT FROM OLD.source
     OR NEW.source_event_id       IS DISTINCT FROM OLD.source_event_id
     OR NEW.source_timezone       IS DISTINCT FROM OLD.source_timezone
     OR NEW.recurring_plan_id     IS DISTINCT FROM OLD.recurring_plan_id
     OR NEW.proposed_by           IS DISTINCT FROM OLD.proposed_by
     OR NEW.merged_source_event_ids IS DISTINCT FROM OLD.merged_source_event_ids
     OR NEW.created_at            IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only the plan owner can change ownership, timing, visibility, or source fields'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_plan_participant_update ON public.plans;
CREATE TRIGGER enforce_plan_participant_update
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_participant_update();
