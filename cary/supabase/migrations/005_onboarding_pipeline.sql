-- Cary — Courier Digital Onboarding Pipeline
-- Adds structured vehicle info, agreement tracking, onboarding step state,
-- expiry-based auto-suspension, and expanded verification types.

-- ============================================================
-- Profiles: add home ZIP code
-- ============================================================
alter table profiles
  add column home_zip text;

-- ============================================================
-- Courier Profiles: onboarding state + structured vehicle + agreement
-- ============================================================

-- Onboarding step tracks where the courier is in the pipeline.
-- Steps: account → identity → license → background → insurance → vehicle → agreement → credential
-- After credential is issued, status becomes 'active' and onboarding_step is null.
alter table courier_profiles
  add column onboarding_step text default 'identity'
    check (onboarding_step in (
      'identity',         -- Step 2: Stripe Identity verification
      'license',          -- Step 3: Driver license verification
      'background',       -- Step 4: Criminal background check
      'insurance',        -- Step 5: Insurance verification
      'vehicle',          -- Step 6: Vehicle registration
      'agreement',        -- Step 7: Courier agreement
      'pending_activation' -- Steps 1-6 complete, awaiting async check results
    ));

-- Structured vehicle fields (vehicle_description remains for free text)
alter table courier_profiles
  add column vehicle_make  text,
  add column vehicle_model text,
  add column vehicle_year  smallint,
  add column registration_expiry date,
  add column registration_doc_url text;

-- Agreement tracking
alter table courier_profiles
  add column agreement_accepted_at timestamptz;

-- Orientation completion (optional but tracked)
alter table courier_profiles
  add column orientation_completed_at timestamptz;

-- Background check expiry (typically 1 year from Checkr)
alter table courier_profiles
  add column background_check_expiry date;

-- ============================================================
-- Verification Checks: expand type enum for license + registration
-- ============================================================
-- Drop and recreate the check constraint to add new types
alter table verification_checks
  drop constraint if exists verification_checks_type_check;

alter table verification_checks
  add constraint verification_checks_type_check
    check (type in ('background', 'identity', 'driver_license', 'vehicle_inspection', 'insurance', 'registration'));

-- ============================================================
-- Credential expiry tracking view
-- Shows all couriers with upcoming or past-due expirations.
-- ============================================================
create or replace view courier_credential_status as
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
from courier_profiles cp
join profiles p on p.id = cp.id
where cp.status in ('active', 'suspended');

-- ============================================================
-- Auto-suspend couriers with expired credentials
-- Called by pg_cron daily or by edge function cron.
-- ============================================================
create or replace function suspend_expired_couriers()
returns integer
language plpgsql
security definer
as $$
declare
  suspended_count integer;
begin
  update courier_profiles
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

-- ============================================================
-- Activation check: all requirements must be met
-- Called by webhooks after each verification passes.
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

  -- Collect all passed verification types
  select array_agg(type) into v_checks_passed
  from verification_checks
  where courier_id = p_courier_id and status = 'passed';

  -- All 4 required verifications must pass
  if not (
    'identity' = any(v_checks_passed)
    and 'background' = any(v_checks_passed)
    and 'driver_license' = any(v_checks_passed)
    and 'insurance' = any(v_checks_passed)
  ) then
    return false;
  end if;

  -- Vehicle info must be present (car/ebike/scooter need plate)
  if v_courier.vehicle_make is null or v_courier.vehicle_model is null then
    return false;
  end if;

  -- Agreement must be signed
  if v_courier.agreement_accepted_at is null then
    return false;
  end if;

  -- Stripe Connect must be set up
  if v_courier.stripe_connect_account_id is null then
    return false;
  end if;

  -- All clear — activate
  update courier_profiles
  set status = 'active',
      activated_at = now(),
      onboarding_step = null
  where id = p_courier_id;

  return true;
end;
$$;

-- ============================================================
-- Onboarding progress function
-- Returns current step + completion status for each requirement.
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
