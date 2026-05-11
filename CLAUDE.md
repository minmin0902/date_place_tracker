# Project context for Claude

This file is the working memory for Claude Code in this repo. Read it before
making non-trivial changes — the **Pitfalls** section in particular records
specific bugs that have already burned us, with the fixes that actually worked.
Do not re-introduce a pattern listed there without explicit reason.

## What this app is

Bilingual (한국어 + 中文) mobile-first PWA for couples to log restaurants,
rate every dish individually per partner, share home-cooking records,
maintain a wishlist, and compare tastes over time.

- **Stack**: React 18 + TypeScript + Vite · Tailwind · Supabase (Postgres +
  Auth + Storage) · TanStack Query · React Hook Form + Zod · i18next ·
  Google Maps via `@vis.gl/react-google-maps`.
- **Deploy**: Vercel. Build: `tsc -b && vite build` — `tsc -b` enforces
  `noUnusedLocals` (see *Build verification* below).
- **PWA**: service worker at `public/sw.js`, push notifications, app-icon
  badge for unread.

## Source layout

- `src/pages/` — route-level components (HomePage, ComparePage, etc.)
- `src/components/` — reusable UI (PageHeader, GroupedMultiSelect,
  PlaceCategoryPicker, MediaThumb, MediaLightbox, MemoThread, etc.)
- `src/hooks/` — TanStack Query hooks + utilities (`useDraft`,
  `useBodyScrollLock`, etc.)
- `src/lib/` — `supabase.ts`, `database.types.ts`, `utils.ts`, `localDb.ts`
  (no-auth dev mode), `constants.ts`.
- `supabase/migrations/*.sql` — additive migrations, dated. **Always add a
  migration when adding a column**; never edit the schema file in place.

## Working conventions (also in user memory)

- Commit messages: bilingual (Korean + English summary). No `Co-Authored-By:
  Claude` trailers.
- Run `npm run build` before claiming done — `tsc --noEmit` alone misses
  `noUnusedLocals` which Vercel's `tsc -b` enforces.
- For viewer-perspective columns (foods.my_rating / chef / eater), display
  through helpers (`ratingsForViewer`, `chefForViewer`) — never bind raw
  storage value to a "내가 / 짝꿍" label, it'll render swapped for the
  partner viewer.

## Major features built (rough chronology)

Read the git log for full detail; this is just the map.

### Core
- Place + food logging, per-partner rating, want_to_revisit toggle.
- Wishlist with `kind: 'restaurant' | 'recipe'`, location for restaurant
  kind, `recipe_text` + `recipe_photo_urls` for recipe kind.
  `다녀왔어요 / 만들어봤어요` promotes to `/places/new?fromWishlist=<id>`,
  PlaceFormPage prefills + auto-flips to home mode for recipes.
- Home cooking mode: `places.is_home_cooked`, `foods.chef` (`me` /
  `partner` / `together` / `null`), per-food recipe (text + screenshots).
- Bilingual UI throughout (i18next), CJK font priority, English fallback.
- Couple system + invite codes.

### Surfaces
- HomePage: timeline / wishlist tabs, list/grid/menu layout, FAB to add,
  filter sheet (sort + city + category multi-select + dining mode +
  revisit + unrated + my-only / partner-only).
- ComparePage: carousel of cards (TasteDiagnosis, HomeChef, Roulette,
  etc.) + tab strip for 명예의전당 / 입맛격돌 / 여긴패스. Each tab has
  per-restaurant / per-menu views (fame additionally has 집밥별); ranks
  shown.
- MapPage: per-place pins with revisit teardrop.
- NotificationsPage: in-app inbox + push subscription, deep-links into
  the relevant place.
- ProfileEditPage: dual nicknames + 한줄 + 좋아하는/싫어하는 + avatar.
- SettingsPage: language toggle, profile entry, password change,
  couple unlink, etc.
- RouletteModal: source toggle (간곳 / 가고싶은곳 / 모두), category +
  city dropdowns, 운명의 룰렛 spin button.

### Forms / pickers
- `PlaceCategoryPicker` (shared) — `GroupedMultiSelect` + freeform
  custom-tag input. Used by PlaceFormPage AND WishlistFormPage.
- `GroupedMultiSelect` — group headers with tri-state, single-select
  mode, allow-empty mode. Used everywhere.
- `MediaThumb` — img/video drop-in with optional lightbox via
  `MediaLightbox` (clickable=true by default; pass false for
  Link-wrapped thumbnails so taps still navigate).
- `MemoThread` — memo composer with photo attachments, `useFormDraft`
  persisted across app switches. `hideComposer` prop suppresses the
  composer on freshly created records.

### DB migrations cheat-sheet
- `categories text[]` on places / foods / wishlist_places — additive,
  with the legacy scalar `category` kept as `categories[0]` for
  back-compat. Always read via `getCategories(item)`.
- `wishlist_places.kind` (`restaurant` / `recipe`).
- `foods.recipe_text`, `foods.recipe_photo_urls`.
- `foods.eater` enum (`both` / `creator` / `partner`) — supersedes
  legacy boolean `is_solo`, kept in sync.
- `foods.chef` (`me` / `partner` / `together` / NULL). NULL means "no
  chef recorded" — must be treated as "drop from rankings", NOT
  "split into both".

---

## Pitfalls — patterns to avoid (read carefully)

These are bugs we've already shipped and rolled back. The fix listed is
the one that actually stuck after iteration.

### iOS Safari modal scrolling

**Symptom**: dropdown / modal opens but inner scroll snaps back on
release; or the bottom action button (저장 / spin) sits behind the URL
bar / home indicator and is unreachable.

**Why it happens (root causes accumulated)**:
1. `vh` is the LARGER (chrome-included) viewport on iOS. `max-h-[85vh]`
   is taller than the visible area when URL bar is up — the bottom of
   the card falls behind chrome.
2. `flex items-end` on a `fixed inset-0` parent pins the card's bottom
   edge to the layout-viewport bottom = behind the URL bar.
3. `position: fixed` body scroll-lock (`useBodyScrollLock`) can route
   touch-drag to the now-frozen body on iOS, eating the modal's scroll
   and rubber-banding back.
4. `backdrop-filter: blur` (Tailwind `backdrop-blur-*`) creates a
   stacking context that sometimes tangles with overflow-y scroll on
   iOS.
5. `transform` (incl. `translateZ(0)`) on a parent breaks `position:
   fixed` descendants AND can break sticky inside scroll containers.
6. `animate-in slide-in-from-bottom-*` (transform-based) on the same
   element with `overflow-y-auto` can confuse iOS touch routing during
   the animation window.

**Fix that works (current pattern, mirrored across modals)**:
- Outer overlay: `fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm
  flex items-center justify-center p-3` + inline style
  `height: 100dvh`. `items-center` (NOT `items-end`) on every
  breakpoint — centering keeps chrome breathing room top + bottom.
- Card: `flex flex-col overflow-hidden` with explicit
  `style={{ maxHeight: 'min(75svh, 600px)' }}`. `svh` is the
  smallest-viewport height (always inside the visible area regardless
  of URL bar state). 75% leaves margin; 600px caps desktop.
- Header: `flex-shrink-0`. Body: `flex-1 min-h-0 overflow-y-auto
  overscroll-contain`. Footer: `flex-shrink-0`. NEVER use sticky here
  — sticky-inside-overflow is unreliable on iOS.
- `useBodyScrollLock(open)` IS used elsewhere fine; for the
  `GroupedMultiSelect` we settled on plain `body.style.overflow =
  "hidden"` to avoid iOS touch-routing weirdness. Don't switch it back
  to `useBodyScrollLock` here without testing rubber-band.
- For the `WishlistFormPage` and `FoodFormPage`, the forms ARE pages
  (full route), not modals — that's why scroll there always worked.
  Convert to a real route when a flow needs lots of inputs.

**See**: `src/components/GroupedMultiSelect.tsx`, `RouletteModal` in
`HomePage.tsx`. Multiple commits chased this: `231b136`, `f6242eb`,
`fa0ed74`, `2c0d1e9`, `b2ce2a9`, `79ca5bf`. **Do not re-attempt the
visualViewport-anchored modal pattern** — it drifted on iOS PWA.

### Page wrapper transforms break fixed children

`transform` on any ancestor of a `position: fixed` element creates a
new containing block, which silently breaks every FAB / sticky / pull
indicator / modal underneath. AppShell's `.animate-fade-up` uses
opacity-only for this exact reason. **Never add `transform` to a
page-level wrapper or a route transition keyframe.** If you need a
slide-in, scope it to subtree that contains no fixed descendants.

See `src/index.css` near `.animate-fade-up`.

### Vercel build vs local build

`tsc --noEmit` alone passes locally even with unused imports / locals;
`tsc -b` (used by Vercel) enforces `noUnusedLocals`. **Always run
`npm run build` before claiming done**, not just type-check. Caught
multiple shipped breakages (e.g., `acd6a18`).

### Viewer-perspective columns

`foods.my_rating` / `partner_rating` / `chef` / `eater` are stored
from the **food creator's** perspective. Binding them directly to a
"내가 / 짝꿍" label renders correctly for the creator and SWAPPED for
their partner. Always go through:
- `ratingsForViewer(food, user.id)` for ratings
- `chefForViewer(food, user.id)` for chef
- viewer-eater swap helpers in `FoodFormPage`

Past bugs from violating this: `c6a458b`, `488ef1b`,
`feedback_viewer_perspective.md` in user memory.

### chef = NULL semantics

`foods.chef` of NULL means "no chef recorded" (premade dishes, legacy
rows). Stats / rankings must SKIP these rows entirely — counting them
as "split between both partners" makes orphaned dishes appear in
both per-partner cooked-by lists (`2d2b171`, `0d7f647`). The
`HomeChefCard` aggregator does this correctly; mirror it for any new
chef-aware view.

### `category` (scalar) vs `categories` (array)

`places` / `foods` / `wishlist_places` all migrated from a single
`category` string to a `categories text[]`. The legacy scalar is kept
as `categories[0]` for older clients. **Always read via
`getCategories(item)`** which falls back to the scalar; never branch
directly on `item.category`.

When you write, populate BOTH columns:
```ts
category: arr[0] ?? null,
categories: arr.length ? arr : null,
```

### Duplicate UI for the same data shape

We've twice deleted custom inline duplicates of canonical pickers
because they drifted from the canonical implementation:
- `HomeFoodCard` (inline multi-menu in PlaceFormPage home mode) →
  removed in `7c8cf3a`. FoodFormPage IS the per-menu canvas.
- `PlaceCategoryPicker` was inlined twice — extracted to
  `src/components/PlaceCategoryPicker.tsx` and shared between
  PlaceFormPage and WishlistFormPage in `9e1d454`.

Before adding a new "almost the same" picker / card, search the
components folder first. If two surfaces need the same UX, share the
component.

### Wishlist add must be a page, not a sheet

Wishlist add was originally a `<WishlistAddSheet>` modal. iOS save-
button visibility was a chronic problem (URL bar, keyboard, sticky
footer, every angle). Fixed permanently by converting to a real route
`/wishlist/new` (`494aefd`) — `<WishlistFormPage>`. Same pattern with
`PlaceFormPage` / `FoodFormPage`. **For any non-trivial form, prefer
a route over a modal.**

### Notification deep-link cold-start back button

Push notification → service worker `clients.openWindow(target)` →
React Router cold-starts at the deep link. History stack is empty;
`navigate(-1)` is a no-op (PWA freezes; browser exits). PageHeader's
back button now detects `location.key === "default"` (the marker
React Router stamps on the first entry) and falls back to
`navigate("/")` so users always have an out (`613953d`).

If you add a new back button outside `PageHeader`, mirror this
fallback.

### Wishlist row preservation on form abandonment

`/places/new?fromWishlist=<id>` deletes the wishlist row INSIDE
`PlaceFormPage.onSubmit` AFTER `upsertPlace` succeeds — never on
navigate. So if the user abandons the form (back / close), the
wishlist row stays. Don't move the deletion earlier.

### iOS Chinese IME composition

Mounting / unmounting a sibling element near a textarea while the user
is mid-composition (中文 IME, Korean IME) clobbers the in-progress
input — feels like a sudden refresh. Hide / show with `opacity` +
`pointer-events-none` instead of mount/unmount when the trigger is
near a typing surface (memo composers, author pickers). See
`MemoThread.tsx`, `MemoComment.tsx`.

### Memo composer on fresh records

A brand-new place / food shouldn't open with an empty memo composer —
felt cluttered, users were not yet at "leave a memo" mindset.
`PlaceFormPage` post-save passes `state: { justCreated: true }` to
`/places/<id>`. PlaceDetailPage reads `location.state.justCreated` and
hides the composer + the wrapping memo card on first arrival. Composer
returns on later visits via timeline / deep link (`2cabe56`).

### iOS PWA cache

`index.html` should be `Cache-Control: no-cache`; built assets
(`/assets/*`) are immutable + hashed. Without this, iOS PWA users get
stale UI for days after a deploy. See `c03a524` and `vercel.json` /
`vite.config`.

### Roulette card vs modal counts

The dashboard `RouletteCard` count must match the modal pool. We had
`revisitCount` (only `want_to_revisit`-flagged places) advertised as
"또 갈래" but the modal spins from ALL places — card understated the
candidate set. Now `visitedCount = places.length` (total) and the
label is "가본 곳 · 去过的". Aggregate line below clarifies "총 N곳
중에서 한 곳" framing (`1ddc36e`).

### Race conditions on rapid taps

Mutation buttons that fire on tap (toggle revisit, save, delete,
mark-visited) need a guard against double-tap firing the mutation
twice — second invocation often flips the state back. Pattern:
```ts
if (mutation.isPending) return;
```
at the top of the handler. See `997890e`.

### `font-number` for digits

CJK fonts render Latin digits with weird metrics. We have a
`font-number` utility (Inter/SF Mono mix) for ratings, counts, dates,
total scores. **Use `font-number` on any numeric display** — without
it, "4.5" looks tall and narrow next to Korean / Chinese text.

### Filter / sort persistence

HomePage filter state (sort, city, category, dining mode, etc.) is
persisted via `sessionStorage` so users don't lose it on
back-navigation. When adding a new filter, add it to the same
sessionStorage shape — see `initialFilters.current` in `HomePage.tsx`.

### Lightbox vs link semantics on thumbnails

`MediaThumb` defaults to `clickable={true}` (taps open
`MediaLightbox`). When a thumb is INSIDE a `<Link>` (timeline cards,
food rows that should navigate to detail), pass `clickable={false}` —
otherwise tapping opens lightbox AND navigates, both at once.

### Build verify with `npm run build`, NOT `tsc --noEmit`

This bites repeatedly. `tsc --noEmit` skips composite-project rules;
`tsc -b` (used by `npm run build` and Vercel) enforces
`noUnusedLocals` / `noUnusedParameters`. Local `tsc --noEmit` will
happily pass code with unused imports that breaks Vercel CI. **Run
`npm run build` (or `npx tsc -b`) before claiming a change is done**
— `de0f996` was a hot-fix landed because we trusted `tsc --noEmit`
output and pushed unused imports.

If the build hits a long-running rolldown timeout, fall back to
`npx tsc -b` alone (skip Vite's bundling) — that catches every
TypeScript-side error Vercel will catch.

### Route changes must reset scroll

React Router doesn't auto-scroll-to-top between routes. Without a
`<ScrollToTop>` listener, navigating from a long timeline to another
page lands the new route at the previous scroll position — feels
like "the page shifts down on every nav". `AppShell` mounts a
`<ScrollToTop>` that calls `window.scrollTo(0, 0)` on every
`useLocation()` change. Don't remove it without replacing.

### vh vs dvh for full-height pages

Pages whose container fills the viewport (e.g. `MapPage`'s
`h-[calc(100vh-5rem)]` wrapper) MUST use `dvh`, not `vh`. iOS Safari
treats `vh` as the LARGER possible viewport (URL bar hidden), so
`100vh` extends behind the URL bar and the page jiggles every time
the bar shows/hides. `100dvh` is the dynamic visible area —
container resizes with chrome.

`MapPage` ships as `h-[calc(100dvh-5rem)]`. Mirror that for any other
viewport-filling layout.

### Multiple selectable datasets on one map / list

`MapPage` shows BOTH `places` (visited) and `wishlist` (가고싶다)
markers. Each has its own id space; a numeric collision could pick
the wrong card on InfoWindow open. Use namespaced selection ids:
`selectedId = "place:<id>" | "wish:<id>"`, derive `selectedPlace` /
`selectedWish` separately. Same idea applies if you ever add a third
source on the map (e.g. friends' picks).

### Emoji width truncates bilingual labels on iOS

iOS Safari renders some emojis (🍽️, 🍳, 🌏, etc.) noticeably wider
than the JS-side measurement predicts, so a 3-segment row with
"🍽️ 외식 · 探店" + "🍳 집밥 · 私房菜" labels truncates on 360px
phones. Dropping Korean is the working compromise:
- If the segment also has a leading lucide icon (list/grid/menu),
  drop both Korean and emoji — keep Chinese-only since the icon
  already conveys the mode language-agnostically.
- If the leading marker IS the emoji (dining filter), keep emoji +
  Chinese, drop Korean. "모두 · 全部" is short enough to stay full.

Don't try CSS-side fixes (font-size, letter-spacing, scaling) — the
emoji width is OS-rendered, not measurable from JS. Just shorten
text. See `e3970ab` for the actual diff.

### Raw float renders show 16-digit ugly form

JavaScript decimal addition leaks float-imprecision into the UI:
`4.1 + 3.2 = 7.300000000000001`. Anywhere we render a SUMMED or
COMPUTED score (not a stored single rating, which RatingPicker
quantizes to 0.5 steps), wrap with `.toFixed(1)` (or `.toFixed(2)`
for the per-person average tile). FoodFormPage's `{total} / 10`
display was the leak that surfaced this — fixed in a follow-up.
Don't render arithmetic results raw; every `{a + b}` or `{x / y}` in
JSX needs a `.toFixed(n)` after.

### `height: 100%` vs `100dvh` for the page root

iOS Safari resolves `height: 100%` on the html/body/#root chain to
the LAYOUT viewport, which extends behind the URL bar AND home
indicator. Result: the bottom nav and last row of any scrollable
content sit slightly under the visible area — the page "doesn't
fit." The `index.css` root chain ships as:

```css
html, body, #root {
  height: 100%;       /* fallback for old engines */
  height: 100dvh;     /* override on modern browsers */
}
```

`dvh` tracks the dynamic VISIBLE viewport, not layout viewport. Don't
revert the `100%` line — it's the fallback for browsers without dvh
(very old iOS / WebView). Don't add another rule on top — the chain
is already what we want.

---

## When debugging a UI issue

Before going deep, check:
1. Are you on iOS? Many issues are iOS-only — try desktop Chrome
   first to isolate.
2. Is there a `transform` on any ancestor? Breaks `position: fixed`
   silently.
3. Is body locked? `position: fixed` body lock + nested overflow scroll
   = iOS sadness.
4. Is the count / display reading from the perspective-stored column
   directly without the `*ForViewer` helper?
5. Are you mounting/unmounting a sibling near an active textarea
   (IME)?
6. Did you add a column without writing the migration AND updating
   `database.types.ts`?
7. "Page jiggles vertically" — check for `100vh` (should be
   `100dvh`) and verify `<ScrollToTop>` still mounts in `AppShell`.
8. Build error in Vercel but local OK? You ran `tsc --noEmit` —
   re-run with `npm run build` / `npx tsc -b`.

When in doubt, grep the previous fix commits referenced in this file
for the actual diff that worked.
