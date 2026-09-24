#!/usr/bin/env node
// CLAIM — REFINEMENT DOES NOT BREED SLIVERS PAST WHAT A GROUP'S OWN AREA CAN NEED (F2/F3, 2026-09-24).
//
// Red-green refinement quarters a triangle into four of the same shape, so a SLIVER (an earcut fan of a
// huge polygon) stays a sliver until its longest edge is under the policy's cap — Provincetown's bay, one
// 157 km² face, went 30,643 → 10.3M triangles, 9.0M of them slivers, and broke the conformity pass.
// THE BOUND IS DERIVED, never a literal: a group cannot NEED more triangles than an equilateral mesh of its
// own AREA at the finest edge its own policy allows —
//   N = areaM2 / (√3/4 · e²)        what the AREA can need, e = the policy's minEdge (adaptive) or maxEdge
//                                   (uniform); 0 for refine 'none'
//     + sliversTriangulated         what its own triangulation already had
//     + 2 · boundaryVerts           what the seam-closing fans can add: each closure vertex on the group's
//                                   boundary splits one triangle into a fan, at most two new slivers —
//                                   this grows with PERIMETER, never with area.
// ASSERTS, per partition group of every baked ground (ground.json `groundShape`): slivers ≤ N.
// ⚠️ Huron's refined fills are sliver-HEAVY today (face:recreation 343k of 506k) yet under N — the real fix
// is longest-edge bisection (F1, filed), which this check will then hold to a tighter bound.
//
//   node checks/claims-ground-refinement-does-not-breed-slivers.mjs [look…] [--ground=path]
//
// MUTATION (must go red): drop the F3 gate so a no-terrain town is refined uniform/64 (Provincetown).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const EQ = Math.sqrt(3) / 4
let red = false
// An explicit --ground judges that file for the look(s) named on the command line (a scratch bake).
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
for (const look of (arg('ground') ? named : scenes('public/baked/<scene>/ground.json'))) {
  const p = arg('ground') || join(ROOT, 'public/baked', look, 'ground.json')
  if (!existsSync(p)) { console.log(`── ${look}   ⛔ NOT CHECKED — no ${p}`); red = true; continue }
  const g = JSON.parse(readFileSync(p, 'utf8')).groundShape
  if (!g) { console.log(`── ${look}   ⛔ NOT CHECKED — ground.json has no groundShape (baked before F2/F3). Re-bake.`); red = true; continue }
  const bad = [], rows = []
  for (const [k, v] of Object.entries(g.groups)) {
    const e = v.refine === 'adaptive' ? v.minEdgeM : v.refine === 'uniform' ? v.maxEdgeM : null
    const areaNeed = v.refine === 'none' ? 0 : Math.ceil((v.areaM2 || 0) / (EQ * e * e))
    const N = areaNeed + v.sliversTriangulated + 2 * v.boundaryVerts
    if (!(Number.isFinite(N))) { bad.push(`${k}: no bound derivable (refine ${v.refine}, edge ${e})`); continue }
    rows.push([k, v.slivers, N])
    if (v.slivers > N) bad.push(`${k}: ${v.slivers.toLocaleString()} slivers > ${N.toLocaleString()} (area ${(v.areaM2 / 1e6).toFixed(2)} km², ${v.refine}${e ? ' ' + e + ' m' : ''})`)
  }
  const worst = rows.sort((a, b) => b[1] / b[2] - a[1] / a[2])[0]
  console.log(`── ${look} ── ${rows.length} group(s) · worst ${worst ? `${worst[0]} ${worst[1].toLocaleString()} / ${worst[2].toLocaleString()} (${(100 * worst[1] / worst[2]).toFixed(0)}% of its bound)` : '-'} ${bad.length ? '⛔' : '✅'}`)
  for (const b of bad) console.log(`   ⛔ ${b}`)
  if (bad.length) red = true
}
console.log(red ? '\n⛔ A ground group bred slivers past what its area can need — or a ground could not be judged.' : '\n✅ No ground group breeds slivers past its own area\'s need.')
process.exit(red ? 1 : 0)
