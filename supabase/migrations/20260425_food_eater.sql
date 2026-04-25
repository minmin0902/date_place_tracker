-- =============================================================
-- Three-state "eater" — 'both' (default), 'creator' (only the food's
-- author ate), or 'partner' (only the non-author ate). Replaces the
-- boolean `is_solo` for finer control. is_solo is kept for now as a
-- legacy column so older client builds keep rendering correctly.
-- Runs in Supabase SQL Editor; safe to re-run.
-- =============================================================

alter table public.foods
  add column if not exists eater text not null default 'both'
    check (eater in ('both', 'creator', 'partner'));

-- Backfill: existing is_solo=true rows became 'creator' (when we only
-- supported "creator ate alone"). Untouched rows stay 'both'.
update public.foods
   set eater = 'creator'
 where is_solo = true
   and eater = 'both';
