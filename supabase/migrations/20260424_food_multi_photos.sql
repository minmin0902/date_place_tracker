-- =============================================================
-- Let a food entry carry multiple photos (same shape as places).
-- Runs in Supabase SQL Editor; safe to re-run.
-- =============================================================

alter table public.foods
  add column if not exists photo_urls text[];

-- Back-fill: if the legacy single-photo column has a value but the new
-- array column is still null, move it over so nothing is lost.
update public.foods
   set photo_urls = array[photo_url]
 where photo_urls is null
   and photo_url is not null;

-- photo_url is kept for now as a no-op legacy column so older clients
-- don't break. Drop it later once everyone is on the new build:
--   alter table public.foods drop column photo_url;
