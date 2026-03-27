-- Cary — Courier Tiers (Deliver / Drive)
-- Adds tier column so the onboarding pipeline and activation logic
-- can differentiate Deliver-only couriers from Drive couriers.

-- ============================================================
-- Courier Profiles: add tier
-- ============================================================
alter table courier_profiles
  add column tier text not null default 'deliver'
    check (tier in ('deliver', 'drive'));

-- ============================================================
-- Tier-aware activation
-- Deliver: identity passed + agreement accepted → active
-- Drive:   all 4 checks + vehicle + agreement + Stripe Connect → active
-- ============================================================
create or replace function try_activate_courier(p_courier_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_courier courier_profiles%rowtype;
  v_checks_passed text[];
begin
  select * into v_courier from courier_profiles where id = p_courier_id;
  if not found then return false; end if;

  -- Agreement must be signed for both tiers
  if v_courier.agreement_accepted_at is null then
    return false;
  end if;

  -- Collect all passed verification types
  select array_agg(type) into v_checks_passed
  from verification_checks
  where courier_id = p_courier_id and status = 'passed';

  -- Identity is required for both tiers
  if not ('identity' = any(coalesce(v_checks_passed, '{}'))) then
    return false;
  end if;

  -- Deliver tier: identity + agreement is sufficient
  if v_courier.tier = 'deliver' then
    update courier_profiles
    set status = 'active',
        activated_at = now(),
        onboarding_step = null
    where id = p_courier_id;
    return true;
  end if;

  -- Drive tier: full requirements
  if not (
    'background' = any(v_checks_passed)
    and 'driver_license' = any(v_checks_passed)
    and 'insurance' = any(v_checks_passed)
  ) then
    return false;
  end if;

  -- Vehicle info must be present
  if v_courier.vehicle_make is null or v_courier.vehicle_model is null then
    return false;
  end if;

  -- Stripe Connect must be set up
  if v_courier.stripe_connect_account_id is null then
    return false;
  end if;

  -- All clear — activate as Drive
  update courier_profiles
  set status = 'active',
      activated_at = now(),
      onboarding_step = null
  where id = p_courier_id;

  return true;
end;
$$;

-- ============================================================
-- Update onboarding status to include tier
-- ============================================================
create or replace function get_onboarding_status(p_courier_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_courier courier_profiles%rowtype;
  v_checks jsonb;
  v_result jsonb;
begin
  select * into v_courier from courier_profiles where id = p_courier_id;
  if not found then return null; end if;

  -- Get all verification checks as JSON
  select coalesce(jsonb_agg(jsonb_build_object(
    'type', type,
    'status', status,
    'vendor', vendor,
    'created_at', created_at,
    'expires_at', expires_at
  )), '[]'::jsonb) into v_checks
  from verification_checks
  where courier_id = p_courier_id;

  v_result := jsonb_build_object(
    'courier_id', p_courier_id,
    'status', v_courier.status,
    'tier', v_courier.tier,
    'onboarding_step', v_courier.onboarding_step,
    'steps', jsonb_build_object(
      'account', jsonb_build_object('complete', true),
      'identity', jsonb_build_object(
        'complete', exists(select 1 from verification_checks where courier_id = p_courier_id and type = 'identity' and status = 'passed')
      ),
      'license', jsonb_build_object(
        'complete', v_courier.drivers_license_verified,
        'expiry', v_courier.drivers_license_expiry
      ),
      'background', jsonb_build_object(
        'complete', exists(select 1 from verification_checks where courier_id = p_courier_id and type = 'background' and status = 'passed'),
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
