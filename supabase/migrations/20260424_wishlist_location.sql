-- =============================================================
-- Let wishlist rows carry full Google-Places location data so the
-- address / lat / lng flow through when we mark them as visited.
-- Run once in Supabase SQL Editor.
-- =============================================================

alter table public.wishlist_places
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;
