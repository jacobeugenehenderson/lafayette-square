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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const R = (...p) => join(ROOT, ...p)
const kb = (f) => existsSync(f) ? Math.round(statSync(f).size / 1024) + 'K' : '—'

const SCENES = ['lafayette-square', 'hipointe-demun', 'altadena', 'ksi-y-m-yn', 'centrum']

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

function namespaceOf(scene) {
  const f = R('public/baked', scene, 'buildings.json')
  if (!existsSync(f)) return { ns: '—', n: 0 }
  try {
    const o = JSON.parse(readFileSync(f, 'utf8'))
    const arr = Array.isArray(o) ? o : (o.buildings || Object.values(o))
    const ids = arr.map(x => x && x.id).filter(Boolean)
    const pre = {}
    for (const i of ids) { const p = String(i).replace(/\d.*$/, ''); pre[p] = (pre[p] || 0) + 1 }
    const ns = Object.keys(pre).sort((a, b) => pre[b] - pre[a])[0] || '—'
    return { ns, n: ids.length }
  } catch { return { ns: '?', n: 0 } }
}

// A stable namespace is one minted from an EXTERNAL key, not the fetch index.
// bldg- : dead ingest path, nothing in cartograph/*.js mints it (excavation §0.8)
// msbf- / osm- : minted as `msbfId: i` = fetch ARRAY INDEX → re-fetch renumbers
const NS_STATUS = {
  'bldg-': 'DEAD — from an ingest path that no longer exists; nothing re-mints it',
  'msbf-': 'UNSTABLE — id = fetch array index; a re-fetch renumbers every anchor',
  'osm-':  'UNSTABLE — id = fetch array index; a re-fetch renumbers every anchor',
}

console.log('\n═══ SERVED-PARITY — is every scene the same, built by the one kit? ═══\n')

// ── PART 1: per-scene served parity ────────────────────────────────────────
console.log('PART 1 — per-scene SERVED artifacts (clean/<scene>/) + identity\n')
const rows = []
for (const s of SCENES) {
  const clean = R('cartograph/data', s, 'clean')
  const has = (a) => existsSync(join(clean, a))
  const { ns, n } = namespaceOf(s)
  const poured = has('ribbons.json')            // the pipeline emits ribbons; no ribbons = never poured
  rows.push({ s, ns, n, poured,
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
console.log('\n\nPART 3 — WORKLIST (what must change so every scene is the same)\n')
for (const r of rows) {
  const items = []
  if (!r.poured) items.push(`POUR through the one path → emit clean/${r.s}/ribbons.json (today: MISSING → not served)`)
  const nsNote = NS_STATUS[r.ns]
  if (nsNote) items.push(`identity ${r.ns} : ${nsNote}`)
  if (!items.length) { console.log(`  ${r.s}: ✅ same as the kit`); continue }
  console.log(`  ${r.s}:`)
  for (const it of items) console.log(`     • ${it}`)
}
if (bleedCount) {
  console.log(`\n  ALL SCENES: retire the ${bleedCount} src/data/* name-imports → per-scene served path`)
  console.log(`     (this closes the entire LS-bleed class at the root, not site-by-site)`)
}
console.log('')
