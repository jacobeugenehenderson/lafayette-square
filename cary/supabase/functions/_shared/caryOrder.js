/**
 * The `CaryOrder` contract — ONE definition, imported by both sides.
 *
 * The boundary object between order-capture and order-injection: built by
 * `place-order` from the customer's intent, consumed by every POS adapter.
 * `cary/pos/cary-order.md` open decision #2 asked for a shared type "so drift is
 * a compile error, not a runtime surprise."
 *
 * ⚠️ Two shapes live here, and the split is the anti-tamper property — see THE
 * INTENT below. The Ward produces an INTENT; the server produces the ORDER.
 *
 * ⭐ A COMPILE ERROR IS NOT AVAILABLE HERE, AND A WEAKER THING WAS NOT THE
 * ANSWER. The Ward is plain JS with no typecheck step; the adapters are Deno TS.
 * A shared `.ts` type would be enforced on one side and decorative on the other
 * — which is worse than nothing, because it would LOOK enforced. So the contract
 * is a runtime validator instead, and it checks the things a type cannot:
 *
 *   - a type says `subtotal_cents` is a number
 *   - this says it EQUALS the sum of the lines, and that the total equals the
 *     stack, and that the POS tender excludes Cary's own charges
 *
 * Those arithmetic invariants are the ones that cost money when they break, and
 * no type system was ever going to catch them.
 *
 * ⛔ THE SPEC BELOW IS THE ONLY DEFINITION. The validator is derived from it and
 * `checks/claims-cary-order-contract.mjs` asserts that the field table in
 * `cary/pos/cary-order.md` still matches it — so the doc cannot quietly drift
 * from the code the way this contract's own `unit_price_cents` note did.
 *
 * Home: `_shared/` because a Supabase edge function bundles from there, and the
 * Ward imports the same file. Two importers, one file, no re-export to drift.
 */

/**
 * ── THE INTENT, AND WHY IT IS A SEPARATE SHAPE ─────────────────────────────
 *
 * `cary-order.md` says "the LS app's MenuTab PRODUCES it at checkout".
 * `ORDER-PIPELINE.md §3.1`, written the same day, says the client sends
 * `{ line_refs, qtys, note, destination_choice }` only and `place-order`
 * re-prices from the authoritative menu. Those cannot both be true.
 *
 * ⭐ ORDER-PIPELINE is right and cary-order.md's line is superseded. The client
 * must not produce a CaryOrder, because a CaryOrder carries MONEY, and money the
 * client computed is money the client can edit. B2 sharpened the same point from
 * the other end: the chargeable price lives in `commerce_items`, so the browser
 * has no access to an authoritative number in the first place.
 *
 * So there are two shapes, and keeping them apart is the anti-tamper property:
 *
 *   CaryOrderIntent   what the customer ASKED for. Refs and quantities. No money.
 *   CaryOrder         what it COSTS, built server-side by re-pricing the intent
 *                     against the price of record. The only thing a POS ever sees.
 *
 * ⛔ Never add a money field to the intent. A total that arrives from a browser
 * is a suggestion, and the moment anything downstream reads it as a fact the
 * whole re-pricing step becomes decorative.
 */
export const INTENT_CONTRACT = [
  { field: 'listing_id', type: 'string', required: true, note: 'The GAS listing id being ordered from.' },
  { field: 'lines', type: 'array', required: true, note: '[{ ref, qty, modifier_ids? }] — refs are stable item ids.' },
  { field: 'order_note', type: 'string', required: false, note: 'Free-text kitchen requests, ≤500.' },
  { field: 'destination_choice', type: 'object', required: true, note: "{ mode: 'home'|'here'|'elsewhere', … } — resolved server-side." },
]

/** Validate what the client is allowed to send. */
export function validateOrderIntent(intent) {
  const problems = []
  const bad = (m) => problems.push(m)
  if (!intent || typeof intent !== 'object') return { valid: false, problems: ['intent is not an object'] }

  for (const spec of INTENT_CONTRACT) {
    const v = intent[spec.field]
    if (v === undefined || v === null) { if (spec.required) bad(`missing required field: ${spec.field}`); continue }
    if (!typeOk(v, spec.type)) bad(`${spec.field} should be ${spec.type}`)
  }

  const lines = Array.isArray(intent.lines) ? intent.lines : []
  if (intent.lines && lines.length === 0) bad('lines is empty')
  lines.forEach((l, i) => {
    if (!l?.ref) bad(`lines[${i}].ref is required`)
    if (typeof l?.ref === 'string' && /^\d+-\d+$/.test(l.ref)) bad(`lines[${i}].ref "${l.ref}" is a POSITION, not an identity`)
    if (!Number.isInteger(l?.qty) || l.qty <= 0) bad(`lines[${i}].qty must be a positive integer`)
  })

  // ⛔ The load-bearing assertion. Anything money-shaped arriving from a client
  // is rejected outright rather than ignored, because "ignored" is one careless
  // destructure away from "trusted".
  const MONEY_SHAPED = /cents$|^total$|^price|^subtotal|^tax|^fee$|payment_intent/i
  const scan = (obj, path) => {
    for (const k of Object.keys(obj || {})) {
      if (MONEY_SHAPED.test(k)) bad(`${path}${k} is money and may not be sent by the client — place-order re-prices from the price of record`)
      const v = obj[k]
      if (v && typeof v === 'object' && !Array.isArray(v)) scan(v, `${path}${k}.`)
      if (Array.isArray(v)) v.forEach((e, i) => e && typeof e === 'object' && scan(e, `${path}${k}[${i}].`))
    }
  }
  scan(intent, '')

  return { valid: problems.length === 0, problems }
}

/** Integer cents throughout. ⛔ Never floats, never dollars. */
export const CONTRACT = [
  { field: 'cary_order_id', type: 'string', required: true,
    note: 'The join key across Stripe + POS. Cary order ↔ PaymentIntent ↔ POS tender.' },
  { field: 'restaurant', type: 'object', required: true,
    note: 'place_id is the GAS listing id.' },
  { field: 'pos', type: 'object|null', required: false,
    note: 'Which POS + the merchant OAuth row. Null until the restaurant connects.' },
  { field: 'line_items', type: 'array', required: true,
    note: "Each line's ref is the item's stable id (menuIdentity.js) — never a position." },
  { field: 'order_note', type: 'string', required: false,
    note: 'Free-text kitchen requests, ≤500. The v1 modifiers channel.' },
  { field: 'money', type: 'object', required: true,
    note: 'All cents. Internally consistent — see validateCaryOrder.' },
  { field: 'fulfillment', type: 'object', required: true,
    note: 'Ties to the courier sessions row. Destination is a resolved in-boundary place.' },
  { field: 'schedule_ok', type: 'boolean', required: true,
    note: 'The menu was in-window at submit (capacity-first invariant).' },
  { field: 'created_at', type: 'string', required: true, note: 'ISO timestamp.' },
]

export const MONEY_FIELDS = [
  'subtotal_cents', 'tax_cents', 'service_charge_cents',
  'processing_fee_cents', 'total_cents', 'tax_remitter',
]

export const TAX_REMITTERS = ['platform', 'restaurant', 'undetermined']

const isInt = (v) => Number.isInteger(v)
const typeOk = (v, type) => type.split('|').some(t =>
  t === 'null' ? v === null
  : t === 'array' ? Array.isArray(v)
  : t === 'object' ? (v !== null && typeof v === 'object' && !Array.isArray(v))
  : typeof v === t)

/**
 * What the POS is told the customer already paid.
 *
 * ⛔⛔ FOOD + TAX, AND NOTHING ELSE. The 22% service charge and the processing
 * fee are Cary's and must never reach the restaurant's books — injecting them
 * would have their bookkeeper reconciling a number that is not theirs, and the
 * whole paid-external settlement model rests on that not happening
 * (`cary/pos/README.md §0`). One function, so no adapter can compute it its own
 * way and be subtly generous.
 */
export function posTenderCents(order) {
  const m = order?.money
  if (!m || !isInt(m.subtotal_cents) || !isInt(m.tax_cents)) return null
  return m.subtotal_cents + m.tax_cents
}

/** The subtotal the line items actually add up to, modifiers included. */
export function computeSubtotalCents(lineItems) {
  let total = 0
  for (const li of lineItems || []) {
    const mods = (li?.modifiers || []).reduce((a, m) => a + (isInt(m?.price_delta_cents) ? m.price_delta_cents : 0), 0)
    total += ((isInt(li?.unit_price_cents) ? li.unit_price_cents : 0) + mods) * (isInt(li?.qty) ? li.qty : 0)
  }
  return total
}

/**
 * Validate a CaryOrder.
 *
 * @param order
 * @param opts.forSubmission  additionally require the things that must be true
 *   before money moves — as opposed to the things that must be true for the
 *   shape to be a CaryOrder at all. A fixture is valid; only a real order is
 *   submittable.
 * @returns { valid, problems[] }
 */
export function validateCaryOrder(order, { forSubmission = false } = {}) {
  const problems = []
  const bad = (msg) => problems.push(msg)

  if (!order || typeof order !== 'object') return { valid: false, problems: ['order is not an object'] }

  for (const spec of CONTRACT) {
    const v = order[spec.field]
    if (v === undefined || v === null) {
      if (spec.required) bad(`missing required field: ${spec.field}`)
      continue
    }
    if (!typeOk(v, spec.type)) bad(`${spec.field} should be ${spec.type}`)
  }

  // ── restaurant ──
  const r = order.restaurant
  if (r && typeof r === 'object' && !r.place_id) bad('restaurant.place_id is required — it is the GAS listing id')

  // ── line items ──
  const lines = Array.isArray(order.line_items) ? order.line_items : []
  if (order.line_items && lines.length === 0) bad('line_items is empty — an order with no food is not an order')
  lines.forEach((li, i) => {
    if (!li?.ref) bad(`line_items[${i}].ref is required — the item's stable id`)
    // ⛔ A positional ref is the defect this contract was rewritten to kill. It
    // is cheap to spot and catastrophic to ship, so it is named explicitly
    // rather than left to "ref is a string".
    if (typeof li?.ref === 'string' && /^\d+-\d+$/.test(li.ref)) {
      bad(`line_items[${i}].ref "${li.ref}" is a POSITION (sectionIdx-itemIdx), not an identity`)
    }
    if (!isInt(li?.unit_price_cents) || li.unit_price_cents <= 0) {
      bad(`line_items[${i}].unit_price_cents must be a positive integer of cents`)
    }
    if (!isInt(li?.qty) || li.qty <= 0) bad(`line_items[${i}].qty must be a positive integer`)
    for (const [j, m] of (li?.modifiers || []).entries()) {
      if (!m?.id) bad(`line_items[${i}].modifiers[${j}].id is required`)
      if (!isInt(m?.price_delta_cents)) bad(`line_items[${i}].modifiers[${j}].price_delta_cents must be an integer`)
    }
  })

  if (typeof order.order_note === 'string' && order.order_note.length > 500) {
    bad('order_note exceeds 500 characters')
  }

  // ── money ──
  const m = order.money
  if (m && typeof m === 'object') {
    for (const f of MONEY_FIELDS) {
      if (m[f] === undefined) bad(`money.${f} is required`)
    }
    for (const f of MONEY_FIELDS.filter(f => f.endsWith('_cents'))) {
      if (m[f] !== undefined && (!isInt(m[f]) || m[f] < 0)) bad(`money.${f} must be a non-negative integer of cents`)
    }
    if (m.tax_remitter !== undefined && !TAX_REMITTERS.includes(m.tax_remitter)) {
      bad(`money.tax_remitter must be one of ${TAX_REMITTERS.join(', ')}`)
    }

    // ⛔ The arithmetic. This is the half a type could never check, and the half
    // that costs money. A client that tampers with a total, or an adapter that
    // rebuilds one, fails here rather than at the card.
    const computed = computeSubtotalCents(lines)
    if (isInt(m.subtotal_cents) && lines.length && m.subtotal_cents !== computed) {
      bad(`money.subtotal_cents ${m.subtotal_cents} does not equal the line items (${computed})`)
    }
    const stack = ['subtotal_cents', 'tax_cents', 'service_charge_cents', 'processing_fee_cents']
    if (stack.every(f => isInt(m[f])) && isInt(m.total_cents)) {
      const sum = stack.reduce((a, f) => a + m[f], 0)
      if (m.total_cents !== sum) bad(`money.total_cents ${m.total_cents} does not equal subtotal+tax+service+processing (${sum})`)
    }
  }

  // ── fulfillment ──
  const f = order.fulfillment
  if (f && typeof f === 'object') {
    if (f.type !== 'delivery') bad(`fulfillment.type must be 'delivery' (v1 has no other kind)`)
    if (!f.destination) bad('fulfillment.destination is required — a resolved in-boundary place, never raw coordinates')
  }

  // ── submission-only gates ──
  if (forSubmission) {
    // ⛔ The DOR marketplace-facilitator letter ruling has not landed, so who
    // remits sales tax is genuinely unknown. An order MAY be modelled with it
    // undetermined; one may not be PLACED that way. Encoded here so the legal
    // blocker is a failing check rather than a line in a brief someone has to
    // remember. (cary/legal/legal-readiness-brief.md §A)
    if (order.money?.tax_remitter === 'undetermined') {
      bad('money.tax_remitter is undetermined — the DOR marketplace-facilitator ruling has not landed; no order may be placed until it does')
    }
    if (!order.money?.food_payment_intent_id) bad('money.food_payment_intent_id is required at submission')
    if (order.schedule_ok !== true) bad('schedule_ok must be true at submission — the menu was not in-window')
  }

  return { valid: problems.length === 0, problems }
}
