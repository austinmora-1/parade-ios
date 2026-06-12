-- One-time cleanup: release default-materialized "free" work-hour slots.
--
-- Two historical writers cemented explicit TRUE into slot columns, which
-- permanently overrode users' default work schedules (explicit values always
-- beat schedule defaults):
--   1. slot columns had DEFAULT true, so any partial insert (single-slot
--      toggle, vibe/location write, trip write) materialized the untouched
--      columns as explicitly free (fixed in 20260612110000),
--   2. the per-device baseline reconciler released unattributable busy slots
--      to explicit TRUE instead of NULL (fixed in lib/availabilityReconcile.ts).
--
-- This pass resets TRUE -> NULL on slots that fall within each user's own
-- work hours on their work days (future dates only), so schedule defaults
-- govern again. Deliberate "free during work" marks are indistinguishable
-- from materialized ones and are reset too; users can re-toggle them, and
-- new toggles persist correctly against the NULL-defaulted columns.

UPDATE public.availability a
SET early_morning   = CASE WHEN a.early_morning   = true AND 7  < p.we AND 9  > p.ws THEN NULL ELSE a.early_morning END,
    late_morning    = CASE WHEN a.late_morning    = true AND 9  < p.we AND 12 > p.ws THEN NULL ELSE a.late_morning END,
    early_afternoon = CASE WHEN a.early_afternoon = true AND 12 < p.we AND 15 > p.ws THEN NULL ELSE a.early_afternoon END,
    late_afternoon  = CASE WHEN a.late_afternoon  = true AND 15 < p.we AND 18 > p.ws THEN NULL ELSE a.late_afternoon END,
    evening         = CASE WHEN a.evening         = true AND 18 < p.we AND 22 > p.ws THEN NULL ELSE a.evening END,
    late_night      = CASE WHEN a.late_night      = true AND 22 < p.we AND 26 > p.ws THEN NULL ELSE a.late_night END,
    updated_at = now()
FROM (
  SELECT user_id,
         COALESCE(default_work_start_hour, 9)::int  AS ws,
         COALESCE(default_work_end_hour, 17)::int   AS we,
         COALESCE(default_work_days, ARRAY['monday','tuesday','wednesday','thursday','friday']) AS wd
  FROM public.profiles
) p
WHERE p.user_id = a.user_id
  AND a.date >= CURRENT_DATE
  AND trim(to_char(a.date, 'day')) = ANY(p.wd)
  AND ((a.early_morning = true AND 7 < p.we AND 9 > p.ws)
    OR (a.late_morning = true AND 9 < p.we AND 12 > p.ws)
    OR (a.early_afternoon = true AND 12 < p.we AND 15 > p.ws)
    OR (a.late_afternoon = true AND 15 < p.we AND 18 > p.ws)
    OR (a.evening = true AND 18 < p.we AND 22 > p.ws)
    OR (a.late_night = true AND 22 < p.we AND 26 > p.ws));
