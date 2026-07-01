# HANDOFF — Security audit (Supabase Advisor + Cary backend)

_Opened 2026-07-01 (Boz, solo forensic pass). Pick up here tomorrow._

## Why this exists
Supabase kept emailing "security concern" alerts. Ran a forensic over the whole repo,
weighted to the **Cary** courier backend (`cary/supabase/**`) — that's where the PII, the
money movement, and the Advisor findings live. Full catalog: **`SECURITY.md`** (root).

## What the emails are
Supabase **Security Advisor** digest. Three findings, all matched to our schema:
- `rls_disabled_in_public` → **`sms_messages` has RLS off** (holds phones + message bodies). The ERROR. Almost certainly the trigger.
- `security_definer_view` → `courier_credential_status` (leaks name/email/phone).
- `function_search_path_mutable` → `try_activate_courier`, `suspend_expired_couriers`, `get_onboarding_status`.

## Done today (drafted, NOT applied)
- `SECURITY.md` — formal surface catalog + fortification register + ranked findings F-1…F-13.
- `cary/supabase/migrations/009_security_advisor_fixes.sql` — fixes **F-1 / F-7 / F-8**:
  enable RLS on `sms_messages` (+revoke), recreate the view `security_invoker=true` (+revoke),
  pin `set search_path=''` on the 3 definer functions (bodies otherwise unchanged from 005/006).
- Nothing committed, nothing pushed, nothing applied to the DB.

## ▶ First action tomorrow — APPLY 009
Live-DB mutation → needs Jacob's explicit go-ahead + interactive login. Before pushing:
1. `supabase projects list` — confirm the linked project is `ngbvgjzrpnfrqmzkqvch` and it's the intended prod.
2. `supabase migration list` — confirm 001–008 are already applied on the remote (009 alters the 007 table + `create or replace`s 005/006 functions; it assumes they exist).
3. `supabase db push` — apply 009.
4. Re-run the Advisor in the dashboard → the 3 findings should drop off, emails stop.
- Then commit (branch `curb-offset-draw`): `SECURITY.md`, `009_*.sql`, this handoff. **Not pushed** — that branch deploys nothing anyway ([[deploy-branch-topology]]); nothing here touches the shipped app.

## Still open (from SECURITY.md, ranked) — decide what's next
**Not yet addressed. These are code/auth changes, bigger than the SQL:**
- **F-2 HIGH** — `onboarding` fn trusts `courier_id` from the body (no caller auth) → anyone can mark any courier's insurance "passed" / accept agreement / trip activation.
- **F-3 HIGH** — `complete-session` fn has no auth at all → unauthenticated POST moves money via Stripe.
- **F-5 HIGH** — no webhook signature verification anywhere (Stripe/Checkr/Twilio) → forged "background passed" activates a courier.
- **F-4 HIGH** — `requests` RLS is `USING (true)` for SELECT+UPDATE (migration 004) → anon reads/edits every request incl. GPS.
- F-6/F-9/F-10/F-11 MEDIUM · F-12/F-13 LOW — device_hash IDOR, TwiML XML injection, blanket courier-location visibility, fail-open cron secret, dev-server shell injection, broad CORS.
- **Not in repo:** the Supabase **Auth dashboard** lints (OTP expiry, leaked-password protection, redirect URLs) — check the console; Advisor may also flag these.

## Framing for the standup
- Cary is **pre-public** (`plans/pre_public_cleanout.md`) BUT the Supabase project is live, the anon key is already in the shipped bundle, and the tables are already reachable → treat HIGH items as live exposure, not future risk.
- The theme across F-2/F-3/F-4/F-6: **service-role functions are the authorization**, and several don't authenticate the caller; **device_hash is a bearer token, not auth.** A fix pass here is a design conversation (bind to Supabase auth vs. route through server-side device_hash filtering), not a one-liner — worth talking through before building.
- Good news to keep: no secrets committed, `.env` clean in history, CI injects via GH secrets, no raw card PANs / license numbers stored, Apps Script admin auth is sound (`SECURITY.md §4`).
