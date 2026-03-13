-- Cary — Development Seed Data
-- Run with: supabase db reset (applies migrations + seed)

-- Fare configs for each vehicle type
insert into fare_config (vehicle_type, base_fare_cents, per_minute_cents, per_meter_cents, minimum_fare_cents) values
  ('car',      150, 20, 0.0560, 400),  -- $1.50 base, $0.20/min, $0.90/mi, $4.00 min
  ('bike',     100, 15, 0.0373, 300),  -- $1.00 base, $0.15/min, $0.60/mi, $3.00 min
  ('ebike',    100, 15, 0.0435, 300),  -- $1.00 base, $0.15/min, $0.70/mi, $3.00 min
  ('scooter',  100, 15, 0.0435, 300),  -- same as ebike
  ('on_foot',  100, 10, 0.0311, 300);  -- $1.00 base, $0.10/min, $0.50/mi, $3.00 min (errands/pickups)
