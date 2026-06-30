# LS — Cary, the courier system (app integration)

How the **Cary** neighborhood courier system surfaces *inside the LS app*. This is the consumer-app integration view only — the program, pricing, legal, onboarding pipeline, and database schema live in their own home and are **not duplicated here**:

> **Cary's canonical docs** (defer to these for the program/legal/schema side):
> - [`../CARY-BRIEF.md`](../CARY-BRIEF.md) — project brief, architecture, pricing, status, next steps
> - [`../cary/legal/`](../cary/legal/) — courier/sender/rider agreements, org structure, TNC-license readiness
> - [`../cary/supabase/migrations/`](../cary/supabase/migrations/) — the canonical DB schema (tables, RLS, realtime), `seed.sql`
> - [`../cary/REFLECTIONS-2026-06-20.md`](../cary/REFLECTIONS-2026-06-20.md) — the non-extraction org philosophy
> - [`../cary/lib/`](../cary/lib/) — shared `meter.js` (fares) · `geo.js` (GPS) · `dispatch.js` (matching)

Last verified: 2026-06-29 against the working tree (`curb-offset-draw`).

---

## 1. What it is (in the app)

Cary is a neighborhood request-and-dispatch courier system. Unlike the rest of LS (which is Google-Apps-Script-backed), Cary runs entirely on **Supabase** — phone-OTP auth, Postgres tables, realtime channels, and edge functions. The app integrates Cary at a handful of seams: live courier **dots on the 3D map**, the masthead **courier count**, a delivery **CTA on place cards**, and the full **courier-facing** onboarding + dashboard. The central client is the `useCary` store (`src/hooks/useCary.js`).

**Safe-stub:** `src/lib/supabase.js` returns a no-op proxy when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are unset, so the app runs fine with Cary unconfigured (per `PUBLISH.md §5`).

---

## 2. The Supabase boundary

Cary is **separate from the GAS backend**. Tables (canonical schema in `cary/supabase/migrations/`): `profiles`, `courier_profiles`, `verification_checks`, `requests`, `sessions`, `courier_locations`, `safety_reports`, `onboarding_steps`. **Realtime** channels publish `requests`, `sessions`, `courier_locations`. **Edge functions**: `onboarding` (verification orchestration — Stripe Identity, Checkr), `credential-check`, `complete-session` (fare settlement), `dispatch` (matching), the `sms-*` / `web-messages` handlers. **Auth**: Supabase phone OTP via Twilio.

---

## 3. In-app surfaces

| Surface | File:line | What it does | Status |
|---|---|---|---|
| **Courier dots (3D map)** | `src/components/CourierDots.jsx:79` | Realtime subscriber to `courier_locations`; delivering vs idle color; idle couriers snap to the park center (privacy); stale after 5 min | ✅ live |
| **Masthead "Couriers" count** | `src/components/SidePanel.jsx:578` | The four-stat widget reads `useCommunityStats()` | ⏳ stub (store inits `couriers: 0`, never populated) |
| **Delivery CTA on cards** | `src/components/PlaceCard.jsx:2003` (`CaryButton`) | "Deliver from …" / "Pick me up here" | ⏳ "coming soon" overlay — no request form wired |
| **Courier auth** | `src/components/CaryAuth.jsx` | phone → OTP → profile | ✅ live |
| **Courier onboarding** | `src/components/CourierOnboarding.jsx` | 7-step wizard (Deliver tier: account → identity → agreement; Drive tier adds license → background → insurance → vehicle) | ✅ live (`/cary/deliver`, `/cary/drive`) |
| **Courier dashboard** | `src/components/CourierDashboard.jsx` | online/offline + GPS, request cards, live meter (time/distance/fare), safety reports; always mounted, opens on `useCourierDash.open` | ✅ live |
| **Safety report** | `src/components/SafetyReport.jsx` | mid-trip incident report (from dashboard "End Service") | ✅ live |
| **Central store** | `src/hooks/useCary.js` | auth, profile, active request/session, realtime subs, lifecycle (sendOtp, acceptRequest, startMeter, updateLocation…); auto-init on load | ✅ live |
| **Routes** | `src/App.jsx:625` | `/cary/deliver` · `/cary/drive` · `/cary/apply` → fullscreen; `/terms/courier` → `LegalPage` | ✅ live |
| **Supabase client** | `src/lib/supabase.js` | real client or safe-stub | ✅ live |

---

## 4. Ship state

- ✅ **Live:** courier onboarding (both tiers), the courier dashboard (GPS, request accept, meter, safety), live courier dots, phone-OTP auth.
- ⏳ **Placeholder:** the **requester** delivery CTA (`CaryButton` shows "coming soon"); the masthead courier count (stub store).
- ❌ **Unbuilt:** requester-side **request creation** (the critical blocker — couriers can sit ready but have nothing to accept), settlement ledger / payouts, restaurant onboarding, ride-request creation + matching.

The **delivery hookup from place cards** (`PLACE-CARDS.md` §3: a menu order needs the `delivery` tag + a live courier + an in-window menu) terminates at `CaryButton`'s placeholder today — the order→dispatch path is the unbuilt requester side above.

---

## 5. Known gaps / next (app side)
Requester request-creation UI (the place-card → pickup/destination form) · wire the masthead count to Supabase · settlement ledger · restaurant onboarding. The program-level roadmap is `CARY-BRIEF.md §"What's next"`.

## Source map
| Thing | File | Notes |
|---|---|---|
| Store + lifecycle | `src/hooks/useCary.js` | auth state listener; auto-init |
| Map dots | `src/components/CourierDots.jsx:79–154` | `courier_locations` realtime |
| Delivery CTA | `src/components/PlaceCard.jsx:2003–2031` | `CaryButton` (placeholder) |
| Onboarding / dashboard / auth / safety | `CourierOnboarding.jsx` · `CourierDashboard.jsx` · `CaryAuth.jsx` · `SafetyReport.jsx` | |
| Routes | `src/App.jsx:602,623–627` | dashboard always mounted |
| Supabase client | `src/lib/supabase.js` | safe-stub when env unset |
| Schema / program / legal | `cary/supabase/migrations/` · `CARY-BRIEF.md` · `cary/legal/` | **canonical homes — defer here** |

*New doc, 2026-06-29 — the app-integration view; the program/legal/schema live in `CARY-BRIEF.md` + `cary/`. Reference-kind: when an in-app Cary surface ships or changes status, update §3–§4.*
