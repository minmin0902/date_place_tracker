# 우리 맛집 · 我们的美食地图

A bilingual (한국어 / 中文) mobile-first web app for couples to log restaurants, rate every dish individually, and compare tastes over time.

## Stack

- React + TypeScript + Vite
- Tailwind CSS (pastel/warm custom theme)
- Supabase (Postgres + Auth + Storage)
- TanStack Query · React Hook Form · Zod
- i18next (ko / zh)
- Google Maps via `@vis.gl/react-google-maps`

## Getting started

### 1. Install

```bash
npm install
```

### 2. Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. **SQL Editor** → open [`supabase/schema.sql`](supabase/schema.sql) → run. This creates `places`, `foods`, `couples`, RLS policies, and the `join_couple()` RPC.
3. **Storage** → New bucket `place-photos` (public).
4. **Settings → API** → copy `URL` and `anon` key.

### 3. Google Maps

1. Enable **Maps JavaScript API** in Google Cloud Console.
2. Create a browser API key. Restrict it to your dev + deploy origins.

### 4. Env

```bash
cp .env.example .env.local
```

Fill in:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_MAPS_API_KEY=
```

### 5. Run

```bash
npm run dev
```

Open the dev URL on your phone (or use responsive mode in devtools) — the UI is designed mobile-first.

### Local (no-login) mode

For quick development or local-only use without Supabase auth, enable the local no-auth mode:

1. Set `VITE_ALLOW_NO_AUTH=true` in `.env.local`.
2. Run `npm run dev`.

This stores data in `localStorage` (couples, places, foods, photos as data URLs). Useful for two-person local use or demos.

## Flow

1. Both partners sign up with email + password.
2. Person A taps **커플 연결 → 코드 만들기** to get a 6-char invite code.
3. Person A shares the code; Person B enters it in **코드로 참여하기**.
4. Both now share the same `couple_id`; all places and foods are scoped to the couple.

## Structure

```
src/
  components/     Shared UI (AppShell, PageHeader, RatingPicker, …)
  hooks/          useAuth, useCouple, usePlaces, useWishlist, useMemos, …
  i18n/           ko.ts, zh.ts, index.ts
  lib/            supabase client, types, utils, constants
  pages/          Login, CoupleSetup, Home, PlaceDetail/Form, FoodForm,
                  Compare, Map, Wishlist, Notifications, Profile, Settings
supabase/
  schema.sql      Initial tables, RLS, join_couple RPC
  migrations/     Incremental schema changes (run in order)
  functions/
    send-push/    Edge Function — push notifications
```

## Data model

- **places**: name, date visited, address, category, memo, want-to-revisit, photos, lat/lng, couple_id, created_by
- **foods**: place_id, name, my_rating (1–5), partner_rating (1–5), category, memo, photo
- **couples**: user1_id, user2_id, invite_code

Food total = `my_rating + partner_rating` (max 10). Place avg = mean of food totals.

## Deploy

Vercel: connect repo, set the three env vars, deploy. No other config needed.

## License

MIT — see [LICENSE](LICENSE) for details.
