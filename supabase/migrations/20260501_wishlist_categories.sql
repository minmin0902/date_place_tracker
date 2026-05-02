-- =============================================================
-- Multi-select categories on wishlist items, mirroring places /
-- foods which both moved off scalar `category` to array `categories`
-- a while back. Wishlist add forms now expose the same picker shape
-- (multi-select dropdown + freeform tags), so the column needs to
-- accept an array of category keys.
--
-- The legacy `category` scalar column stays around as the first
-- element of `categories` so older client builds keep rendering
-- something. Nullable + default null for back-compat.
-- =============================================================

alter table public.wishlist_places
  add column if not exists categories text[];

-- Backfill: copy existing scalar values into the new array. Skip
-- rows already populated (e.g. from a partial earlier run) and rows
-- with null category.
update public.wishlist_places
   set categories = array[category]
 where categories is null
   and category is not null;
