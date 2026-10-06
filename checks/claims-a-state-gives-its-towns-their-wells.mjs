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
//   5. in resolveFromState, drop the protocol check                               → the no-protocol case
//   6. in readNycPlutoLandUse, read 07 as commercial                              → the PLUTO cases
//   7. in voteState, call a FETCHED town with no osm.json "not measured"          → the vote-state cases
//
// ⭐ THREE VERDICTS, NOT TWO (served-parity's pattern, EXTENT-DESIGN §2). A town DECLARED before its first fetch (the
// designed flow since BRIEF-nyc-adapter §3.0: write sources.json, then Extent) has no map to vote yet. That is
// ⛔ NOT MEASURED — said, counted apart, exit 2 — never a pass, and never folded into a failure. A town that HAS
// been fetched (geography.json) and still has no osm.json is RED.
//
//   node checks/claims-a-state-gives-its-towns-their-wells.mjs
import fs from 'fs'
import { STATES, resolveFromState, LAND_USE_READERS, PROTOCOLS } from '../cartograph/states/index.mjs'
import { readSources, sourcesPath } from '../cartograph/sources.js'
import { townState } from '../src/cartograph/streetProfiles.js'

let failed = false, notMeasured = 0
// Whether a declared town's state can be voted: by its OWN map (raw/osm.json). Fetched = geography.json exists.
export function voteState({ fetched, hasOsm }) {
  if (hasOsm) return 'vote'
  return fetched ? 'red' : 'not-measured'
}
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
const ny = resolveFromState({ from: 'state', id: 'nyc-mappluto' }, 'parcels', { state: 'NY' })
say(ny.fromState === `NY@${STATES.NY.version}` && ny.protocol === 'arcgis' && ny.file === 'nyc_parcels.json' && !ny.where,
  `an NYC town takes MapPLUTO from NY, stamped, selecting nothing (the envelope scopes a citywide layer) — got ${ny.fromState}, ${ny.protocol}, where ${JSON.stringify(ny.where)}`)
say(Object.values(STATES).every(r => ['parcels', 'addressPoints'].every(k => Object.values(r[k] || {}).every(w => PROTOCOLS.includes(w.protocol)))),
  'every state well declares its protocol')
STATES.ZZTEST = { code: 'ZZTEST', version: 0, parcels: { bare: { file: 'x.json' }, odd: { file: 'x.json', protocol: 'ftp' } } }
say(throws(() => resolveFromState({ from: 'state', id: 'bare' }, 'parcels', { state: 'ZZTEST' }), /must declare one of/), 'a state well with NO protocol THROWS')
say(throws(() => resolveFromState({ from: 'state', id: 'odd' }, 'parcels', { state: 'ZZTEST' }), /must declare one of/), 'a state well with an unknown protocol THROWS')
delete STATES.ZZTEST
const full = { id: 'own', jurisdiction: 'city', file: 'f.json' }
say(resolveFromState(full, 'parcels', ma) === full, 'a well declared in full by the town passes through untouched')

console.log('hermetic — Massachusetts DOR codes:')
const R = LAND_USE_READERS['ma-dor-numeric']
for (const [code, want] of [['1010', 'residential'], ['1020', 'residential'], ['1300', 'vacant'], ['1320', 'vacant'], ['0130', 'residential'],
  ['0310', 'commercial'], ['3010', 'commercial'], ['3430', 'commercial'], ['3900', 'vacant'], ['4010', 'industrial'], ['7100', 'agricultural'],
  ['6010', 'forest'], ['8050', 'recreation'], ['9300', 'institutional'], ['9320', 'park'], ['9590', 'institutional'], ['5040', 'unknown'], ['', 'unknown']])
  say(R(code).use === want, `USE_CODE ${JSON.stringify(code)} reads as ${want} — got ${R(code).use}`)

console.log('hermetic — NYC PLUTO LandUse:')
const P = LAND_USE_READERS['nyc-pluto-landuse']
for (const [code, want] of [['01', 'residential'], ['02', 'residential'], ['03', 'residential'], ['04', 'residential'], ['05', 'commercial'],
  ['06', 'industrial'], ['07', 'industrial'], ['08', 'institutional'], ['09', 'recreation'], ['10', 'parking'], ['11', 'vacant'],
  ['12', 'unknown'], ['', 'unknown'], [null, 'unknown'], ['R6', 'unknown']])
  say(P(code).use === want, `LandUse ${JSON.stringify(code)} reads as ${want} — got ${P(code).use}`)

console.log('hermetic — the three verdicts of a declared town:')
say(voteState({ fetched: false, hasOsm: false }) === 'not-measured', 'declared, never fetched → NOT MEASURED (the vote is owed at first fetch)')
say(voteState({ fetched: true, hasOsm: false }) === 'red', 'fetched, but no osm.json → RED, never "not measured"')
say(voteState({ fetched: true, hasOsm: true }) === 'vote', 'fetched with its map → voted')

console.log('every declared town:')
for (const town of fs.readdirSync('cartograph/data')) {
  const p = sourcesPath(town); if (!fs.existsSync(p)) continue
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (!j.state) { console.log(`  · ${town}: declares its wells in full (no state) — not judged here`); continue }
  let s; try { s = readSources(town) } catch (e) { say(false, `${town}: ${e.message.split('\n')[0]}`); continue }
  const osmP = `cartograph/data/${town}/raw/osm.json`
  const vs = voteState({ fetched: fs.existsSync(`cartograph/data/${town}/geography.json`), hasOsm: fs.existsSync(osmP) })
  if (vs === 'not-measured') { notMeasured++; console.log(`  ⛔ NOT MEASURED: ${town} is declared (${j.state}), not yet fetched — the vote is owed at first fetch`); continue }
  if (vs === 'red') { say(false, `${town}: fetched, but no raw/osm.json — its state cannot be voted, so its declared ${j.state} cannot be checked`); continue }
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
if (failed) { console.log('\n⛔ RED'); process.exit(1) }
if (notMeasured) { console.log(`\n⛔ NOT MEASURED — ${notMeasured} declared town(s) not yet fetched; everything else passed. Not a pass.`); process.exit(2) }
console.log('\n✅ GREEN — every town takes its wells from the state its own map votes, and every well has a vocabulary.')
process.exit(0)
