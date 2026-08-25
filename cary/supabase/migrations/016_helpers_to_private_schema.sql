-- Cary — F-15 Class A: move the RLS policy helpers out of the exposed schema
--
-- Clears the last of Advisor lints 0028/0029. The three functions here are NOT
-- the exposure F-15 was mostly about (014/015 handled that); they are `stable`,
-- read-only and scoped to auth.uid(), so anon calling them gets `false`. What is
-- wrong is that they are REACHABLE as /rest/v1/rpc/* at all — they are internals
-- of the RLS policies in 010/011 and were never meant to be API.
--
-- ⛔⛔ `revoke execute` IS THE WRONG FIX HERE AND WOULD FAIL RLS CLOSED.
--    A policy expression is evaluated as the QUERYING role, so anon/authenticated
--    must KEEP execute or every policy below silently returns false and couriers
--    and requesters lose sight of their own rows. The fix is to keep the grants
--    and take the functions out of the schema PostgREST exposes.
--
-- ⚠️ THE GRANTS BELOW ARE LOAD-BEARING. `grant usage on schema private` and
--    `grant execute` are what keep policy evaluation working. Dropping either is
--    invisible in an empty database — every policy just returns nothing, which
--    looks exactly like "no data yet". Verified by DDL, not by data: see the
--    note at the end.

create schema if not exists private;

-- ⛔ NOT added to PostgREST's exposed schemas — that omission IS the fix.
grant usage on schema private to anon, authenticated, service_role;

-- ============================================================
-- The three helpers, re-homed. Bodies unchanged from 010/011.
-- ============================================================
create or replace function private.is_active_courier()
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

create or replace function private.courier_holds_request(p_request_id uuid)
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

create or replace function private.viewer_shares_live_trip_with(p_courier_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sessions s
    join public.requests r on r.id = s.request_id
    where s.courier_id = p_courier_id
      and r.requester_id = auth.uid()
      and s.completed_at is null    -- only while the trip is actually running
  );
$$;

grant execute on function private.is_active_courier() to anon, authenticated, service_role;
grant execute on function private.courier_holds_request(uuid) to anon, authenticated, service_role;
grant execute on function private.viewer_shares_live_trip_with(uuid) to anon, authenticated, service_role;

-- ============================================================
-- Repoint the three policies that reference them
-- ============================================================
-- Recreated verbatim from 010/011 apart from the schema prefix. ⛔ Postgres
-- resolves the function reference at CREATE POLICY time, so a wrong name fails
-- this migration loudly rather than at query time.

drop policy if exists "requests_select_held_by_courier" on requests;
create policy "requests_select_held_by_courier" on requests
  for select to authenticated
  using (private.courier_holds_request(id));

drop policy if exists "requests_update_by_courier" on requests;
create policy "requests_update_by_courier" on requests
  for update to authenticated
  using (
    private.is_active_courier()
    and (status = 'open' or private.courier_holds_request(id))
  );

drop policy if exists "courier_locations_select_in_trip" on courier_locations;
create policy "courier_locations_select_in_trip" on courier_locations
  for select to authenticated
  using (
    -- a courier always sees their own position
    courier_id = auth.uid()
    -- and their requester sees it, for as long as the trip is live
    or private.viewer_shares_live_trip_with(courier_id)
  );

-- ============================================================
-- Only now are the public copies unreferenced
-- ============================================================
drop function if exists public.is_active_courier();
drop function if exists public.courier_holds_request(uuid);
drop function if exists public.viewer_shares_live_trip_with(uuid);

-- Verify: the census must report these three ABSENT (PGRST202), not merely denied.
--   SUPABASE_URL=… SUPABASE_ANON_KEY=… node scratch/claims-cary-anon-exposure.mjs
--
-- ⚠️ WHAT THAT RUN DOES **NOT** PROVE: that the policies still ADMIT the right
--    rows. Cary has no live data, so a correctly-scoped policy and a policy
--    broken by a missing grant BOTH answer "200, 0 rows". Confirming the admit
--    side needs a real courier holding a real request. Recorded in SECURITY.md
--    F-15 as owed rather than quietly assumed.
