-- =============================================================
-- Date Place Tracker — schema + RLS
-- Run this in Supabase SQL editor after creating a new project.
-- =============================================================

-- Extensions
create extension if not exists "pgcrypto";

-- --------------------------------------------------------------
-- couples
-- --------------------------------------------------------------
create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references auth.users(id) on delete cascade,
  user2_id uuid references auth.users(id) on delete set null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists couples_user1_idx on public.couples(user1_id);
create index if not exists couples_user2_idx on public.couples(user2_id);

-- Helper: current user's couple id
create or replace function public.my_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.couples
   where user1_id = auth.uid() or user2_id = auth.uid()
   limit 1
$$;

-- --------------------------------------------------------------
-- places
-- --------------------------------------------------------------
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date_visited date not null,
  address text,
  category text,
  memo text,
  want_to_revisit boolean not null default false,
  photo_urls text[],
  latitude double precision,
  longitude double precision,
  created_by uuid not null references auth.users(id) on delete set null,
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists places_couple_date_idx
  on public.places(couple_id, date_visited desc);

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists places_touch_updated_at on public.places;
create trigger places_touch_updated_at
  before update on public.places
  for each row execute function public.touch_updated_at();

-- --------------------------------------------------------------
-- foods
-- --------------------------------------------------------------
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  name text not null,
  my_rating int check (my_rating between 1 and 5),
  partner_rating int check (partner_rating between 1 and 5),
  category text,
  memo text,
  photo_url text,
  created_at timestamptz not null default now()
);

create index if not exists foods_place_idx on public.foods(place_id);

-- --------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------
alter table public.couples enable row level security;
alter table public.places  enable row level security;
alter table public.foods   enable row level security;

-- couples: member can see and update own row
drop policy if exists "couples_select_members" on public.couples;
create policy "couples_select_members" on public.couples
  for select using (auth.uid() = user1_id or auth.uid() = user2_id);

drop policy if exists "couples_insert_self" on public.couples;
create policy "couples_insert_self" on public.couples
  for insert with check (auth.uid() = user1_id);

drop policy if exists "couples_update_members" on public.couples;
create policy "couples_update_members" on public.couples
  for update using (auth.uid() = user1_id or auth.uid() = user2_id)
  with check (auth.uid() = user1_id or auth.uid() = user2_id);

-- Special: allow anyone authenticated to JOIN (update) a couple by invite_code,
-- but only if user2_id is currently null and user1_id != auth.uid().
-- Implement via a SECURITY DEFINER function below.

create or replace function public.join_couple(p_invite_code text)
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.couples;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.couples
     set user2_id = auth.uid()
   where invite_code = upper(p_invite_code)
     and user2_id is null
     and user1_id <> auth.uid()
  returning * into c;

  if c.id is null then
    raise exception 'invalid or already-claimed invite code';
  end if;

  return c;
end;
$$;

grant execute on function public.join_couple(text) to authenticated;
grant execute on function public.my_couple_id() to authenticated;

-- places: scoped to couple
drop policy if exists "places_select_couple" on public.places;
create policy "places_select_couple" on public.places
  for select using (couple_id = public.my_couple_id());

drop policy if exists "places_insert_couple" on public.places;
create policy "places_insert_couple" on public.places
  for insert with check (
    couple_id = public.my_couple_id()
    and created_by = auth.uid()
  );

drop policy if exists "places_update_couple" on public.places;
create policy "places_update_couple" on public.places
  for update using (couple_id = public.my_couple_id())
  with check (couple_id = public.my_couple_id());

drop policy if exists "places_delete_couple" on public.places;
create policy "places_delete_couple" on public.places
  for delete using (couple_id = public.my_couple_id());

-- foods: scoped via parent place
drop policy if exists "foods_select_couple" on public.foods;
create policy "foods_select_couple" on public.foods
  for select using (
    exists (
      select 1 from public.places p
       where p.id = foods.place_id
         and p.couple_id = public.my_couple_id()
    )
  );

drop policy if exists "foods_write_couple" on public.foods;
create policy "foods_write_couple" on public.foods
  for all using (
    exists (
      select 1 from public.places p
       where p.id = foods.place_id
         and p.couple_id = public.my_couple_id()
    )
  ) with check (
    exists (
      select 1 from public.places p
       where p.id = foods.place_id
         and p.couple_id = public.my_couple_id()
    )
  );

-- --------------------------------------------------------------
-- Storage bucket for photos
-- In Supabase dashboard: Storage → New bucket "place-photos" (public).
-- Or run:
-- insert into storage.buckets (id, name, public) values ('place-photos','place-photos', true)
-- on conflict (id) do nothing;
-- --------------------------------------------------------------
