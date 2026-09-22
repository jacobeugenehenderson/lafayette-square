#!/usr/bin/env node
/**
 * claims-a-menu-price-is-in-cents — a menu price is an integer count of cents, on every
 * scene on disk.
 *
 * ⛔⛔ NOTHING IN THE FIELD'S NAME SAYS WHICH UNIT IT IS. `price` is a bare number.
 * Lafayette Square stores `2400` for a $24 plate — 781 prices, every one an integer —
 * because a human authored those menus by hand in cents, and `PlaceCard`'s MenuRow
 * renders `(shownPrice / 100).toFixed(0)`.
 *
 * ⭐ SO A CORRECT TRANSCRIPTION IS A BROKEN RECORD. A researcher reading Berardi's
 * printed menu writes `13.5` — right about the world — and the card renders **$0**,
 * because 0.135 rounded to no decimals is zero. Measured 2026-09-22: 97 merged prices,
 * median 12.5, every Huron menu row a column of zeroes. It did not look like a bug, it
 * looked like missing data, which is why it was reported as "there are no prices listed".
 *
 * ⭐⭐ CLASS D, TEXTBOOK — a constant with no unit, whose value was only ever right
 * because something else was also fixed (one town, one human, one convention). No
 * fallback, no scene name, nothing a grep would find.
 *
 * ⭐ THE TWO TELLS, and why both are needed. A cents price is an INTEGER, so `13.5`
 * fails outright. But a whole-dollar `13` is an integer too and still wrong, so the
 * second tell is MAGNITUDE: a non-zero price under 100 cents is a sub-dollar menu item,
 * which essentially does not exist. ⛔ Zero is legal and must stay legal — a modifier
 * priced at nothing ("6 pc: +$0") is real, and LS ships them.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
// ⛔ THE THIRD TELL, and the one the first version of this check was blind to. ×100
// applied TWICE gives $13.50 → 135000, which is an integer and far above a dollar, so
// both the other tells pass it. LS's dearest item is 20000 ($200), so $1,000 is a
// ceiling no real menu line reaches and a double conversion always clears.
const DOUBLE_CONVERTED = 100000
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nA menu price is an integer count of cents')

// Every well a menu can live in — the per-scene content dirs plus LS's reader-private set.
const wells = []
for (const scene of readdirSync(path.join(ROOT, 'cartograph/data'))) {
  const p = path.join(ROOT, 'cartograph/data', scene, 'content/listings.json')
  if (existsSync(p)) wells.push({ name: scene, path: p, kind: 'listings' })
  const m = path.join(ROOT, 'cartograph/data', scene, 'content/menus.json')
  if (existsSync(m)) wells.push({ name: `${scene}/menus`, path: m, kind: 'menus' })
}
const lsMenus = path.join(ROOT, 'src/data/lafayette-square/menus.json')
if (existsSync(lsMenus)) wells.push({ name: 'lafayette-square/menus', path: lsMenus, kind: 'menus' })
if (!wells.length) { bad('no menu wells found — the check is looking in the wrong place'); process.exit(1) }

function* pricesOf(raw, kind) {
  const menus = []
  if (kind === 'listings') {
    const arr = Array.isArray(raw) ? raw : (raw.listings || Object.values(raw).find(v => Array.isArray(v)) || [])
    for (const l of arr) if (l.menu) menus.push([l.name || l.id, l.menu])
  } else {
    for (const [k, v] of Object.entries(raw)) if (v && v.sections) menus.push([k, v])
  }
  for (const [who, menu] of menus) {
    for (const s of menu.sections || []) {
      for (const i of s.items || []) {
        if (typeof i.price === 'number') yield [who, i.name, i.price]
        for (const m of i.modifiers || []) if (typeof m.price === 'number') yield [who, `${i.name} → ${m.name}`, m.price]
      }
    }
  }
}

let total = 0
for (const w of wells) {
  const raw = JSON.parse(readFileSync(w.path, 'utf8'))
  const nonInt = [], subDollar = [], negative = [], absurd = []
  let n = 0
  for (const [who, item, price] of pricesOf(raw, w.kind)) {
    n++; total++
    if (!Number.isInteger(price)) nonInt.push(`${who} · ${item} = ${price}`)
    else if (price < 0) negative.push(`${who} · ${item} = ${price}`)
    else if (price > 0 && price < 100) subDollar.push(`${who} · ${item} = ${price}`)
    else if (price > DOUBLE_CONVERTED) absurd.push(`${who} · ${item} = ${price} ($${(price / 100).toFixed(2)})`)
  }
  if (!n) { console.log(`  · ${w.name}: no menu prices`); continue }
  if (nonInt.length) bad(`${w.name}: ${nonInt.length} of ${n} price(s) are not whole cents — DOLLARS written into a cents field, and they render as $0:\n       ${nonInt.slice(0, 4).join('\n       ')}${nonInt.length > 4 ? `\n       …and ${nonInt.length - 4} more` : ''}`)
  if (negative.length) bad(`${w.name}: ${negative.length} negative price(s) — ${negative.slice(0, 2).join(' · ')}`)
  if (subDollar.length) bad(`${w.name}: ${subDollar.length} of ${n} non-zero price(s) are under 100 cents — a sub-dollar menu item is almost certainly whole DOLLARS:\n       ${subDollar.slice(0, 4).join('\n       ')}${subDollar.length > 4 ? `\n       …and ${subDollar.length - 4} more` : ''}`)
  if (absurd.length) bad(`${w.name}: ${absurd.length} price(s) over $${DOUBLE_CONVERTED / 100} — almost certainly a DOUBLE conversion (dollars×100 twice), which is an integer well over a dollar and would otherwise pass this check clean:\n       ${absurd.slice(0, 4).join('\n       ')}`)
  if (!nonInt.length && !subDollar.length && !negative.length && !absurd.length) ok(`${w.name}: ${n} price(s), all whole cents between $1.00 and $${DOUBLE_CONVERTED / 100}`)
}
console.log(`  (${total} menu prices checked across ${wells.length} wells)`)

console.log(failed ? `\n⛔ ${failed} failed\n` : '\n✅ all passed\n')
process.exit(failed ? 1 : 0)
