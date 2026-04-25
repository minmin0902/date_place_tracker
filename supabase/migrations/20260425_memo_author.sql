-- Track who wrote the memo on places + foods. Distinct from
-- created_by because the couple originally shared one account
-- (mjjy0902) — the partner (luoyuhan2025@gmail.com) was logging in
-- there for a while before she had her own account, so created_by
-- alone misattributes those rows.

alter table public.places
  add column if not exists memo_author_id uuid references auth.users(id);

alter table public.foods
  add column if not exists memo_author_id uuid references auth.users(id);

-- ---------------------------------------------------------------
-- One-time backfill for legacy memos written under the shared
-- account. Hard-codes the two known user_ids (same ones used in
-- the Dave's Coffee seed) so the backfill is reproducible without
-- depending on the auth.users table state at run time.
--
-- Default: luoyuhan2025@gmail.com — every memo with no author so
-- far was actually her, since she's the one who used the shared
-- mjjy0902 account back then.
--
-- Override: the single memo on the "Dave's Coffee" place row was
-- written by the actual mjjy0902, so it gets stamped that way.
-- ---------------------------------------------------------------

update public.places
   set memo_author_id = 'aa9d102d-35f9-4334-820c-c8bd840e8685'  -- luoyuhan2025
 where memo is not null
   and memo_author_id is null;

update public.foods
   set memo_author_id = 'aa9d102d-35f9-4334-820c-c8bd840e8685'  -- luoyuhan2025
 where memo is not null
   and memo_author_id is null;

-- Override: Dave's Coffee place memo → mjjy0902.
-- Idempotent — only flips rows whose memo is currently set.
update public.places
   set memo_author_id = '363a941f-2991-4992-9a38-3a46430ae2c8'  -- mjjy0902
 where name = 'Dave''s Coffee'
   and memo is not null;
