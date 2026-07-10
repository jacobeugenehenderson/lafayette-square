# Cary — the order submit pipeline (the missing middle)

**From "Place order" to delivered.** The order-*capture* surface is built client-side (`ls/CARY.md §6`, `MenuTab`); the settlement side is a downstream ledger (`CARY-BRIEF.md §"What's next" #3`). This doc is the **middle neither covers**: what has to happen the instant a customer taps *Place order* — persist, pay, inject the kitchen ticket, dispatch a courier — and the state machine that ties it together.

Drafted 2026-07-09 (`curb-offset-draw`). Status: **design canon, unbuilt.** This is the build brief for `CARY-BRIEF.md §"What's next" #2` ("Build the delivery request flow").

---

## 0. The gate — who can order

**Townie+ (in-network, presence-verified).** A townie has checked in on 3 distinct days in a rolling 14-day window *in the neighborhood* (`ls/TOWNIES.md`) — real physical presence, not "any weirdo from Utah." That presence **is** the "people in the hood" filter.

- **Residents** (`ls/RESIDENTS.md`) and **Guardians** (`ls/GUARDIANS.md`) are building-linked → they get a **Home** default destination (residence / guarded place). Both are townies automatically.
- A plain **townie without a building link** can still order — they just have no Home shortcut and pick **Here** or **Somewhere-else** each time (§4).

Gate enforced server-side (same posture as `isTownie` for participation, `TOWNIES.md §54`).

---

## 1. The spine

```
[client: MenuTab "Place order"]  →  POST { restaurant, line_refs+qtys, note, destination_choice }
      │                               (client sends INTENT, never trusted totals)
      ▼
┌─ edge fn: place-order  (server holds ALL authority) ─────────────────────┐
│  1. gate ✓          requester is townie+ (server-checked)                 │
│  2. re-price        recompute money from the AUTHORITATIVE menu           │
│  3. capacity gate   a courier is available NOW  ── else stop, DON'T charge │
│  4. destination ✓   resolve to a deliverable building INSIDE the boundary  │
│  5. persist PENDING orders + order_line_items + requests(type=delivery)    │
│                     → order.state = 'pending_payment'                      │
│  6. PaymentIntent   Cary's Stripe, amount = total_cents,                   │
│                     metadata.cary_order_id                                 │
└───────────────────────────────────────────────────────────────────────────┘
      ▼
[Stripe webhook: payment_intent.succeeded]   ← the source of truth
      │  (handlePaymentEvent, extended to key on metadata.cary_order_id)
      ▼
┌─ on PAID ────────────────────────────────────────────────────────────────┐
│  7. state → 'paid'                                                         │
│  8. INJECT ticket   cary/pos adapter → POS (paid-external)                 │
│                     └ no POS connection → SMS / printer relay              │
│  9. DISPATCH        call existing dispatch fn → standing-by courier        │
│                     accepts → sessions row (delivery-shaped money)         │
└───────────────────────────────────────────────────────────────────────────┘
      ▼
[confirm + track]   requester confirmation; courier dots track; SMS updates
      ▼
[nightly]           settlement ledger (CARY-BRIEF #3) — NOT synchronous here
```

---

## 2. The state machine

```
pending_payment ──payment_intent.succeeded──▶ paid ──▶ injected|relayed ──▶ dispatched ──▶ delivered
      │                                                                          │
      ├─payment_intent.payment_failed──▶ payment_failed (no ticket, no orphan)   │
      └─capacity lost pre-charge────────▶ blocked (never charged)                │
                                                          restaurant reject ─────┴──▶ refunded
                                                          courier no-show ───────────▶ reassign | refunded
```

**Stripe is the source of truth.** The webhook (`handlePaymentEvent`, `cary/stripe/webhooks.js:119` — today keyed on `metadata.session_id` for rides) grows an **order-keyed branch** (`metadata.cary_order_id`). Injection + dispatch fire *from the webhook*, not from the client, so a dropped client never leaves a paid-but-unfired order.

---

## 3. Load-bearing decisions (settled 2026-07-09)

1. **Server-side authority.** The client sends `{ line_refs, qtys, note, destination_choice }` only. `place-order` **re-prices from the authoritative menu** and holds the POS tokens. Client totals are display-only — never the charge basis (anti-tamper). The `MenuTab` math (`ls/CARY.md §6`) moves server-side as the authority.

2. **Persist-then-pay, webhook-confirmed.** Persist `pending_payment` *first* (a recoverable orphan) → PaymentIntent → webhook flips to `paid` → *then* inject + dispatch. Charge-fails ⇒ no kitchen ticket, no orphan. **Idempotent on `cary_order_id`** (webhook retries never double-inject / double-dispatch).

3. **Capacity-first is a PRE-payment gate.** Re-check courier availability at step 3, *before* the PaymentIntent. Never charge and then discover nobody can deliver. (The capacity-first invariant — `REFLECTIONS §4` — enforced at the one moment it bites.)

4. **Delivery ≠ metered.** A delivery's courier comp is the order's fixed **22% service charge** (courier 75 / platform 25), *not* the ride meter. `cary/lib/meter.js` stays ride-only. A delivery `sessions` row carries **order-derived** money (`courier_payout = 75% of service_charge`), not distance/duration fare. The two payment shapes (fixed-order-delivery vs metered-ride) stay cleanly separate.

5. **Inject on payment-success.** Fire the POS ticket the moment payment succeeds — capacity-first means a courier is already standing by, so the kitchen starts fastest. (Accepted trade: the rare standing-by-courier-flakes case, cheap to absorb at this geography/min-order.)

---

## 4. The destination model

> **The governing rule: we only deliver inside the neighborhood.** Every destination must resolve to a building **within the neighborhood boundary** (the delivery zone = the boundary itself — `project_neighborhood_disc`; LS = the Chouteau→I-44, Jefferson→Truman box, `sender-agreement §4`; per-instance for other installations). No exceptions, all three modes.

Three modes; **Home is the default** for building-linked identities. The picker is two taps + an escape hatch — because we know both **where you live** (residence/guarded place) and **where you are** (`useUserLocation` live GPS, `Scene.jsx:437`).

| Mode | Resolves to | For | In-boundary? |
|---|---|---|---|
| **Home** *(default, building-linked only)* | your residence / guarded place (the place card on your handle) | the common case — zero entry | ✅ always (a hood building by construction) |
| **Here** | your **live dot, snapped to the nearest building/landmark and confirmed** ("Deliver to you at Lafayette Park?") | you're out *in the neighborhood* | ⚠️ **only if the live dot is inside the boundary** — outside the hood, Here is unavailable |
| **Somewhere else** | a building you tap/search on the map | sending to a friend / a specific address | must be an **in-boundary** building |

**The invariant:** the destination handed to the courier *and* the POS ticket is always a **resolved in-boundary building/address**, never raw coordinates — the live dot **resolves to a named neighborhood place before it becomes a destination**, so couriers deliver to doors, not to a moving dot. A live dot *outside* the boundary simply disables **Here** (you can't get a delivery where you aren't in the hood).

**Consent:** using the live dot as a destination requires the resident's **active consent to share real location** for that order — distinct from the privacy-snapped *courier* dots (`ls/CARY.md §3`). (Raw "meet my moving dot at the park bench" is a v2 charm; v1 resolves to a place.)

---

## 5. Money flow (recap — the invariant lives in cary/pos)

Customer → **Cary's Stripe** collects `total_cents` (`subtotal + tax + service_charge + processing`). The order's money then splits three ways at settlement (nightly, off this pipeline):

- **Restaurant** ← `subtotal + tax` (100% of food + tax) — *and this is the only amount the POS ticket sees, as the paid-external tender* (`cary/pos/README.md §0`; injecting the service charge would pollute their books).
- **Courier** ← 75% of `service_charge` + any tip.
- **Platform** ← 25% of `service_charge`. Processing covers Stripe.

---

## 6. Reuse vs. new

**Reuse:** `dispatch` fn (call after `paid`) · `sessions` (accept → session, delivery-shaped money) · `handlePaymentEvent` webhook (extend to order-keyed) · `cary/pos/` adapters (inject) · `sms-*` fns (relay fallback + status) · `payment_methods` (card on file) · `useCary` store (client lifecycle).

**New:**
- Tables: `orders` (+ state, money, destination, `food_payment_intent_id`, `pos_order_id`) · `order_line_items` (or line items as jsonb on `orders`) · `pos_connections` (per-restaurant OAuth tokens, §`cary/pos`).
- `requests` gains: `order_id`, `destination` (resolved building + address), `order_total_cents`.
- Edge functions: **`place-order`** (the orchestrator, steps 1–6) · **`inject-order`** (step 8 — POS adapter or relay, idempotent).
- The shared **`CaryOrder`** type (`cary/pos/cary-order.md`) imported by both producer (`MenuTab`) and consumers (edge fns).

---

## 7. Failure & refund paths (`sender-agreement §10`)

- **Destination out of boundary** → rejected at step 4, before charging (we only deliver in the neighborhood, §4).
- **Payment fails** → `payment_failed`; nothing fired.
- **Capacity lost pre-charge** → `blocked`; never charged.
- **No POS connection** → not a failure; fall back to **SMS/printer relay**, order proceeds.
- **POS injection errors** → fall back to relay, don't fail the order; log for reconciliation.
- **Restaurant rejects** (closed / can't make it) → refund (Platform discretion, §10).
- **Courier no-show** → reassign from the pool, or refund.

---

## 8. Open items / next

- ⬜ `orders` / `order_line_items` / `pos_connections` migration + the `requests` additions.
- ⬜ `place-order` edge function (gate · re-price · capacity gate · persist · PaymentIntent).
- ⬜ Extend `handlePaymentEvent` with the order-keyed branch → inject + dispatch on `paid`.
- ⬜ `inject-order` edge function (idempotent; POS adapter or relay).
- ⬜ Destination picker UI in `MenuTab` (Home / Here / Somewhere-else) + live-dot resolve-to-place + consent.
- ⬜ Wire "Place order" → `place-order` (retire the "coming soon" stub, `ls/CARY.md §6`).
- ⬜ Remove the `isAdmin` CTA gate when going live (`PlaceCard.jsx ~L2982`).
- ⬜ Delivery-shaped `sessions` money (order-derived payout, not meter).

## Cross-refs
- [`../ls/CARY.md §6`](../ls/CARY.md) — the built order-capture surface (`MenuTab`) this pipeline consumes.
- [`pos/README.md`](pos/README.md) · [`pos/cary-order.md`](pos/cary-order.md) — POS injection (step 8) + the `CaryOrder` contract.
- [`../CARY-BRIEF.md`](../CARY-BRIEF.md) — program roadmap (#2 = this; #3 = settlement).
- [`legal/sender-agreement.md`](legal/sender-agreement.md) — §5–§10 (payment agency, order prep, refunds).
- [`REFLECTIONS-2026-06-20.md`](REFLECTIONS-2026-06-20.md) §4 — capacity-first / non-extraction doctrine.
