-- =============================================================
-- Solo flag — when true, only the food's creator (created_by) ate
-- this dish. UI shows a single rating + doubles it for the /10 total.
-- Runs in Supabase SQL Editor; safe to re-run.
-- =============================================================

alter table public.foods
  add column if not exists is_solo boolean not null default false;
