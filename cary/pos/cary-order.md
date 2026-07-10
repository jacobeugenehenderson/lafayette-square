# The `CaryOrder` contract

**The boundary object between order-capture and order-injection.** One shape, agreed by both sides: the LS app's `MenuTab` **produces** it at checkout; every POS adapter (`README.md`) **consumes** it to inject a paid-external ticket. Define it once → checkout and all four POS adapters can't drift.

Drafted 2026-07-09 from the built `MenuTab` surface (`ls/CARY.md §6`, `PlaceCard.jsx ~L2836–3237`). Status: **v1 design, unbuilt.** Prices are integer cents throughout (matches `MenuTab`).

---

## Provenance — where each field already exists

Almost every field is already computed by `MenuTab` today; the contract mostly *formalizes* what the client produces and adds the IDs + the two seams (item-ref, modifiers).

| Contract field | Type | v1 source | Notes |
|---|---|---|---|
| **`cary_order_id`** | uuid | **new** — mint at submit | The join key across Stripe + POS. `Cary order ↔ PaymentIntent ↔ POS tender`. |
| **`restaurant`** | `{ place_id, name, lat, lon }` | `listing` (`L2842`) | `place_id` is the existing landmark/building id. |
| **`pos`** | `{ vendor, connection_id }` | **new** — from `pos_connections` | Which POS + the merchant's OAuth token row. Null until the restaurant connects. |
| **`line_items[]`** | see below | `cart` + `sections` (`L2938`) | — |
| **`order_note`** | string ≤500 | `orderNote` (`L3166`) | Free-text kitchen requests. The v1 modifiers channel. |
| **`money`** | see below | `MenuTab` price stack (`L2951–2956`) | All cents. |
| **`fulfillment`** | `{ type: 'delivery', courier_session_id, destination, promised_at? }` | partial — `destination` is **new** (`CARY-BRIEF §"What's next" #2`) | Ties to the courier `sessions` row. |
| **`schedule_ok`** | bool | `orderableMenus` (`L2908`) | Menu was in-window at submit (capacity-first invariant). |
| **`created_at`** | timestamptz | new | — |

### `line_items[]`

```
{
  ref:            "sectionIdx-itemIdx",   // MenuTab cart key — stable within a menu version
  name:           string,                 // Guardian-authored item name
  unit_price_cents: integer,              // = item.price (already cents)
  qty:            integer,
  pos_item_ref:   string | null,          // ⚠️ SEAM 1 — the POS's own catalog GUID; null in v1
  modifiers:      Modifier[]              // ⚠️ SEAM 2 — [] in v1 (intent rides order_note)
}

Modifier = { name: string, price_delta_cents: integer, pos_modifier_ref: string | null }
```

### `money` (cents)

```
{
  subtotal_cents,        // Σ unit_price_cents × qty   (MenuTab cartTotal)
  tax_cents,             // round(subtotal × INSTANCE.commerce.salesTaxRate) — FOOD ONLY
  service_charge_cents,  // round(subtotal × 0.22)     — Cary's, OFF-POS
  processing_fee_cents,  // round((subtotal+tax+service) × 0.029)+30 — Cary's, OFF-POS
  total_cents,           // what the customer paid Cary's Stripe
  food_payment_intent_id // Stripe — the paid-external reference
}
```

---

## The two seams (why v1 is safe to ship without solving them)

**Seam 1 — `pos_item_ref` (item identity) — largely dissolved by the Guardian model.** The restaurant **manages its own Cary menu** (Guardian-authored in-app; `sender-agreement §7`, the `MenuTab` editor), so the ordered items' names + prices are *exactly what the restaurant set*. Injecting each line as an **open / custom item** (`name` + `unit_price_cents` — Toast/Square/Clover/Lightspeed all support it) is therefore **not a lossy fallback, it's the design**: the ticket prints the restaurant's own authored menu, already priced, already paid. `pos_item_ref` stays in the shape as an **optional, Guardian-set mapping** — only for a restaurant that wants catalog-level injection (kitchen-station routing, item-level POS analytics, inventory depletion). **Menu-in sync from the POS is _not_ required for correctness** and is off the injection critical path (`README.md §1`); the Guardian owns menu accuracy (+ the 86/pause toggle), not us.

**Seam 2 — `modifiers[]` (variants — the versioned nightmare).** The menu model already has a per-item `modifiers: []` (`PlaceCard.jsx L3060`); the *order UI* doesn't yet let you pick them. **v1:** `modifiers` is `[]`; variant intent rides `order_note` ("no onions, add cheese"), which prints on the ticket. **v2:** wire modifier selection in `MenuTab` + the price-delta math + `pos_modifier_ref`. The structured shape is present now so v2 fills it rather than reshaping the contract.

---

## Money mapping to the POS (the invariant, restated concretely)

The injected POS order carries **only what the restaurant is owed** as a paid-external tender:

```
POS order total = subtotal_cents + tax_cents        ← the paid-external tender
POS never sees   = service_charge_cents, processing_fee_cents   ← Cary's, off-POS
```

Injecting the service charge or processing fee would **pollute the restaurant's books** — they'd reconcile a number that isn't theirs. The POS's job is to record *their* sale (food + tax), already paid. See `README.md §0`.

---

## Example

```json
{
  "cary_order_id": "…uuid…",
  "restaurant": { "place_id": "barrio-soulard", "name": "Barrio", "lat": 38.61, "lon": -90.21 },
  "pos": { "vendor": "toast", "connection_id": "…" },
  "line_items": [
    { "ref": "0-2", "name": "Al Pastor Taco", "unit_price_cents": 450, "qty": 3, "pos_item_ref": null, "modifiers": [] },
    { "ref": "1-0", "name": "Guacamole", "unit_price_cents": 900, "qty": 1, "pos_item_ref": null, "modifiers": [] }
  ],
  "order_note": "One taco no onions. Allergy: cilantro.",
  "money": {
    "subtotal_cents": 2250, "tax_cents": 196, "service_charge_cents": 495,
    "processing_fee_cents": 116, "total_cents": 3057, "food_payment_intent_id": "pi_…"
  },
  "fulfillment": { "type": "delivery", "courier_session_id": "…", "destination": { "address": "…", "unit": "…" } },
  "schedule_ok": true,
  "created_at": "…"
}
```

*POS injection uses `subtotal_cents + tax_cents = 2446` as the paid-external tender; the $495 + $116 never touch Barrio's POS.*

---

## Open decisions (for Jacob)

1. **`ref` stability across menu edits.** `"sectionIdx-itemIdx"` is positional — a Guardian reordering the menu shifts it. Fine for a live cart; risky if we persist orders long-term or reconcile later. Consider a stable per-item id in the menu model when we touch it. *(Low urgency — orders are short-lived.)*
2. **Where the contract is enforced** — a shared TS/JSDoc type imported by both `MenuTab` (producer) and the edge-function adapters (consumer), so drift is a compile error, not a runtime surprise.
3. **Persist-then-pay-then-inject ordering** at submit — the still-unbuilt middle (`CARY-BRIEF §"What's next" #2`). The contract is the target shape; the submit pipeline that fills it is the next build.

## Cross-refs
- [`README.md`](README.md) — POS injection canon (the invariant, the adapters, the target list).
- [`../../ls/CARY.md §6`](../../ls/CARY.md) — the producing surface (`MenuTab`), field-by-field.
