-- =============================================================
-- Wishlist supports two kinds: 식당 (restaurant) and 레시피 (recipe).
-- Restaurant items carry location/address; recipe items carry the
-- recipe text + screenshots a user saved (e.g. from Instagram /
-- Xiaohongshu) for later home cooking.
--
-- `kind` defaults to 'restaurant' so every existing wishlist row
-- back-fills correctly without a migration touch-up. recipe_text /
-- recipe_photo_urls are nullable so restaurant rows leave them empty.
-- =============================================================

alter table public.wishlist_places
  add column if not exists kind text not null default 'restaurant'
    check (kind in ('restaurant', 'recipe'));

alter table public.wishlist_places
  add column if not exists recipe_text text;

alter table public.wishlist_places
  add column if not exists recipe_photo_urls text[];
