-- =============================================================
-- In-app notification inbox + push subscriptions.
--
-- The two tables are intentionally separate:
--   - notifications  → durable inbox the bell icon reads from.
--                      Lives forever (or until row-level cleanup).
--   - push_subscriptions → ephemeral browser endpoints. Replaced
--                      whenever the user re-grants permission or
--                      switches device.
--
-- DB triggers on places / foods / memos auto-create a notification
-- row for the OTHER partner whenever one partner makes a change.
-- A separate Database Webhook (configured in the Supabase dashboard)
-- listens for inserts on `notifications` and invokes the
-- `send-push` Edge Function to actually deliver the web push.
-- =============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  -- 'place' | 'food' | 'memo' | 'memo_thread'
  --   place         — partner added a new place
  --   food          — partner logged a food on an existing place
  --   memo          — partner edited the primary memo on a place/food
  --   memo_thread   — partner added a memo to the threaded discussion
  kind text not null check (kind in ('place','food','memo','memo_thread')),
  actor_id uuid not null references auth.users(id) on delete set null,
  -- Target row pointers. Exactly one of place_id / food_id is set,
  -- with memo_id optionally non-null for kind='memo_thread'.
  place_id uuid references public.places(id) on delete cascade,
  food_id uuid references public.foods(id) on delete cascade,
  memo_id uuid references public.memos(id) on delete cascade,
  -- Short snippet shown in the inbox row + the push payload — keeps
  -- the receiver from having to fetch the source row just to render.
  preview text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications(recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (recipient_id = auth.uid());

-- Only the recipient can flip read_at; never lets you change recipient_id.
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete using (recipient_id = auth.uid());

-- INSERTs are done by SECURITY DEFINER triggers that bypass RLS, so
-- no INSERT policy for end users — they shouldn't be hand-creating
-- notifications.

-- ---------------------------------------------------------------
-- Trigger: someone added a place. Notify the OTHER partner.
-- ---------------------------------------------------------------
create or replace function public.notify_partner_on_place()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  the_couple public.couples%rowtype;
  partner uuid;
begin
  select * into the_couple from public.couples where id = new.couple_id;
  if the_couple is null then return new; end if;
  partner := case
    when the_couple.user1_id = new.created_by then the_couple.user2_id
    else the_couple.user1_id
  end;
  if partner is null or partner = new.created_by then return new; end if;
  insert into public.notifications
    (recipient_id, couple_id, kind, actor_id, place_id, preview)
  values
    (partner, new.couple_id, 'place', new.created_by, new.id, new.name);
  return new;
end;
$$;

drop trigger if exists notify_on_place_insert on public.places;
create trigger notify_on_place_insert
  after insert on public.places
  for each row execute function public.notify_partner_on_place();

-- ---------------------------------------------------------------
-- Trigger: someone added a food. Notify the OTHER partner.
-- Foods don't carry couple_id directly, so we join via places.
-- ---------------------------------------------------------------
create or replace function public.notify_partner_on_food()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  the_place public.places%rowtype;
  the_couple public.couples%rowtype;
  partner uuid;
begin
  select * into the_place from public.places where id = new.place_id;
  if the_place is null then return new; end if;
  select * into the_couple from public.couples where id = the_place.couple_id;
  if the_couple is null then return new; end if;
  partner := case
    when the_couple.user1_id = new.created_by then the_couple.user2_id
    else the_couple.user1_id
  end;
  if partner is null or new.created_by is null or partner = new.created_by then
    return new;
  end if;
  insert into public.notifications
    (recipient_id, couple_id, kind, actor_id, place_id, food_id, preview)
  values
    (partner, the_place.couple_id, 'food', new.created_by,
     new.place_id, new.id, new.name);
  return new;
end;
$$;

drop trigger if exists notify_on_food_insert on public.foods;
create trigger notify_on_food_insert
  after insert on public.foods
  for each row execute function public.notify_partner_on_food();

-- ---------------------------------------------------------------
-- Trigger: someone added a threaded memo. Notify the OTHER partner.
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
begin
  select * into the_couple from public.couples where id = new.couple_id;
  if the_couple is null then return new; end if;
  partner := case
    when the_couple.user1_id = new.author_id then the_couple.user2_id
    else the_couple.user1_id
  end;
  if partner is null or partner = new.author_id then return new; end if;
  insert into public.notifications
    (recipient_id, couple_id, kind, actor_id, place_id, food_id, memo_id, preview)
  values
    (partner, new.couple_id, 'memo_thread', new.author_id,
     new.place_id, new.food_id, new.id,
     -- 80-char clamp keeps push-payload size sane.
     left(new.body, 80));
  return new;
end;
$$;

drop trigger if exists notify_on_memo_insert on public.memos;
create trigger notify_on_memo_insert
  after insert on public.memos
  for each row execute function public.notify_partner_on_memo();


-- ===============================================================
-- Push subscriptions: per-browser PushManager endpoints. One user
-- can have multiple rows (phone + laptop).
-- ===============================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  -- Keys returned by PushManager.subscribe() — needed to encrypt the
  -- push payload server-side.
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subs_select_own" on public.push_subscriptions;
create policy "push_subs_select_own" on public.push_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists "push_subs_insert_own" on public.push_subscriptions;
create policy "push_subs_insert_own" on public.push_subscriptions
  for insert with check (user_id = auth.uid());

drop policy if exists "push_subs_update_own" on public.push_subscriptions;
create policy "push_subs_update_own" on public.push_subscriptions
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_subs_delete_own" on public.push_subscriptions;
create policy "push_subs_delete_own" on public.push_subscriptions
  for delete using (user_id = auth.uid());
