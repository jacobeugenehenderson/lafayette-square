-- Cary — F-15 follow-up: the get_onboarding_status self-guard was INERT
--
-- ⛔ 014 shipped this guard written against `current_user`. Inside a SECURITY
--    DEFINER function `current_user` is the OWNER, so the role test was always
--    false and the guard never raised. The anon revoke in 014 stands and is
--    unaffected; what was broken is the AUTHENTICATED half — any signed-in user
--    could read any courier's onboarding record.
--
-- Caught by probing, not by reading: with anonymous sign-in restored (F-16) the
-- guard was tested with a real `authenticated` token against someone else's
-- uuid and answered HTTP 200 instead of 42501.
--
-- Verify after applying — SELF must return, OTHER must 42501:
--   bash scratch/claims-onboarding-guard.sh

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
  --
  -- ⛔ 014 WROTE THIS GUARD WITH `current_user` AND IT NEVER FIRED. Inside a
  --    SECURITY DEFINER function `current_user` is the function OWNER, not the
  --    caller — so it was always `postgres`, the role test was always false, and
  --    the whole condition short-circuited to never-raise. Measured, not reasoned:
  --    an authenticated caller asked for another uuid and got HTTP 200.
  --
  -- The caller's identity survives the definer switch in exactly two places:
  --    · the JWT `role` claim  — what PostgREST authenticated the request AS
  --    · session_user          — the ORIGINAL login role, unaffected by the
  --                              definer switch (PostgREST: `authenticator`;
  --                              a direct psql admin: `postgres`)
  -- `is distinct from` stays load-bearing: auth.uid() is NULL for service_role,
  -- and a plain `<>` against NULL yields NULL and would not raise.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
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
