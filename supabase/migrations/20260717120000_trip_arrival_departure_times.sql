-- XPE-285 / XPE-275: optional arrival/departure times on trips so they can
-- occupy specific time windows instead of defaulting to all-day.
-- NULL = all-day (legacy behavior, and the default for new trips too).
-- Applied to prod 2026-07-17 via Management API.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS arrival_time   time without time zone,
  ADD COLUMN IF NOT EXISTS departure_time time without time zone;

COMMENT ON COLUMN public.trips.arrival_time   IS 'Time the user arrives at the destination on start_date. NULL = all-day (legacy).';
COMMENT ON COLUMN public.trips.departure_time IS 'Time the user leaves the destination on end_date. NULL = all-day (legacy).';
