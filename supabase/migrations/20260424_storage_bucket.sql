-- =============================================================
-- Storage setup for place photos.
-- Run this in Supabase SQL Editor once.
-- =============================================================

-- Public bucket for place photos.
insert into storage.buckets (id, name, public)
values ('place-photos', 'place-photos', true)
on conflict (id) do nothing;

-- Public read — photos are meant to be shown in the app without auth headers.
drop policy if exists "place-photos: public read" on storage.objects;
create policy "place-photos: public read"
on storage.objects for select to public
using (bucket_id = 'place-photos');

-- Authenticated couple members can upload to their own couple folder
-- (object path is "{coupleId}/{uuid}.{ext}").
drop policy if exists "place-photos: couple upload" on storage.objects;
create policy "place-photos: couple upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'place-photos'
  and public.my_couple_id() is not null
  and split_part(name, '/', 1) = public.my_couple_id()::text
);

drop policy if exists "place-photos: couple delete" on storage.objects;
create policy "place-photos: couple delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'place-photos'
  and public.my_couple_id() is not null
  and split_part(name, '/', 1) = public.my_couple_id()::text
);
