-- Cary — Give `contact-sms` something to rate-limit against (SECURITY.md F-13)
--
-- `contact-sms` is reachable from the Ward's "Text us" button AND directly, with
-- no key and no auth header at all. Every call sends a real SMS to CONTACT_PHONE
-- and costs money. There was no limit of any kind — client or server — so a loop
-- of one curl command could flood the Host's personal phone and burn the Twilio
-- balance.
--
-- The counters live in `sms_messages`, which already logs every web contact with
-- a timestamp; no new table is needed. This migration adds the one thing missing:
-- a per-SOURCE key that a caller cannot simply rotate.
--
-- ⭐ WHY A HASH AND NOT THE IP. A per-device limit keyed on `device_hash` is
-- almost free to evade — the client makes that value up. The IP is not
-- client-chosen, so it is the useful key. But a raw IP log on a neighborhood
-- site is a surveillance record we do not want and did not previously keep, and
-- it would enter `SECURITY.md`'s data-sensitivity inventory. Storing a salted
-- hash keeps the rate-limit key and keeps none of the address: it cannot be read
-- back into an IP, only compared against another hash of the same IP.
--
-- ⛔ NOT the whole answer, and the ordering matters. Per-source limits slow an
-- attacker down; only the GLOBAL daily ceiling actually bounds the bill, because
-- addresses can be rotated and device hashes invented. The global cap is the
-- backstop; these are the speed bumps.

alter table sms_messages
  add column if not exists sender_ip_hash text;

comment on column sms_messages.sender_ip_hash is
  'Salted SHA-256 of the sender IP, for rate limiting only (migration 012). '
  'NOT reversible to an address and deliberately not an IP log. Null for rows '
  'that did not arrive over the web contact path.';

-- Supports the per-source window count in `contact-sms`.
create index if not exists idx_sms_messages_ip_hash
  on sms_messages(sender_ip_hash, created_at desc)
  where sender_ip_hash is not null;

-- Supports the global "web messages in the last 24h" ceiling. Partial, because
-- that count only ever looks at inbound web rows — inbound SMS and outbound
-- replies are irrelevant to it and shouldn't be scanned.
create index if not exists idx_sms_messages_web_recent
  on sms_messages(created_at desc)
  where phone = 'web' and direction = 'inbound';
