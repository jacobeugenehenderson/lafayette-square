// A16 · Is the panel's material-toggle write an IDENTITY for the FILL?
// Run: node scratch/a16-write-site-identity.mjs
//
// READ-ONLY. Instrument: the FROZEN shape artifact (public/baked/<scene>/shape.json)
// — the same surface Section renders off — re-stroked through sectionPassTile
// twice: with blockCustoms = {} (pre-write) and with the operator's actual blob
// (post-write, lifted from public/looks/<scene>/design.json). Geometry is
// compared, not counts.
//
// Also sizes the question "does a seed-survey measured ped depth reach the FILL
// on ANY run-side?" by reading resolvePedDepths' contract directly.

import { readFileSync } from 'fs'
import { sectionPassTile, resolvePedDepths } from '../src/lib/tileGround.js'

const SCENE = process.argv[2] || 'lafayette-square'
const ROOT = process.cwd()
const shape = JSON.parse(readFileSync(`${ROOT}/public/baked/${SCENE}/shape.json`, 'utf-8'))
const design = JSON.parse(readFileSync(`${ROOT}/public/looks/${SCENE}/design.json`, 'utf-8'))
const map = JSON.parse(readFileSync(`${ROOT}/cartograph/data/${SCENE}/clean/map.json`, 'utf-8'))

const CW = design.curbWidth ?? 0.381
const STRIP = { outer: 'LU', inner: 'SW' }

// ── The write under test: every slot the operator's working tree holds that is
// NOT in HEAD's design.json. Derived, not hardcoded, so this probe reads the
// source rather than restating it.
const bcNow = design.blockCustoms || {}
const TARGET = { skelId: 'dolman-street-1', side: 'left', segOrd: '4' }
const blob = bcNow[TARGET.skelId]?.[TARGET.side]?.[TARGET.segOrd]
if (!blob) { console.error(`no custom at ${TARGET.skelId}/${TARGET.side}/${TARGET.segOrd}`); process.exit(1) }

const bcAfter = { [TARGET.skelId]: { [TARGET.side]: { [TARGET.segOrd]: blob } } }
const bcBefore = {}

console.log('── the write ──')
console.log(' ', JSON.stringify(blob))
const st = (map.layers.ribbons.streets || []).find(s => s.skelId === TARGET.skelId)
console.log('  frame measure[' + TARGET.side + ']:', JSON.stringify(st?.measure?.[TARGET.side]), 'source=', st?.measure?.source)

console.log('\n── resolvePedDepths, before vs after (the one-depth-truth) ──')
const before = resolvePedDepths(st.measure, TARGET.side, null)
const after = resolvePedDepths(st.measure, TARGET.side, blob)
console.log('  before (custom=null):', JSON.stringify(before))
console.log('  after  (custom=blob):', JSON.stringify(after))
console.log('  IDENTITY:', JSON.stringify(before) === JSON.stringify(after))

// ── the FILL, re-stroked over every tile that owns this run-side ──
const key = (g) => JSON.stringify(g, (k, v) => typeof v === 'number' ? +v.toFixed(6) : v)
let touched = 0, changed = 0
for (const [ti, tile] of shape.tiles.entries()) {
  const owns = (tile.runs || []).some(r => r.skelId === TARGET.skelId && r.side === TARGET.side && String(r.segOrd) === TARGET.segOrd)
  if (!owns) continue
  touched++
  const a = sectionPassTile(tile, CW, STRIP, bcBefore)
  const b = sectionPassTile(tile, CW, STRIP, bcAfter)
  const same = key(a) === key(b)
  if (!same) changed++
  console.log(`\n  tile[${ti}] FILL byte-identical: ${same}`)
  if (!same) {
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
      if (key(a?.[k]) !== key(b?.[k])) console.log(`    differs: ${k}`)
    }
  }
}
console.log(`\n  tiles owning the run-side: ${touched} · FILL changed on: ${changed}`)

// ── Q3 · does ANY seed-survey measured ped depth reach the FILL? ──
// resolvePedDepths ignores baseMeasure for tl/sw entirely; it reads it only for
// the gleaned Y/N boolean. Prove it over every run-side in the frozen artifact.
let sides = 0, seedSurvey = 0, depthReaches = 0, nonAdaMeasure = 0
const seenRun = new Set()
const byName = new Map((map.layers.ribbons.streets || []).map(s => [s.skelId, s]))
for (const tile of shape.tiles) {
  for (const r of (tile.runs || [])) {
    const rk = `${r.skelId}|${r.side}|${r.segOrd}`
    if (seenRun.has(rk)) continue
    seenRun.add(rk); sides++
    const src = byName.get(r.skelId)?.measure?.source
    if (src === 'seed-survey') seedSurvey++
    const sd = r.baseMeasure?.[r.side] || byName.get(r.skelId)?.measure?.[r.side]
    if (!sd) continue
    const d = resolvePedDepths(byName.get(r.skelId)?.measure || {}, r.side, null)
    const measured = { tl: +(sd.treelawn || 0), sw: +(sd.sidewalk || 0) }
    if (Math.abs(measured.tl - d.tl) > 1e-6 || Math.abs(measured.sw - d.sw) > 1e-6) nonAdaMeasure++
    if (Math.abs(measured.tl - d.tl) < 1e-9 && Math.abs(measured.sw - d.sw) < 1e-9) depthReaches++
  }
}
console.log('\n── Q3 · measured ped depth vs what the FILL strokes (un-authored default) ──')
console.log(`  distinct run-sides in the frozen artifact: ${sides}`)
console.log(`  ...whose street measure is source:'seed-survey': ${seedSurvey}`)
console.log(`  ...where the FILL's resolved (tl,sw) EQUALS the measured (treelawn,sidewalk): ${depthReaches}`)
console.log(`  ...where they DIFFER (the measure never renders): ${nonAdaMeasure}`)
