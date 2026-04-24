-- =============================================================
-- Allow 0.1-increment (decimal) ratings for foods.
-- Run this once in Supabase SQL Editor.
-- =============================================================

alter table public.foods drop constraint if exists foods_my_rating_check;
alter table public.foods drop constraint if exists foods_partner_rating_check;

alter table public.foods
  alter column my_rating type numeric using my_rating::numeric;
alter table public.foods
  alter column partner_rating type numeric using partner_rating::numeric;

alter table public.foods
  add constraint foods_my_rating_check
    check (my_rating is null or (my_rating >= 0 and my_rating <= 5));
alter table public.foods
  add constraint foods_partner_rating_check
    check (partner_rating is null or (partner_rating >= 0 and partner_rating <= 5));
