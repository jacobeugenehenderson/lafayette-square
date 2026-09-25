#!/usr/bin/env node
// CLAIM — A ONE-WAY CARRIAGEWAY'S WIDE SIDE IS ON THE DRIVER'S RIGHT (H-3 check 4).
//
// The typical section is asymmetric by design: 10 ft outside (right) shoulder, 4 ft inside (left), and a
// ramp's right shoulder is the wider too. Point order is the direction of travel, and right = (−dz, dx) of
// point order (the measure convention; +z is south, so travelling east the right is south — the driver's).
// ASSERTS, on every one-way highway in the ribbons:
//   · data: every span's right half-width ≥ its left (`section.spans`);
//   · geometry: H — rebuilt with the REAL `sweepHighway` sliced from tileGround.js — reaches FARTHER on the
//     geometric right: a probe at the midpoint of the chain's longest segment, at the mean of the two
//     half-widths, is INSIDE H on the right and OUTSIDE it on the left (where the sides differ).
//
//   node checks/claims-highway-handedness.mjs [scene…] [--ribbons=path]
//
// MUTATION (must go red): swap one highway's left/right sections in a temp ribbons copy (--ribbons).
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))
const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
const a0 = src.indexOf('function highwayWidthProfile'), b0 = src.indexOf('function unionRings')
if (a0 < 0 || b0 < a0) { console.error('⛔ NOT CHECKED — sweepHighway not found in tileGround.js'); process.exit(2) }
const { sweepHighway } = await import('data:text/javascript,' + encodeURIComponent(src.slice(a0, b0) + '\nexport { sweepHighway }'))
const DEFAULT_MAP = readFileSync(join(ROOT, 'cartograph/scene.js'), 'utf8').match(/export const DEFAULT_MAP = '([^']+)'/)?.[1]
const ribbonsOf = (s) => s === DEFAULT_MAP ? join(ROOT, 'src/data/ribbons.json') : join(ROOT, 'cartograph/data', s, 'clean/ribbons.json')
const H = /^(motorway|motorway_link|trunk|trunk_link)$/
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
let red = false
for (const scene of (arg('ribbons') ? named : scenes('cartograph/data/<scene>/raw/osm.json'))) {
  const p = arg('ribbons') || ribbonsOf(scene)
  if (!existsSync(p)) { console.log(`── ${scene}   ⛔ NOT CHECKED — no ribbons`); red = true; continue }
  const hw = JSON.parse(readFileSync(p, 'utf8')).streets.filter(s => s.gradeSeparated && H.test(s.highway) && s.oneway)
  const withSec = hw.filter(s => s.measure?.left?.section?.taper && s.measure?.right?.section?.taper)
  if (!withSec.length) { console.log(`── ${scene}   ${hw.length ? '⛔ NOT CHECKED — highways carry no section (poured before H-3)' : 'no one-way highway'}`); if (hw.length) red = true; continue }
  const bad = []; let probed = 0
  for (const s of withSec) {
    const L = s.measure.left.section, R = s.measure.right.section
    L.spans.forEach((sp, i) => { if (R.spans[i] && R.spans[i].hw < sp.hw - 1e-6) bad.push(`${s.skelId} span ${i}: right ${R.spans[i].hw} < left ${sp.hw}`) })
    const sw = sweepHighway(s.points, L, R); if (!sw) continue
    // the longest segment's midpoint, away from the ends and their tapers
    const P = s.points.map(q => Array.isArray(q) ? q : [q.x, q.z]); let best = -1, bi = 0
    for (let i = 0; i + 1 < P.length; i++) { const d = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (d > best) { best = d; bi = i } }
    const [a, b] = [P[bi], P[bi + 1]], ux = (b[0] - a[0]) / best, uz = (b[1] - a[1]) / best, nx = -uz, nz = ux
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2
    // the widths AT THE PROBE'S STATION (its own lane span), and never inside a taper window or an end handoff
    let st = 0; for (let i = 0; i < bi; i++) st += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); st += best / 2
    let tot = st; for (let i = bi; i + 1 < P.length; i++) tot += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); tot -= best / 2
    const at = (sec) => { const sc = sec.length > 0 ? tot / sec.length : 1; const sp = sec.spans.find(x => st >= x.s0 * sc - 1e-6 && st <= (x.s1 ?? sec.length) * sc + 1e-6) || sec.spans[0]
      const margin = sec.taper.rate * 12; const edges = sec.spans.flatMap(x => [x.s0 * sc, (x.s1 ?? sec.length) * sc])
      return { hw: sp.hw, nearStep: edges.some(e => Math.abs(e - st) < margin) } }
    const lo = at(L), ro = at(R)
    if (lo.nearStep || ro.nearStep) continue                               // a taper can make the sides momentarily equal
    const wl = lo.hw, wr = ro.hw
    if (!(wr - wl > 0.05)) continue                                       // symmetric here: nothing to tell apart
    const d = (wl + wr) / 2
    const right = pip(mx + nx * d, mz + nz * d, sw.ring), left = pip(mx - nx * d, mz - nz * d, sw.ring)
    probed++
    if (!right || left) bad.push(`${s.skelId}: the wider side is ${left && !right ? 'on the LEFT' : 'not where the section says'} (probe at ${d.toFixed(2)} m: right ${right ? 'in' : 'out'}, left ${left ? 'in' : 'out'})`)
  }
  console.log(`── ${scene} ── ${withSec.length} one-way highway(s), ${probed} probed for side ${bad.length ? '⛔' : '✅'}`)
  for (const b of bad.slice(0, 8)) console.log(`   ⛔ ${b}`)
  if (bad.length) red = true
}
console.log(red ? '\n⛔ A one-way highway is wider on the wrong side.' : '\n✅ Every one-way highway is wider on the driver\'s right.')
process.exit(red ? 1 : 0)
