#!/usr/bin/env node
// served-parity.mjs — THE SAMENESS DETECTOR.
//
// One question: is every scene built by the ONE kit and SERVED the same way,
// or is it a special case? A scene is "the same" iff:
//   (1) its render geometry is SERVED from cartograph/data/<scene>/clean/ (poured),
//       not statically imported from the shared src/data/* root;
//   (2) it carries a stable, locked building-id namespace (not a fetch-index that
//       a re-fetch renumbers, and not a dead ingest namespace nothing mints);
//   (3) nothing an absent input can fall back to resolves to another install's data.
//
// LS is the progenitor: src/data/* IS Lafayette Square, so today src/data/* is
// BOTH "the shared default" AND "LS's own render data" — that conflation is the
// root the whole LS-bleed class grows from. This script measures it, per scene,
// and prints a WORKLIST. Zero-risk: reads only. Gate for §0.6 conform + the
// BRIEF-ls-bleed-excision §6.4 regression guard.
//
// Run: node scratch/served-parity.mjs

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { declaredScenes } from '../checks/_scenes.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const R = (...p) => join(ROOT, ...p)
const kb = (f) => existsSync(f) ? Math.round(statSync(f).size / 1024) + 'K' : '—'

// ⛔ NOT A TYPED ROSTER. The towns are whatever `public/looks/index.json` declares — the same
//    SSoT every check uses (`checks/_scenes.mjs`, `39aac128`: "45 checks carried a typed scene
//    roster, which is a skip list nobody called one"). This file carried its own copy of that
//    skip list until 2026-09-19, which is why two retired towns kept appearing in the worklist
//    and why a town poured after the list was typed would never have appeared at all.
// ⭐ DECLARED, not measurable: "declared but not poured" is precisely what this detector reports,
//    so it must enumerate what the product CLAIMS, then measure each claim.
const SCENES = declaredScenes()

// The render-critical shared defaults: files at src/data/*.json that a consumer
// can NAME-import, so an absent scene renders LS's version of them.
const SHARED_DEFAULTS = [
  'ribbons.json', 'buildings.json', 'street_lamps.json', 'streets.json',
  'block_shapes.json', 'blocks_clean.json', 'blocks.json', 'landmarks.json',
  'facade_mapping.json', 'park-feature-elev.json', 'ground_layers.json',
]

function nameImporters(basename) {
  // static `import x from '.../data/<base>'` OR `'.../data/<base>.json'` — the
  // hardwires. buildings is imported bare (a .js module); ribbons/lamps carry .json.
  const base = basename.replace('.json', '')
  try {
    const out = execSync(
      `grep -rnE "from '[^']*data/${base}(\\\\.json)?'" src 2>/dev/null || true`,
      { cwd: ROOT, encoding: 'utf8' })
    return out.trim() ? out.trim().split('\n') : []
  } catch { return [] }
}

// ⛔ ABSENCE IS NOT AN ANSWER. Every return says whether the namespace was MEASURED. Until
//    2026-09-19 a missing artifact returned the same shape as a real reading (`ns: '—'`), the
//    caller looked '—' up in NS_STATUS, found nothing, added no worklist item, and printed
//    "✅ same as the kit". A scene nobody had baked was certified identical to the kit — Layer 0
//    question 2 committed inside the detector that is supposed to catch it.
function namespaceOf(scene) {
  const f = R('public/baked', scene, 'buildings.json')
  const rel = `public/baked/${scene}/buildings.json`
  if (!existsSync(f)) return { ns: '—', n: 0, measured: false, why: `no ${rel} — never baked` }
  try {
    const o = JSON.parse(readFileSync(f, 'utf8'))
    const arr = Array.isArray(o) ? o : (o.buildings || Object.values(o))
    const ids = arr.map(x => x && x.id).filter(Boolean)
    if (!ids.length) return { ns: '—', n: 0, measured: false, why: `${rel} carries no building ids` }
    const pre = {}
    for (const i of ids) { const p = String(i).replace(/\d.*$/, ''); pre[p] = (pre[p] || 0) + 1 }
    const ns = Object.keys(pre).sort((a, b) => pre[b] - pre[a])[0]
    return { ns, n: ids.length, measured: true }
  } catch (e) { return { ns: '?', n: 0, measured: false, why: `${rel} unreadable — ${e.message}` } }
}

// A stable namespace is one minted from an EXTERNAL key, not the fetch index.
//
// ⚠️ CORRECTED 2026-08-02 — this table called msbf- UNSTABLE after the lock had
// already landed, i.e. the checker was reporting a fixed defect as live. A
// checker that lies is worse than no checker: re-verify before trusting a row.
// Verified per-namespace on trunk this date:
//   bldg- : still dead — nothing in cartograph/*.js mints it (excavation §0.8)
//   msbf- : LOCKED — fetch-msbf.js:179 consults a per-scene registry via
//           assignIds/loadRegistry (cartograph/msbf-identity.js); an existing
//           footprint keeps its PERMANENT id, an unseen one appends at
//           highWater+1, "nothing is renumbered". Affects altadena, hipointe-demun.
//   osm-  : STABLE NATIVELY — needs no registry. `fetch.js:156` sets
//           `osmId: way.id`, i.e. OSM's own PERMANENT way id, which is exactly
//           the "external key, not the fetch index" criterion above. Verified
//           2026-08-04 against live data: ksi-y-m-yn / centrum ids are
//           39524935, 76277579, 89901592 … — OSM way ids, not 0,1,2,3.
//           ⛔ DO NOT "port the registry to the OSM path" — there is nothing to
//           fix. msbf- needs a registry only because Microsoft's footprint
//           dataset ships no per-building id; OSM already has one.
//
// ⚠️⚠️ THIS TABLE HAS NOW BEEN WRONG IN BOTH DIRECTIONS. It called msbf-
// UNSTABLE after the lock landed (reporting a fixed defect as live), and on
// 2026-08-04 a correction pass flipped osm- to UNSTABLE on the assumption that
// "no registry ⇒ no lock" — inventing maintenance work for scenes nobody is
// returning to. ⭐ THE LESSON: check what the id actually IS before grading the
// namespace. A checker that lies is worse than no checker, and an OVER-
// correction is as costly as the rot it replaces.
const NS_STATUS = {
  'bldg-': 'DEAD — from an ingest path that no longer exists; nothing re-mints it',
  'msbf-': 'LOCKED — per-scene registry + high-water (fetch-msbf.js:179); nothing renumbered',
  'osm-':  "STABLE — id is OSM's own permanent way id (fetch.js:156); no registry needed",
}

console.log('\n═══ SERVED-PARITY — is every scene the same, built by the one kit? ═══\n')

// ── PART 1: per-scene served parity ────────────────────────────────────────
console.log('PART 1 — per-scene SERVED artifacts (clean/<scene>/) + identity\n')
const rows = []
for (const s of SCENES) {
  const clean = R('cartograph/data', s, 'clean')
  const has = (a) => existsSync(join(clean, a))
  const { ns, n, measured, why } = namespaceOf(s)
  const poured = has('ribbons.json')            // the pipeline emits ribbons; no ribbons = never poured
  rows.push({ s, ns, n, nsMeasured: measured, nsWhy: why, poured,
    skeleton: has('skeleton.json') ? kb(join(clean, 'skeleton.json')) : 'MISSING',
    ribbons:  has('ribbons.json')  ? kb(join(clean, 'ribbons.json'))  : 'MISSING',
    map:      has('map.json')      ? kb(join(clean, 'map.json'))      : 'MISSING',
    slab:     existsSync(R('public/baked', s, 'scene.json')) ? 'yes' : 'no',
  })
}
const pad = (v, w) => String(v).padEnd(w)
console.log(pad('scene', 18), pad('ns', 7), pad('skeleton', 9), pad('ribbons', 9), pad('map', 7), pad('slab', 5), 'SERVED?')
for (const r of rows) {
  const served = r.poured ? 'served from clean/' : '⛔ NOT poured — no clean/ribbons'
  console.log(pad(r.s, 18), pad(r.ns, 7), pad(r.skeleton, 9), pad(r.ribbons, 9), pad(r.map, 7), pad(r.slab, 5), served)
}

// ── PART 2: the shared-default bleed surface (LS-as-default) ────────────────
console.log('\n\nPART 2 — the shared-default BLEED surface (src/data/* name-imported)\n')
console.log('Each file below IS Lafayette Square. A NAME-import means any absent scene')
console.log('renders LS\'s version of it. This is why LS "isn\'t a scene" — it\'s the fallback.\n')
let bleedCount = 0
for (const f of SHARED_DEFAULTS) {
  const path = R('src/data', f)
  if (!existsSync(path)) continue
  const importers = nameImporters(f)
  if (!importers.length) continue
  bleedCount += importers.length
  console.log(`  src/data/${f}  (${kb(path)})  ← ${importers.length} hardwired importer(s):`)
  for (const line of importers) console.log('      ' + line.replace(ROOT + '/', ''))
}
if (!bleedCount) console.log('  (none — every consumer reads a per-scene served path) ✅')

// ── PART 3: the worklist ────────────────────────────────────────────────────
//
// ⛔⛔ THREE VERDICTS, NEVER TWO. A scene is SAME, or it has WORK, or IT COULD NOT BE MEASURED —
//    and the third may never be folded into the first. Before 2026-09-19 this loop had two
//    verdicts: it collected worklist items and, finding none, printed "✅ same as the kit". Every
//    way of learning NOTHING produced that green:
//      • no `public/baked/<scene>/buildings.json`  → ns '—' → not in NS_STATUS → no item → green
//      • an unreadable buildings.json              → ns '?' → not in NS_STATUS → no item → green
//      • a namespace nobody has graded             → not in NS_STATUS → no item → green
//      • no slab at all                            → measured, PRINTED in part 1, never consulted
//    Two retired towns sat at the bottom of this worklist reading "✅ same as the kit" with their
//    namespace shown as '—' and their slab shown as 'no' three columns to the left.
//
// ⭐ WHY THIS OUTLIVES THOSE TWO TOWNS, AND IS THE REASON THE FIX CAME BEFORE THE DELETION: a town
//    that has been poured but not yet baked presents to this detector EXACTLY as they did — no
//    namespace, no slab. Deleting the rows would have removed the evidence and left the mechanism
//    armed for the next town. The green was not about those towns; they were just the ones
//    standing in front of it. `CLAUDE.md` Layer 0 q2: absence must fail loudly, and the one place
//    a silent substitution must never happen is the detector itself.
console.log('\n\nPART 3 — WORKLIST (what must change so every scene is the same)\n')
let unmeasured = 0
for (const r of rows) {
  const items = []   // measured, and it is not the same → WORK
  const blind = []   // not measured → this scene's parity is UNKNOWN, which is not a pass

  if (!r.poured) items.push(`POUR through the one path → emit clean/${r.s}/ribbons.json (today: MISSING → not served)`)

  if (!r.nsMeasured) {
    blind.push(`identity NOT MEASURED — ${r.nsWhy}`)
  } else if (NS_STATUS[r.ns]) {
    items.push(`identity ${r.ns} : ${NS_STATUS[r.ns]}`)
  } else {
    // ⛔ An ungraded namespace is not a good namespace. A new ingest path mints a new prefix and
    //    this table will not know it — the one case where staying quiet ships a wrong "same".
    blind.push(`identity NOT GRADED — namespace "${r.ns}" (${r.n} ids) appears in no status table. Grade it in NS_STATUS.`)
  }

  if (r.slab !== 'yes') blind.push(`NO SLAB — public/baked/${r.s}/scene.json is absent; nothing served to the renderer was measured`)

  if (blind.length) {
    unmeasured++
    console.log(`  ${r.s}: ⛔ NOT MEASURED — parity UNKNOWN. This is not a pass.`)
    for (const b of blind) console.log(`     ⛔ ${b}`)
    for (const it of items) console.log(`     • ${it}`)
    continue
  }
  if (!items.length) { console.log(`  ${r.s}: ✅ same as the kit`); continue }
  console.log(`  ${r.s}:`)
  for (const it of items) console.log(`     • ${it}`)
}
if (bleedCount) {
  console.log(`\n  ALL SCENES: retire the ${bleedCount} src/data/* name-imports → per-scene served path`)
  console.log(`     (this closes the entire LS-bleed class at the root, not site-by-site)`)
}
console.log('')

// ⛔ EXIT 2 = COULD NOT MEASURE, the corpus convention (`checks/_scenes.mjs`,
//    `claims-onboarding-guard.sh`: "Exit 2 = could not run"). `EXTENT-DESIGN §2` names this script
//    as the DONE gate for the whole kit, so a run that could not see some scenes must not leave a
//    zero exit behind for a runner to read as "the kit is finished".
if (unmeasured) {
  console.log(`⛔ ${unmeasured} scene(s) COULD NOT BE MEASURED. Parity is unknown for them — not confirmed.`)
  console.log(`   Bake them (public/baked/ is gitignored, so a fresh clone lands here) or retire them.\n`)
  process.exit(2)
}
