-- SMS message log for admin inbox
create table sms_messages (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  direction   text not null check (direction in ('inbound', 'outbound')),
  body        text not null,
  twilio_sid  text,
  device_hash text,
  handle      text,
  avatar      text,
  created_at  timestamptz default now()
);

create index idx_sms_messages_phone on sms_messages(phone, created_at);
create index idx_sms_messages_created on sms_messages(created_at desc);
