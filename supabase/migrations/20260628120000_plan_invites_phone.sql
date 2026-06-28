-- Plan-first SMS invites need phone support so users can pull non-Parade
-- friends into a plan at creation time. `plan_invites` previously carried
-- `email` + `placeholder_name` only; this adds an optional `phone` to sit
-- alongside them. Nullable so email-only invites stay valid. Re-runnable.
--
-- RLS is unchanged: the plan_invites policies key off invited_by / plan_id,
-- never the contact columns, so the new column is already covered.

ALTER TABLE public.plan_invites
  ADD COLUMN IF NOT EXISTS phone text;
