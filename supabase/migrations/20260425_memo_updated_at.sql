-- Track when each memo was last written. Distinct from places.updated_at
-- because that bumps on ANY column change (e.g. the memo_author_id
-- backfill migration touched every row and made every memo look like
-- it was written "방금 전"). A memo-specific timestamp lets the
-- comment-style render show an accurate "12분 전 / 3시간 전 / 5일 전".

alter table public.places
  add column if not exists memo_updated_at timestamptz;

alter table public.foods
  add column if not exists memo_updated_at timestamptz;

-- ---------------------------------------------------------------
-- Backfill for legacy memos. We don't have a real history of when
-- each memo was actually typed, so we use the row's created_at as
-- the best available approximation. It can lag the truth (you might
-- have added the memo days after creating the row), but it beats
-- NULL (which would hide the timestamp) and beats NOW() (which
-- would lie that everything was written this minute).
-- ---------------------------------------------------------------

update public.places
   set memo_updated_at = created_at
 where memo is not null
   and memo_updated_at is null;

update public.foods
   set memo_updated_at = created_at
 where memo is not null
   and memo_updated_at is null;
