// claims-autosave-keeps-what-bakes-read.mjs — DOES STAGE'S AUTOSAVE KEEP EVERYTHING A BAKE READS?
//
// ⭐ THE INVARIANT: the design autosave (cartograph/serve.js, POST /looks/<id>/design) REPLACES a
// town's design.json with Stage's payload — built from the store's DESIGN_FIELDS — and preserves only
// the keys it names. So every top-level design.json key a bake reads must be in DESIGN_FIELDS or in
// that preserve list; any other is WIPED the next time Stage saves, silently, and the operator's
// authoring is gone with no error (Layer 0 q2).
// ⛔ Found 2026-09-26: `surfaces` — the operator layer of cartograph/surfaces.mjs (class remaps, crop
// and sand params) — was in neither.
//
// Every list is PARSED FROM SOURCE: DESIGN_FIELDS (src/cartograph/stores/useCartographStore.js), the
// preserve list (serve.js), and the keys the bakes read (`design.<key>` / `design?.<key>` across
// cartograph/*.js|mjs). ⭐ MUTATION-TESTED EVERY RUN: 'surfaces' is dropped from the parsed fields and
// the check must then fail.
//
//   node checks/claims-autosave-keeps-what-bakes-read.mjs
// Read-only. Exit 1 on a key the autosave would wipe, or a blind check.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const STORE = 'src/cartograph/stores/useCartographStore.js', SERVE = 'cartograph/serve.js'

const store = read(STORE)
const block = store.match(/const DESIGN_FIELDS = \[([\s\S]*?)\n\]/)
if (!block) { console.error(`⛔ could not parse DESIGN_FIELDS from ${STORE} — blind`); process.exit(2) }
const fields = new Set([...block[1].matchAll(/key:\s*'(\w+)'/g), ...block[1].matchAll(/_grp\('(\w+)'/g)].map(m => m[1]))

const serve = read(SERVE)
const pres = serve.match(/Preserve keys another endpoint owns[\s\S]*?for \(const k of \[([^\]]*)\]\)/)
if (!pres) { console.error(`⛔ could not parse the autosave's preserve list from ${SERVE} — blind`); process.exit(2) }
const preserved = new Set([...pres[1].matchAll(/'(\w+)'/g)].map(m => m[1]))

// Keys the bakes read. `design.json` (the filename in prose/strings) is not a key.
const NOT_KEYS = new Set(['json'])
const readers = new Map()
for (const f of readdirSync(join(ROOT, 'cartograph')).filter(f => /\.(m?js)$/.test(f))) {
  // Code only: a key named in a comment is not a key read (`design.time`, in bake-scene's prose).
  const src = read(join('cartograph', f)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const m of src.matchAll(/\bdesign\??\.([A-Za-z_]\w*)/g)) {
    if (NOT_KEYS.has(m[1])) continue
    if (!readers.has(m[1])) readers.set(m[1], new Set())
    readers.get(m[1]).add(f)
  }
}

const wiped = (F) => [...readers.keys()].filter(k => !F.has(k) && !preserved.has(k)).sort()
const bad = wiped(fields)
console.log(`DESIGN_FIELDS ${fields.size} · autosave preserves ${[...preserved].join(', ')} · bakes read ${readers.size} key(s)`)
for (const k of bad) console.log(`⛔ design.${k} — read by ${[...readers.get(k)].join(', ')} — the next Stage autosave WIPES it`)

// The mutation: drop 'surfaces' and the check must see it.
const mut = new Set(fields); mut.delete('surfaces')
const blind = readers.has('surfaces') && !wiped(mut).includes('surfaces')
console.log(blind ? `⛔ BLIND: 'surfaces' dropped from DESIGN_FIELDS and nothing failed`
  : readers.has('surfaces') ? `   mutation (drop 'surfaces') caught ✓` : `⚠️ no bake reads design.surfaces — the mutation proves nothing`)
console.log(bad.length || blind ? `\n⛔ FAIL` : `\n✅ PASS — every key a bake reads survives the autosave`)
process.exit(bad.length || blind ? 1 : 0)
