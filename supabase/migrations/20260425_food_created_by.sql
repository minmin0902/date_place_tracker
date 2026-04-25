-- =============================================================
-- Per-food authorship — track which partner entered each food row
-- so the UI can swap "내 별점 / 짝꿍 별점" labels per viewer.
-- Runs in Supabase SQL Editor; safe to re-run.
-- =============================================================

alter table public.foods
  add column if not exists created_by uuid;

-- Backfill: assume the food was logged by whoever created the parent
-- place. That's the only signal we have for legacy rows since we
-- weren't tracking per-food authorship before this migration.
update public.foods f
   set created_by = p.created_by
  from public.places p
 where f.place_id = p.id
   and f.created_by is null;
