-- Cary — Row Level Security Policies
-- Every table locked down. Service role (edge functions) bypasses RLS.

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
alter table profiles enable row level security;
alter table courier_profiles enable row level security;
alter table verification_checks enable row level security;
alter table requests enable row level security;
alter table sessions enable row level security;
alter table fare_config enable row level security;
alter table courier_locations enable row level security;
alter table payment_methods enable row level security;

-- ============================================================
-- Profiles
-- ============================================================
-- Users can read their own profile
create policy "profiles_select_own" on profiles
  for select using (id = auth.uid());

-- Users can update their own profile
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());

-- Users can insert their own profile (on sign-up)
create policy "profiles_insert_own" on profiles
  for insert with check (id = auth.uid());

-- ============================================================
-- Courier Profiles
-- ============================================================
-- Couriers can read their own courier profile
create policy "courier_profiles_select_own" on courier_profiles
  for select using (id = auth.uid());

-- Couriers can insert their own (application)
create policy "courier_profiles_insert_own" on courier_profiles
  for insert with check (id = auth.uid());

-- Couriers can update their own (vehicle info, etc.)
create policy "courier_profiles_update_own" on courier_profiles
  for update using (id = auth.uid());

-- Requesters can see basic info about active couriers (for dispatch display)
create policy "courier_profiles_select_active" on courier_profiles
  for select using (status = 'active');

-- ============================================================
-- Verification Checks
-- ============================================================
-- Couriers can view their own checks
create policy "verification_checks_select_own" on verification_checks
  for select using (courier_id = auth.uid());

-- ============================================================
-- Requests
-- ============================================================
-- Requesters can create requests
create policy "requests_insert_own" on requests
  for insert with check (requester_id = auth.uid());

-- Requesters can view their own requests
create policy "requests_select_own" on requests
  for select using (requester_id = auth.uid());

-- Requesters can cancel their own open requests
create policy "requests_update_own" on requests
  for update using (requester_id = auth.uid());

-- Active couriers can see open requests (for dispatch)
create policy "requests_select_open" on requests
  for select using (
    status = 'open'
    and exists (
      select 1 from courier_profiles
      where id = auth.uid() and status = 'active'
    )
  );

-- ============================================================
-- Sessions
-- ============================================================
-- Couriers can see their own sessions
create policy "sessions_select_courier" on sessions
  for select using (courier_id = auth.uid());

-- Requesters can see sessions for their requests
create policy "sessions_select_requester" on sessions
  for select using (
    exists (
      select 1 from requests
      where requests.id = sessions.request_id
      and requests.requester_id = auth.uid()
    )
  );

-- Couriers can update their own active sessions (route_points, ratings)
create policy "sessions_update_courier" on sessions
  for update using (courier_id = auth.uid());

-- Requesters can update sessions for rating
create policy "sessions_update_requester" on sessions
  for update using (
    exists (
      select 1 from requests
      where requests.id = sessions.request_id
      and requests.requester_id = auth.uid()
    )
  );

-- ============================================================
-- Fare Config (read-only for everyone)
-- ============================================================
create policy "fare_config_select_all" on fare_config
  for select using (true);

-- ============================================================
-- Courier Locations
-- ============================================================
-- Couriers can upsert their own location
create policy "courier_locations_upsert_own" on courier_locations
  for insert with check (courier_id = auth.uid());

create policy "courier_locations_update_own" on courier_locations
  for update using (courier_id = auth.uid());

-- Authenticated users can see courier locations (for live map)
create policy "courier_locations_select_auth" on courier_locations
  for select using (auth.uid() is not null);

-- ============================================================
-- Payment Methods
-- ============================================================
-- Users can manage their own payment methods
create policy "payment_methods_select_own" on payment_methods
  for select using (profile_id = auth.uid());

create policy "payment_methods_insert_own" on payment_methods
  for insert with check (profile_id = auth.uid());

create policy "payment_methods_update_own" on payment_methods
  for update using (profile_id = auth.uid());

create policy "payment_methods_delete_own" on payment_methods
  for delete using (profile_id = auth.uid());
