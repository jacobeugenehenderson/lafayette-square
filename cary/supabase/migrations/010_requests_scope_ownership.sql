-- Cary — Scope `requests` to real ownership (F-4 from SECURITY.md)
--
-- Migration 004 moved requester identity from Supabase auth to a device hash
-- and, in doing so, replaced three `auth.uid()` policies with:
--     requests_select_by_device … using (true)
--     requests_update_by_device … using (true)
-- The comments still said "their own requests by device_hash", but `true` is
-- every row: the public anon key could read every request (place name, exact
-- lat/lon, description, handle) and update any of them — cancel someone else's,
-- flip a status, tamper.
--
-- ⭐ WHY THE ANSWER IS auth.uid() AFTER ALL, AND WHY THAT COSTS NOTHING.
-- 004 abandoned auth because requesters must not face a signup wall — correct,
-- and still true. But an ANONYMOUS sign-in gives every requester a real
-- `auth.uid()` with no phone, no email and no user-visible step at all. So the
-- property 004 wanted (no signup) and the property RLS needs (an identity the
-- database can verify) turn out not to be in conflict.
--
-- ⛔ THE ROAD NOT TAKEN, AND WHY — this is the part worth reading.
-- The obvious cheaper fix is to have the client present the device hash in an
-- `x-device-hash` header and compare it in the policy via
-- `current_setting('request.headers', …)`. It works for plain PostgREST reads.
-- It BREAKS the requester's realtime subscription (`useCary.js`, channel
-- `requester-requests`): Realtime authorises on the socket's JWT and evaluates
-- RLS with no request headers, so the policy is false and the live status
-- updates go dark — silently, which is the worst way for it to fail. A header
-- cannot ride a WebSocket. An anonymous JWT can.
--
-- Bonus: it also retires most of F-6 for this table — the device hash is a
-- bearer token in localStorage with no rotation or expiry, and an anonymous
-- session is a real, refreshable credential.
--
-- ⚠️ REQUIRES "Allow anonymous sign-ins" to be ENABLED on the project (Auth →
-- Sign In / Providers). It is declared in `config.toml`, but ⛔ do NOT run
-- `supabase config push` to apply it: that pushes the WHOLE local config and
-- our `config.toml` does not capture the dashboard-side auth settings (OTP
-- expiry, redirect allowlist, leaked-password protection), so pushing it would
-- silently reset them. Toggle it in the dashboard.
--
-- ⛔ FAILS CLOSED. Until the client signs in, `auth.uid()` is NULL, every
-- comparison below is NULL — never true — and the requester sees nothing. A
-- half-deployed client sees no rows; it does not see everyone's.

-- ============================================================
-- requester_id becomes the requester's auth uid
-- ============================================================
-- 001 declared `requester_id uuid not null references profiles(id)`; 004 dropped
-- the NOT NULL when identity moved to the device hash. An anonymous auth user
-- has no `profiles` row, so the FK has to go — the column now holds an
-- `auth.users` id directly, which is what every other table here already means
-- by an id (`002_rls_policies.sql` compares `id = auth.uid()` throughout).
alter table requests drop constraint if exists requests_requester_id_fkey;

-- `requester_device_hash` is deliberately KEPT, not dropped: it is still the
-- identity for check-in, guardians, the bulletin and web-messages
-- (`ls/IDENTITY.md`), it is useful for correlating a request with those, and
-- dropping a column is not reversible. It simply stops being an authorization
-- input for this table.
comment on column requests.requester_device_hash is
  'Informational only since 2026-08-24 (migration 010). NOT an authorization '
  'input — authorization is requester_id = auth.uid(). See SECURITY.md F-4.';

create index if not exists idx_requests_requester_id on requests(requester_id);

-- ============================================================
-- Helpers
-- ============================================================
-- `security definer` on purpose: a policy's subquery is itself subject to the
-- referenced table's RLS, which makes inline `exists (select … from
-- courier_profiles)` fragile and recursion-prone. `set search_path = ''` keeps
-- these out of F-8's hijackable class.

create or replace function public.is_active_courier()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courier_profiles
    where id = auth.uid() and status = 'active'
  );
$$;

-- Does the caller hold the session for this request? `requests` has no
-- courier_id — the courier↔request link lives in `sessions`.
create or replace function public.courier_holds_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions
    where request_id = p_request_id and courier_id = auth.uid()
  );
$$;

-- ============================================================
-- Replace the `using (true)` requester policies
-- ============================================================
drop policy if exists "requests_insert_anon" on requests;
drop policy if exists "requests_select_by_device" on requests;
drop policy if exists "requests_update_by_device" on requests;

-- A requester may only create a request owned by themselves. (The old policy
-- asked only that `requester_device_hash` be non-null — trivially satisfied.)
create policy "requests_insert_own" on requests
  for insert to authenticated
  with check (requester_id = auth.uid());

create policy "requests_select_own" on requests
  for select to authenticated
  using (requester_id = auth.uid());

-- Cancel/modify your own, and only while the trip is still live. A completed or
-- cancelled request is history and stops being editable. `with check` stops a
-- requester handing their request to someone else.
create policy "requests_update_own" on requests
  for update to authenticated
  using (
    requester_id = auth.uid()
    and status in ('open', 'accepted', 'in_progress')
  )
  with check (requester_id = auth.uid());

-- ============================================================
-- Courier side
-- ============================================================
-- `requests_select_open` (002) already scopes courier READS to open requests and
-- active couriers — it survived 004 and is left alone. But it stops matching the
-- moment the courier accepts (status leaves 'open'), and the blanket
-- `using (true)` was what masked that. Without this, a courier would lose sight
-- of the request they just claimed, including the `sessions → requests(*)`
-- embedded read in useCary.js.
create policy "requests_select_held_by_courier" on requests
  for select to authenticated
  using (public.courier_holds_request(id));

-- Claiming an open request, and working the one they hold. ⭐ The `using (true)`
-- UPDATE policy was also the only thing letting couriers accept at all — scoping
-- the requester policy without this would have broken dispatch outright.
create policy "requests_update_by_courier" on requests
  for update to authenticated
  using (
    public.is_active_courier()
    and (status = 'open' or public.courier_holds_request(id))
  );

-- ============================================================
-- Sessions: repair the requester side, broken since 004
-- ============================================================
-- `sessions_select_requester` / `sessions_update_requester` (002) test
-- `requests.requester_id = auth.uid()`. 004 stopped populating that column, so
-- since then a requester has been unable to see or rate the session for their
-- own request — a silent functional gap, not a security one. Restoring
-- requester_id as the auth uid fixes them as a side effect; they are left
-- as-written and simply start working again.
