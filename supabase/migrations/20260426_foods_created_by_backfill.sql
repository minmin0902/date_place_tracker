-- Older food rows were inserted without created_by because the
-- standalone "메뉴 추가" form didn't stamp it. That breaks the
-- viewer-perspective swap helpers (chefForViewer / ratingsForViewer)
-- — without created_by they can't tell whether the viewer is the
-- row's author, so both partners end up seeing "내가 만들었어!"
-- on the same row.
--
-- Backfill from the parent place's created_by — the user who
-- created the place is by far the most likely original author of
-- the foods under it. Idempotent: only fills rows that are still
-- null, so re-running this is safe.

update public.foods f
   set created_by = p.created_by
  from public.places p
 where f.place_id = p.id
   and f.created_by is null
   and p.created_by is not null;
