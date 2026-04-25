-- =============================================================
-- Multi-category — places and foods can carry more than one category
-- (e.g. "이탈리안 + 와인바", "디저트 + 음료"). Adds a text[] column,
-- backfills from the legacy single-string `category`. The old column
-- stays put for backward compat; new code reads `categories` first
-- and falls back to a 1-element array of `category` if `categories`
-- is null.
--   Runs in Supabase SQL Editor; safe to re-run.
-- =============================================================

alter table public.places
  add column if not exists categories text[];

update public.places
   set categories = case
     when category is not null and category <> '' then array[category]
     else array[]::text[]
   end
 where categories is null;

alter table public.foods
  add column if not exists categories text[];

update public.foods
   set categories = case
     when category is not null and category <> '' then array[category]
     else array[]::text[]
   end
 where categories is null;
