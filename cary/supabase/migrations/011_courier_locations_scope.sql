-- Cary — Scope live courier GPS to an actual trip (F-10 from SECURITY.md)
--
-- ⭐⭐ THIS IS URGENT *BECAUSE OF MIGRATION 010*, AND THAT IS THE POINT WORTH
-- KEEPING. `002_rls_policies.sql:129-131` reads:
--
--     create policy "courier_locations_select_auth" on courier_locations
--       for select using (auth.uid() is not null);
--
-- "Any authenticated user can see every active courier's live GPS." When it was
-- written that meant a courier — requesters had no account at all (004), so the
-- authenticated set was small and vetted by phone OTP.
--
-- ⛔ Migration 010 gives every visitor an ANONYMOUS session, and an anonymous
-- Supabase user holds the `authenticated` role. So `auth.uid() is not null`
-- silently widened from "a phone-verified courier" to "anyone who loads the
-- site." A stalking surface, opened as a side effect of closing a data leak.
--
-- ⭐ The lesson, worth more than the patch: **a predicate that tests the SHAPE
-- of a caller ("is authenticated", "has a JWT", "is not null") is not an
-- authorization rule — it is an assumption about who holds credentials, and it
-- rots the moment that population changes.** Authorize on the RELATIONSHIP —
-- this viewer, this courier, this trip — which does not move when the identity
-- model does. `verify_jwt` failed the same way for the same reason (F-2/F-5).
--
-- This migration is the second half of 010 and should never have been separable
-- from it.

-- Is the caller a requester on a LIVE trip with this courier?
-- `security definer` because a policy's subquery is itself subject to the
-- referenced tables' RLS; `set search_path = ''` keeps it out of F-8's class.
create or replace function public.viewer_shares_live_trip_with(p_courier_id uuid)
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

drop policy if exists "courier_locations_select_auth" on courier_locations;

create policy "courier_locations_select_in_trip" on courier_locations
  for select to authenticated
  using (
    -- a courier always sees their own position
    courier_id = auth.uid()
    -- and their requester sees it, for as long as the trip is live
    or public.viewer_shares_live_trip_with(courier_id)
  );

comment on table courier_locations is
  'Live courier GPS. Readable only by the courier themselves and by the '
  'requester on a CURRENTLY RUNNING session with them (migration 011). '
  'Never gate this on "is authenticated" — since migration 010 every site '
  'visitor holds an anonymous session. See SECURITY.md F-10.';
