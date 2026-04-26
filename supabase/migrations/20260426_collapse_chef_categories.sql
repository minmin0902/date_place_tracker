-- The category picker briefly exposed 'by_me' / 'by_partner' as a
-- "누가 만들었어" group. They were redundant with the chef toggle and
-- never wrote to foods.chef, so picking them looked like setting a
-- chef but actually saved nothing. We removed the picker entries —
-- this migration migrates any rows that still carry those tags into
-- the chef field, then strips the tags so they don't reappear.
--
-- Idempotent: only touches rows that still have the legacy tag, and
-- the chef update only fires when chef is null (so we never overwrite
-- a properly set value).

-- 1. by_me → chef='me' (creator-perspective storage convention).
update public.foods
   set chef = 'me'
 where chef is null
   and 'by_me' = ANY(categories);

-- 2. by_partner → chef='partner'.
update public.foods
   set chef = 'partner'
 where chef is null
   and 'by_partner' = ANY(categories);

-- 3. Strip the now-redundant category tags from every row that has
--    them, regardless of chef state. Categories array is multi-tag
--    so this preserves any other categories the row carries.
update public.foods
   set categories = array_remove(categories, 'by_me')
 where 'by_me' = ANY(categories);

update public.foods
   set categories = array_remove(categories, 'by_partner')
 where 'by_partner' = ANY(categories);

-- 4. Legacy single-string `category` column may also still hold one
--    of the deprecated keys. Null it out so the chip renderer doesn't
--    surface it as a custom freeform tag.
update public.foods
   set category = null
 where category in ('by_me', 'by_partner');
