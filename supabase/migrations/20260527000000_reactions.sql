-- ─────────────────────────────────────────────────────────────────────────────
-- reactions — polymorphic emoji reactions for plans, comments, photos, and
-- (eventually) any other target type. One row per (user, target, emoji).
--
-- Distinct from the older target-specific reaction tables (vibe_reactions,
-- message_reactions). New surfaces should write here.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('plan', 'comment', 'photo', 'vibe', 'message')),
  target_id   uuid NOT NULL,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Same user can react with multiple distinct emojis to the same target,
  -- but only once per (user, target, emoji).
  CONSTRAINT reactions_uniq UNIQUE (user_id, target_type, target_id, emoji)
);

CREATE INDEX IF NOT EXISTS reactions_target_idx
  ON public.reactions (target_type, target_id);
CREATE INDEX IF NOT EXISTS reactions_user_idx
  ON public.reactions (user_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read reactions (visibility is controlled by the
-- parent object — if you can see the plan/comment/photo, you can see its
-- reactions). Tighten later if a target type needs stricter rules.
DROP POLICY IF EXISTS "Authenticated read reactions" ON public.reactions;
CREATE POLICY "Authenticated read reactions"
  ON public.reactions FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users insert own reactions" ON public.reactions;
CREATE POLICY "Users insert own reactions"
  ON public.reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own reactions" ON public.reactions;
CREATE POLICY "Users delete own reactions"
  ON public.reactions FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.reactions IS
  'Polymorphic emoji reactions. target_type ∈ {plan, comment, photo, vibe, message}.';
COMMENT ON COLUMN public.reactions.target_type IS
  'Discriminator for target_id. Add to the CHECK constraint to support new surfaces.';
COMMENT ON CONSTRAINT reactions_uniq ON public.reactions IS
  'One emoji per user per target. Multiple distinct emojis allowed.';
