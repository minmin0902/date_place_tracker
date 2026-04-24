-- =============================================================
-- One-time dev seed: connect the two known users as a couple and
-- insert the Dave's Coffee sample data.
-- Run this once in Supabase SQL Editor AFTER the two auth users
-- below exist in auth.users.
-- =============================================================

with new_couple as (
  insert into public.couples (user1_id, user2_id, invite_code)
  values (
    '363a941f-2991-4992-9a38-3a46430ae2c8', -- mjjy0902@gmail.com
    'aa9d102d-35f9-4334-820c-c8bd840e8685', -- luoyuhan2025@gmail.com
    'DAVE01'
  )
  returning id
),
new_place as (
  insert into public.places (
    name, date_visited, address, category,
    want_to_revisit, latitude, longitude,
    created_by, couple_id
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
    new_couple.id
  from new_couple
  returning id
)
insert into public.foods (place_id, name, my_rating, partner_rating)
select new_place.id, f.name, f.my, f.partner
from new_place, (
  values
    ('avocado toast',             3.8, 4.0),
    ('Prosciutto & ham & cheese', 3.6, 4.0),
    ('Pistachio & ube latte',     3.8, 4.5),
    ('iced americano',            3.6, 1.0)
) as f(name, my, partner);
