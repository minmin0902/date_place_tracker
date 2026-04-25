-- Fix: food-memo notifications had place_id null, so the inbox row
-- couldn't deep-link anywhere. Resolve the parent place from foods
-- when the memo targets a food, so every notification has a valid
-- /places/:id deep-link target.
--
-- Idempotent — uses CREATE OR REPLACE on the existing trigger fn.

create or replace function public.notify_partner_on_memo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  the_couple public.couples%rowtype;
  partner uuid;
  resolved_place_id uuid;
begin
  select * into the_couple from public.couples where id = new.couple_id;
  if the_couple is null then return new; end if;
  partner := case
    when the_couple.user1_id = new.author_id then the_couple.user2_id
    else the_couple.user1_id
  end;
  if partner is null or partner = new.author_id then return new; end if;

  -- For thread memos on a food, the memos row carries food_id only
  -- (place_id is null per the XOR check). Look up the parent place
  -- so the notification can deep-link to the place detail page —
  -- foods don't have their own route.
  resolved_place_id := new.place_id;
  if resolved_place_id is null and new.food_id is not null then
    select place_id into resolved_place_id
      from public.foods where id = new.food_id;
  end if;

  insert into public.notifications
    (recipient_id, couple_id, kind, actor_id, place_id, food_id, memo_id, preview)
  values
    (partner, new.couple_id, 'memo_thread', new.author_id,
     resolved_place_id, new.food_id, new.id,
     left(new.body, 80));
  return new;
end;
$$;

-- Backfill: existing food-memo notifications already inserted with
-- place_id null get patched up so the inbox can deep-link them too.
update public.notifications n
   set place_id = f.place_id
  from public.foods f
 where n.kind = 'memo_thread'
   and n.place_id is null
   and n.food_id = f.id;
