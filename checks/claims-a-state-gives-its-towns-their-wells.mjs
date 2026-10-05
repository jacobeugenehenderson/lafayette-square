// claims-a-state-gives-its-towns-their-wells.mjs
//
// ⭐⭐ THE INVARIANT (Jacob, 2026-10-05 — "yes, go", "Plus MO"): a town takes its parcel and address-point wells,
// and the vocabulary that reads them, FROM ITS STATE (cartograph/states/), declaring only what it takes and how it
// selects. ⛔ No fallbacks: an unknown state, an unlisted well or a missing selector throws, naming it; and the state
// a town declares must be the state its OWN map votes (every `addr:state` in its OSM — `townState`).
//
// ⛔⛔ WHY. Each town re-declared its state's wells by hand: Huron carried Ohio's endpoints, LS and HPDM each held an
// identical copy of St. Louis City's, and Provincetown — a Massachusetts town in a state with one statewide parcel
// layer — had no parcels at all, so 2,740 of its buildings stood on `underived` ground.
//
// ⭐ MUTATION TEST — each must turn this RED:
//   1. in resolveFromState, skip the selector check (substitute an empty string)   → the hermetic selector case
//   2. in readMaDorCode, read 1xx as commercial                                   → the DOR cases + Provincetown
//   3. declare huron's state as MO in its sources.json                            → the town-vote leg
//   4. let stateRecord return OH for an unknown code                              → the unknown-state case
//
//   node checks/claims-a-state-gives-its-towns-their-wells.mjs
import fs from 'fs'
import { STATES, resolveFromState, LAND_USE_READERS } from '../cartograph/states/index.mjs'
import { readSources, sourcesPath } from '../cartograph/sources.js'
import { townState } from '../src/cartograph/streetProfiles.js'

let failed = false
const say = (ok, msg) => { if (!ok) failed = true; console.log(`  ${ok ? '✅' : '⛔'} ${msg}`) }
const throws = (fn, re) => { try { fn(); return false } catch (e) { return re.test(e.message) } }

console.log('hermetic — resolution:')
const ma = { state: 'MA', select: { town_id: 242 } }
const w = resolveFromState({ from: 'state', id: 'massgis-l3' }, 'parcels', ma)
say(w.where === 'TOWN_ID = 242' && w.fromState === `MA@${STATES.MA.version}` && w.file === 'ma_parcels.json', `a town's selector reaches its state's well, stamped — got where "${w.where}", ${w.fromState}`)
say(throws(() => resolveFromState({ from: 'state', id: 'massgis-l3' }, 'parcels', { state: 'MA', select: {} }), /gives no `town_id`/), 'a well whose selector the town does not give THROWS, naming it')
say(throws(() => resolveFromState({ from: 'state', id: 'x' }, 'parcels', { state: 'ZZ' }), /NO state adapter/), 'a state with no record THROWS — never another state\'s well')
say(throws(() => resolveFromState({ from: 'state', id: 'nope' }, 'parcels', ma), /lists no such well/), 'a well the state does not list THROWS')
say(throws(() => resolveFromState({ from: 'state', id: 'massgis-l3' }, 'parcels', { state: 'MA', select: { town_id: "1 OR 1=1" } }), /not a plain name or number/), 'a selector that is not a plain name or number THROWS (it is spliced into a query)')
const full = { id: 'own', jurisdiction: 'city', file: 'f.json' }
say(resolveFromState(full, 'parcels', ma) === full, 'a well declared in full by the town passes through untouched')

console.log('hermetic — Massachusetts DOR codes:')
const R = LAND_USE_READERS['ma-dor-numeric']
for (const [code, want] of [['1010', 'residential'], ['1020', 'residential'], ['1300', 'vacant'], ['1320', 'vacant'], ['0130', 'residential'],
  ['0310', 'commercial'], ['3010', 'commercial'], ['3430', 'commercial'], ['3900', 'vacant'], ['4010', 'industrial'], ['7100', 'agricultural'],
  ['6010', 'forest'], ['8050', 'recreation'], ['9300', 'institutional'], ['9320', 'park'], ['9590', 'institutional'], ['5040', 'unknown'], ['', 'unknown']])
  say(R(code).use === want, `USE_CODE ${JSON.stringify(code)} reads as ${want} — got ${R(code).use}`)

console.log('every declared town:')
for (const town of fs.readdirSync('cartograph/data')) {
  const p = sourcesPath(town); if (!fs.existsSync(p)) continue
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!j.state) { console.log(`  · ${town}: declares its wells in full (no state) — not judged here`); continue }
  let s; try { s = readSources(town) } catch (e) { say(false, `${town}: ${e.message.split('\n')[0]}`); continue }
  const osmP = `cartograph/data/${town}/raw/osm.json`
  if (!fs.existsSync(osmP)) { say(false, `${town}: no raw/osm.json — its state cannot be voted, so its declared ${j.state} cannot be checked`); continue }
  const v = townState(JSON.parse(fs.readFileSync(osmP, 'utf8')))
  say(v.code === j.state, `${town}: declares ${j.state}; its own map votes ${v.code} (${v.vote})`)
  for (const pw of s.parcels) {
    const fmt = pw.land_use_code_format
    const readable = fmt === 'stl-assessor-numeric' || !!LAND_USE_READERS[fmt]
    say(readable, `${town}: well ${pw.id} (${pw.fromState || 'own'}) is read by a known vocabulary — ${fmt}`)
    const f = `cartograph/data/${town}/raw/${pw.file}`
    if (fmt && LAND_USE_READERS[fmt] && fs.existsSync(f)) {
      const ps = Object.values(JSON.parse(fs.readFileSync(f, 'utf8')).parcels || {}).filter(q => q.land_use_code != null)
      const by = {}; for (const q of ps) { const u = LAND_USE_READERS[fmt](String(q.land_use_code)).use; by[u] = (by[u] || 0) + 1 }
      const un = by.unknown || 0
      console.log(`     ${pw.id}: ${ps.length} coded parcel(s) → ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
      say(un < ps.length, `${town}: ${pw.id} reads ${ps.length - un} of ${ps.length} codes (unreadable ones abstain, counted)`)
    }
  }
}
console.log(`\n${failed ? '⛔ RED' : '✅ GREEN — every town takes its wells from the state its own map votes, and every well has a vocabulary.'}`)
process.exit(failed ? 1 : 0)
