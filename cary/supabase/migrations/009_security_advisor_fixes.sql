-- Cary — Security Advisor remediations (F-1, F-7, F-8 from SECURITY.md)
-- Clears the Supabase Security Advisor findings:
--   • rls_disabled_in_public       → sms_messages  (F-1, ERROR)
--   • security_definer_view        → courier_credential_status  (F-7)
--   • function_search_path_mutable → the 3 security-definer functions  (F-8)
--
-- Nothing here changes behavior for the service-role edge functions (they
-- bypass RLS/grants). It only removes the anon/authenticated exposure and
-- pins the definer functions' search_path so they can't be hijacked.

-- ============================================================
-- F-1 · Enable RLS on sms_messages
-- ============================================================
-- The table is only ever touched by service-role edge functions
-- (sms-webhook / sms-inbox / sms-reply / contact-sms / web-messages), which
-- bypass RLS. So: RLS on + ZERO policies = anon/authenticated fully locked
-- out, functions unaffected. This is the ERROR that triggers the Advisor email.
alter table sms_messages enable row level security;

-- Belt-and-suspenders: make sure the auto-exposed roles have no direct grant.
revoke all on table sms_messages from anon, authenticated;

-- ============================================================
-- F-7 · courier_credential_status → security_invoker + admin-only
-- ============================================================
-- Recreate the view so it runs with the QUERYING user's rights (and thus the
-- underlying tables' RLS) instead of the definer's — an anon query then sees
-- nothing. The view is consumed only by the service-role credential-check
-- function, so it needs no anon/authenticated access at all.
create or replace view courier_credential_status
with (security_invoker = true) as
select
  cp.id as courier_id,
  p.display_name,
  p.email,
  p.phone,
  cp.status,
  cp.drivers_license_expiry,
  cp.insurance_expiry,
  cp.registration_expiry,
  cp.background_check_expiry,
  least(
    cp.drivers_license_expiry,
    cp.insurance_expiry,
    cp.registration_expiry,
    cp.background_check_expiry
  ) as earliest_expiry,
  case
    when least(
      cp.drivers_license_expiry,
      cp.insurance_expiry,
      cp.registration_expiry,
      cp.background_check_expiry
    ) < current_date then 'expired'
    when least(
      cp.drivers_license_expiry,
      cp.insurance_expiry,
      cp.registration_expiry,
      cp.background_check_expiry
    ) < current_date + interval '30 days' then 'expiring_soon'
    else 'current'
  end as credential_health
from public.courier_profiles cp
join public.profiles p on p.id = cp.id
where cp.status in ('active', 'suspended');

revoke all on table courier_credential_status from anon, authenticated;

-- ============================================================
-- F-8 · Pin search_path on the security-definer functions
-- ============================================================
-- `set search_path = ''` + schema-qualified references makes each definer
-- function immune to search_path hijacking (pg_catalog is always implicitly
-- searched first, so built-ins like now()/least()/jsonb_* still resolve).
-- Bodies are unchanged from migrations 005/006 aside from the public. prefix.

create or replace function suspend_expired_couriers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  suspended_count integer;
begin
  update public.courier_profiles
  set status = 'suspended'
  where status = 'active'
    and (
      drivers_license_expiry < current_date
      or insurance_expiry < current_date
      or registration_expiry < current_date
      or background_check_expiry < current_date
    );

  get diagnostics suspended_count = row_count;
  return suspended_count;
end;
$$;

create or replace function try_activate_courier(p_courier_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_courier public.courier_profiles%rowtype;
  v_checks_passed text[];
begin
  select * into v_courier from public.courier_profiles where id = p_courier_id;
  if not found then return false; end if;

  -- Agreement must be signed for both tiers
  if v_courier.agreement_accepted_at is null then
    return false;
  end if;

  -- Collect all passed verification types
  select array_agg(type) into v_checks_passed
  from public.verification_checks
  where courier_id = p_courier_id and status = 'passed';

  -- Identity is required for both tiers
  if not ('identity' = any(coalesce(v_checks_passed, '{}'))) then
    return false;
  end if;

  -- Deliver tier: identity + agreement is sufficient
  if v_courier.tier = 'deliver' then
    update public.courier_profiles
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
  update public.courier_profiles
  set status = 'active',
      activated_at = now(),
      onboarding_step = null
  where id = p_courier_id;

  return true;
end;
$$;

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
