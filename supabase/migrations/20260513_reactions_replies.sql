-- =============================================================
-- Reactions + threaded replies + reaction/reply notification kinds.
--
-- Three things in one migration because they're a single feature
-- shipped together (Instagram-style reactions and 1-level replies
-- on memos + primary place/food captions):
--
--   1. memos.parent_id — top-level memo or nested reply (1 level)
--   2. reactions       — polymorphic (memo / place caption / food
--                        caption) so the existing primary memo on
--                        places.memo / foods.memo can take reactions
--                        without being migrated into the memos table
--   3. notifications.kind += 'reaction', 'memo_reply'
--      + a trigger on reactions + a special-case in the existing
--      memo trigger to fire 'memo_reply' when parent_id is set.
-- =============================================================

-- ---------------------------------------------------------------
-- 1. memos.parent_id  — single-level threading.
--    NULL → top-level comment (on a place / food primary memo).
--    Set  → reply nested under that top-level comment.
--    We don't DB-enforce "parent must be top-level"; the UI never
--    exposes a reply button on a row that already has parent_id,
--    and downstream queries treat unknown depths as top-level so
--    a stray nested row would still render harmlessly.
-- ---------------------------------------------------------------
alter table public.memos
  add column if not exists parent_id uuid
    references public.memos(id) on delete cascade;

create index if not exists memos_parent_idx
  on public.memos(parent_id)
  where parent_id is not null;

-- ---------------------------------------------------------------
-- 2. reactions — polymorphic via three nullable FK columns guarded
--    by an XOR-style CHECK. Same shape as memos.{place,food}_id so
--    it cascades on parent delete without an extra trigger.
-- ---------------------------------------------------------------
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized for RLS efficiency, mirroring memos.couple_id.
  couple_id uuid not null references public.couples(id) on delete cascade,
  -- Exactly one of these three is non-null (CHECK below).
  memo_id  uuid references public.memos(id)  on delete cascade,
  place_id uuid references public.places(id) on delete cascade,
  food_id  uuid references public.foods(id)  on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  -- Raw emoji string. Capped at 16 chars to leave room for ZWJ
  -- sequences (👨‍👩‍👧 is 18 bytes / 7 code units) without letting
  -- the column become a freeform note field.
  emoji text not null check (length(emoji) > 0 and length(emoji) <= 16),
  created_at timestamptz not null default now(),
  constraint reactions_target_xor check (
    (case when memo_id  is null then 0 else 1 end)
  + (case when place_id is null then 0 else 1 end)
  + (case when food_id  is null then 0 else 1 end)
    = 1
  )
);

-- Toggle uniqueness: a user can react with multiple emojis to the
-- same target, but not the SAME emoji twice. Three partial unique
-- indexes (one per scope) because NULLs in a multi-column UNIQUE
-- don't conflict in standard SQL, which would let duplicates slip
-- through if we used a single index over all three FKs.
create unique index if not exists reactions_unique_memo
  on public.reactions(memo_id, user_id, emoji)
  where memo_id is not null;
create unique index if not exists reactions_unique_place
  on public.reactions(place_id, user_id, emoji)
  where place_id is not null;
create unique index if not exists reactions_unique_food
  on public.reactions(food_id, user_id, emoji)
  where food_id is not null;

-- Lookup indexes so "give me all reactions on this memo / place /
-- food" stays cheap.
create index if not exists reactions_memo_idx
  on public.reactions(memo_id) where memo_id is not null;
create index if not exists reactions_place_idx
  on public.reactions(place_id) where place_id is not null;
create index if not exists reactions_food_idx
  on public.reactions(food_id) where food_id is not null;
create index if not exists reactions_couple_idx
  on public.reactions(couple_id);

alter table public.reactions enable row level security;

drop policy if exists "reactions_select_couple" on public.reactions;
create policy "reactions_select_couple" on public.reactions
  for select using (couple_id = public.my_couple_id());

drop policy if exists "reactions_insert_self" on public.reactions;
create policy "reactions_insert_self" on public.reactions
  for insert with check (
    couple_id = public.my_couple_id()
    and user_id = auth.uid()
  );

drop policy if exists "reactions_delete_own" on public.reactions;
create policy "reactions_delete_own" on public.reactions
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------
-- 3. Notifications: extend the kind enum.
--    PostgreSQL CHECK constraints can't be ALTERed in place — drop
--    + re-add. The Insert/Row type unions in database.types.ts are
--    updated alongside.
-- ---------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in (
    'place','food','memo','memo_thread',
    'revisit','rating',
    -- New:
    'memo_reply',  -- partner replied to a thread comment
    'reaction'     -- partner reacted (emoji) to a memo / caption
  ));

-- ---------------------------------------------------------------
-- 3a. Replace the memo trigger so replies fire 'memo_reply' instead
--     of 'memo_thread'. Recipient resolution is unchanged — still
--     the OTHER partner.
-- ---------------------------------------------------------------
create or replace function public.notify_partner_on_memo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  the_couple public.couples%rowtype;
  partner uuid;
  notif_kind text;
begin
  select * into the_couple from public.couples where id = new.couple_id;
  if the_couple is null then return new; end if;
  partner := case
    when the_couple.user1_id = new.author_id then the_couple.user2_id
    else the_couple.user1_id
  end;
  if partner is null or partner = new.author_id then return new; end if;
  notif_kind := case
    when new.parent_id is not null then 'memo_reply'
    else 'memo_thread'
  end;
  insert into public.notifications
    (recipient_id, couple_id, kind, actor_id, place_id, food_id, memo_id, preview)
  values
    (partner, new.couple_id, notif_kind, new.author_id,
     new.place_id, new.food_id, new.id,
     left(new.body, 80));
  return new;
end;
$$;

-- The trigger itself doesn't change — it already fires on every
-- insert into memos, including replies. Recreate idempotently in
-- case this migration ever runs on a fresh DB.
drop trigger if exists notify_on_memo_insert on public.memos;
create trigger notify_on_memo_insert
  after insert on public.memos
  for each row execute function public.notify_partner_on_memo();

-- ---------------------------------------------------------------
-- 3b. Reaction trigger: a partner tapped an emoji. We:
--   - skip self-reactions (same as memo trigger)
--   - resolve the deep-link target by reading whichever FK is set
--     (for scope='food', also look up the parent place_id so the
--     notification row can link to /places/<id>)
--   - put the emoji itself in `preview` so the inbox row reads
--     "❤️" without needing the receiver to re-fetch the memo
-- ---------------------------------------------------------------
create or replace function public.notify_partner_on_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  the_couple public.couples%rowtype;
  partner uuid;
  resolved_place_id uuid;
  resolved_food_id uuid;
  resolved_memo_id uuid;
begin
  select * into the_couple from public.couples where id = new.couple_id;
  if the_couple is null then return new; end if;
  partner := case
    when the_couple.user1_id = new.user_id then the_couple.user2_id
    else the_couple.user1_id
  end;
  if partner is null or partner = new.user_id then return new; end if;

  if new.memo_id is not null then
    resolved_memo_id := new.memo_id;
    select place_id, food_id
      into resolved_place_id, resolved_food_id
      from public.memos
      where id = new.memo_id;
  elsif new.place_id is not null then
    resolved_place_id := new.place_id;
  elsif new.food_id is not null then
    resolved_food_id := new.food_id;
    -- Foods don't carry couple_id, but they carry place_id which
    -- we need for the notification deep-link.
    select place_id into resolved_place_id
      from public.foods
      where id = new.food_id;
  end if;

  insert into public.notifications
    (recipient_id, couple_id, kind, actor_id,
     place_id, food_id, memo_id, preview)
  values
    (partner, new.couple_id, 'reaction', new.user_id,
     resolved_place_id, resolved_food_id, resolved_memo_id,
     new.emoji);
  return new;
end;
$$;

drop trigger if exists notify_on_reaction_insert on public.reactions;
create trigger notify_on_reaction_insert
  after insert on public.reactions
  for each row execute function public.notify_partner_on_reaction();
