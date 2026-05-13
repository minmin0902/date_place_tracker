-- =============================================================
-- RPC: reactions_for_place(p_place_id uuid)
--
-- Reason this exists: PlaceDetailPage hosts dozens of reaction
-- targets (place caption + every food caption + every thread memo
-- under either). Each ReactionRow used to mount its own
-- useReactions query → 30-40 round trips per page load. This RPC
-- returns every reaction in that place's subtree in ONE call so
-- the page can run a single query and slice client-side.
--
-- Subtree definition:
--   1. reactions.place_id = p_place_id            (place caption)
--   2. reactions.food_id IN (foods of that place) (food captions)
--   3. reactions.memo_id IN (memos targeting that place OR any of
--                            its foods)            (thread memos)
--
-- SECURITY DEFINER + RLS check on the parent place ensures the
-- caller can only see reactions for their own couple's place — we
-- look up the place and verify couple_id matches my_couple_id().
-- =============================================================

create or replace function public.reactions_for_place(p_place_id uuid)
returns setof public.reactions
language sql
stable
security definer
set search_path = public
as $$
  -- Couple guard: returns nothing if the caller doesn't own this
  -- place. Cheaper than relying on RLS on the underlying tables
  -- because we short-circuit before touching reactions at all.
  with my as (
    select id from public.places
    where id = p_place_id
      and couple_id = public.my_couple_id()
  ),
  food_ids as (
    select id from public.foods
    where place_id = p_place_id
      and exists (select 1 from my)
  ),
  memo_ids as (
    select id from public.memos
    where exists (select 1 from my)
      and (
        place_id = p_place_id
        or food_id in (select id from food_ids)
      )
  )
  select r.*
  from public.reactions r
  where exists (select 1 from my)
    and (
      r.place_id = p_place_id
      or r.food_id in (select id from food_ids)
      or r.memo_id in (select id from memo_ids)
    );
$$;

-- PostgREST exposes this as POST /rpc/reactions_for_place. Authn'd
-- couples invoke it via supabase.rpc('reactions_for_place', { p_place_id }).
grant execute on function public.reactions_for_place(uuid) to authenticated;
