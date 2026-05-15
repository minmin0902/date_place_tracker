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
- `memos` table — `{couple_id, place_id XOR food_id, author_id, body,
  photo_urls, parent_id, created_at, updated_at}`. `parent_id`
  enables unbounded depth threading; the UI flattens visually.
- `reactions` table — polymorphic via three nullable FKs
  `(memo_id, place_id, food_id)` guarded by an XOR CHECK. Unique
  per `(target, user_id, emoji)` via 3 partial indexes (NULLs in a
  single UNIQUE wouldn't conflict). Couple_id denormalized for RLS.
- `notifications` table — `kind` text CHECK enum (`place / food /
  memo / memo_thread / memo_reply / revisit / rating / reaction`).
  Triggers on places / foods / memos / reactions / foods.rating /
  places.want_to_revisit insert rows, all `SECURITY DEFINER` so they
  bypass the row-level INSERT policy (no end-user INSERT policy by
  design). Webhook → `send-push` Edge Function fans out to FCM/APNs
  via `push_subscriptions`.
- `reactions_for_place(p_place_id)` RPC — single round-trip pulls
  every reaction in a place's subtree (caption + foods + memos).
  Backs `ReactionProvider` so PlaceDetailPage doesn't fire 30+
  per-row useReactions queries.

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

### Route changes must reset scroll — and POP must restore it

React Router doesn't auto-scroll-to-top between routes. AppShell
mounts a `<ScrollManager>` (NOT a naïve ScrollToTop) that:
- On PUSH/REPLACE: scrollTo(0, 0)
- On POP (back button): restores the saved scrollY for that path
  from sessionStorage. **Single-shot scrollTo at POP fails** when
  the destination is data-driven (React Query renders cached data
  fast but late effects keep the document growing for tens of ms).
  Solution: keep nudging scrollTo back to target each rAF for up
  to ~600ms, BAIL immediately on wheel / touchstart / keydown so
  we don't fight a user gesture.
- Also `window.history.scrollRestoration = 'manual'` so browser
  doesn't race us.

**Don't add a `key={location.pathname}` wrapper on Outlet.** It
force-remounts the entire route tree on POP — kills cached state +
fights scroll restoration. The previous pretty `.animate-fade-up`
keyed remount was removed for exactly this reason.

See `src/components/AppShell.tsx` `ScrollManager`.

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

### Place category vs food category — don't conflate

`places` and `foods` both carry their own categories. A bar (place
category 'bar') still serves food, so filtering by
`placeCategories.includes('bar')` leaks non-drink items (charcuterie,
appetizers) into a 술 ranking. To pull "actual drinks" use the FOOD
category: `foodCategories.includes('drink')`. Same logic when
isolating any food type (main, side, dessert) — don't take the place's
category as a proxy.

`ComparePage`'s Row type carries BOTH `placeCategories` and
`foodCategories` so view filters can pick the right axis. When adding
a new view here, decide upfront which axis the filter rides on.

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

## Reactions + memo threading

### Memo threading is unbounded depth, flat-rendered

`memos.parent_id` references another memo. UI uses `gatherDescendants(rootId)`
to collect ALL descendants regardless of depth, sort by `created_at` asc,
and render them at a SINGLE indent level under the top-level memo. Every
memo (top-level OR reply) gets its own `[답글]` button + `ReplyComposer`
— users can reply-to-reply infinitely on the DB side; visually it stays
flat for mobile readability.

Deletes cascade via FK `ON DELETE CASCADE`. Single memo delete wipes its
whole child chain.

### Reactions are polymorphic — XOR target columns

`reactions(memo_id, place_id, food_id, ...)` with a CHECK that exactly
one is non-null. Primary memo on `places.memo` / `foods.memo` ISN'T a
memos row, so reactions on captions target the parent place/food
directly. Reactions on thread memos target the memo.

Common bug: **food-scoped memos / reactions have `place_id = NULL`** in
both the underlying `memos` / `reactions` row AND the `notification`
row (the trigger copies them as-is). To attribute a food-scoped event
to a parent place, route through `useReactionBatch` (PlaceDetail) or
`ContextResolver.foodPlaceIdOf` (NotificationsPage).

### Batch reactions — don't fire per-row HTTP

PlaceDetailPage has 30-40 reaction targets (caption + foods + memos).
Per-row `useReactions` = 30+ round trips on mount. Solution:
- `<ReactionProvider placeId>` wraps the tree. It runs the
  `reactions_for_place(p_place_id)` RPC ONCE.
- `ReactionRow` checks for a provider via `useReactionBatch()`. If
  present, reads its slice from the bucketed map. If not, falls back
  to `useReactions(target)` (e.g. on Compare page, isolated rows).
- Optimistic toggle writes BOTH the per-target cache AND the bulk
  cache, so the bubble flips instantly under either subscription mode.

If the RPC migration hasn't shipped, the provider detects `bulk.isError`
and renders `{children}` raw, so consumers transparently fall back.

### Quick reactions set is fixed

`QUICK_REACTIONS = ["❤️", "😘", "😋", "🥹", "🔥", "👍"]`. The
expand picker tried as a 24-grid in one experiment; **inside narrow
columns (memo thread) the grid wrapped to a tall single column** —
ugly. The popover is now a horizontal pill row with just the 6
quick reactions. Don't re-introduce the extended grid without a
fixed-width portal/popover layout.

### Reaction picker click-outside on touch

`pointerleave` doesn't fire on touch devices. The palette closes via
a global `pointerdown` (capture phase) listener installed when
`paletteOpen`, comparing target against `paletteAnchorRef` /
`paletteRef`. Don't switch back to `pointerleave`.

---

## NotificationsPage architecture

The inbox is dense — restructure history was painful. Current shape:

### Data
- `useNotifications` returns last **14 days** (`gte('created_at',
  now-14d)`) with a 500-row safety cap. Not LIMIT 50 — busy days get
  truncated mid-stream that way.
- `useMarkNotificationRead` does **optimistic patch via setQueryData**,
  NO list invalidate. Just patches the row's `read_at` in cache. Only
  the unread-count badge invalidates (cheap COUNT query). Without this,
  every tap triggered a refetch + render wave on a 200+ row inbox.
- `useMarkAllNotificationsRead` same optimistic pattern (maps every
  unread row → `read_at = now()` in cache).

### Context resolver
- `usePlaces(coupleId)` loads once at page level. `ContextResolver`
  exposes `placeNameOf / foodNameOf / placeMemoOf / foodMemoOf /
  placePhotoOf / foodPhotoOf / memoTextOf / parentMemoTextOf /
  memoPhotoOf / foodPlaceIdOf / foodPlaceNameOf`. Provided via
  React Context so 50+ rows share lookup without re-fetching.
- `useNotificationMemoLookup` fetches memo bodies for visible notif
  rows (and their parent memos for replies) in two batched IN-clauses.
  Feeds memoTextOf / parentMemoTextOf.

### Grouping
Three tiers, all rebuilt on the (visibleItems, filter, rowContext)
useMemo:

1. **DateHeader** rows emitted whenever the calendar day changes
   walking the newest-first feed. Labels: "오늘 / 어제 / M월 D일".

2. **ActivityBundle** cards collapse all events for the same
   `(place_id, day, actor_id)` in the 전체 filter. Place becomes the
   header, sub-rows show kind tallies (`🍴 메뉴 N`, `💬 메모/답글 N`,
   etc.). Reactions are extracted into a separate ReactionBundle.
   `effectivePlaceId = n.place_id ?? rowContext.foodPlaceIdOf(n.food_id)`
   keeps food-scoped notifications inside their parent place's card.

3. **ReactionBundle** rows group emoji reactions by
   `(actor, target signature)` Instagram-style ("❤️😘 3"). Lives
   alongside ActivityBundles within the date section.

### Filter behavior
- "전체" filter: bundling enabled (above).
- All other chips (`새 기록 / 메모/이모지 / 평점 / 또 갈래`): bundling
  DISABLED, every notification rendered as a detailed single row.
  Users in a narrow filter want every event, not a summary.
- Filter chip clicks go through `startTransition(() => setFilter(k))`
  so the chip highlight flips instantly while the heavy list rebuild
  runs in a transition.

### Sub-row clickability
Each sub-row in an ActivityBundle is its own button with its own
scoped deep-link (memo → `#memo-<id>`, food → `#food-<id>`, etc.) and
its own mark-read scope. Implemented as `<article>` container with
SIBLING `<button>` elements — nested buttons are invalid HTML.

### Header verb
- Single-kind bundle: use `kindSpec(primaryKind).verb` ("별점 · 打分",
  "메뉴 추가 · 添加菜品", etc.).
- Multi-kind bundle: catch-all "새 기록 · 新记录".
- placeEvent present: always "새 장소 · 新地点".

Don't simplify to a binary placeEvent / else — single-kind bundles
will read "새 기록" misleadingly.

### Place name display rule
- ActivityBundleItem header: show `placeName` ONLY when
  `bundle.placeEvent` is set. Other bundles intentionally hide it —
  user fed back that always-showing-place was visually noisy.
- NotificationItem bodyLine: kind === "place" shows `item.preview`
  (= place name). Other kinds derive from memo / food / emoji.

### Don't downgrade N=1 bundles
The bundle layout is preserved even at 1 event so memos/replies always
show their parent place as a bold header line, not a truncated
breadcrumb. Previously we collapsed N=1 → flat single row; the user
hated losing the parent context.

### Reaction notifications get the actor's actual emoji
The trigger puts `preview = new.emoji`, so the inbox preview reads the
emoji directly without re-fetching the reaction row.

### KindBadge corner badge
Each row's avatar carries a `<KindBadge kind>` in the bottom-right
corner with a color-coded icon (place=emerald MapPin, food=amber
Utensils, memo=sky MessageCircle, reply=indigo CornerDownRight,
reaction=rose Smile, rating=yellow Star, revisit=pink Heart). Plus
the verb text uses the same color. First-glance type recognition.

---

## Performance budget

The app went through several "everything's janky" rounds. These are
the techniques that stuck:

### React Query defaults
- `staleTime: 30_000`, `retry: 1`.
- **`refetchOnWindowFocus: false` GLOBALLY.** iOS PWA fires focus
  events every time the user app-switches; the default true was
  causing wave refetches. Opt back in per-query for things that truly
  need it (`useUnreadCount` for the bell badge).
- On refresh, use `invalidateQueries({ ..., refetchType: 'active' })`
  so only mounted queries actually re-fetch. Stale queries are marked
  but refetch lazily on next mount. Without this, a refresh from a
  user who'd visited 8 places fired 8 parallel memo SELECTs nobody
  was waiting on.

### Pull-to-refresh
`useRefreshControls` has multiple traps; current shape:
- Touch listeners installed ONCE (`useEffect [] deps`). `refreshAll`
  and `refreshing` are stashed in refs and read at fire time —
  putting them in deps tore listeners down + up mid-gesture.
- `setPull` is rAF-coalesced. touchmove at ~60Hz × N timeline rows
  = render-wave-of-doom otherwise.
- `dy <= 0` (finger moves above start) keeps `tracking` true so the
  same gesture can move down again and continue tracking — old code
  set tracking=false there, which permanently disengaged.
- Touch listeners use `capture: true` so MapPage's Google canvas
  doesn't eat them before bubble.
- Items with `data-no-pull-refresh` (the map canvas) get an early
  return on touchstart so pull never engages over them.

### Memoization
- `React.memo` on every heavy leaf that renders inside a long list:
  `MemoComment`, `ReactionRow` (custom comparator on target identity),
  `FoodMemoBlock`, `TimelineItem` / `MenuRow` / `TimelineGridItem` on
  HomePage, `ActivityBundleItem` / `NotificationItem` on
  NotificationsPage (custom comparator: id + unread bit + length).
- Custom comparator pattern when props are rebuilt every parent
  render but the rendered output only depends on a stable shape.

### Code splitting + preload
- Every route except HomePage is `React.lazy()`. Routes are imported
  from a central `routeImporters` table in `src/lib/routePreload.ts`.
- `preloadAppRoutes()` (called from AppShell on mount) fires every
  route chunk's import on `requestIdleCallback`, 80ms apart. By the
  time the user taps a tab the chunk is usually warm — no Suspense
  flash.
- `preloadRouteForPath(path)` warms a specific route on hover/intent.
- Initial bundle dropped from one ~850KB chunk to ~360KB main +
  per-route chunks.

### Virtualization
HomePage's timeline view uses `useWindowVirtualizer` from
`@tanstack/react-virtual` — see `VirtualTimeline`. Only viewport +
overscan (6) rows are in DOM regardless of total count.
- `scrollMargin = container.offsetTop` so virtualizer knows where its
  slice begins relative to scrollY.
- `measureElement` handles variable row heights.
- `isLast` uses the full list length, not the virtualized subset, so
  the connector line drops correctly on the actual last item.

Grid + menu layouts use `ExpandableList` (initial=20 + 더보기 button)
— virtualization overkill for those.

NotificationsPage is NOT virtualized; relies on caps (14-day window +
500 row safety + per-row React.memo) for performance. If row count
grows further we'll need to virtualize.

### useDeferredValue / useTransition
- HomePage filter inputs (`query`, `listFilter`, `viewMode`,
  `diningFilter`, `categoryFilter`, etc.) wrapped in
  `useDeferredValue` before feeding the expensive filteredPlaces
  useMemo. Typing stays 1:1; the heavy compute catches up next frame.
- ExpandableList's expand toggle is wrapped in `startTransition` so a
  jumbo expand doesn't block the tap response.
- NotificationsPage filter chip uses `startTransition(() =>
  setFilter(...))`.

### CSS — no always-on backdrop-blur
- `backdrop-blur-*` only on TRANSIENT modals (ConfirmDialog,
  FilterSheet, GroupedMultiSelect, MediaLightbox, PullIndicator). It
  is removed from the AppShell bottom nav and HomePage sticky header
  — those re-rasterize on every scroll frame and cost real GPU time
  for an effect users barely perceive when bg is already 95% opaque.
- Row cards use `transition-colors`, not bare `transition`. The
  default `transition-all` watches transform / filter / box-shadow /
  backdrop-filter on every element — iOS overhead adds up.

### Images
- `MediaThumb` `<img>` defaults to `loading="lazy"` + `decoding="async"`
  so 50+ imgs on a place page don't all GET concurrently.
- Videos use `preload="metadata"` so the first frame paints but the
  clip body doesn't download until play.

### Bundle deps audited
- `@tanstack/react-virtual` (~5KB) for VirtualTimeline.
- No image gallery library — `MediaLightbox` is hand-rolled.

---

## MediaLightbox — gallery + zoom

`<MediaLightbox>` is dual-mode:
- `src` (string) → single image (legacy).
- `srcs` (string[]) + `initial` (number) → swipe-able gallery.

`MediaThumb` opt-in via `gallery` + `index` props. Existing single-src
callers don't need refactoring.

Architecture is a CSS carousel — `translate3d(-index * 100% +
dragX, 0, 0)` on a flex strip of N slides. The next/prev slide is
already painted on the side as the finger drags, which is what makes
the swipe feel buttery (vs the older "current → snap-out → swap →
snap-in" sequence).

Gestures:
- 1-finger horizontal swipe (not zoomed) → next/prev (18% viewport
  threshold; under threshold = snap back).
- Edge over-swipe → rubber-band (raw / 3) but no commit.
- Double-tap (300ms) → toggle 2.5× zoom centered on tap.
- 2-finger pinch → smooth 1..4× zoom on the active slide.
- 1-finger drag when zoomed → pan.
- Keyboard arrows / desktop chevron buttons.
- Backdrop tap / Esc / X → close.

Only the current ± 1 slides actually mount media. Other slots in the
strip render as placeholders so the translate math stays consistent
without N image GETs.

---

## China / GFW compatibility

The app's primary blocker in mainland China was NOT Google Maps — it
was Google Fonts loaded in `index.html` as a render-blocking
stylesheet. `fonts.googleapis.com` is blocked; the request hangs to
timeout, page goes blank.

**Fix shipped**: swapped to Bunny Fonts proxy. `fonts.bunny.net`
mirrors Google Fonts' CSS API 1:1 and has China PoPs. Just the URL
change, no other refactor. Don't reintroduce direct `fonts.googleapis.com`
links to `index.html`.

Other Google-domain dependencies and their China status:
- **Maps API** (`maps.googleapis.com`) — blocked. `<APIProvider>` only
  mounts on MapPage, so this only breaks the map route. The rest of
  the app loads.
- **FCM web push** (`fcm.googleapis.com`) — blocked. Affects Android
  Chrome PWA push notifications. iOS Safari PWA uses APNs (Apple),
  which has China PoPs and works.
- **Google Fonts** (`fonts.googleapis.com`) — blocked. Now using
  Bunny Fonts.

If the team ever needs full China push delivery on Android: requires
a native app + Chinese push SDK (Mi Push / Huawei Push / 极光).
The PWA path is iOS-only in China.

Don't add new Google-hosted assets to `index.html` without checking
GFW behavior. `cdn.jsdelivr.net` (Pretendard) is in `index.html` and
has occasionally been flaky in CN; consider self-host if it bites.

---

## Working on existing user-WIP files

The user often edits files in parallel between Claude sessions —
their working tree may have uncommitted changes when a new turn
starts. Some etiquette:
- **Run `git status -s` before committing** to see what's modified
  that wasn't part of this turn.
- If unrelated WIP files would cause TS errors and you need to ship
  just one file, use `git add <one file>` + `git stash push
  --keep-index -u` to verify the staged change builds in isolation,
  then `git stash pop` to restore the user's other in-flight edits.
  Pattern is:
  ```bash
  git add <my files> && \
    git stash push --keep-index -u -m wip && \
    npm run build && \
    git stash pop
  ```
- Don't unilaterally fix the user's WIP TS errors unless they ask.
  Their `useDeferredValue` block etc. might be mid-wiring.

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
   `100dvh`) and verify `<ScrollManager>` still mounts in `AppShell`.
8. "Click triggers a wave of re-renders" — does the mutation
   `invalidateQueries` the whole list instead of `setQueryData` for
   one row? Optimistic patch is the fix.
9. "Filter chip tap freezes for a beat" — wrap `setFilter` in
   `startTransition`.
10. "Scroll jank during pull-to-refresh" — `setPull` should be
    rAF-coalesced (`pendingPull` ref + `scheduledPullCommit`).
11. "Lightbox swipe feels sticky" — the strip should be a single
    `translate3d(-index * 100% + dragX)`, NOT per-slide translates.
12. "Inbox row missing place context for a food memo" — the row's
    `place_id` is NULL by design; use `foodPlaceIdOf` / `foodPlaceNameOf`
    fallback.
13. "App loads on VPN but not without" — Google Fonts in
    `index.html`. Use Bunny Fonts mirror.
14. Build error in Vercel but local OK? You ran `tsc --noEmit` —
    re-run with `npm run build` / `npx tsc -b`.
15. User's working tree has unrelated WIP files in `git status`?
    Don't commit them. Stash + isolated build pattern documented
    above.

When in doubt, grep the previous fix commits referenced in this file
for the actual diff that worked.
