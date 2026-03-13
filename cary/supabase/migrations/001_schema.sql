-- Cary — Core Schema
-- Lafayette Square local courier network

-- ============================================================
-- Profiles (base identity for all users)
-- ============================================================
create table profiles (
  id            uuid primary key default gen_random_uuid(),
  phone         text unique not null,
  phone_verified boolean default false,
  email         text,
  display_name  text not null,
  avatar_url    text,
  neighborhood_relationship text check (neighborhood_relationship in ('resident', 'worker', 'visitor')),
  created_at    timestamptz default now()
);

-- ============================================================
-- Courier Profiles (activated couriers)
-- ============================================================
create table courier_profiles (
  id                        uuid primary key references profiles(id),
  status                    text not null default 'applying'
                            check (status in ('applying', 'pending_checks', 'active', 'suspended', 'inactive')),
  vehicle_type              text not null
                            check (vehicle_type in ('car', 'bike', 'ebike', 'scooter', 'on_foot')),
  vehicle_description       text,
  vehicle_photo_urls        jsonb default '[]',
  license_plate             text,
  drivers_license_verified  boolean default false,
  drivers_license_expiry    date,
  insurance_verified        boolean default false,
  insurance_expiry          date,
  stripe_connect_account_id text,
  activated_at              timestamptz,
  created_at                timestamptz default now()
);

-- ============================================================
-- Verification Checks (background, identity, vehicle, insurance)
-- ============================================================
create table verification_checks (
  id                  uuid primary key default gen_random_uuid(),
  courier_id          uuid not null references courier_profiles(id),
  type                text not null
                      check (type in ('background', 'identity', 'vehicle_inspection', 'insurance')),
  vendor              text not null
                      check (vendor in ('checkr', 'stripe_identity', 'manual')),
  vendor_reference_id text,
  status              text not null default 'pending'
                      check (status in ('pending', 'passed', 'failed', 'expired')),
  cost_cents          integer not null default 0,
  paid_at             timestamptz,
  expires_at          timestamptz,
  created_at          timestamptz default now()
);

-- ============================================================
-- Requests (ride, delivery, pickup, errand)
-- ============================================================
create table requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references profiles(id),
  place_id      text not null,               -- references your existing landmark/building ID
  place_name    text,
  place_lat     double precision not null,
  place_lon     double precision not null,
  type          text not null
                check (type in ('ride', 'delivery', 'pickup', 'errand')),
  description   text,
  status        text not null default 'open'
                check (status in ('open', 'accepted', 'in_progress', 'completed', 'cancelled', 'disputed')),
  created_at    timestamptz default now(),
  expires_at    timestamptz default (now() + interval '5 minutes')
);

-- ============================================================
-- Sessions (active trips with metering)
-- ============================================================
create table sessions (
  id                      uuid primary key default gen_random_uuid(),
  request_id              uuid not null references requests(id),
  courier_id              uuid not null references courier_profiles(id),
  accepted_at             timestamptz default now(),
  started_at              timestamptz,           -- meter begins
  completed_at            timestamptz,           -- meter ends
  route_points            jsonb default '[]',    -- [{lat, lon, timestamp}, ...]
  distance_meters         double precision default 0,
  duration_seconds        integer default 0,
  fare_cents              integer default 0,
  platform_fee_cents      integer default 0,
  processing_fee_cents    integer default 0,
  courier_payout_cents    integer default 0,
  payment_status          text default 'pending'
                          check (payment_status in ('pending', 'captured', 'transferred', 'failed', 'disputed')),
  stripe_payment_intent_id text,
  requester_rating        smallint check (requester_rating between 1 and 5),
  courier_rating          smallint check (courier_rating between 1 and 5),
  created_at              timestamptz default now()
);

-- ============================================================
-- Fare Configuration (per vehicle type)
-- ============================================================
create table fare_config (
  id                uuid primary key default gen_random_uuid(),
  vehicle_type      text not null,
  base_fare_cents   integer not null default 150,
  per_minute_cents  integer not null default 20,
  per_meter_cents   numeric(6,4) not null default 0.0560,  -- ≈ $0.90/mile
  minimum_fare_cents integer not null default 400,
  effective_from    timestamptz not null default now()
);

-- ============================================================
-- Courier location (real-time, updated frequently)
-- ============================================================
create table courier_locations (
  courier_id    uuid primary key references courier_profiles(id),
  lat           double precision not null,
  lon           double precision not null,
  heading       double precision,
  accuracy      double precision,
  updated_at    timestamptz default now()
);

-- ============================================================
-- Payment methods (requester cards on file)
-- ============================================================
create table payment_methods (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid not null references profiles(id),
  stripe_customer_id    text not null,
  stripe_payment_method text not null,
  card_last4            text,
  card_brand            text,
  is_default            boolean default true,
  created_at            timestamptz default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index idx_requests_status on requests(status) where status = 'open';
create index idx_sessions_active on sessions(courier_id) where completed_at is null;
create index idx_courier_status on courier_profiles(status) where status = 'active';
create index idx_verification_courier on verification_checks(courier_id);

-- ============================================================
-- Enable real-time for live metering
-- ============================================================
alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table requests;
alter publication supabase_realtime add table courier_locations;
