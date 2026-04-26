-- =============================================================
-- Per-food recipe fields. Home-cooked menus carry a recipe — text
-- (manual instructions) and/or screenshots (photos copied from
-- Instagram, Xiaohongshu, etc.). Both nullable so the columns are
-- backwards-compatible with existing food rows.
--
-- Restaurant-mode foods leave these empty; the form only exposes the
-- recipe section when foods.places.is_home_cooked is true.
-- =============================================================

alter table public.foods
  add column if not exists recipe_text text;

alter table public.foods
  add column if not exists recipe_photo_urls text[];
