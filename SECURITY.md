# SECURITY.md

**Security surface catalog & fortification register for Lafayette Square / Cary.**

_Forensic pass: 2026-07-01. Author: Boz (solo analytic pass). Scope: the whole repo,
with emphasis on the **Cary** courier backend (`cary/supabase/**`) — that is where the
sensitive data and the money movement live, and it is the subsystem Supabase's Security
Advisor emails are about._

This document has three jobs:

1. **Answer the Supabase email** — [§1](#1-the-supabase-security-advisor-email--likely-triggers) maps our schema to the exact Advisor lints that fire.
2. **Catalog the surface** — [§2](#2-security-surfaces-trust-boundaries) draws the trust boundaries; [§4](#4-fortifications-in-place) records what is already fortified.
3. **Surface the gaps** — [§3](#3-findings--gaps-ranked) is the ranked findings register with file:line and remediation.

> ⚠️ **Status of the Cary backend.** Cary is pre-public (`plans/pre_public_cleanout.md`,
> `ls/CARY.md`). Several findings below are "not shipped to real users yet" — but the
> Supabase project **is live** (the Advisor is scanning a real database), the anon key is
> **already public** in the deployed web bundle, and the tables **are already reachable**.
> Treat the CRITICAL/HIGH items as live exposure, not future risk.

---

## 1. The Supabase Security Advisor email — likely triggers

Supabase emails a weekly **Security Advisor** digest. Every lint below has a concrete
match in our migrations. Fix these and the emails stop.

| Advisor lint | Severity | Our object | Where |
|---|---|---|---|
| `rls_disabled_in_public` | **ERROR** | **`sms_messages` has no RLS** — anon key can `select *` (phones, message bodies, device_hash) | `007_sms_messages.sql`, never enabled |
| `security_definer_view` | ERROR/WARN | **`courier_credential_status`** view exposes name/email/phone, runs with definer rights (bypasses caller RLS) | `005_onboarding_pipeline.sql:65` |
| `function_search_path_mutable` | WARN | `suspend_expired_couriers`, `try_activate_courier`, `get_onboarding_status` are `security definer` with **no `set search_path`** | `005:105,132,189`; `006:18,110` |
| `auth_*` (OTP expiry / leaked-password protection) | WARN | Auth-console settings, not in repo — **verify in the dashboard** | Supabase Auth settings |

**The `sms_messages` one is almost certainly the ERROR that triggered the email.** It is
the only public table in the schema with RLS switched off, and it holds PII. See
[F-1](#f-1-critical--sms_messages-has-no-row-level-security).

> ✅ **CLOSED 2026-08-24 (Wren).** `009_security_advisor_fixes.sql` is **applied to prod**
> (`ngbvgjzrpnfrqmzkqvch`). F-1 and F-7 are verified shut against the live API — anon now gets
> **HTTP 401** on `sms_messages` and on `courier_credential_status`, with `requests` still
> answering 200 as the control that proves the probe works. ⛔ Don't take that on trust — re-derive it:
>
> ```
> SUPABASE_URL=… SUPABASE_ANON_KEY=… node scratch/claims-cary-anon-exposure.mjs
> ```
>
> F-8 is confirmed only by the DDL applying (a failed `create or replace function` aborts the whole
> migration); the catalog was not read. **Re-run the Advisor in the dashboard for the last word** — the
> Advisor API is not reachable from the CLI.
>
> ### ⚠️ `supabase db push` alone does NOT apply a migration here — it did not on 2026-08-24
> The remote **migration history table was empty** while 001–008 were genuinely applied (all ten tables
> live, `sms_messages` holding 23 real rows). So push tried the whole stack, hit `create table profiles`
> in `001`, and would have applied **nothing** — a no-op that reads like a run. The sequence that works:
> `supabase migration repair --status applied 001 … 008`, **then** `db push`. History is now tracked, so
> the next migration is a plain push. **Check it before pushing, every time:** `supabase migration list`
> — an empty *Remote* column means you are about to no-op.

---

## 2. Security surfaces & trust boundaries

The system is three deployables plus two third-party backends:

```
 Browser (public JS bundle: VITE_SUPABASE_ANON_KEY, VITE_API_URL are visible to everyone)
   │
   ├── Supabase Postgres  ──── PostgREST auto-API, gated ONLY by RLS + the anon key
   │      (Cary: profiles, couriers, requests, sessions, payments, sms_messages, locations)
   │
   ├── Supabase Edge Functions ── run with the SERVICE_ROLE key (RLS bypassed)
   │      onboarding · complete-session · dispatch · credential-check
   │      sms-webhook · sms-inbox · sms-reply · contact-sms · web-messages
   │
   ├── Google Apps Script (GAS) ── LS listings / guardians / bulletins backend
   │      admin passphrase → 6h cache token; guardian_token + claim_secret per listing
   │
   ├── Cloudflare Worker (worker.js) ── OG-tag injection proxy in front of the site
   │
   └── Third parties: Stripe (Connect + Identity), Checkr, Twilio, SendGrid
```

**The two trust boundaries that matter:**

- **Anon key ⇒ RLS is the only wall.** The anon key is public by design (it ships in the
  browser bundle). Anything the anon role can reach through PostgREST is world-readable/
  writable **unless RLS says otherwise**. RLS is not defense-in-depth here; it is _the_
  defense. A single table with RLS off (F-1) or a `USING (true)` policy (F-4) is a full
  data breach for that table.

- **Service-role key ⇒ the function IS the authorization.** Every edge function creates its
  client with `SUPABASE_SERVICE_ROLE_KEY`, which **bypasses RLS entirely**. That is correct
  for a trusted server — but it means each function must authenticate its caller and authorize
  the specific action **in its own code**. Supabase's `verify_jwt` gateway does _not_ save us — and
  it is weaker than it sounds twice over: even when it is on, the anon key is itself a valid JWT, so
  "has a JWT" ≈ "is anyone on the internet"; and ⭐ **it is not on for every deployed function** —
  `onboarding` executes with no `apikey` and no `Authorization` header at all (measured 2026-08-24,
  F-2). ⛔ So never treat the gateway as a layer: **check per function, don't assume.** Functions that
  trust an `id` from the request body without checking it against the caller (F-2, F-3) are
  unauthenticated privileged endpoints.

**Data sensitivity inventory** (what an attacker gains): phone numbers + verified flags,
driver-license expiry/verified, insurance, live GPS (`courier_locations`, `route_points`),
Stripe customer/payment-method tokens + card last4/brand, SMS message contents, safety
reports, home ZIP. No raw card PANs, no SSNs, no license numbers are stored (see F-good).

---

## 3. Findings & gaps (ranked)

Severity = impact × exposure. IDs are stable; cite them in fixes.

### F-1 · CRITICAL · `sms_messages` has no Row-Level Security  — ✅ CLOSED 2026-08-24 (verified: anon → 401)
- **Where:** `cary/supabase/migrations/007_sms_messages.sql` (table created, RLS never enabled); `008_web_messaging.sql` (columns added, still no RLS).
- **Impact:** The anon key can `GET /rest/v1/sms_messages?select=*` and read every SMS/web
  message — **phone numbers, message bodies, device_hash, handle** — and `INSERT`/`UPDATE`
  arbitrary rows. Full disclosure of the contact/message log. This is the Advisor **ERROR**.
- **Fix:** `alter table sms_messages enable row level security;` — then add **no anon
  policies at all** (the table is only ever touched by service-role edge functions
  `sms-webhook`/`sms-inbox`/`sms-reply`/`contact-sms`/`web-messages`, which bypass RLS). RLS
  on + zero policies = anon locked out, functions unaffected. Add a migration `009_*.sql`.

### F-2 · HIGH · `onboarding` function trusts `courier_id` from the body (no caller auth)  — ✅ CLOSED 2026-08-24 (deployed + verified live)
- **Where:** `cary/supabase/functions/onboarding/index.ts` — `handleAction`/`handleGetStatus` (dispatch), and every handler. *(Cite the symbol, not a line number — these drifted once already.)*
- **Impact:** Service-role client + `courier_id` taken straight from the request. Any
  anonymous caller can, for **any** courier id: `submit_insurance` → **marks insurance
  `passed`** (`index.ts:255-262`, self-attested, no vendor), `accept_agreement` →
  `try_activate_courier` (a Deliver courier needs only identity + agreement → **activation**),
  `upgrade_to_drive`, overwrite vehicle/license, and `GET ?courier_id=` to read another
  courier's onboarding status. Broken access control on identity/verification state.
- ⭐ **Scope of the live exposure, measured 2026-08-24** (`supabase secrets list`): `STRIPE_SECRET_KEY`
  and `CHECKR_API_KEY` are **not set**, so `start_identity` and `start_background` answered 503. That
  does **not** soften the finding — the damaging actions are pure DB writes needing no vendor key:
  `submit_insurance` (**marks insurance `passed`**), `accept_agreement` (→ `try_activate_courier`),
  `submit_license`, `submit_vehicle`, `upgrade_to_drive`, and `GET` on anyone's status. All were live.
- ⭐ **Worse than written, measured 2026-08-24:** the doc said `verify_jwt` doesn't save us *because
  the anon key is itself a valid JWT*. In fact **there is no JWT gate on this function at all** — it
  executes with no `apikey` and no `Authorization` header whatsoever. An attacker does not even need
  the public anon key. Reproduce (returns the function's own 400, i.e. its code ran):

  ```
  curl -i https://ngbvgjzrpnfrqmzkqvch.supabase.co/functions/v1/onboarding
  ```

- **Fix (done in source):** `authenticateCourier()` in `onboarding/index.ts` requires
  `Authorization: Bearer <user token>`, verifies it via `auth.getUser()` against the anon-key client,
  and **derives** `courierId` from the verified token. A `courier_id` in the query/body is still
  accepted but must match — ⛔ a mismatch is rejected **403 and logged**, never silently overridden.
  No client change was needed: couriers already hold a phone-OTP session (`useCary.js:59-69`) and
  `supabase.functions.invoke` forwards it.
- ✅ **Deployed and verified live 2026-08-24.** Every attack this finding names now returns the
  function's own `401 {"error":"Authentication required"}` (dummy all-zeros courier id, so no real
  record was touched):

  ```
  curl -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -X POST \
    https://ngbvgjzrpnfrqmzkqvch.supabase.co/functions/v1/onboarding \
    -d '{"action":"submit_insurance","courier_id":"…","insurance_expiry":"2030-01-01"}'
  ```
- ⛔ Deploy **by name**. A bare `supabase functions deploy` would also ship `complete-session` (F-3),
  an unauthenticated money-moving endpoint that has deliberately never been deployed.
- ⚠️ **Separate, pre-existing, NOT fixed here — the function has no CORS headers**, so a browser
  preflight gets `405` with no `Access-Control-Allow-Origin` and the *legitimate* client cannot call
  it; only `curl` can. Verified 2026-08-24 with
  `curl -X OPTIONS … -H 'Origin: https://lafayette-square.com'`. It is a functional gap, not a
  security one, and fixing it is a design choice about allowed origins (cf. F-13) — so it is left for
  that pass rather than resolved silently here.

### F-3 · HIGH · `complete-session` is an unauthenticated money-moving endpoint
- **Where:** `cary/supabase/functions/complete-session/index.js:20-32`.
- **Impact:** No auth check. Anyone who POSTs `{session_id}` finalizes that session, computes
  the fare, and **creates a Stripe PaymentIntent** (charge to the requester's card, transfer to
  the courier's Connect account). An attacker can force-complete sessions, and — because
  distance/duration are recomputed server-side but the trigger is open — grief metering and
  payments. Uses service role, so RLS gives no backstop.
- **Fix:** Authenticate the caller and authorize that they are the session's courier
  (`session.courier_id === auth.uid()`). Consider idempotency on `session_id` to block replays.

### F-4 · HIGH · `requests` RLS opened to `USING (true)` for SELECT and UPDATE  — ✅ CLOSED 2026-08-24 (migration `010`, applied + verified live)
- **Where:** `cary/supabase/migrations/004_requester_device_identity.sql:30-35`.
- **Impact:** When requester identity moved from auth to device_hash, the policies became
  `requests_select_by_device … using (true)` and `requests_update_by_device … using (true)`.
  The anon role can therefore **read every request** (place name, exact lat/lon, description,
  requester handle) and **update any request** (flip status, cancel someone else's, tamper).
  `requests_insert_anon` only checks `device_hash is not null` — trivially satisfied.
- **Fix (applied — `010_requests_scope_ownership.sql`):** requesters now get an **anonymous Supabase
  session**, so `requests` is scoped by `requester_id = auth.uid()` like every other table, and the
  courier side gets the two policies the blanket `using (true)` had been masking
  (`requests_select_held_by_courier`, `requests_update_by_courier`).
  ⭐ **The signup wall 004 was avoiding never had to be paid:** an anonymous sign-in has no phone, no
  email and no user-visible step. The property 004 wanted and the property RLS needs were not actually
  in conflict.
- ⛔ **THE ROAD NOT TAKEN, AND WHY — the reason this is not a header claim.** The cheaper fix is to send
  the device hash in an `x-device-hash` header and compare it via `current_setting('request.headers',…)`.
  It works for PostgREST reads and **breaks Realtime**: Realtime authorises on the socket's JWT and
  evaluates RLS with **no request headers**, so a requester's `postgres_changes` subscription silently
  delivers nothing. **A header cannot ride a WebSocket; an anonymous JWT can.**
  *(Honest scope: `subscribeAsRequester` is defined in `useCary.js` and currently never invoked, so that
  breakage would have been latent rather than live. The approach was chosen on the model being right,
  not on an outage that exists today.)*
- ⚠️ **Requires "Allow anonymous sign-ins" ENABLED** (Auth → Sign In / Providers). Declared in
  `cary/supabase/config.toml`; ⛔ **do not `supabase config push`** to apply it — that pushes the whole
  local config, which does not capture the dashboard-only auth settings (OTP expiry, redirect
  allowlist, leaked-password protection), and there is no `--dry-run`. Toggle it in the console.
- **Verified live 2026-08-24** — anon now SELECTs `[]`, INSERT is `401`, and the tamper affects nothing:
  ⭐ **note the status code, it is a trap:** a blocked anon `PATCH` returns **`200` with an empty body**
  (PostgREST's "zero rows matched"), not `403`. Testing by status code alone reads as still-open.
  ```
  curl -X PATCH "$URL/rest/v1/requests?id=eq.<id>" -H "apikey: $ANON" \
       -H "Authorization: Bearer $ANON" -H "Prefer: return=representation" \
       -H "Content-Type: application/json" -d '{"status":"disputed"}'   # → []
  ```
- **Check:** `node scratch/claims-cary-anon-exposure.mjs`.

### F-5 · HIGH · No webhook signature verification (Stripe / Checkr / Twilio)  — ✅ TWILIO HALF CLOSED 2026-08-24 (deployed) · Stripe/Checkr half OPEN
- **Where:** `cary/stripe/webhooks.js` (handlers only — no `stripe.webhooks.constructEvent`);
  `cary/supabase/functions/sms-webhook/index.ts` (no `X-Twilio-Signature` check). Repo-wide grep
  for `constructEvent` / `STRIPE_WEBHOOK_SECRET` / `X-Twilio-Signature` = **zero hits**.
- **Impact:** If/when these handlers are wired to a public endpoint, a forged POST can drive
  the trust chain: a fake Checkr `report.completed {result:'clear'}` or Stripe
  `identity.verification_session.verified` calls `try_activate_courier` → **a courier goes
  active with no real background check or identity proof**; a forged `payment_intent.succeeded`
  marks a session paid; forged Twilio inbound injects rows and abuses the SMS/email relay.
- **Fix (Twilio half, done in source):** `sms-webhook` now verifies `X-Twilio-Signature`
  (HMAC-SHA1 over `url + sorted(k+v)`) **before** it spends SendGrid credit, writes a row, or emits
  TwiML. ⛔ **No fail-open:** an unset `TWILIO_AUTH_TOKEN` **rejects**, it does not skip — that is the
  F-11 mistake, and here it would make every forged POST indistinguishable from a real text.
  `TWILIO_WEBHOOK_URL` overrides `req.url` for the case where a proxy rewrites host/proto.
  ✅ `TWILIO_AUTH_TOKEN` **is** set in the project's secrets, so the deploy did not blind the endpoint
  (`supabase secrets list`). Deployed 2026-08-24; an unsigned POST now gets `403` from the function.
- ### ⛔⛔ `verify_jwt` IS AN OUTAGE ON A THIRD-PARTY WEBHOOK, NOT A LAYER — and this deploy proved it
  `supabase functions deploy` defaults `verify_jwt` to **true**, and **Twilio cannot send an `apikey`
  header**. The first deploy therefore turned the gate on and made every real inbound text `401`
  *before the function ran* — a self-inflicted outage, caught within the minute by re-probing rather
  than by trusting the deploy. Fixed by redeploying `--no-verify-jwt`, and **pinned in
  `cary/supabase/config.toml`** so the setting travels with the repo instead of living in whoever last
  typed the flag. ⭐ That is only safe because the function now authenticates its own caller: turning
  the gate off on a function with no auth of its own is how F-2 happened.
- ⚠️ **The positive path is NOT verified.** Rejecting forgeries is confirmed live; *accepting a genuine
  Twilio request* cannot be, because signing one needs the auth token. The residual risk is a **URL
  mismatch** — Twilio signs the exact URL configured in its console, so a proxy rewriting host/proto
  makes real texts fail. The rejection log now prints the URL the HMAC was computed over, so that
  shows up as one readable line instead of "SMS stopped working"; the fix is to set
  `TWILIO_WEBHOOK_URL`. ▶ **Owed: send a real text and confirm it lands.**
- **Check:** `node scratch/claims-twilio-webhook-guard.mjs` — loads the real helpers **out of the
  function's source** (never a re-implementation) and asserts that forged, misrouted, mis-keyed and
  unverifiable requests are all rejected. The HMAC is pinned against the official `twilio` package's
  `getExpectedTwilioSignature`, not against a remembered constant.
- **Still OPEN — Stripe/Checkr half:** `cary/stripe/webhooks.js` still has no `constructEvent` and, in
  fact, **no HTTP entrypoint at all** — it exports handlers nothing routes to. Verify with
  `STRIPE_WEBHOOK_SECRET` and Checkr's signature header *when* it is wired. A hard prerequisite before
  Cary handles a real activation.

### F-6 · MEDIUM · `web-messages` IDOR — device_hash is the only authorization  — ⚠️ NARROWED 2026-08-24 (no longer applies to `requests`)
- **Where:** `cary/supabase/functions/web-messages/index.ts` (`fetch`/`reply`/`unread` all key
  solely on the body's `device_hash`).
- **Impact:** Anyone who supplies a valid `device_hash` reads that user's whole thread and can
  post as them. The hash is a client-generated 64-bit random token (`src/lib/device.js:8-13`,
  crypto-strong, so not brute-forceable) — but it is a **bearer token in localStorage**, not
  authentication: it leaks via shared devices, logs, referrers, or XSS, and there is no
  rotation/expiry. Acceptable for low-stakes neighborhood messaging; document the model and
  don't extend it to anything sensitive.
- **Fix:** Accept the residual risk consciously, or bind threads to Supabase auth for anything
  that carries PII. At minimum treat device_hash as a secret (never log it, keep it out of URLs).
- ⭐ **Narrowed by `010`:** `requests` no longer authorizes on the device hash at all — it moved to
  `auth.uid()` via anonymous sign-in, which is a real refreshable credential rather than a
  non-expiring bearer token in localStorage. The finding still stands for `web-messages`,
  `contact-sms`, check-in, guardians and the bulletin (`ls/IDENTITY.md`), which are unchanged.
  ⭐ **And the same escape hatch is available to them** — anonymous auth costs no signup step, so
  "device_hash or a signup wall" was a false choice there too.

### F-7 · MEDIUM · `courier_credential_status` view leaks PII with definer rights  — ✅ CLOSED 2026-08-24 (verified: anon → 401)
- **Where:** `cary/supabase/migrations/005_onboarding_pipeline.sql:65-99`.
- **Impact:** The view joins `courier_profiles` + `profiles` to expose **display_name, email,
  phone** and all credential dates. Views run with the **owner's** rights and bypass the
  querying user's RLS unless created `with (security_invoker = true)`. This is the Advisor
  `security_definer_view` finding, and a PII exposure if the view is anon-reachable.
- **Fix:** Recreate as `create view courier_credential_status with (security_invoker = true)
  as …`, and confirm no anon `GRANT SELECT` on it. It is only consumed by the service-role
  `credential-check` function, so it needs no anon access at all.

### F-8 · MEDIUM · `security definer` functions without `set search_path`  — ✅ CLOSED 2026-08-24 (DDL applied; catalog not read)
- **Where:** `005:105,132,189`; `006:18,110`.
- **Impact:** A `security definer` function with a mutable `search_path` can be hijacked by a
  caller who shadows a referenced object in a schema earlier on their path — privilege
  escalation. This is the Advisor `function_search_path_mutable` warning.
- **Fix:** Add `set search_path = ''` (or `= public, pg_temp`) to each function definition and
  schema-qualify the table references.

### F-9 · MEDIUM · TwiML XML injection in `sms-webhook`  — ✅ CLOSED 2026-08-24 (deployed)
- **Where:** `cary/supabase/functions/sms-webhook/index.ts` (the raw inbound `body` is
  interpolated into `<Message to="…">[from] ${body}</Message>` unescaped).
- **Impact:** Combined with the missing Twilio signature check (F-5), an attacker (or a
  crafted real SMS) can inject TwiML markup, altering the response Twilio executes — e.g.
  redirecting the forward message. XML-escape all interpolated values.
- **Fix (done in source):** `escapeXml()` covers `& < > " '` and every value interpolated into the
  TwiML now goes through it. ⭐ Deliberately **not** applied to the `console.log` or the `text/plain`
  SendGrid body, where escaping would be wrong — `claims-twilio-webhook-guard.mjs` scopes its
  assertion to the `twiml +=` lines for exactly that reason. Signature verification landed with it (F-5).

### F-10 · MEDIUM→**HIGH** · Any authenticated user can see all courier live locations  — ✅ CLOSED 2026-08-24 (migration `011`)
- **Where:** `cary/supabase/migrations/002_rls_policies.sql:129-131`
  (`courier_locations_select_auth using (auth.uid() is not null)`).
- **Impact:** Real-time GPS of every active courier is visible to any signed-in account, not
  just a requester in an active session with that courier. A stalking/safety concern for a
  neighborhood service where couriers are identifiable.
- ⭐⭐ **RE-RANKED, AND BY OUR OWN CHANGE.** When this policy was written, "authenticated" meant a
  phone-OTP-verified courier — requesters had no account at all (004), so the set was small and vetted.
  **Migration `010` gives every visitor an anonymous session, and an anonymous Supabase user holds the
  `authenticated` role.** So `auth.uid() is not null` silently widened from *"a verified courier"* to
  *"anyone who loads the site"* — live GPS of every active courier, to the public. A stalking surface
  opened as a **side effect of closing a data leak**, in the same session.
- ⛔ **THE LESSON, WHICH OUTLIVES THE PATCH: a predicate that tests the SHAPE of a caller — "is
  authenticated", "has a JWT", "is not null" — is not an authorization rule.** It is an assumption
  about who holds credentials, and it rots the instant that population changes. **Authorize on the
  RELATIONSHIP** — this viewer, this courier, this trip — which does not move when the identity model
  does. `verify_jwt` failed the same way for the same reason (F-2, F-5). This was the only
  shape-testing policy in the schema; grep for the pattern before adding another.
- **Fix (applied — `011_courier_locations_scope.sql`):** readable only by the courier themselves, and
  by the requester on a session with them that has **not completed**.
- ⚠️ **The anon-only census could not have caught this** — anon and `authenticated` get different
  policy sets. `scratch/claims-cary-anon-exposure.mjs` now probes **both** roles, and ⛔ **refuses to
  print a pass** when it cannot obtain an anonymous session (which is the state today, since the
  dashboard toggle is still off — the check reports exactly that).

### F-14 · MEDIUM · `courier_profiles` exposes EVERY column for any active courier  *(new, 2026-08-24)*
- **Where:** `cary/supabase/migrations/002_rls_policies.sql:47-48` —
  `create policy "courier_profiles_select_active" … for select using (status = 'active');`
- **Impact:** The comment says *"Requesters can see basic info about active couriers (for dispatch
  display)"*, but **RLS is row-level, not column-level** — the policy hands over the whole row:
  `license_plate`, `drivers_license_expiry`, `insurance_expiry`, `stripe_connect_account_id`,
  `vehicle_photo_urls`. And it carries **no auth predicate at all**, so this is the public anon key,
  not merely a signed-in user. ⭐ Latent only because there are **zero active couriers today** — it goes
  live with the first activation, which is also when `SECURITY.md`'s own §4 "data minimization" claim
  stops being true.
- **Fix:** a `security_invoker` view exposing only the dispatch-display columns
  (`id, status, vehicle_type, vehicle_description, vehicle_photo_urls`), with the base-table policy
  dropped. ⛔ Column-level `GRANT`s are the wrong tool here — they apply regardless of RLS and would
  also strip a courier's access to their own row via `courier_profiles_select_own`.
- **Not fixed here:** what counts as "basic info" for dispatch display is a product decision, and
  guessing it is how an authoring decision gets called a defect. Needs a ruling.

### F-11 · LOW · `credential-check` cron auth is fail-open
- **Where:** `cary/supabase/functions/credential-check/index.js` (`if (cronSecret && authHeader !== …)`).
- **Impact:** If `CRON_SECRET` is unset, the guard is skipped and the endpoint (which suspends
  couriers and sends Twilio SMS) is callable by anyone — enabling forced suspensions and SMS
  spend abuse. Fail-open on a missing secret is the wrong default.
- **Fix:** Fail closed — if `CRON_SECRET` is not configured, return 500/401 rather than run.

### F-12 · LOW (dev-only) · Command injection in the Publish dev server
- **Where:** `cartograph/serve.js` (and `arborist`/`meteorologist` siblings): the look `id`
  from the URL path `/looks/([^/]+)/publish` is interpolated into
  `spawn("git commit -m '…publish ${id}…'", { shell: true })`.
- **Impact:** A crafted `id` containing shell metacharacters executes arbitrary commands. Bound
  by the fact this server is **dev-only** (it does not exist in the CI/prod build — see the
  guard comments in the file and `PUBLISH.md`) and is expected to bind to localhost. Real risk
  only if the dev port is exposed on an untrusted network.
- **Fix:** Validate `id` against `^[a-z0-9-]+$` before use, or drop `shell: true` and pass argv
  arrays. Confirm the server binds to `127.0.0.1`, not `0.0.0.0`.

### F-13 · LOW · Broad CORS (`Access-Control-Allow-Origin: *`) on data functions
- **Where:** `sms-inbox`, `sms-reply`, `web-messages`, `contact-sms`.
- **Impact:** Any origin can call these. For the admin functions this is mitigated by the
  Apps-Script admin-token check; for `web-messages`/`contact-sms` it widens CSRF/abuse surface.
- **Fix:** Restrict to the known site origin(s) where feasible; keep rate limiting in mind.

---

## 4. Fortifications in place

Credit where due — these are already correct and should be preserved:

- **No secrets in the repo or git history.** `.env` (holding `VITE_*` only) is gitignored
  (`.gitignore:8-11`) and absent from history; `dist/` is not committed; no `sk_live`/
  `service_role`/private-key strings anywhere in tracked source. All server secrets
  (`STRIPE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_*`, `CHECKR_API_KEY`,
  `SENDGRID_API_KEY`, `CRON_SECRET`) are read from `Deno.env` / injected via GitHub Actions
  secrets (`.github/workflows/deploy.yml:32-34`, `staging.yml:27-34`).
- **Only public values reach the browser.** `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` are
  designed to be public; the service-role key never leaves the edge/server side
  (`src/lib/supabase.js` uses the anon key only).
- **Correct RLS model on the core Cary tables.** `002_rls_policies.sql` enables RLS on the
  original 8 tables and (mostly) scopes to `auth.uid()`; `safety_reports` (003) enables RLS
  with own-row policies. The _model_ is right — the gaps (F-1, F-4) are omissions against it.
- **Strong PCI / data-minimization posture.** No raw card numbers (only Stripe
  `customer`/`payment_method` tokens + `card_last4`/`card_brand`), no SSNs, and driver-license
  **numbers are deliberately not stored** — only state + expiry (`onboarding/index.ts:150`).
  Sensitive checks are delegated to Stripe Identity / Checkr.
- **Apps-Script admin auth is sound.** Passphrase compared server-side against
  `ScriptProperties.ADMIN_PASSPHRASE`, exchanged for a random UUID token cached 6h
  (`apps-script/Code.js:39-49`); `guardian_token` and `claim_secret` are stripped from API
  output (`Code.js:338-339`); listing claims require a per-listing secret (`Code.js:602-617`).
- **Device identity uses crypto-strong randomness** (`src/lib/device.js:9-12`,
  `crypto.randomUUID` / `getRandomValues`) — the weakness is that it's a bearer token (F-6),
  not that it's guessable.
- **The worker's OG injection escapes HTML** (`worker.js:escHtml` covers `& < "`; consider
  adding `>` for completeness).

---

## 5. Remediation priority

⭐ **Ranked by LIVE exposure, not by finding number** *(re-ordered 2026-08-24, Wren)*. `supabase functions list`
shows only **six** of the nine edge functions are deployed — `complete-session`, `dispatch` and
`credential-check` have **never been deployed**, so the findings against them are latent, not live. That
inverts part of the old ordering, which ranked F-3 alongside F-2. ⛔ Re-derive before trusting this
sentence; a function can be deployed at any time:

```
supabase functions list --project-ref ngbvgjzrpnfrqmzkqvch
```

1. ~~**F-2**~~ ✅ closed + deployed 2026-08-24.
2. ~~**F-5 (Twilio half)** + **F-9**~~ ✅ closed + deployed 2026-08-24. ▶ Owed: send a real text and
   confirm it lands — the accept path could not be verified from here.
3. **F-4** — `requests` carries an open **UPDATE** policy and is handing rows to anon right now
   (`scratch/claims-cary-anon-exposure.mjs` fails on it).
   ### ⭐ AND **F-13/`contact-sms` IS NOW ABOVE ITS OWN RANK** *(2026-08-24)*
   Jacob is adding a **public "direct contact" QR** that routes into `contact-sms`. That function is
   deployed, takes `ACAO: *`, has **no auth and no rate limit**, and every POST sends a real Twilio SMS
   to `CONTACT_PHONE` and a SendGrid email. A QR makes the endpoint *more* discoverable, and the abuse
   is billable spend plus SMS-flooding a personal phone. `ls/OPERATIONS.md` has called this a ⛔ for a
   while; this register still files it under **F-13 · LOW · broad CORS**, which is the wrong severity.
   ⛔ **Rate-limit / abuse-gate it before the QR is printed**, not after.
4. ~~**F-10**~~ ✅ closed by `011` — and re-ranked MEDIUM→HIGH on the way, because `010` had widened it.
5. **F-14** — `courier_profiles` hands every column (license plate, Stripe account id, expiry dates) to
   the anon key for any *active* courier. Latent only because there are none yet; **live on the first
   activation**, which is exactly when Cary stops being pre-public. Needs a ruling on what "basic info"
   means before it can be built.
6. **F-3** + **F-5 (Stripe/Checkr half)** — money and vendor-trust. Not deployed today; a hard
   prerequisite before either is. `cary/stripe/webhooks.js` has no HTTP entrypoint at all.
7. **F-6, F-11, F-12, F-13** — harden as the surfaces mature.

_Also check the Supabase **Auth** dashboard settings (OTP expiry, leaked-password protection,
allowed redirect URLs) — those Advisor lints live in the console, not this repo._

---

_This is a static/forensic review of source at the stated date. It does not replace a live
pentest of the deployed Supabase project, nor a review of dashboard-side Auth/Storage config.
Re-run when the Cary backend approaches public launch._
