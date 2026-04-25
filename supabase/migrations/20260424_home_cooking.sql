-- =============================================================
-- Home cooking mode + per-food chef + couple's home address.
-- Runs in Supabase SQL Editor; safe to re-run.
-- =============================================================

-- A place can be marked as home-cooked, which switches the UI to a
-- multi-menu form and skips the location picker. Defaults to false so
-- every existing row stays "out".
alter table public.places
  add column if not exists is_home_cooked boolean not null default false;

-- Each food can credit a chef. Null = unset (legacy rows).
alter table public.foods
  add column if not exists chef text
    check (chef in ('me', 'partner', 'together'));

-- Couples store one shared home address used for the home marker on the
-- map and as an implicit location for is_home_cooked places.
alter table public.couples
  add column if not exists home_address text,
  add column if not exists home_latitude double precision,
  add column if not exists home_longitude double precision;
