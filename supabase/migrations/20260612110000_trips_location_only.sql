-- Trips are a location change, not an availability block.
--
-- The old model blanket-wrote FALSE into all six slot columns for every day
-- a trip covered (lib/tripBusy.ts setTripAvailabilityBulk). The new model
-- (setTripLocationRange) only writes location_status + trip_location and
-- leaves slots to the user's schedule defaults. This migration:
--   1. makes untouched slot columns default to NULL (= "follow the user's
--      default schedule") instead of TRUE (= explicitly free),
--   2. stamps every trip-covered day with the away location change,
--   3. releases the old blanket block: FALSE → NULL on trip-covered days so
--      schedule defaults govern again. (Calendar-synced busy marks on those
--      days are re-applied by the app's next calendar sync.)

-- 1. Untouched slots follow the schedule, not "free"
ALTER TABLE public.availability
  ALTER COLUMN early_morning   SET DEFAULT NULL,
  ALTER COLUMN late_morning    SET DEFAULT NULL,
  ALTER COLUMN early_afternoon SET DEFAULT NULL,
  ALTER COLUMN late_afternoon  SET DEFAULT NULL,
  ALTER COLUMN evening         SET DEFAULT NULL,
  ALTER COLUMN late_night      SET DEFAULT NULL;

-- 2. Trip-covered days carry the location change
INSERT INTO public.availability (user_id, date, location_status, trip_location,
  early_morning, late_morning, early_afternoon, late_afternoon, evening, late_night)
SELECT DISTINCT ON (t.user_id, d::date) t.user_id, d::date, 'away', t.location,
  NULL, NULL, NULL, NULL, NULL, NULL
FROM public.trips t
CROSS JOIN LATERAL generate_series(t.start_date::timestamp, t.end_date::timestamp, interval '1 day') AS d
-- Overlapping trips: the most recently created trip wins the day's location
ORDER BY t.user_id, d::date, t.created_at DESC
ON CONFLICT (user_id, date) DO UPDATE
  SET location_status = 'away',
      trip_location   = EXCLUDED.trip_location,
      updated_at      = now();

-- 3. Release the old blanket block on trip-covered days (FALSE → NULL)
UPDATE public.availability a
SET early_morning   = NULLIF(a.early_morning,   false),
    late_morning    = NULLIF(a.late_morning,    false),
    early_afternoon = NULLIF(a.early_afternoon, false),
    late_afternoon  = NULLIF(a.late_afternoon,  false),
    evening         = NULLIF(a.evening,         false),
    late_night      = NULLIF(a.late_night,      false),
    updated_at      = now()
WHERE EXISTS (
  SELECT 1 FROM public.trips t
  WHERE t.user_id = a.user_id
    AND a.date BETWEEN t.start_date AND t.end_date
)
AND (a.early_morning = false OR a.late_morning = false OR a.early_afternoon = false
     OR a.late_afternoon = false OR a.evening = false OR a.late_night = false);
