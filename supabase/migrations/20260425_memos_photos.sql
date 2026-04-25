-- Add small-photo support to threaded memos. Mirrors the photo_urls
-- shape on places/foods so MediaThumb can render the same way (and
-- video URLs auto-flip to <video> via isVideoUrl). Keeping it nullable
-- so the column is fully backwards-compatible — existing memos are
-- "text-only" until the user attaches something.

alter table public.memos
  add column if not exists photo_urls text[];
