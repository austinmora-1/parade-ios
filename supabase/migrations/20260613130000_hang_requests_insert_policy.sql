-- Fix the hang_requests INSERT policy. A "vibe check" is sender-initiated:
-- the row's user_id is the RECIPIENT and sender_id is the current user, so
-- the old check (auth.uid() = user_id) blocked every client-side send.
-- Allow inserting when you're the sender (or, for any self-created flow,
-- the recipient).
DROP POLICY IF EXISTS "Users can create their own hang requests" ON public.hang_requests;
CREATE POLICY "Users can create their own hang requests"
  ON public.hang_requests FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    OR (SELECT auth.uid()) = user_id
  );
