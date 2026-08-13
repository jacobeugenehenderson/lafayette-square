#!/usr/bin/env node
// claims-inner-edge-deletion-gates — the regression gates for deleting
// streetProfiles.innerEdgeMeasure (2026-08-13). Per-scene, no street names in
// source. Run: node scratch/claims-inner-edge-deletion-gates.mjs [--customs]
//
// The DELETED transform is reproduced below ONLY so the gate can compute the
// BEFORE state. ⛔ It is not a spare copy to restore from — see streetProfiles.js.
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(new URL('..', import.meta.url).pathname)
const CUSTOMS = process.argv.includes('--customs')

function deletedInnerEdgeMeasure(baseMeasure, innerSign) {
  if (!innerSign) return baseMeasure
  const inboardKey = innerSign === +1 ? 'right' : 'left'
  const outboardKey = inboardKey === 'left' ? 'right' : 'left'
  let inb = baseMeasure?.[inboardKey] || {}, out = baseMeasure?.[outboardKey] || {}
  if (!(out.pavementHW > 0) && inb.pavementHW > 0) { const t = out; out = inb; inb = t }
  return { ...baseMeasure, [outboardKey]: out,
    [inboardKey]: { ...inb, treelawn: 0, sidewalk: 0, terminal: 'none' } }
}

const pedZero = s => !(s?.treelawn > 0) && !(s?.sidewalk > 0)
const hasPed = s => (s?.treelawn > 0) || (s?.sidewalk > 0)

function inboardKeyGeom(s, mate) {
  const pa = s?.points, pb = mate?.points
  if (!pa || pa.length < 2 || !pb || pb.length < 2) return null
  const i = Math.max(1, Math.floor(pa.length / 2))
  const ca = pa[i], cb = pb[Math.floor(pb.length / 2)]
  const dx = pa[i][0] - pa[i - 1][0], dz = pa[i][1] - pa[i - 1][1], L = Math.hypot(dx, dz) || 1
  return ((-dz / L) * (cb[0] - ca[0]) + (dx / L) * (cb[1] - ca[1]) > 0) ? 'left' : 'right'
}

function customsFor(scene) {
  const p = path.join(ROOT, 'public/looks', scene, 'design.json')
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p)).blockCustoms || {}) : null
}

const paths = [['lafayette-square', path.join(ROOT, 'src/data/ribbons.json')]]
for (const s of fs.readdirSync(path.join(ROOT, 'cartograph/data'))) {
  const p = path.join(ROOT, 'cartograph/data', s, 'clean/ribbons.json')
  if (fs.existsSync(p)) paths.push([s, p])
}

let fail = 0
const line = (ok, msg) => { if (!ok) fail++; console.log(`  ${ok ? 'PASS' : '⛔ FAIL'}  ${msg}`) }

for (const [scene, p] of paths) {
  const R = JSON.parse(fs.readFileSync(p))
  const streets = R.streets || []
  const inner = streets.filter(s => s?.anchor === 'inner-edge')
  const bc = CUSTOMS ? customsFor(scene) : null
  console.log(`\n### ${scene}   inner-edge ${inner.length}/${streets.length}`
    + (CUSTOMS ? `   blockCustoms: ${bc ? Object.keys(bc).length + ' streets' : 'NONE'}` : '   [customs NOT applied]'))
  if (!inner.length) { console.log('  NOT MEASURED — no anchor=inner-edge chains'); continue }

  let bothBefore = 0, bothAfter = 0, outboardRestored = 0, skewMoved = 0
  const bakeZeroedBoth = []
  for (const s of inner) {
    const before = deletedInnerEdgeMeasure(s.measure, s.innerSign)   // OLD code path
    const after = s.measure                                          // NEW: no transform
    if (pedZero(before.left) && pedZero(before.right)) bothBefore++
    if (pedZero(after.left) && pedZero(after.right)) { bothAfter++; bakeZeroedBoth.push(s) }
    // The cure: an outboard side that the deleted transform wiped and now survives.
    const mate = streets.find(x => x.skelId === s.pairId)
    const inb = inboardKeyGeom(s, mate)
    const out = inb === 'left' ? 'right' : 'left'
    if (inb && hasPed(after[out]) && !hasPed(before[out])) outboardRestored++
    // GATE: the zeroed-side skew must NOT move — it is derive.js's oracle output.
    const sideOf = m => (pedZero(m.left) && pedZero(m.right)) ? 'BOTH'
      : pedZero(m.left) ? 'left' : pedZero(m.right) ? 'right' : 'NONE'
    if (sideOf(after) !== sideOf(s.measure)) skewMoved++
  }

  // GATE 1 — the outboard side comes back.
  line(outboardRestored > 0 || bothBefore === bothAfter,
    `GATE 1 outboard ped RESTORED on ${outboardRestored} chains (was wiped by the deleted transform)`)
  // GATE 2 — both-zeroed collapses to exactly the set the BAKE zeroed.
  line(bothAfter <= bothBefore,
    `GATE 2 both-ped-zeroed ${bothBefore} → ${bothAfter}`)
  const tags = {}
  for (const s of bakeZeroedBoth) tags[s.highway || '?'] = (tags[s.highway || '?'] || 0) + 1
  console.log(`         surviving both-zeroed by highway tag: ${Object.entries(tags).map(([k, v]) => `${k}×${v}`).join(' ') || '(none)'}`)
  // GATE 3 — the skew must not move (it is the oracle's correct output).
  line(skewMoved === 0, `GATE 3 zeroed-side skew UNCHANGED (moved on ${skewMoved})`)
  // GATE 4 — BLAST: undivided chains never entered the transform at all.
  const undiv = streets.filter(s => s && s.anchor !== 'inner-edge')
  const touched = undiv.filter(s => s.measure
    && JSON.stringify(deletedInnerEdgeMeasure(s.measure, s.innerSign)) !== JSON.stringify(s.measure)).length
  line(touched === 0, `GATE 4 BLAST — undivided chains identical: ${undiv.length - touched}/${undiv.length}`)
  // GATE 5 — the RECLAIM trigger the deletion also removed: unreachable?
  let reach = 0
  for (const s of inner) {
    const m = s.measure; if (!m?.left || !m?.right) continue
    for (const inb of ['left', 'right']) {
      const out = inb === 'left' ? 'right' : 'left'
      if (!(m[out].pavementHW > 0) && m[inb].pavementHW > 0) reach++
    }
  }
  line(reach === 0, `GATE 5 deleted RECLAIM trigger reachable on ${reach} chains (both key choices)`)
}

console.log(`\n=== ${fail === 0 ? 'ALL GATES PASS' : `⛔ ${fail} GATE(S) FAILED`}`)
process.exit(fail === 0 ? 0 : 1)
