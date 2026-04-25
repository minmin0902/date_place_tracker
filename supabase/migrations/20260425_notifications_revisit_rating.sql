-- Add two more notification kinds:
--   'revisit'  — partner toggled "또 갈래" on a place
--   'rating'   — partner just rated a food (filled my_rating or
--                partner_rating from null)
--
-- Both are UPDATE events, so the existing INSERT-only triggers on
-- places/foods don't fire. We add fresh AFTER UPDATE OF triggers
-- gated on column-level changes.

-- ---------------------------------------------------------------
-- Extend the kind check constraint. Drop + re-add with the new
-- values; idempotent because both DDLs use IF EXISTS / overwrite.
-- ---------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('place','food','memo','memo_thread','revisit','rating'));

-- ---------------------------------------------------------------
-- revisit: places.want_to_revisit went false → true
-- ---------------------------------------------------------------
create or replace function public.notify_partner_on_revisit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  the_couple public.couples%rowtype;
  partner uuid;
  actor uuid;
begin
  -- Only fire on the "newly wanted" transition, not the "no longer
  -- want" toggle. Two-way notifications would spam if the user
  -- waffles between yes/no.
  if new.want_to_revisit is not true or old.want_to_revisit is true then
    return new;
  end if;

  -- The actor on a places UPDATE is whoever made the API call.
  -- auth.uid() reads from the JWT context which Supabase sets per
  -- request, so it works even though this function is SECURITY
  -- DEFINER (the JWT setting is per-connection, not per-role).
  actor := auth.uid();
  if actor is null then return new; end if;

  select * into the_couple from public.couples where id = new.couple_id;
  if the_couple is null then return new; end if;
  partner := case
    when the_couple.user1_id = actor then the_couple.user2_id
    else the_couple.user1_id
  end;
  if partner is null or partner = actor then return new; end if;

  insert into public.notifications
    (recipient_id, couple_id, kind, actor_id, place_id, preview)
  values
    (partner, new.couple_id, 'revisit', actor, new.id, new.name);
  return new;
end;
$$;

drop trigger if exists notify_on_revisit_toggle on public.places;
create trigger notify_on_revisit_toggle
  after update of want_to_revisit on public.places
  for each row execute function public.notify_partner_on_revisit();

-- ---------------------------------------------------------------
-- rating: foods.my_rating or foods.partner_rating filled from null
-- ---------------------------------------------------------------
create or replace function public.notify_partner_on_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  the_place public.places%rowtype;
  the_couple public.couples%rowtype;
  partner uuid;
  actor uuid;
  my_just_rated boolean;
  partner_just_rated boolean;
begin
  my_just_rated := old.my_rating is null and new.my_rating is not null;
  partner_just_rated := old.partner_rating is null
                    and new.partner_rating is not null;

  -- Skip when neither rating just appeared (e.g. revising an existing
  -- rating, photo edit, etc).
  if not my_just_rated and not partner_just_rated then
    return new;
  end if;

  select * into the_place from public.places where id = new.place_id;
  if the_place is null then return new; end if;
  select * into the_couple from public.couples where id = the_place.couple_id;
  if the_couple is null then return new; end if;

  -- Storage convention:
  --   my_rating       belongs to foods.created_by
  --   partner_rating  belongs to the other partner
  -- Pick the actor accordingly so the notification credits the right
  -- person regardless of which UI session typed the value.
  if my_just_rated then
    actor := new.created_by;
  else
    actor := case
      when the_couple.user1_id = new.created_by then the_couple.user2_id
      else the_couple.user1_id
    end;
  end if;
  if actor is null then return new; end if;

  partner := case
    when the_couple.user1_id = actor then the_couple.user2_id
    else the_couple.user1_id
  end;
  if partner is null or partner = actor then return new; end if;

  insert into public.notifications
    (recipient_id, couple_id, kind, actor_id, place_id, food_id, preview)
  values
    (partner, the_place.couple_id, 'rating', actor,
     new.place_id, new.id, new.name);
  return new;
end;
$$;

drop trigger if exists notify_on_food_rating on public.foods;
create trigger notify_on_food_rating
  after update of my_rating, partner_rating on public.foods
  for each row execute function public.notify_partner_on_rating();
