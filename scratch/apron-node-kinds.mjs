#!/usr/bin/env node
/**
 * APRON FORENSIC part 4 — RE-KEY THE CENSUS BY GEOMETRIC DEGREE.
 *
 * ⛔ The morning census counted `legs.length`. A leg with end:'through' is ONE
 * chain passing THROUGH the node = TWO arms. So legs.length is not the degree:
 * legs=[through] is a degree-2 mid-chain vertex, legs=[through,end] is a T
 * (degree 3), legs=[through,through] is a cross (degree 4). This re-derives the
 * table against the geometric degree tileGround itself computes (nodeDeg:
 * endpoints count 1, interior vertices count 2), so "which node-kind is bare"
 * is answered in the terms the code uses.
 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json'), 'utf8'))
const streets = (ribbons.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const key = p => p[0].toFixed(2) + ',' + p[1].toFixed(2)
const nodeDeg = new Map()
for (const s of streets) for (let i = 0; i < s.points.length; i++) {
  const k = key(s.points[i]); nodeDeg.set(k, (nodeDeg.get(k) || 0) + ((i === 0 || i === s.points.length - 1) ? 1 : 2))
}
const nodes = ribbons.junctionMap?.nodes || []
const tab = new Map()
for (const n of nodes) {
  const deg = nodeDeg.get(key(n.at))
  const legs = (n.legs || []).length
  const thru = (n.legs || []).filter(l => l.end === 'through').length
  const any = !!(n.continuity?.length || n.deTaper?.length || n.apron)
  const tipOnly = !!(n.continuity?.length && n.continuity.every(p => p.source === 'tip-wrap') && !n.apron && !n.deTaper?.length)
  const k = `deg ${deg === undefined ? '??' : String(deg).padStart(2)} | legs ${legs} (${thru} through)`
  const r = tab.get(k) || { n: 0, any: 0, apron: 0, cont: 0, taper: 0, tipOnly: 0 }
  r.n++; if (any) r.any++; if (n.apron) r.apron++; if (n.continuity?.length) r.cont++
  if (n.deTaper?.length) r.taper++; if (tipOnly) r.tipOnly++
  tab.set(k, r)
}
console.log(`junctionMap nodes ${nodes.length} — by GEOMETRIC degree (not legs.length)\n`)
console.log(`  ${'node shape'.padEnd(30)} | nodes | anySpec | apron | cont | taper | tip-wrap-ONLY (a no-op at :2992)`)
for (const k of [...tab.keys()].sort()) {
  const r = tab.get(k)
  console.log(`  ${k.padEnd(30)} | ${String(r.n).padStart(5)} | ${String(r.any).padStart(7)} | ${String(r.apron).padStart(5)} | ${String(r.cont).padStart(4)} | ${String(r.taper).padStart(5)} | ${String(r.tipOnly).padStart(5)}`)
}
// bare = the :3548 filter's FALSE branch → owned by the THRU pass (deg>=3 only)
const bare = nodes.filter(n => !(n.continuity?.length || n.deTaper?.length || n.apron))
const bareByDeg = new Map()
for (const n of bare) { const d = nodeDeg.get(key(n.at)); bareByDeg.set(d, (bareByDeg.get(d) || 0) + 1) }
console.log(`\nBARE nodes (no continuity, no deTaper, no apron): ${bare.length}`)
for (const d of [...bareByDeg.keys()].sort((a, b) => a - b)) console.log(`   degree ${d}: ${bareByDeg.get(d)}  → ${d >= 3 ? 'THRU pass eligible (:3565)' : '⛔ NEITHER pass reaches it'}`)
// and the nodes that carry a spec that is ENTIRELY a no-op
const noop = nodes.filter(n => n.continuity?.length && n.continuity.every(p => p.source === 'tip-wrap') && !n.apron && !n.deTaper?.length)
console.log(`\nNodes whose ONLY spec is tip-wrap continuity — counted as "has a spec" but skipped at :2992: ${noop.length}`)
const noopDeg = new Map(); for (const n of noop) { const d = nodeDeg.get(key(n.at)); noopDeg.set(d, (noopDeg.get(d) || 0) + 1) }
for (const d of [...noopDeg.keys()].sort((a, b) => a - b)) console.log(`   degree ${d}: ${noopDeg.get(d)}`)
console.log(`\nEFFECTIVE construction coverage = nodes reaching E3 with something to build:`)
const eff = nodes.filter(n => n.apron || n.deTaper?.length || (n.continuity || []).some(p => p.source !== 'tip-wrap'))
const effDeg = new Map(); for (const n of eff) { const d = nodeDeg.get(key(n.at)); effDeg.set(d, (effDeg.get(d) || 0) + 1) }
const allDeg = new Map(); for (const n of nodes) { const d = nodeDeg.get(key(n.at)); allDeg.set(d, (allDeg.get(d) || 0) + 1) }
for (const d of [...allDeg.keys()].sort((a, b) => a - b)) console.log(`   degree ${d}: ${(effDeg.get(d) || 0)} / ${allDeg.get(d)}`)
