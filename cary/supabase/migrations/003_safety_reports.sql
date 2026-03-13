-- Cary — Safety Reports
-- Anyone who feels unsafe during a Courier service may end the service
-- immediately and report the concern. Safety reports are taken seriously
-- and may result in suspension or removal from the network.

create table safety_reports (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid references sessions(id),
  reporter_id     uuid not null references profiles(id),
  reported_id     uuid not null references profiles(id),
  reason          text not null,
  details         text,
  status          text not null default 'open'
                  check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  resolution      text,
  created_at      timestamptz default now()
);

-- RLS
alter table safety_reports enable row level security;

-- Reporter can create and view their own reports
create policy "safety_reports_insert_own" on safety_reports
  for insert with check (reporter_id = auth.uid());

create policy "safety_reports_select_own" on safety_reports
  for select using (reporter_id = auth.uid());

create index idx_safety_reports_reported on safety_reports(reported_id);
create index idx_safety_reports_status on safety_reports(status) where status = 'open';
