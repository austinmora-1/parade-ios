-- Storage bucket for in-app bug-report / feedback screenshots.
--
-- The bug-report button uploads a compressed screenshot to
-- `bug-reports/<user_id>/<timestamp>.jpg`, then passes the public URL to the
-- `report-issue` edge function, which embeds it in the Linear issue.
--
-- Public bucket so the URL renders in Linear; authenticated users may only
-- write into their own `<user_id>/…` folder. Re-runnable.

-- 1. Bucket (public read).
insert into storage.buckets (id, name, public)
values ('bug-reports', 'bug-reports', true)
on conflict (id) do update set public = true;

-- 2. Public read — lets the Linear-embedded <img> load the screenshot.
drop policy if exists "bug-reports public read" on storage.objects;
create policy "bug-reports public read"
  on storage.objects for select
  using (bucket_id = 'bug-reports');

-- 3. Authenticated upload, scoped to the uploader's own folder
--    (path[1] must equal their auth uid — matches the client upload path).
drop policy if exists "bug-reports owner upload" on storage.objects;
create policy "bug-reports owner upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bug-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
