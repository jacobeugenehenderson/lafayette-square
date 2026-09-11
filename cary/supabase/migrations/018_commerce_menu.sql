-- Cary — the commercial half of a menu (Track B2)
--
-- ⭐ THE SPLIT THIS ENCODES, AND WHY IT IS NOT "MOVE THE MENU TO SUPABASE".
-- A menu has three homes (`ls/reference/INVENTORY-DATA.md`): the bundled
-- editorial seed, the guardian's authored copy in GAS `menu_json`, and — from
-- here — Cary. That looked like three sources for one thing. It is not. The
-- first two are a POUR and an OVERRIDE, which is this project's own doctrine
-- working correctly, and they are left exactly where they are. What moves is
-- narrower and different in kind:
--
--     CONTENT     (section · name · description · tags · menu type · schedule)
--                 stays in GAS. Poured from the bundle, overridden by the
--                 guardian. Not touched by this migration.
--
--     COMMERCIAL  (price of record · availability · confirmation)
--                 lives HERE, once, with no seed and no merge.
--
-- ⛔⛔ THE MOVE THAT MAKES THIS SAFE: **A SEEDED PRICE IS NOT A PRICE.**
-- The number on a bundled or guardian-authored menu is a DISPLAY FIGURE. It can
-- be shown; it can never be charged. Only a confirmed price of record in this
-- table can be charged. So there is no "price in two places" to keep in sync —
-- there is one price and one display figure, and they are different kinds of
-- thing. An item nobody has confirmed is simply not orderable, and that is the
-- right answer rather than a gap to backfill.
--
-- The consequence worth having: it becomes STRUCTURALLY IMPOSSIBLE to charge a
-- price nobody confirmed. Not "we are careful not to" — there is no column the
-- charge could read. See the check constraint on commerce_items.
--
-- ⚠️ THIS IS THE FIRST TABLE IN CARY KEYED ON A GAS IDENTIFIER. `listing_id` is
-- the Google Sheet's listing id and `item_id` is the menu item's stable id from
-- `src/lib/menuIdentity.js` (`d_…` derived / `i_…` minted). Neither is a foreign
-- key — Postgres cannot see a spreadsheet — so ⛔ a row here can outlive the item
-- it names. That is deliberate and it fails the SAFE way: an id that no longer
-- resolves to a menu item is simply never read, because the join runs from the
-- menu inward. A price cannot haunt a menu it has fallen off of.
--
-- ⛔ NO WRITE POLICIES EXIST IN THIS FILE, AND THAT IS THE DESIGN.
-- Guardianship is a GAS concept — it lives in the Guardians sheet, keyed by
-- device hash. Postgres has no way to verify it, and Supabase auth knows only an
-- anonymous `auth.uid()` (migration 010). So there is no honest client-side
-- policy to write: any rule we could express here would be a rule about someone
-- we cannot identify. Writes therefore go through a service-role edge function
-- that checks guardianship against GAS first. Until that function exists these
-- tables are read-only to the entire world, which is the correct state for them
-- to be in while the write path is unbuilt.

-- ── commerce_places — per-restaurant commerce settings ──────────────────────
create table if not exists commerce_places (
  listing_id      text primary key,
  ordering_paused boolean     not null default false,
  min_order_cents integer     not null default 4000 check (min_order_cents >= 0),

  -- ⚠️ WHO REMITS SALES TAX — pending the Missouri DOR marketplace-facilitator
  -- letter ruling (`cary/legal/legal-readiness-brief.md §A`). Recorded as a
  -- FIELD rather than assumed by the arithmetic, precisely so that whichever way
  -- the ruling lands it is a value change and not a migration. ⛔ 'undetermined'
  -- is not a synonym for 'platform' — it means the question is open, and an
  -- order path may not quietly pick one.
  tax_remitter    text        not null default 'undetermined'
                  check (tax_remitter in ('platform', 'restaurant', 'undetermined')),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── commerce_items — the price of record ────────────────────────────────────
create table if not exists commerce_items (
  listing_id   text        not null,
  item_id      text        not null,
  price_cents  integer     check (price_cents is null or price_cents > 0),

  -- The 86 toggle: the kitchen cannot make this right now. Distinct from
  -- unconfirmed — both block ordering, for entirely different reasons, and the
  -- reason is what the customer and the guardian each need to see.
  available    boolean     not null default true,

  -- ⛔ NULL means never confirmed, which means NOT SELLABLE. There is no default
  -- that could be safe here: a timestamp would assert that someone checked.
  confirmed_at timestamptz,
  updated_at   timestamptz not null default now(),

  primary key (listing_id, item_id),

  -- ⭐ The structural guarantee, in one line: a confirmed item HAS a price of
  -- record. Nothing downstream needs to remember to check, because the row
  -- cannot exist in the half-state where it would matter.
  constraint commerce_items_confirmed_has_price
    check (confirmed_at is null or price_cents is not null)
);

-- ── commerce_item_events — append-only audit ────────────────────────────────
-- The question this exists to answer is the one that gets asked the first time a
-- customer is charged wrong: WHO set that price, and WHEN. `menu_json` is a
-- single blob rewritten whole on every save, so it can never answer it.
create table if not exists commerce_item_events (
  id          bigserial   primary key,
  listing_id  text        not null,
  item_id     text        not null,
  action      text        not null
              check (action in ('confirm', 'unconfirm', 'reprice', 'available', 'unavailable')),
  price_cents integer,
  actor       text,
  at          timestamptz not null default now()
);

create index if not exists commerce_item_events_item_idx
  on commerce_item_events (listing_id, item_id, at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table commerce_places      enable row level security;
alter table commerce_items       enable row level security;
alter table commerce_item_events enable row level security;

-- Public read, declared deliberately in the schema per the `fare_config` ruling
-- (migration 017): a price and an availability are the menu in the window, and a
-- customer has to see both before ordering. Neither table carries personal data.
create policy commerce_places_public_read on commerce_places for select using (true);
create policy commerce_items_public_read  on commerce_items  for select using (true);

comment on table commerce_places is
  'PUBLIC REFERENCE DATA — deliberately world-readable. Per-restaurant commerce '
  'settings a customer must see before ordering (pause state, minimum). No personal '
  'data. Writes are service-role only: guardianship lives in GAS and Postgres '
  'cannot verify it. See SECURITY.md and migration 018.';

comment on table commerce_items is
  'PUBLIC REFERENCE DATA — deliberately world-readable. The price of record and '
  'availability behind an orderable menu item; the menu in the window. No personal '
  'data. Writes are service-role only. A NULL confirmed_at means NOT SELLABLE — see '
  'commerce_items_confirmed_has_price. Migration 018.';

-- ⛔ commerce_item_events gets RLS and NO policy at all: it names actors, so it
-- is not public reference data. RLS-enabled with zero policies denies every
-- anon and authenticated row while leaving service_role (which bypasses RLS)
-- able to append. Silence here is the intended behaviour, not an omission.
comment on table commerce_item_events is
  'Append-only audit of price and availability changes. NOT public — carries actor '
  'identity. RLS enabled with no policy: denied to anon and authenticated by design. '
  'Migration 018.';

-- ── Two independent locks ───────────────────────────────────────────────────
-- The policies above gate rows; these grants gate the verbs. Either one alone
-- would hold, and that is the point: a future migration that adds a write policy
-- by mistake still cannot write, and a grant restored by mistake still has no
-- policy to pass. ⚠️ Do not "tidy" one of them away as redundant.
revoke insert, update, delete on commerce_places      from anon, authenticated;
revoke insert, update, delete on commerce_items       from anon, authenticated;
revoke all                    on commerce_item_events from anon, authenticated;

grant select on commerce_places to anon, authenticated;
grant select on commerce_items  to anon, authenticated;
