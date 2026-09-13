#!/usr/bin/env node
/**
 * Can a DISPLAY FIGURE ever be charged?
 *
 * The whole B2 split rests on one claim: the number on a bundled or
 * guardian-authored menu may be shown but never charged, and only a confirmed
 * `commerce_items.price_cents` can reach a total. That claim is worth exactly as
 * much as the number of inputs we have tried to break it with.
 *
 * So this enumerates the cross product of every commercial state an item can be
 * in — no row, unconfirmed, confirmed, 86'd, paused, unloaded, errored, a row
 * whose price disagrees with the menu — and asserts on EVERY combination:
 *
 *   1. an orderable line's unit price is the price of record, never item.price
 *   2. nothing is orderable unless commercial state actually loaded
 *   3. nothing is orderable without a confirmed_at AND a price_cents
 *   4. the subtotal equals the sum of prices of record, and moves when the
 *      price of record moves — never when the display figure does
 *
 * ⛔ #4 is the one that would catch a well-meaning "fall back to item.price"
 * added later: every other assertion still passes with such a fallback in place
 * as long as a confirmed row exists, which it usually would in testing.
 *
 *   node scratch/claims-price-of-record.mjs
 */
import { itemOrderability, resolveCart, BLOCKED } from '../src/lib/commerce.js'

const DISPLAY = 1900   // what the menu says
const RECORD = 1250    // what was actually confirmed — deliberately different
const item = { id: 'd_test', name: 'Test Item', price: DISPLAY }
const itemIndex = new Map([['d_test', { item, sectionIdx: 0 }]])

const ROWS = {
  'no row': undefined,
  'row, unconfirmed, no price': { item_id: 'd_test', price_cents: null, available: true, confirmed_at: null },
  'row, unconfirmed, has price': { item_id: 'd_test', price_cents: RECORD, available: true, confirmed_at: null },
  'row, confirmed, no price': { item_id: 'd_test', price_cents: null, available: true, confirmed_at: '2026-09-10T00:00:00Z' },
  'row, confirmed, priced': { item_id: 'd_test', price_cents: RECORD, available: true, confirmed_at: '2026-09-10T00:00:00Z' },
  'row, confirmed, priced, 86ed': { item_id: 'd_test', price_cents: RECORD, available: false, confirmed_at: '2026-09-10T00:00:00Z' },
}
const PLACES = { 'no place': null, 'open': { ordering_paused: false }, 'paused': { ordering_paused: true } }
const LOADED = { 'loaded': true, 'not loaded': false }
const WINDOWS = { 'in window': true, 'out of window': false }

let checked = 0
const failures = []
const fail = (msg) => failures.push(msg)

for (const [rn, row] of Object.entries(ROWS))
  for (const [pn, place] of Object.entries(PLACES))
    for (const [ln, commerceLoaded] of Object.entries(LOADED))
      for (const [wn, inWindow] of Object.entries(WINDOWS)) {
        const label = `${rn} · ${pn} · ${ln} · ${wn}`
        const v = itemOrderability(item, row, place, { inWindow, commerceLoaded })
        checked++

        // 1 — a price of record is never a display figure
        if (v.priceOfRecord != null && v.priceOfRecord === DISPLAY) fail(`${label}: priceOfRecord is the DISPLAY figure`)
        // 2 — unloaded can never sell
        if (v.orderable && !commerceLoaded) fail(`${label}: orderable while commercial state not loaded`)
        // 3 — unconfirmed or unpriced can never sell
        if (v.orderable && !(row?.confirmed_at && row?.price_cents != null)) fail(`${label}: orderable without a confirmed price`)
        if (v.orderable && v.priceOfRecord == null) fail(`${label}: orderable with a null price of record`)
        // paused / 86 / window must all block
        if (v.orderable && place?.ordering_paused) fail(`${label}: orderable while the restaurant is paused`)
        if (v.orderable && row?.available === false) fail(`${label}: orderable while 86'd`)
        if (v.orderable && !inWindow) fail(`${label}: orderable out of window`)

        // 4 — the cart agrees with the verdict, and charges the record
        const cart = { d_test: 2 }
        const r = resolveCart(cart, {
          itemIndex, rows: new Map(row ? [['d_test', row]] : []), place,
          orderableSections: new Set(inWindow ? [0] : []), commerceLoaded,
        })
        if (v.orderable) {
          if (r.subtotalCents !== RECORD * 2) fail(`${label}: subtotal ${r.subtotalCents} is not 2 x price of record (${RECORD * 2})`)
          if (r.subtotalCents === DISPLAY * 2) fail(`${label}: subtotal charged the DISPLAY figure`)
        } else if (r.subtotalCents !== 0) {
          fail(`${label}: not orderable, yet subtotal is ${r.subtotalCents}`)
        }
      }

// A stranded line (item gone from the menu) must never be priced either.
const strandedRes = resolveCart({ d_gone: 3 }, {
  itemIndex, rows: new Map(), place: null, orderableSections: new Set([0]), commerceLoaded: true,
})
checked++
if (strandedRes.subtotalCents !== 0) fail('stranded line was priced')
if (strandedRes.stranded.length !== 1) fail('stranded line was not reported')

console.log(`price-of-record invariants — ${checked} states checked`)
if (failures.length === 0) {
  console.log(`PASS — no state charges a display figure; nothing sells unconfirmed, 86'd, paused, out-of-window or unloaded`)
  process.exit(0)
}
console.log(`FAIL — ${failures.length}`)
for (const f of failures) console.log('  ' + f)
process.exit(1)
