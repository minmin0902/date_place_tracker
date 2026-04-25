-- =============================================================
-- Memos thread: lets either partner leave their own memo on an
-- already-posted place or food without overwriting the other's.
--
-- Additive design — places.memo / foods.memo (the "first memo"
-- typed in the create-form) stays where it is. This table holds
-- additional memos any partner adds later from the detail page's
-- inline composer. The detail page renders the legacy memo first,
-- then this thread, in chronological order.
-- =============================================================

create table if not exists public.memos (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized couple_id so RLS doesn't have to traverse a join
  -- on every read (mirrors the wishlist_places pattern).
  couple_id uuid not null references public.couples(id) on delete cascade,
  -- Exactly one of these is set. The XOR check below enforces it
  -- — a memo always targets either a place or a food, never both.
  place_id uuid references public.places(id) on delete cascade,
  food_id uuid references public.foods(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete set null,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memos_target_xor check (
    (place_id is not null) <> (food_id is not null)
  )
);

create index if not exists memos_place_thread_idx
  on public.memos(place_id, created_at);
create index if not exists memos_food_thread_idx
  on public.memos(food_id, created_at);
create index if not exists memos_couple_idx
  on public.memos(couple_id);

alter table public.memos enable row level security;

drop policy if exists "memos_select_couple" on public.memos;
create policy "memos_select_couple" on public.memos
  for select using (couple_id = public.my_couple_id());

drop policy if exists "memos_insert_couple" on public.memos;
create policy "memos_insert_couple" on public.memos
  for insert with check (
    couple_id = public.my_couple_id()
    and author_id = auth.uid()
  );

-- Authors edit/delete only their own memos. Other partner can add
-- their own memo, but can't rewrite or delete yours.
drop policy if exists "memos_update_own" on public.memos;
create policy "memos_update_own" on public.memos
  for update using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "memos_delete_own" on public.memos;
create policy "memos_delete_own" on public.memos
  for delete using (author_id = auth.uid());
