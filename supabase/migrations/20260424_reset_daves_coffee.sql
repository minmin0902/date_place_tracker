-- =============================================================
-- Wipe all place/food rows for the mj + jd couple and reseed with
-- the canonical Dave's Coffee dataset. Safe to re-run.
--   mj = mjjy0902@gmail.com  (363a941f-2991-4992-9a38-3a46430ae2c8)
--   jd = luoyuhan2025@gmail.com (aa9d102d-35f9-4334-820c-c8bd840e8685)
-- =============================================================

-- 1) Delete all places belonging to this couple (foods cascade via FK).
delete from public.places
where couple_id in (
  select id from public.couples
  where (user1_id, user2_id) = (
    '363a941f-2991-4992-9a38-3a46430ae2c8'::uuid,
    'aa9d102d-35f9-4334-820c-c8bd840e8685'::uuid
  )
  or (user1_id, user2_id) = (
    'aa9d102d-35f9-4334-820c-c8bd840e8685'::uuid,
    '363a941f-2991-4992-9a38-3a46430ae2c8'::uuid
  )
);

-- 2) Collapse any duplicate couple rows, keeping only the oldest.
delete from public.couples c
using public.couples older
where c.id <> older.id
  and c.user1_id = older.user1_id
  and c.user2_id is not distinct from older.user2_id
  and c.created_at > older.created_at;

-- 3) Reseed Dave's Coffee + 4 foods under the (single) surviving couple.
with surviving_couple as (
  select id from public.couples
  where (user1_id = '363a941f-2991-4992-9a38-3a46430ae2c8'
         and user2_id = 'aa9d102d-35f9-4334-820c-c8bd840e8685')
     or (user1_id = 'aa9d102d-35f9-4334-820c-c8bd840e8685'
         and user2_id = '363a941f-2991-4992-9a38-3a46430ae2c8')
  order by created_at asc
  limit 1
),
new_place as (
  insert into public.places (
    name, date_visited, address, category, want_to_revisit,
    latitude, longitude, created_by, couple_id
  )
  select
    'Dave''s Coffee',
    '2026-04-24',
    '341 Wayland Ave, Providence, RI 02906, USA',
    'cafe',
    true,
    41.8236,
    -71.4002,
    '363a941f-2991-4992-9a38-3a46430ae2c8',
    surviving_couple.id
  from surviving_couple
  returning id
)
insert into public.foods (place_id, name, my_rating, partner_rating)
select new_place.id, f.name, f.my, f.partner
from new_place, (values
  ('avocado toast',             3.8, 4.0),
  ('Prosciutto & ham & cheese', 3.6, 4.0),
  ('Pistachio & ube latte',     3.8, 4.5),
  ('iced americano',            3.6, 1.0)
) as f(name, my, partner);
