#!/usr/bin/env node
/**
 * The CaryOrder contract — does it hold, and does the doc still describe it?
 *
 * Two jobs, and the second is the unusual one:
 *
 *  A. INVARIANTS. Every way a CaryOrder can be wrong in a manner that costs
 *     money: a tampered total, a subtotal that does not match its lines, a
 *     positional ref, money arriving from a browser, a POS tender that includes
 *     Cary's own charges.
 *
 *  B. DOC CONFORMANCE. `cary/pos/cary-order.md` carries a field table. A table
 *     copied from code goes stale — this contract's own `unit_price_cents` note
 *     still said "= item.price" months after B2 made the price of record the only
 *     chargeable number. So the table is CHECKED against CONTRACT rather than
 *     trusted, and the doc cannot drift without this failing.
 *
 *   node checks/claims-cary-order-contract.mjs
 */
import { readFileSync } from 'node:fs'
import {
  CONTRACT, INTENT_CONTRACT, validateCaryOrder, validateOrderIntent,
  posTenderCents, computeSubtotalCents,
} from '../cary/supabase/functions/_shared/caryOrder.js'

const fails = []
const ok = []
const assert = (cond, label, why = '') => (cond ? ok : fails).push(cond ? label : `${label}${why ? ' — ' + why : ''}`)

const ORDER = () => ({
  cary_order_id: '11111111-1111-1111-1111-111111111111',
  restaurant: { place_id: 'barrio-soulard', name: 'Barrio', lat: 38.61, lon: -90.21 },
  pos: null,
  line_items: [
    { ref: 'd_7a29963a', name: 'Al Pastor Taco', unit_price_cents: 450, qty: 3, pos_item_ref: null, modifiers: [] },
    { ref: 'd_9360a031', name: 'Guacamole', unit_price_cents: 900, qty: 1, pos_item_ref: null, modifiers: [] },
  ],
  order_note: 'One taco no onions. Allergy: cilantro.',
  money: {
    subtotal_cents: 2250, tax_cents: 196, service_charge_cents: 495,
    processing_fee_cents: 116, total_cents: 3057,
    tax_remitter: 'platform', food_payment_intent_id: 'pi_test',
  },
  fulfillment: { type: 'delivery', courier_session_id: 's1', destination: { address: '1822 Lafayette Ave' } },
  schedule_ok: true,
  created_at: '2026-09-10T18:00:00.000Z',
})

// ── A. the fixture is valid, and every required field is load-bearing ───────
assert(validateCaryOrder(ORDER()).valid, 'the reference order validates',
  validateCaryOrder(ORDER()).problems.join('; '))

for (const spec of CONTRACT.filter(s => s.required)) {
  const o = ORDER(); delete o[spec.field]
  const r = validateCaryOrder(o)
  assert(!r.valid && r.problems.some(p => p.includes(spec.field)), `missing ${spec.field} is caught`)
}

// ── A. arithmetic — what a type could never check ──────────────────────────
const tamper = (fn, label) => {
  const o = ORDER(); fn(o)
  assert(!validateCaryOrder(o).valid, label)
}
tamper(o => { o.money.total_cents = 1 }, 'a tampered total is caught')
tamper(o => { o.money.subtotal_cents = 100 }, 'a subtotal that disagrees with the lines is caught')
tamper(o => { o.line_items.push({ ref: 'd_x', name: 'Free', unit_price_cents: 500, qty: 1, modifiers: [] }) },
  'adding a line without repricing is caught')
tamper(o => { o.line_items[0].qty = 99 }, 'inflating a quantity without repricing is caught')
tamper(o => { o.line_items[0].ref = '0-2' }, 'a POSITIONAL ref is caught')
tamper(o => { o.line_items[0].unit_price_cents = -450 }, 'a negative unit price is caught')
tamper(o => { o.money.tax_remitter = 'whoever' }, 'an unknown tax_remitter is caught')

// modifiers must count toward the subtotal
{
  const o = ORDER()
  o.line_items[0].modifiers = [{ id: 'm_1', name: '12 pc', price_delta_cents: 4200, pos_modifier_ref: null }]
  assert(!validateCaryOrder(o).valid, 'a modifier price delta must move the subtotal')
  o.money.subtotal_cents = computeSubtotalCents(o.line_items)
  o.money.total_cents = o.money.subtotal_cents + o.money.tax_cents + o.money.service_charge_cents + o.money.processing_fee_cents
  assert(validateCaryOrder(o).valid, 'a repriced order with modifiers validates')
}

// ── A. submission gates ────────────────────────────────────────────────────
{
  const o = ORDER(); o.money.tax_remitter = 'undetermined'
  assert(validateCaryOrder(o).valid, 'undetermined tax_remitter is a valid SHAPE')
  assert(!validateCaryOrder(o, { forSubmission: true }).valid,
    'undetermined tax_remitter blocks SUBMISSION (the DOR ruling gate)')
}
{
  const o = ORDER(); delete o.money.food_payment_intent_id
  assert(!validateCaryOrder(o, { forSubmission: true }).valid, 'submission requires a PaymentIntent')
}

// ── A. the POS tender never carries Cary's charges ─────────────────────────
{
  let worst = null
  for (let i = 0; i < 2000; i++) {
    const sub = 1 + Math.floor(Math.random() * 500000)
    const tax = Math.floor(Math.random() * 50000)
    const svc = Math.floor(Math.random() * 200000)
    const fee = Math.floor(Math.random() * 20000)
    const t = posTenderCents({ money: { subtotal_cents: sub, tax_cents: tax, service_charge_cents: svc, processing_fee_cents: fee } })
    if (t !== sub + tax) { worst = { sub, tax, svc, fee, t }; break }
  }
  assert(worst === null, 'POS tender is food+tax across 2000 random money stacks',
    worst && `got ${worst.t} for subtotal ${worst.sub} + tax ${worst.tax}`)
}

// ── A. the intent carries no money ─────────────────────────────────────────
const INTENT = () => ({ listing_id: 'lmk-003', lines: [{ ref: 'd_7a29963a', qty: 2 }], destination_choice: { mode: 'home' } })
assert(validateOrderIntent(INTENT()).valid, 'the reference intent validates')
for (const [label, mut] of [
  ['a top-level total', o => { o.total_cents = 999 }],
  ['a price on a line', o => { o.lines[0].unit_price_cents = 450 }],
  ['a nested money object', o => { o.money = { subtotal_cents: 1 } }],
  ['a PaymentIntent', o => { o.food_payment_intent_id = 'pi_x' }],
]) {
  const o = INTENT(); mut(o)
  assert(!validateOrderIntent(o).valid, `intent rejects ${label}`)
}

// ── B. the doc still describes the code ────────────────────────────────────
const DOC = 'cary/pos/cary-order.md'
const doc = readFileSync(new URL(`../${DOC}`, import.meta.url), 'utf8')
const documented = new Set([...doc.matchAll(/^\|\s*\*\*`([a-z_]+)(?:\[\])?`\*\*\s*\|/gm)].map(m => m[1]))
const declared = new Set(CONTRACT.map(s => s.field))
const missingFromDoc = [...declared].filter(f => !documented.has(f))
const staleInDoc = [...documented].filter(f => !declared.has(f))
assert(missingFromDoc.length === 0, 'every contract field is documented', `absent from ${DOC}: ${missingFromDoc.join(', ')}`)
assert(staleInDoc.length === 0, 'the doc invents no fields', `in ${DOC} but not in CONTRACT: ${staleInDoc.join(', ')}`)
assert(!/=\s*item\.price/.test(doc), 'the doc does not still say unit_price_cents = item.price',
  'B2 made the price of record the only chargeable number; item.price is a display figure')
assert(/tax_remitter/.test(doc), 'the doc mentions tax_remitter', 'money carries it and the doc does not say so')
// ⚠️ This assertion first passed by ACCIDENT — /intent/ matched "variant intent
// rides order_note" elsewhere in the doc. Narrowed to the actual type name, and
// to the claim that must be present.
assert(/CaryOrderIntent/.test(doc) && /No money, ever/.test(doc), 'the doc covers the intent/order split',
  'the doc still implies the client produces a CaryOrder, which ORDER-PIPELINE §3.1 forbids')

console.log('CaryOrder contract')
for (const o of ok) console.log('  PASS  ' + o)
for (const f of fails) console.log('  FAIL  ' + f)
console.log(`\n${fails.length === 0 ? `PASS — ${ok.length} properties hold` : `FAIL — ${fails.length} of ${ok.length + fails.length}`}`)
process.exit(fails.length === 0 ? 0 : 1)
