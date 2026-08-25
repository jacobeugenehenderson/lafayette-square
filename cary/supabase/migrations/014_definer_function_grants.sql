-- Cary — lock down the anon/authenticated-executable SECURITY DEFINER functions
-- Clears the Advisor lints 0028 / 0029 for the THREE BUSINESS functions:
--   • try_activate_courier(uuid)      → privileged WRITE, callable unauthenticated
--   • suspend_expired_couriers()      → mass WRITE, callable unauthenticated
--   • get_onboarding_status(uuid)     → definer READ of any courier, bypasses RLS
--
-- ⛔ SCOPE, deliberately. The Advisor also flags three RLS POLICY HELPERS —
--    is_active_courier() · courier_holds_request(uuid) · viewer_shares_live_trip_with(uuid)
--    (migrations 010/011). They are NOT touched here, and `revoke execute` is the
--    WRONG fix for them: a policy expression is evaluated as the QUERYING role, so
--    anon/authenticated must keep EXECUTE or every policy in 010/011 fails closed.
--    Their fix is a move to a non-exposed schema, which edits four live policies —
--    a separate migration, separately verified. They leak nothing today: all three
--    are `stable`, read-only and scoped to auth.uid(), so anon gets `false`.
--
-- Measured before writing (anon key, 2026-08-25): all six answered HTTP 200 with
-- real return values, unauthenticated. Re-derive, don't trust this line:
--   SUPABASE_URL=… SUPABASE_ANON_KEY=… node scratch/claims-cary-anon-exposure.mjs

-- ============================================================
-- Why `from public` and not just `from anon, authenticated`
-- ============================================================
-- Postgres grants EXECUTE on every new function to PUBLIC by default. Revoking
-- from anon/authenticated alone leaves that default grant standing and the
-- function still reachable — a revoke that reads like a fix and changes nothing.
-- So: revoke from PUBLIC, then grant back explicitly to the roles that need it.

-- ============================================================
-- try_activate_courier — service_role only
-- ============================================================
-- Callers: cary/supabase/functions/onboarding (index.js:304,332 / index.ts:382,424)
-- and cary/stripe/webhooks.js:63,91,111 — every one of them service_role.
revoke all on function public.try_activate_courier(uuid) from public, anon, authenticated;
grant execute on function public.try_activate_courier(uuid) to service_role;

-- ============================================================
-- suspend_expired_couriers — service_role only
-- ============================================================
-- Caller: cary/supabase/functions/credential-check/index.js:26 — service_role.
revoke all on function public.suspend_expired_couriers() from public, anon, authenticated;
grant execute on function public.suspend_expired_couriers() to service_role;

-- ============================================================
-- get_onboarding_status — authenticated, and ONLY for yourself
-- ============================================================
-- ⚠️ This one has a live BROWSER caller on the anon key: src/hooks/useCary.js:210.
-- A blanket revoke breaks the courier onboarding UI. The client only ever asks
-- for its own id (`updatedCourier.id` = `user.id`), so the arbitrary-uuid read is
-- closed in the function body instead, and `anon` (no session at all) is revoked.
-- Body below is spliced verbatim from 009 — only the guard is new.

create or replace function get_onboarding_status(p_courier_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier public.courier_profiles%rowtype;
  v_checks jsonb;
  v_result jsonb;
begin

  -- F-15 - a courier may read ONLY their own onboarding status.
  -- `is distinct from` is load-bearing: for the anon role auth.uid() is NULL,
  -- and a plain `<>` against NULL evaluates to NULL - i.e. it would NOT raise.
  -- That null-comparison is the classic way a guard like this ships broken.
  if current_user not in ('service_role', 'postgres', 'supabase_admin')
     and p_courier_id is distinct from auth.uid() then
    raise exception 'not authorized to read onboarding status for another courier'
      using errcode = '42501';
  end if;
  select * into v_courier from public.courier_profiles where id = p_courier_id;
  if not found then return null; end if;

  -- Get all verification checks as JSON
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', type,
    'status', status,
    'vendor', vendor,
    'created_at', created_at,
    'expires_at', expires_at
  )), '[]'::jsonb) into v_checks
  from public.verification_checks
  where courier_id = p_courier_id;

  v_result := jsonb_build_object(
    'courier_id', p_courier_id,
    'status', v_courier.status,
    'tier', v_courier.tier,
    'onboarding_step', v_courier.onboarding_step,
    'steps', jsonb_build_object(
      'account', jsonb_build_object('complete', true),
      'identity', jsonb_build_object(
        'complete', exists(select 1 from public.verification_checks where courier_id = p_courier_id and type = 'identity' and status = 'passed')
      ),
      'license', jsonb_build_object(
        'complete', v_courier.drivers_license_verified,
        'expiry', v_courier.drivers_license_expiry
      ),
      'background', jsonb_build_object(
        'complete', exists(select 1 from public.verification_checks where courier_id = p_courier_id and type = 'background' and status = 'passed'),
        'expiry', v_courier.background_check_expiry
      ),
      'insurance', jsonb_build_object(
        'complete', v_courier.insurance_verified,
        'expiry', v_courier.insurance_expiry
      ),
      'vehicle', jsonb_build_object(
        'complete', v_courier.vehicle_make is not null and v_courier.vehicle_model is not null,
        'registration_expiry', v_courier.registration_expiry
      ),
      'agreement', jsonb_build_object(
        'complete', v_courier.agreement_accepted_at is not null,
        'accepted_at', v_courier.agreement_accepted_at
      ),
      'stripe', jsonb_build_object(
        'complete', v_courier.stripe_connect_account_id is not null
      ),
      'orientation', jsonb_build_object(
        'complete', v_courier.orientation_completed_at is not null,
        'completed_at', v_courier.orientation_completed_at
      )
    ),
    'checks', v_checks
  );

  return v_result;
end;
$$;
revoke all on function public.get_onboarding_status(uuid) from public, anon;
grant execute on function public.get_onboarding_status(uuid) to authenticated, service_role;

comment on function public.get_onboarding_status(uuid) is
  'Definer read of a courier onboarding record. Self-only for `authenticated` '
  '(guarded on auth.uid()); unrestricted for service_role. Revoked from anon. '
  'See SECURITY.md F-15.';
