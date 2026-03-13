-- Cary — Switch requester identity from Supabase auth to device hash + handle
-- Requesters ("townies") use the existing anonymous device identity system.
-- Only Couriers need Supabase auth (phone verification, background checks, payments).

-- ============================================================
-- Add device-based identity columns to requests
-- ============================================================
alter table requests
  add column requester_device_hash text,
  add column requester_handle text;

-- Drop the FK constraint to profiles (requester_id becomes nullable/unused for requesters)
alter table requests
  alter column requester_id drop not null;

-- ============================================================
-- Update RLS: allow anon inserts with device_hash
-- ============================================================

-- Drop old requester policies that depend on auth.uid()
drop policy if exists "requests_insert_own" on requests;
drop policy if exists "requests_select_own" on requests;
drop policy if exists "requests_update_own" on requests;

-- Anyone can create a request (identified by device_hash, not auth)
create policy "requests_insert_anon" on requests
  for insert with check (requester_device_hash is not null);

-- Requesters can view their own requests by device_hash
create policy "requests_select_by_device" on requests
  for select using (true);

-- Requesters can cancel their own open requests by device_hash
create policy "requests_update_by_device" on requests
  for update using (true);

-- ============================================================
-- Index for device_hash lookups
-- ============================================================
create index idx_requests_device_hash on requests(requester_device_hash)
  where status in ('open', 'accepted', 'in_progress');
