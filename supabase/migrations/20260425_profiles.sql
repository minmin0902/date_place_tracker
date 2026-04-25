-- =============================================================
-- profiles: 사용자별 프로필 정보 — 듀얼 닉네임, 프사, 한 줄 소개,
-- 불호 식재료. user_id PK 로 auth.users 와 1:1.
--
-- 듀얼 닉네임 시스템:
--   nickname           — 내가 나를 부르는 이름 (앱 전체 default)
--   partner_nickname   — 내가 *짝꿍*에게 붙여준 애칭. 짝꿍이 자기
--                       프로필 화면에 들어가면 "OOO이 너를 이렇게
--                       부르고 있어" 로 보임.
--
-- Supabase SQL Editor 에서 한 번 실행. 재실행해도 안전.
-- =============================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  -- 짝꿍에게 붙여준 애칭 — 1행이 "내 view"이라 partner 입장에서
  -- 자기 프로필 보면 partner_nickname 가 곧 "내가 나를 부르는 이름이
  -- 아니라 짝꿍이 나를 부르는 이름" 으로 노출됨.
  partner_nickname text,
  avatar_url text,
  bio text,
  hate_ingredients text[] default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at 자동 갱신 트리거
create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- ---------- RLS ----------
-- 본인 행 + 같은 커플의 짝꿍 행을 read 가능. 본인 행만 write.
alter table public.profiles enable row level security;

drop policy if exists "profiles read own + partner" on public.profiles;
create policy "profiles read own + partner"
  on public.profiles for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.couples c
      where (c.user1_id = auth.uid() and c.user2_id = profiles.user_id)
         or (c.user2_id = auth.uid() and c.user1_id = profiles.user_id)
    )
  );

drop policy if exists "profiles upsert own" on public.profiles;
create policy "profiles upsert own"
  on public.profiles for insert
  with check (user_id = auth.uid());

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- avatar storage bucket ----------
-- 아바타 사진은 'avatars' 버킷에 user_id/<filename> 식으로 저장.
-- 업로드는 본인만, 조회는 모두에게 공개(URL 알면 보이는 정도).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars upload own" on storage.objects;
create policy "avatars upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');
