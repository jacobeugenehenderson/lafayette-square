# Cary — POS Integration (order injection)

**The canon for how a Cary order reaches a restaurant's kitchen.** When a customer checks out in the LS app, Cary has taken the money — but "the kitchen" is not an addressable endpoint. This doc is how we place that order onto a surface the kitchen already watches: **their POS.**

> Reference-kind. The *program/pricing/legal* live in [`../../CARY-BRIEF.md`](../../CARY-BRIEF.md) + [`../legal/`](../legal/); the *app-integration surfaces* in [`../../ls/CARY.md`](../../ls/CARY.md); the *money/settlement* model in `CARY-BRIEF.md §Pricing` + `../legal/sender-agreement.md §5–§6`. This doc owns **only** the order→kitchen wire.

Last authored: 2026-07-09 (`curb-offset-draw`). Status: **design canon, unbuilt.** Pilot = **Barrio (Toast)** + **Extra Wavy (Lightspeed)**.

---

## 0. The one invariant — POS never touches the money

Everything here rests on a single rule. Break it and the whole non-extraction settlement model inverts.

> **Payment stays on Cary's rails (Stripe). The order is injected into the POS flagged _paid by third party / external tender_. The POS books the sale and prints the ticket, but never runs a card.**

This is the UberEats-into-Toast pattern. Two consequences:

- **The money model is untouched.** Customer → Cary's Stripe collects `subtotal + tax + service charge` → Cary holds funds → **nightly settlement off Cary's ledger** (restaurant gets 100% food + tax; courier gets their split). Payout timing and amounts are **the ledger's job — the POS neither accelerates, gates, nor touches them.**
- **The anti-pattern to never build:** routing payment *through* the restaurant's POS/merchant account (e.g. letting Square be the processor because it's convenient). Then *they* collect, the money lands in *their* bank, and Cary is reduced to invoicing them to claw back the service-charge share — reintroducing the exact collections/trust problem the design killed. **Never.**

### Three-way reconciliation

One identity ties the order across all three systems, so the books agree:

```
Cary order ID  ↔  Stripe PaymentIntent  ↔  POS external-tender record
```

The injected order carries the Cary order ID and an external-tender stamp ("Cary — paid externally"). The restaurant's end-of-day Z-report then shows Cary orders as their own tender line, tagged settled-off-POS, so their bookkeeper can tie that total to Cary's nightly Venmo/ACH — and their food-cost/labor/sales analytics stay whole.

**This bookkeeping-completeness — making the restaurant's own books whole — is the real reason to wire POS at all.** SMS or a cloud printer can *place* the order; only POS injection makes the sale visible in the restaurant's own system. That's the value prop to a restaurant that already runs a POS.

---

## 1. The mechanism — shallow but authenticated

You are **not** taking over their POS or "accepting orders on their behalf." The order is *born in Cary*; you **write it into their POS on Cary's behalf.** Direction: **Cary → their POS.**

Minimum scopes, and nothing more:

1. **Create-order (write)** — push line items into their Orders API.
2. **Mark-paid-external (tender)** — stamp the order "paid, third-party / Cary" so it books but never charges a card.
3. **Merchant OAuth grant** — the restaurant clicks *"authorize Cary"* once; Cary holds a token scoped to **their location**. **That token _is_ the "on behalf of."**
4. *(Optional, read-only)* **Read-catalog** — pull their live menu / prices / 86-status to feed the LS listing. **Not required for injection** — the restaurant manages its own Cary menu (Guardian model), so this is only a *DRY convenience* for a restaurant that doesn't want to maintain a menu in two places.

**Not in scope:** their payments, payroll, reporting, customer data, inventory writes. Cary is a narrow authenticated writer of one object type.

The real friction is **not code depth — it's the gate to get the token in production** (certification; see §3).

### The two data flows

| Flow | Direction | Required? | Purpose |
|---|---|---|---|
| **Order out** | Cary → POS | **Yes** — the whole point | Kitchen ticket + the restaurant's sales record |
| **Menu in** | POS → Cary | Optional (DRY convenience) | Spare a restaurant from maintaining a menu twice — **not** a correctness need (Guardian owns the Cary menu) |

The LS menu is **Guardian-authored** — the restaurant maintains its own Cary menu (`ls/PLACE-CARDS.md`; `listing.menu.sections[]`; `sender-agreement §7`). The **"86 / pause ordering" toggle is load-bearing** — the Guardian's tool to block a ticket for something the kitchen can't make right now. (Menu accuracy is the Guardian's job, not ours; no POS sync needed for it.)

---

## 2. Who we develop for — the ranked target list

**Absolute POS market share ≠ relevance to Cary.** The big-share names are big *because of chains*. Cary serves **independent, owner-operated neighborhood restaurants** — that segment reorders the list hard. Rank by prevalence *among independents*, not overall.

| # | POS | Who runs it | API access | Priority |
|---|---|---|---|---|
| 1 | **Toast** | The default for US independent full-service/QSR — cloud-native, dominant SMB share | **Partner-gated** (apply + certify; weeks–months) | **Head — build.** Pilot. |
| 2 | **Square for Restaurants** | Cafes, bars, coffee, casual, small QSR | **Self-serve**, friendliest API (Orders/Catalog/OAuth) | **Head — build.** Easiest win. |
| 3 | **Clover** | Broad SMB, usually sold through banks (Fiserv) | Self-serve-ish, app-market + REST | **Head — build (2nd wave).** |
| 4 | **Lightspeed Restaurant** (K-/L-Series) | Upscale/wine-forward independents, international | Self-serve-ish, API available | **Head — build.** Pilot. *(confirm Restaurant, not Retail R-Series)* |
| 5 | TouchBistro | iPad, independent full-service | API (varies) | Tail — on demand |
| 6 | SpotOn | Fast-growing independent restaurant POS | Has APIs | Tail — on demand |
| 7 | Revel | iPad, mid-market + small chains | API | Tail — on demand |
| 8 | Heartland / SkyTab | Merchant-services channel (Global Payments) | API | Tail — on demand |
| — | **Aloha (NCR), Micros/Simphony (Oracle), PAR/Brink, Qu** | **Chains / enterprise / hotels** | Heavy/enterprise | **Skip** — not our segment |

**The "head" is the top 4: Toast, Square, Clover, Lightspeed** — the large majority of independents you'll ever onboard. Everything below is a tail you build only when a specific restaurant needs it.

---

## 3. Doctrine — direct for the head, aggregator for the tail

"More plumbing is better" is *half* right: pre-built plumbing makes each new restaurant onboard frictionless — you never want to tell a spot "we don't support your POS." **But unused pipes aren't free** — every integration is ongoing maintenance (APIs drift, certs renew), so speculative plumbing you're not running is a *liability*, not an asset.

The resolving architecture:

> **Build direct for the head; rent a unified API for the tail; build just-ahead-of-demand.**
>
> - **Direct** (no fee, on-doctrine) for the top 4 — where you'll have the volume to justify it.
> - **Unified API in your pocket** (Rutter / Omnivore) as the escape hatch for the long tail — the one-off restaurant on SpotOn or TouchBistro where per-location volume will never justify a direct build. Eat the per-location fee **only there, only** when it's the difference between onboarding a restaurant and turning them away.

### Why not middleware for everything

There **is** no free/universal POS SDK — every POS is a proprietary, non-standardized API. The commercial "universal layers" are:

- **Unified API vendors** ("Plaid for POS") — **Rutter**, **Omnivore**. One normalized API; build once.
- **Order-injection middleware** — **Deliverect, Chowly, Otter, ItsaCheckmate**. One integration, order + menu fan-out.

Both are **recurring per-location fees**, and the margin math kills them at pilot scale:

> Platform take = **5.5% of food subtotal**. A restaurant doing ~$2,000/mo in Cary orders → your cut ≈ **$110**. Middleware ≈ **$100/location/mo**. The fee eats nearly the entire margin — *and* it's a live extractor skimming a system whose whole identity is not skimming. **Middleware only pencils at volume you don't have yet.**

---

## 4. Build policy — the full head now (the "covered for a minute" bet)

Revised 2026-07-09 (Jacob): don't strictly build-on-onboard — **build all four head POS up front (Toast · Square · Clover · Lightspeed) and bet the head-4 covers whatever restaurant signs next.** The reasoning holds because the cost is lopsided:

- **Square + Clover are self-serve** (OAuth, no gate) → cheap to pre-build → building them ahead of demand is low-cost *insurance* that the next restaurant to sign is already covered. This is the good version of "more plumbing is better" — the pipes are nearly free.
- **Toast is the only expensive one** (partner-gated cert — see below) and **Lightspeed** is the other pilot — both are being built for a real committed restaurant anyway.

**The bet, named honestly:** the head-4 covers the independents we onboard in the near term. It *will* eventually miss (a spot on SpotOn/TouchBistro) — and when it does, the **unified-API escape hatch** (Rutter/Omnivore, §3) covers that one tail restaurant without a direct build. "Fingers crossed we're covered for a minute" = we're covered until the head-4 bet misses, and the tail hatch catches it when it does.

1. Build the **full head** — Toast, Square, Clover, Lightspeed.
2. **Start Toast's partner application _now_** — it's the long pole (a quarter-ish, gated — see §4.1), and it's a *process* clock that runs independent of code.
3. Confirm **which Lightspeed** Extra Wavy runs — Restaurant (K-/L-Series) vs Retail (R-Series) are different APIs.
4. Reach for the **unified-API escape hatch** only for a tail POS the head-4 bet missed.

### 4.1 Toast certification path (the long pole)

Toast is **partner-gated**: you can't just pull an API key, you run an 8-stage partner process, and **Toast publishes no SLA** and explicitly warns of response delays from high application volume. Plan for **a quarter, not a sprint** — and it's a *process* clock (legal review, scheduling, beta soak), so start it in parallel with everything else *today*.

| # | Stage | What we do | Gate |
|---|---|---|---|
| 1 | **Application** | Agree to the API Documentation License Agreement; submit the integration-partner application | Toast vets for fit; **response delay is the first unknown** |
| 2 | **Discovery** | Discovery call; assessed for technical + business readiness | Needs **compliance / privacy / security / legal approval** + assigned Toast rep |
| 3 | **Partner Agreement** | Negotiate + sign business terms *(regional expansion later needs agreement updates — relevant to Altadena/town #3)* | Signed before any dev |
| 4 | **Development Kickoff** | Receive **sandbox credentials**; build against the sandbox to the integration checklist | — |
| 5 | **Certification** | **1-hour interactive demo review** — how we hit each endpoint, poll history, post orders, pull reports; fix any flagged issues | Pass → **production credentials** issued |
| 6 | **Alpha** | Enable for a **single restaurant** (→ **Barrio**), ~1 week of real usage; Toast reviews logs | — |
| 7 | **Beta** | **3–5 locations / management groups**, several weeks in production + co-marketing | ⚠️ **snag: we may not have 3–5 Toast restaurants at pilot** — raise with the Toast rep (single-group beta? count Barrio's own management group?) |
| 8 | **General Availability** | Listed publicly + on "My Integrations" | — |

**Order-injection scopes** (request these): `orders.orders:write` · `orders.items:write` · `orders.payments:write` (this is where the *third-party payment* is recorded — **there is no separate "external payment" scope**, the paid-external stamp rides the standard payments scope) · plus the ordering-partner scopes `orders.channel:read` + `menus.channel:read`.

**One thing to flag to the Toast rep early:** that we record payment as **third-party/external** (money is on Cary's Stripe) so the integration is order-injection, not a payment integration. *(The old beta-3–5-location worry is resolved by sequencing — see §4.2 — since Toast being the #1 POS makes 3–5 Toast pilot commitments findable; it's a recruiting task, not a blocker.)*

### 4.2 Sequencing — Human Auditor deep-pass FIRST, then engage Toast

Decision (2026-07-09, Jacob): **do a Human Auditor deep-pass — a thorough human security + legal review — for insurance _before_ opening the Toast partner process.** Not a code gate; a de-risking gate.

**Why this order is correct, not just cautious:** Toast's **Discovery stage (§4.1 #2) is itself gated on Toast's compliance / privacy / security / legal review.** Auditing ourselves first means we arrive at Discovery **already pre-cleared** on the exact axis Toast tests — instead of scrambling to answer their compliance questions cold. The audit does double duty: it makes us insurable/de-risked *and* clears Toast's own gate.

**The deep-pass covers the two already-open workstreams:**
- **Security:** `HANDOFF-security-audit.md` + `SECURITY.md` — apply migration `009_security_advisor_fixes.sql` (F-1/F-7/F-8), then the deeper items (service-role fns w/ no caller auth, webhook signature verification, `requests` RLS `USING(true)`).
- **Legal:** `cary/legal/legal-readiness-brief.md §A` — the two lawyer items: (1) **DOR marketplace-facilitator letter ruling** (who remits on the zero-commission model), (2) **alcohol transporter-permit / local STL ordinance** check.

**The clock is a feature, not a cost.** The Toast path is ~a quarter regardless, so fronting it with the audit costs ~nothing on the critical path — and the audit + wait window is the runway to **build the business** (recruit the 3–5 Toast pilot commitments the beta needs, land the lawyer sign-offs, harden security).

**Sequence:** Human Auditor deep-pass (security ✅ + legal ✅) → *then* Toast Application (§4.1 #1) → the rest of the gated path. Square/Clover/Lightspeed direct builds can proceed in parallel (self-serve, no compliance gate).

### Per-POS build ledger

| POS | Restaurant(s) | Auth path | Status |
|---|---|---|---|
| Toast | **Barrio** (tightest partner commitment → the beachhead) | Partner API — certification required | ⬜ not started — **start cert application** |
| Lightspeed | **Extra Wavy** (the "sexiest" business → the showcase) | OAuth, self-serve-ish | ⬜ not started — confirm series |
| Square | *(none yet — coverage insurance)* | OAuth, self-serve | ⬜ **build ahead** — cheap, self-serve |
| Clover | *(none yet — coverage insurance)* | OAuth, app-market | ⬜ **build ahead** — cheap, self-serve |

*Pilot read: **Barrio is the commitment** (deepest partner → prove the gated Toast path end-to-end there first), **Extra Wavy is the showcase** (most photogenic business → the one whose live integration you demo). Toast's certification clock is the long pole, so Barrio/Toast gates the timeline even though Lightspeed/Extra Wavy is technically easier. **Square + Clover are built ahead of demand** — self-serve enough that pre-building them is cheap coverage insurance, not speculative waste.*

*(Per-integration notes land in sibling files as each is built: `cary/pos/toast.md`, `cary/pos/lightspeed.md` — auth, order payload, external-tender call, cert status.)*

---

## 5. The pitch language (reconciles "no tech changes")

POS injection needs the restaurant to click *"authorize Cary"* once — the OAuth grant. That's not an install, but it's not literally nothing, so the old *"no tech changes on their end"* line softens to:

> **"Nothing to install, nothing to learn — one click to connect, then orders just appear on your line like any other ticket."**

Use this everywhere the restaurant pitch appears (`CARY-BRIEF.md §4`, onboarding copy, sender-agreement framing).

---

## 6. Open items / next

- ⬜ **Toast partner/certification application** — the long pole; start now.
- ⬜ Confirm the pilot Lightspeed **series** (Restaurant K-/L vs Retail R).
- ⬜ Pull current Toast + Lightspeed order-injection + external-tender API docs; write `toast.md` / `lightspeed.md`.
- ⬜ Define the injected-order **payload schema** (line items, modifiers, Cary order ID, external tender) so the three-way reconciliation is airtight.
- ⬜ Wire the requester **order submit** — the *order-capture* surface is **already built client-side** (`ls/CARY.md §6` — `MenuTab`: cart + full priced order + kitchen note, legal-canon-accurate, instance-parameterized tax). What's missing is everything past "Place order": **persist → Stripe food-PaymentIntent → `requests`/`sessions` row → dispatch → inject** — the full design is **[`../ORDER-PIPELINE.md`](../ORDER-PIPELINE.md)** (injection is step 8 there). The canonical `CaryOrder` object is ~defined by the UI already (this file's sibling `cary-order.md`).
- ⬜ **"86 / pause ordering" toggle** — the Guardian's tool to block a ticket the kitchen can't fill (menu accuracy is the restaurant's job; no POS menu-sync needed).
- ⬜ Settlement **ledger** keyed to the Stripe PaymentIntent (`CARY-BRIEF.md §"What's next" #3`).

## Cross-refs

- [`../../ls/CARY.md`](../../ls/CARY.md) — app-integration surfaces (the `CaryButton` order path terminates here today).
- [`../../CARY-BRIEF.md`](../../CARY-BRIEF.md) — program, pricing, settlement, next steps.
- [`../legal/sender-agreement.md`](../legal/sender-agreement.md) §5–§9 — payment agency, order preparation, alcohol checkout rules.
- [`../REFLECTIONS-2026-06-20.md`](../REFLECTIONS-2026-06-20.md) — the non-extraction doctrine that makes the "no middleware" call.
