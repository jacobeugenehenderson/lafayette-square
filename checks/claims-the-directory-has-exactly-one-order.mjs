#!/usr/bin/env node
/**
 * claims-the-directory-has-exactly-one-order — every writer of the listings store orders
 * what it writes, and the order is depth-first with prominence as tie-break.
 *
 * ⛔⛔ THE DIRECTORY HAD NO ORDER AT ALL. Not one `.sort()` in `SidePanel`,
 * `useListings` or `useLandmarkFilter` — 285 listings rendered in the producer's
 * emission order, which for an Overture base is that file's order. huron opened on a
 * remodeling contractor, a detailer and a car wash. ⚠️ Id assignment DOES sort
 * (`listing-identity.js`), which made it read as though a discipline existed: it sorts a
 * copy to hand out id numbers and never reorders the array it returns.
 *
 * ⛔⛔ AND THE TRAP THIS CHECK EXISTS FOR: the store is SEEDED in `useListings` and then
 * REPLACED by the API merge in `useInit`. Ordering only the seed looks correct in a cold
 * dev reload and reverts to file order in production, the moment the API answers —
 * broken exactly where nobody is looking. ⭐ So the check is on the WRITERS, not on one
 * function: every `setState` that assigns `listings` must pass through `orderListings`.
 *
 * ⭐ It also pins the two rulings the order rests on, because both are easy to
 * "simplify" into the wrong thing:
 *   · DEPTH BEATS PROMINENCE. Prominence is a footprint-and-brand score; sorting huron
 *     by it alone puts six fast-food chains above a 1979 family restaurant and moves
 *     Berardi's from #48 to #82. Good tie-break, bad primary key.
 *   · AN ABSENT RANK SORTS LAST. `null`, never 0 — zero is a rank, and the best one.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const { orderListings, listingDepth } = await import(path.join(ROOT, 'src/lib/listingOrder.js'))

let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nThe directory has exactly one order')

// ── every writer orders what it writes ────────────────────────────────────
const files = []
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, e.name)
  if (e.isDirectory()) walk(p); else if (/\.jsx?$/.test(e.name)) files.push(p)
} }
walk(path.join(ROOT, 'src'))

const WRITER = /setState\(\s*\{[^}]*\blistings\s*:/g
const writers = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(WRITER)) {
    const stmt = src.slice(m.index, src.indexOf('\n', m.index + m[0].length))
    writers.push({ file: path.relative(ROOT, f), stmt: stmt.trim() })
  }
}
if (!writers.length) { bad('no `setState({ listings: … })` found — the parse is wrong, not the code'); process.exit(1) }
ok(`${writers.length} writer(s) of the listings store found`)
for (const w of writers) {
  if (!/orderListings\s*\(/.test(w.stmt)) {
    bad(`${w.file} writes the store unordered — it would revert the directory to the producer's file order:\n       ${w.stmt.slice(0, 120)}`)
  }
}
if (writers.every(w => /orderListings\s*\(/.test(w.stmt))) ok('every writer passes through orderListings')

// ── the two rulings ───────────────────────────────────────────────────────
const rich = { id: 'rich', name: 'Rich', prominence_rank: 900, menu: { sections: [{}] }, hours: { monday: {} }, description: 'x' }
const prominentButBare = { id: 'bare', name: 'Bare', prominence_rank: 1 }
const out = orderListings([prominentButBare, rich])
if (out[0].id !== 'rich') bad('a bare listing with the best prominence outranked a full card — prominence must be the TIE-BREAK, not the primary key')
else ok('depth beats prominence: a full card outranks a bare listing ranked #1')

const a = { id: 'a', name: 'A', description: 'x', prominence_rank: 50 }
const b = { id: 'b', name: 'B', description: 'x', prominence_rank: 10 }
if (orderListings([a, b])[0].id !== 'b') bad('equal depth did not fall back to prominence')
else ok('at equal depth, the better prominence rank wins')

const unranked = { id: 'u', name: 'U', description: 'x', prominence_rank: null }
if (orderListings([unranked, a])[0].id !== 'a') bad('a listing with a null rank sorted FIRST — an absent rank must sort last, never be read as 0')
else ok('an absent rank sorts last')
if (listingDepth({}) !== 0) bad('an empty listing has non-zero depth')
else ok('a listing with nothing to show has depth 0')

// ── the rank actually reaches the listings on disk ────────────────────────
for (const scene of readdirSync(path.join(ROOT, 'cartograph/data'))) {
  const p = path.join(ROOT, 'cartograph/data', scene, 'content/listings.json')
  let raw; try { raw = JSON.parse(readFileSync(p, 'utf8')) } catch { continue }
  const arr = Array.isArray(raw) ? raw : (raw.listings || [])
  if (!arr.length) continue
  const has = arr.filter(l => 'prominence_rank' in l).length
  const zeroish = arr.filter(l => l.prominence_rank === 0).length
  if (has === 0) bad(`${scene}: no listing carries \`prominence_rank\` — re-bake; the tie-break has nothing to read`)
  else if (has < arr.length) bad(`${scene}: only ${has} of ${arr.length} listings carry \`prominence_rank\``)
  else if (zeroish) bad(`${scene}: ${zeroish} listing(s) have \`prominence_rank: 0\` — an absent rank must be null, and 0 would sort them FIRST`)
  else ok(`${scene}: all ${arr.length} listings carry a rank`)
}

console.log(failed ? `\n⛔ ${failed} failed\n` : '\n✅ all passed\n')
process.exit(failed ? 1 : 0)
