-- =============================================================
-- Wishlist: places we haven't visited yet but want to.
-- =============================================================

create table if not exists public.wishlist_places (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  name text not null,
  category text,
  memo text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists wishlist_places_couple_idx
  on public.wishlist_places(couple_id, created_at desc);

alter table public.wishlist_places enable row level security;

drop policy if exists "wishlist_select_couple" on public.wishlist_places;
create policy "wishlist_select_couple" on public.wishlist_places
  for select using (couple_id = public.my_couple_id());

drop policy if exists "wishlist_insert_couple" on public.wishlist_places;
create policy "wishlist_insert_couple" on public.wishlist_places
  for insert with check (
    couple_id = public.my_couple_id()
    and created_by = auth.uid()
  );

drop policy if exists "wishlist_update_couple" on public.wishlist_places;
create policy "wishlist_update_couple" on public.wishlist_places
  for update using (couple_id = public.my_couple_id())
  with check (couple_id = public.my_couple_id());

drop policy if exists "wishlist_delete_couple" on public.wishlist_places;
create policy "wishlist_delete_couple" on public.wishlist_places
  for delete using (couple_id = public.my_couple_id());
