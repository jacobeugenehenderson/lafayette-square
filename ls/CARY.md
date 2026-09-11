# LS — Cary, the courier system (app integration)

How the **Cary** neighborhood courier system surfaces *inside the LS app*. This is the consumer-app integration view only — the program, pricing, legal, onboarding pipeline, and database schema live in their own home and are **not duplicated here**:

> **Cary's canonical docs** (defer to these for the program/legal/schema side):
> - [`../_handoffs/CARY-BRIEF.md`](../_handoffs/CARY-BRIEF.md) — project brief, architecture, pricing, status, next steps
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

Cary is **separate from the GAS backend**. Tables (canonical schema in `cary/supabase/migrations/`): `profiles`, `courier_profiles`, `verification_checks`, `requests`, `sessions`, `courier_locations`, `safety_reports`, `onboarding_steps`, and — from `018` — `commerce_places`, `commerce_items`, `commerce_item_events`.

⭐ **`018` is the first place the two backends touch.** It is keyed on the GAS `listing_id` and on the menu item's stable `item_id`; ⛔ neither is a foreign key, because Postgres cannot see a spreadsheet. That fails the safe way — the join runs from the menu inward, so a row naming an item that has left the menu is simply never read. A price cannot haunt a menu it has fallen off of. **Realtime** channels publish `requests`, `sessions`, `courier_locations`. **Edge functions**: `onboarding` (verification orchestration — Stripe Identity, Checkr), `credential-check`, `complete-session` (fare settlement), `dispatch` (matching), the `sms-*` / `web-messages` handlers. **Auth**: Supabase phone OTP via Twilio.

---

## 3. In-app surfaces

| Surface | File:line | What it does | Status |
|---|---|---|---|
| **Courier dots (3D map)** | `src/components/CourierDots.jsx` | Realtime subscriber to `courier_locations`; delivering vs idle colour; stale after 5 min. ⛔ **No client-side privacy snap, and none is wanted** — migration `011` (F-10, closed 2026-08-24) scopes the table to the courier themselves and the requester on a *live* session with them, so no other position is ever received. The old "idle couriers snap to the park centre" line described a pre-011 mitigation the render never actually performed; the constants were dead and are excised. ⭐ 011 is also what makes delivering-vs-idle decidable client-side: a row that is not yours belongs, by the policy's definition, to a courier mid-delivery for you | ✅ live |
| **Masthead "Couriers" count** | `src/components/SidePanel.jsx:662` | The four-stat widget reads `useCommunityStats` | ⏳ stub (store inits `couriers: 0`, never populated) |
| **Delivery CTA on cards** | `src/components/PlaceCard.jsx:2011` (`CaryButton`) | "Deliver from …" / "Pick me up here" | ⏳ "coming soon" overlay — no request form wired |
| **Menu ordering surface** | `src/components/PlaceCard.jsx:2837` (`MenuTab`) | Full **cart + priced order** (subtotal · tax · 22% service charge · processing · total; $40 min; kitchen note) — see §6 | ⏳ **capture built, submit stubbed** — "Place order" dead-ends at a "coming soon" card (admin-gated CTA) |
| **Courier auth** | `src/components/CaryAuth.jsx` | phone → OTP → profile | ✅ live |
| **Courier onboarding** | `src/components/CourierOnboarding.jsx` | 7-step wizard (Deliver tier: account → identity → agreement; Drive tier adds license → background → insurance → vehicle) | ✅ live (`/cary/deliver`, `/cary/drive`) |
| **Courier dashboard** | `src/components/CourierDashboard.jsx` | online/offline + GPS, request cards, live meter (time/distance/fare), safety reports; always mounted, opens on `useCourierDash.open` | ✅ live |
| **Safety report** | `src/components/SafetyReport.jsx` | mid-trip incident report (from dashboard "End Service") | ✅ live |
| **Central store** | `src/hooks/useCary.js` | auth, profile, active request/session, realtime subs, lifecycle (sendOtp, acceptRequest, startMeter, updateLocation…); auto-init on load | ✅ live |
| **Routes** | `src/App.jsx:953–957` | `/cary/deliver` · `/cary/drive` · `/cary/apply` → fullscreen; `/terms/courier` → `LegalPage` | ✅ live |
| **Supabase client** | `src/lib/supabase.js` | real client or safe-stub | ✅ live |

---

## 4. Ship state

- ✅ **Live:** courier onboarding (both tiers), the courier dashboard (GPS, request accept, meter, safety), live courier dots, phone-OTP auth.
- ⏳ **Placeholder:** the **requester** delivery CTA (`CaryButton` shows "coming soon"); the masthead courier count (stub store).
- 🟨 **Built, NOT DEPLOYED** (2026-09-10): the **commercial half of a menu** — stable item ids, the price of record, availability/86, the guardian write path. ⚠️ Four operator steps outstanding (`OPERATIONS.md §5`); until they run, **no price of record exists anywhere** and nothing is orderable — which is the correct default, not a fault.
- 🟨 **Built but not wired (client-only):** the **menu ordering surface** (§6) — cart, the price stack, the $40 minimum, the kitchen note. "Place order" is still a stub.
- ❌ **Unbuilt:** the **order submit and everything after it** — no `place-order`, no persistence, no Stripe food-PaymentIntent, no `requests`/`sessions` row, no dispatch, no POS injection. Also: settlement ledger / payouts, restaurant onboarding, ride-request creation + matching. ⭐ The **`CaryOrder` contract** these will fill exists and is checked (`_shared/caryOrder.js`).

The **delivery hookup from place cards** (`PLACE-CARDS.md` §3: a menu order needs the `delivery` tag + a live courier + an in-window menu) captures a full priced cart in `MenuTab` today, then terminates at a "coming soon" card — the **submit → persist → pay → dispatch → inject** path is the unbuilt requester side above.

---

## 5. Known gaps / next (app side)

> ⛔ **The next move is DEPLOYMENT, not code** — `OPERATIONS.md §5`'s four steps. Everything built on 2026-09-10 is unverified against a running system.

Requester request-creation UI (the place-card → pickup/destination form) · wire the masthead count to Supabase · settlement ledger · restaurant onboarding. **Still-open UX, and no track owns it:** modifier *selection* (the card displays priced modifiers the cart cannot order — §6), the destination picker (`ORDER-PIPELINE §4`), and retiring the `isAdmin` CTA gate. The program-level roadmap is `_handoffs/CARY-BRIEF.md §"What's next"`.

**Order → kitchen.** The requester flow ends at a *checkout*; how that order then reaches the restaurant's line is the **POS-injection canon** — `../cary/pos/README.md`. Key invariant: payment stays on Cary's Stripe, the order is injected into the POS as *paid-external* (POS never touches the money). Pilot POS = Toast + Lightspeed; head-direct / tail-aggregator.

## 6. The ordering surface (order capture — built client-side)

Formalized 2026-07-09 from the code (`PlaceCard.jsx` `MenuTab`, ~L2837–3256). ⭐ **Anchors below are SYMBOL names, not line numbers** — the numbers drifted within a month of being written and were quoted wrong twice; a symbol is greppable forever. This is the requester **order-capture** flow — real and complete client-side; only the *submit* is stubbed. It is also the de-facto source of the **canonical order shape** that `../cary/pos/README.md` (POS injection) consumes.

**Gates (all must hold to reach the order UI):**
- `hasDelivery` — the place carries the `delivery` tag.
- `courierAvailable` — `useCourierAvailable` (`CourierDots`) → `canOrder`: capacity-first, orders only when a courier is standing by.
- **In-schedule now** — the menu type's `schedule[menuKey][day]` window contains the current time (`orderableMenus`); the cart only counts items from currently-orderable menus.
- **CTA is admin-gated** — non-admins see "Cary delivery — coming soon". *Code comment:* "To go live for everyone: remove the isAdmin gate." ⇒ **nothing in §6 is reachable by a customer in production yet**, which is why none of it appears in `FEATURES.md`.

**Cart:** `cart` = `{ [lineKey]: qty }` — **keyed on item IDENTITY, never position** (`src/lib/menuIdentity.js`). Per-item ± controls, section cart counts.

⭐ **Until 2026-09-10 this keyed on `"sectionIdx-itemIdx"`, which names a POSITION.** A guardian reordering a section, or inserting one above it, re-pointed every line behind the edit — so a live cart silently became a cart for different food, and the total still looked plausible. Every item now carries a stable `id`:

| | | |
|---|---|---|
| `d_…` | **derived** | computed from menu type + section name + item name. All three menu homes (bundled payload · GAS `menu_json` · soon Cary) independently compute the **same** id for the same item, so the `useListings` merge can swap one home for another without dangling a cart line or a Cary row. |
| `i_…` | **minted** | a genuinely new item authored in the editor. Random, permanent. |

The prefix is provenance: it reads at a glance which items have been through the editor and which still ride their derived bridge id. Ids are filled at ingest (`normalizeListingMenu`, `useListings.js`) and minted at every item-creation site in the editor. ⚠️ **Derivation is a bootstrap, not an ongoing rule** — once an item has an id it keeps it, so identity survives a rename.

⛔ **A cart line whose item has left the menu is NOT silently dropped from the total** — `strandedCount` counts it and the order summary says so. A checkout total that quietly shrinks is the worst shape this surface could have.

### The price of record — what may actually be charged *(2026-09-10, migration 018)*

⛔⛔ **A SEEDED PRICE IS NOT A PRICE.** `item.price` — the number on the bundled editorial menu or on the guardian's authored copy — is a **display figure**. It may be shown; it may never be charged. The only chargeable number is `price_cents` on a **confirmed** `commerce_items` row.

This is what "one owner per field" means in practice, and it is why the three menu homes are not a SSoT problem: **content** (section · name · description · tags · menu type · schedule) is poured from the bundle and overridden by the guardian, exactly as before; **commercial state** (price of record · availability · confirmation) lives once, in Cary, with no seed and no merge. There is no price in two places — there is one price and one display figure, and they are different kinds of thing.

⭐ The consequence worth having: it is **structurally impossible to charge a price nobody confirmed.** Not "we are careful not to" — `resolveCart` has no display figure to reach for, and the schema's `commerce_items_confirmed_has_price` forbids the half-state where it would matter.

`itemOrderability` (`src/lib/commerce.js`) is the one predicate, and it names **why** rather than just refusing — "we're out of that" and "nobody has priced this" are different sentences to a customer and different jobs for a guardian:

| Blocked by | Means |
|---|---|
| `no_commerce` | commercial state has not loaded — unconfigured, still loading, or it failed. ⛔ Never permissive. |
| `paused` | `commerce_places.ordering_paused` — the restaurant stopped taking orders |
| `unconfirmed` | no price of record. **The default state of every item.** |
| `eighty_sixed` | `commerce_items.available = false` — the kitchen is out |
| `out_of_window` | the menu type isn't served at this hour (the pills already say so, so it is quiet) |
| `stranded` | in a cart, but no longer on the menu |

⚠️ **Wiring this made the whole surface unsellable until items are confirmed** — correctly, and with no customer impact, since the CTA is still admin-gated. An admin sees a banner naming which of the three no-commerce states applies rather than a menu of quietly un-addable items.

▶ `node scratch/claims-price-of-record.mjs` — 73 commercial states; asserts none charges a display figure and none sells unconfirmed, 86'd, paused, out-of-window or unloaded. ⭐ Mutation-tested: a "fall back to `item.price`" fails 72 of 73; dropping the load gate or the confirmation requirement each fail exactly 2 — the narrow states a human would not think to try.

### The write path — who may set a price *(2026-09-10)*

`commerce_items` and `commerce_places` have **no write policy at all**, so there is no direct client write and there must not be one. Everything goes through the **`commerce-write`** edge function:

```
PricingPanel  →  commerceApi  →  commerce-write (edge fn)  →  GAS ?action=guardian-check  →  yes/no
                                          └─ only on yes ─→  service-role write + audit append
```

⭐ **As strong as the existing guardian write path, and no stronger — by construction.** It asks the same authority the same question `Code.js` already asks before mutating a listing. ⛔ The client's `lsq_guardian_listings` is a **localStorage cache**: it decides what UI to show and is trusted by neither side.

- **`guardian-check`** (new GAS action) is **shared-secret gated and fails closed when the secret is unset** — it answers about a third party rather than its caller, so open it would let anyone probe which listings a device hash controls. It reuses `staffHasPermission`, so a guardian who paired a desktop (`DEVICE-LINK`) is correctly the same person.
- **`mayEditMenu` denies on every failure path** — unreachable, non-200, bad JSON, missing secrets. ⛔ "Could not reach the authority, so allowed" is the one outcome that must never exist.
- **Bulk by design.** Confirming a poured menu one item at a time is the difference between a sitting at the bar and an afternoon — `op: 'items'` takes up to 500.
- **⛔ No sanity ceiling on a price.** A $900 item is a whole pig or a rare bottle; refusing it would be calling the operator's authoring a defect. **The human confirmation IS the sanity check** — that is what the operation is for.
- **The audit is appended after the write and its failure does not fail the call** — the change already happened, and reporting failure would lie in the other direction. It logs loudly instead.

The **Delivery prices** panel (`PricingPanel`, guardian-only) is the surface: every item with its menu price pre-filled, per-item 86, pause-all, and an *"N of M confirmed"* header. The pre-fill is deliberate — a gate people dread is a gate people route around.

▶ `node scratch/claims-commerce-write-gate.mjs` — 17 source-level properties asserting no write path skips GAS. Mutation-tested four ways, each killed by name.

▶ `node scratch/claims-menu-item-ids.mjs` — proves every item across every live payload is addressable, unique, and **stable under reorder** (819/819 on LS). It caught a real collision on its first run: `lmk-008` carries two sections named "Mocktails" (one `brunch`, one `drinks`) holding the same three drinks, so the identity basis needs the menu **type** as well as the section name.

**The price stack** (all integer cents — this is the money model, and it matches the legal canon exactly):

| Field | Formula | Source |
|---|---|---|
| `MIN_ORDER` | `4000` ($40) | `MIN_ORDER` |
| `cartTotal` (subtotal) | Σ `item.price × qty` over resolved, in-window cart lines | `cartLines` |
| `salesTax` | `round(cartTotal × INSTANCE.commerce.salesTaxRate)` — **food only, not delivery** | `salesTax` |
| `caryFee` (service charge) | `round(cartTotal × 0.22)` — 22%, courier 75% / platform 25% | `caryFee` |
| `processingFee` | `round((cartTotal + salesTax + caryFee) × 0.029) + 30` — Stripe 2.9% + $0.30 | `processingFee` |
| `orderTotal` | `cartTotal + salesTax + caryFee + processingFee` | `orderTotal` |
| `belowMinimum` | `cartTotal > 0 && cartTotal < MIN_ORDER` (blocks submit) | `belowMinimum` |

`salesTaxRate` is **per-installation** via `INSTANCE.commerce.salesTaxRate` (LS `0.08725`; HiPointe `0.09238` placeholder) — already instance-parameterized, not hardwired.

**Kitchen note:** free text ≤500 chars, "goes directly to the kitchen" (allergies/substitutions) — the current special-requests / modifiers channel (`orderNote`).

⛔ **And it is doing a job it cannot do. The card DISPLAYS priced modifiers the cart cannot order** — `MenuItem` renders `item.modifiers` with their price deltas (`MenuItemRow`) off real authored data (`src/data/lafayette-square/menus.json:63` and 9 more), while `setQty` has no way to name a *chosen* modifier (the cart key admits them — `lineKey(itemId, modifierIds)` — but nothing selects them yet). So a customer reads "12 pc +$42.00" and has no way to choose it; the intent has to be retyped into the note, un-priced, and the total is wrong by the delta. This is a **live defect today**, not a v2 seam — ⭐ shipping v1 with note-only modifiers ships a menu that advertises options it won't sell.

**The gap (everything past "Place order"):** the button sets `orderPlaced = true` → a terminal **"Coming soon — Cary delivery is launching this spring"** card. **No persistence, no Stripe PaymentIntent, no `requests`/`sessions` row, no dispatch, no POS injection.** Nothing leaves the browser. → the design for closing this gap is **[`../cary/ORDER-PIPELINE.md`](../cary/ORDER-PIPELINE.md)** (the submit pipeline).

**The implied `CaryOrder` shape** (the client already computes every field except the IDs): `{ restaurant place_id/name/lat/lon (from listing) · line_items[]{ section, name, unit_price_cents, qty } · order_note · subtotal/tax/serviceCharge/processing/total (cents) · in-schedule window }`. **Missing for POS injection:** structured **modifiers** (today only the free note), a **Cary order ID**, and the **food PaymentIntent id**. ✅ **Stable line identity landed 2026-09-10** — `line_items[].ref` is the item `id`, not a position. This is the schema to formalize when the submit path is built (`_handoffs/CARY-BRIEF.md §"What's next" #2`; POS side in `../cary/pos/README.md`).

## Source map
| Thing | File | Notes |
|---|---|---|
| Store + lifecycle | `src/hooks/useCary.js` | auth state listener; auto-init |
| Map dots | `src/components/CourierDots.jsx` | `courier_locations` realtime |
| Delivery CTA | `src/components/PlaceCard.jsx:2003–2031` | `CaryButton` (placeholder) |
| Menu ordering surface | `src/components/PlaceCard.jsx:2836–3237` (`MenuTab`) | cart + priced order; submit stubbed — §6 |
| Onboarding / dashboard / auth / safety | `CourierOnboarding.jsx` · `CourierDashboard.jsx` · `CaryAuth.jsx` · `SafetyReport.jsx` | |
| Routes | `src/App.jsx:602,623–627` | dashboard always mounted |
| Supabase client | `src/lib/supabase.js` | safe-stub when env unset |
| Schema / program / legal | `cary/supabase/migrations/` · `_handoffs/CARY-BRIEF.md` · `cary/legal/` | **canonical homes — defer here** |

*New doc, 2026-06-29 — the app-integration view; the program/legal/schema live in `_handoffs/CARY-BRIEF.md` + `cary/`. Reference-kind: when an in-app Cary surface ships or changes status, update §3–§4.*
