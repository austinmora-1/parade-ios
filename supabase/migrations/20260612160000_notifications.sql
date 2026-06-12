-- Notifications table — the app (notifications screen, home unread badge)
-- has been reading public.notifications since Phase 3, but the table was
-- never created in this project. Shape matches what the readers expect:
-- type/title/body for the card, url for deep-link routing, jsonb data for
-- anything extra, read flag for the badge.
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- who triggered it (sender of a share, requester of a friendship, …)
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  body text,
  url text,
  data jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- In-app sharing: the authed user may notify a CONNECTED friend, and must
-- stamp themselves as actor_id so the recipient can see who it came from.
CREATE POLICY "Connected friends can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = actor_id
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'connected'
        AND (
          (f.user_id = (SELECT auth.uid()) AND f.friend_user_id = notifications.user_id)
          OR (f.user_id = notifications.user_id AND f.friend_user_id = (SELECT auth.uid()))
        )
    )
  );
