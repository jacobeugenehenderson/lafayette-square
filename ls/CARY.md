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
| **Menu ordering surface** | `src/components/PlaceCard.jsx:2836` (`MenuTab`) | Full **cart + priced order** (subtotal · tax · 22% service charge · processing · total; $40 min; kitchen note) — see §6 | ⏳ **capture built, submit stubbed** — "Place order" dead-ends at a "coming soon" card (admin-gated CTA) |
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
- 🟨 **Built but not wired (client-only):** the **menu ordering surface** (§6) — cart, the full priced order (subtotal/tax/service-charge/processing/total), the $40 minimum, the kitchen note. It computes a complete, legal-canon-accurate order **but nothing leaves the browser**: "Place order" is a stub.
- ❌ **Unbuilt:** the **order submit and everything after it** — no persistence, no Stripe food-PaymentIntent, no `requests`/`sessions` row, no dispatch, no POS injection. Also: settlement ledger / payouts, restaurant onboarding, ride-request creation + matching.

The **delivery hookup from place cards** (`PLACE-CARDS.md` §3: a menu order needs the `delivery` tag + a live courier + an in-window menu) captures a full priced cart in `MenuTab` today, then terminates at a "coming soon" card — the **submit → persist → pay → dispatch → inject** path is the unbuilt requester side above.

---

## 5. Known gaps / next (app side)
Requester request-creation UI (the place-card → pickup/destination form) · wire the masthead count to Supabase · settlement ledger · restaurant onboarding. The program-level roadmap is `CARY-BRIEF.md §"What's next"`.

**Order → kitchen.** The requester flow ends at a *checkout*; how that order then reaches the restaurant's line is the **POS-injection canon** — `../cary/pos/README.md`. Key invariant: payment stays on Cary's Stripe, the order is injected into the POS as *paid-external* (POS never touches the money). Pilot POS = Toast + Lightspeed; head-direct / tail-aggregator.

## 6. The ordering surface (order capture — built client-side)

Formalized 2026-07-09 from the code (`PlaceCard.jsx` `MenuTab`, ~L2836–3237). This is the requester **order-capture** flow — real and complete client-side; only the *submit* is stubbed. It is also the de-facto source of the **canonical order shape** that `../cary/pos/README.md` (POS injection) consumes.

**Gates (all must hold to reach the order UI):**
- `hasDelivery` — the place carries the `delivery` tag (`L2842`).
- `courierAvailable` — `useCourierAvailable()` (`CourierDots`) → `canOrder` (`L2843–2844`): capacity-first, orders only when a courier is standing by.
- **In-schedule now** — the menu type's `schedule[menuKey][day]` window contains the current time (`orderableMenus`, `L2908`); the cart only counts items from currently-orderable menus.
- **CTA is admin-gated** — non-admins see "Cary delivery — coming soon" (`L2980–3004`). *Code comment:* "To go live for everyone: remove the isAdmin gate."

**Cart:** `cart` = `{ "sectionIdx-itemIdx": qty }` (`L2900`), per-item ± controls, section cart counts.

**The price stack** (all integer cents — this is the money model, and it matches the legal canon exactly):

| Field | Formula | Source |
|---|---|---|
| `MIN_ORDER` | `4000` ($40) | `L2951` |
| `cartTotal` (subtotal) | Σ `item.price × qty` over orderable sections | `L2938` |
| `salesTax` | `round(cartTotal × INSTANCE.commerce.salesTaxRate)` — **food only, not delivery** | `L2953` |
| `caryFee` (service charge) | `round(cartTotal × 0.22)` — 22%, courier 75% / platform 25% | `L2954` |
| `processingFee` | `round((cartTotal + salesTax + caryFee) × 0.029) + 30` — Stripe 2.9% + $0.30 | `L2955` |
| `orderTotal` | `cartTotal + salesTax + caryFee + processingFee` | `L2956` |
| `belowMinimum` | `cartTotal > 0 && cartTotal < MIN_ORDER` (blocks submit) | `L2957` |

`salesTaxRate` is **per-installation** via `INSTANCE.commerce.salesTaxRate` (LS `0.08725`; HiPointe `0.09238` placeholder) — already instance-parameterized, not hardwired.

**Kitchen note:** free text ≤500 chars, "goes directly to the kitchen" (allergies/substitutions) — the current special-requests / modifiers channel (`L3166`).

**The gap (everything past "Place order"):** the button sets `orderPlaced = true` → a terminal **"Coming soon — Cary delivery is launching this spring"** card (`L3179–3196`). **No persistence, no Stripe PaymentIntent, no `requests`/`sessions` row, no dispatch, no POS injection.** Nothing leaves the browser. → the design for closing this gap is **[`../cary/ORDER-PIPELINE.md`](../cary/ORDER-PIPELINE.md)** (the submit pipeline).

**The implied `CaryOrder` shape** (the client already computes every field except the IDs): `{ restaurant place_id/name/lat/lon (from listing) · line_items[]{ section, name, unit_price_cents, qty } · order_note · subtotal/tax/serviceCharge/processing/total (cents) · in-schedule window }`. **Missing for POS injection:** structured **modifiers** (today only the free note), a **Cary order ID**, and the **food PaymentIntent id**. This is the schema to formalize when the submit path is built (`CARY-BRIEF.md §"What's next" #2`; POS side in `../cary/pos/README.md`).

## Source map
| Thing | File | Notes |
|---|---|---|
| Store + lifecycle | `src/hooks/useCary.js` | auth state listener; auto-init |
| Map dots | `src/components/CourierDots.jsx:79–154` | `courier_locations` realtime |
| Delivery CTA | `src/components/PlaceCard.jsx:2003–2031` | `CaryButton` (placeholder) |
| Menu ordering surface | `src/components/PlaceCard.jsx:2836–3237` (`MenuTab`) | cart + priced order; submit stubbed — §6 |
| Onboarding / dashboard / auth / safety | `CourierOnboarding.jsx` · `CourierDashboard.jsx` · `CaryAuth.jsx` · `SafetyReport.jsx` | |
| Routes | `src/App.jsx:602,623–627` | dashboard always mounted |
| Supabase client | `src/lib/supabase.js` | safe-stub when env unset |
| Schema / program / legal | `cary/supabase/migrations/` · `CARY-BRIEF.md` · `cary/legal/` | **canonical homes — defer here** |

*New doc, 2026-06-29 — the app-integration view; the program/legal/schema live in `CARY-BRIEF.md` + `cary/`. Reference-kind: when an in-app Cary surface ships or changes status, update §3–§4.*
