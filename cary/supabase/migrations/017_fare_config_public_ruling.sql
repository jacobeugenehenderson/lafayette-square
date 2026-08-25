-- Cary — record the fare_config ruling IN THE SCHEMA
--
-- ⭐ The census reports `fare_config_select_all [for select using (true)]` as
-- RULING NEEDED on every run: a world-readable table is either deliberate public
-- reference data or an oversight, and that is a judgement about the DATA which a
-- checker must not guess (CLAUDE.md Layer 0 q3 — never call the operator's
-- decision a defect). Jacob's ruling, 2026-08-25: DELIBERATE. It is the price
-- list — base fare, per-minute, per-mile, minimum — and a rider has to see the
-- fare before booking, the same way a menu sits in a window. `001_schema.sql:114`
-- already said "read-only for everyone"; this makes that intent machine-readable.
--
-- ⛔ Recorded HERE, not as an exception inside the checker. A named skip list in
-- the detector would ship to town #2 carrying OUR table names; a declaration in
-- the schema lets every town rule on its own tables and keeps the checker blind
-- to instances. The census reads the `PUBLIC REFERENCE DATA` marker below and
-- reports "declared public" instead of asking again.
--
-- ⛔ The declaration excuses an open READ and nothing else. An open WRITE policy
-- is still an unconditional finding — a comment cannot waive it.

comment on table fare_config is
  'PUBLIC REFERENCE DATA — deliberately world-readable (ruled 2026-08-25). '
  'Published pricing a rider must see before booking; contains no personal data. '
  'The open `fare_config_select_all` policy is intended. See SECURITY.md.';
