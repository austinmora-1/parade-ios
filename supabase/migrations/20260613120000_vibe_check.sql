-- "Vibe check" (formerly Quick ping) enhancements on hang_requests:
--   • optional specific start/end clock time the sender proposes
--   • the recipient's response when they accept: a vibe + an optional
--     suggested activity
ALTER TABLE public.hang_requests
  ADD COLUMN IF NOT EXISTS start_time time without time zone,
  ADD COLUMN IF NOT EXISTS end_time time without time zone,
  ADD COLUMN IF NOT EXISTS response_vibe text,
  ADD COLUMN IF NOT EXISTS response_activity text;
