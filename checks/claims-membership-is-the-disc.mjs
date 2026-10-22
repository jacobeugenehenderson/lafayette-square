// claims-membership-is-the-disc.mjs — WHERE A TOWN HAS NO AUTHORED POLYGON, MEMBERSHIP'S "INSIDE" IS THE DISC THE GROUND IS
// STAMPED WITH: the same ring, about the same centre.
//
// ⭐ WHY (Zob's spotlight census, 2026-10-21; Boz): `neighborhood_boundary.json` is read five ways. The ground is stamped with
//   its `boundary` RING; `neighborhood-membership.mjs#makeMembership.isInside`, which decides labels, lamps and the trees' and
//   lamps' dissolve, falls back (no `polygon`) to `Math.hypot(x, z) <= R`: a circle about the ORIGIN, ignoring the file's own
//   `center`. Right only where the centre is (0, 0). LS's centre is (−15, −15) and Huron's (−46.42, −36.21): the two selectors
//   disagree by 21 m and 59 m at the rim (Layer 0 class D: a constant that happened to be right for one town).
// THE PREDICATE, read, never restated: points a hair inside and a hair outside every vertex of the RING, along the ray from the
//   file's `center` (the hair = a quarter of the ring's own mean edge, so it scales with the ring), each classified by the ring
//   itself (point-in-polygon); `isInside` must agree with the ring at every one.
//   ⚠️ RESOLUTION: the hair is the check's reach; an offset smaller than it is not seen (PTown's 0.35 m centre, under a ~33 m
//   hair, reads GREEN). The defect this exists for is tens of metres.
//   ⭐ AUTHORING IS NOT JUDGED (Layer 0 Q3): a town whose file carries a `polygon` (an authored inclusion) is said and not
//   judged, and a point inside an authored `exclusion` is skipped.
// ROWS: per town (none named = every declared town with a boundary file) — disagreements at the rim, with the worst site.
// ⭐ MUTATION TEST (`--selftest`, synthetic files in the OS temp dir): a centred ring → GREEN · the same ring moved off the
//   origin → the live isInside goes RED (the defect this check exists for) · a planted membership that reads the ring → GREEN
//   on the moved fixture (GREEN is reachable).
//   node checks/claims-membership-is-the-disc.mjs [--scene=<id>] [--selftest]
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ROOT, declaredScenes, requestedScenes, refuseUnknownFlags } from './_scenes.mjs'
import { makeMembership } from '../cartograph/neighborhood-membership.mjs'

refuseUnknownFlags(['selftest'])
const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i].x ?? r[i][0], zi = r[i].z ?? r[i][1], xj = r[j].x ?? r[j][0], zj = r[j].z ?? r[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }

/** Disagreements between `isInside` and the file's ring at the rim: { n, samples, worst, polygon } (polygon: authored, not judged). */
export function rimDisagreements(file, isInside) {
  const b = JSON.parse(readFileSync(file, 'utf8')), ring = b.boundary, c = b.center || [0, 0]
  if (Array.isArray(b.polygon) && b.polygon.length >= 3) return { polygon: true }
  const excl = (b.exclusions || []).filter(e => Array.isArray(e) && e.length >= 3)
  const L = ring.reduce((t, p, i) => t + Math.hypot(ring[(i + 1) % ring.length][0] - p[0], ring[(i + 1) % ring.length][1] - p[1]), 0) / ring.length, h = L / 4
  let n = 0, samples = 0, worst = null
  for (const [x, z] of ring) { const dx = x - c[0], dz = z - c[1], r = Math.hypot(dx, dz); if (!r) continue
    for (const s of [-h, h]) { const px = x + dx / r * s, pz = z + dz / r * s
      if (excl.some(e => pip(px, pz, e))) continue
      samples++; const truth = pip(px, pz, ring)
      if (isInside(px, pz) !== truth) { n++; const off = Math.abs(Math.hypot(px, pz) - Math.hypot(px - c[0], pz - c[1])); if (!worst || off > worst.off) worst = { at: [+px.toFixed(3), +pz.toFixed(3)], ring: truth ? 'inside' : 'outside', off: +off.toFixed(2) } } } }
  return { n, samples, worst, center: c }
}

if (process.argv.includes('--selftest')) {
  const dir = mkdtempSync(join(tmpdir(), 'membership-disc-'))
  const disc = (cx, cz, R) => Array.from({ length: 256 }, (_, k) => [cx + R * Math.cos(2 * Math.PI * k / 256), cz + R * Math.sin(2 * Math.PI * k / 256)])
  const body = (cx, cz) => JSON.stringify({ center: [cx, cz], radius: 100, boundary: disc(cx, cz, 100) })
  writeFileSync(join(dir, 'centred.json'), body(0, 0)); writeFileSync(join(dir, 'moved.json'), body(-15, -15))
  const centred = join(dir, 'centred.json'), moved = join(dir, 'moved.json')
  const live = (f) => makeMembership(f).isInside
  const ringOf = (f) => { const r = JSON.parse(readFileSync(f, 'utf8')).boundary; return (x, z) => pip(x, z, r) }
  const rows = [
    ['a centred ring: the live isInside agrees with it everywhere at the rim', rimDisagreements(centred, live(centred)).n === 0],
    ['the same ring moved to (−15, −15): the live isInside DISAGREES (the origin circle) — RED, as it must be', rimDisagreements(moved, live(moved)).n > 0],
    ['a planted membership that reads the ring agrees on the moved fixture — GREEN is reachable', rimDisagreements(moved, ringOf(moved)).n === 0],
  ]
  let bad = 0; for (const [what, ok] of rows) { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad++ }
  process.exit(bad ? 1 : 0)
}

const asked = requestedScenes(), towns = asked.length ? asked : declaredScenes()
let red = 0
for (const s of towns) {
  const f = join(ROOT, 'cartograph', 'data', s, 'neighborhood_boundary.json')
  if (!existsSync(f)) { console.log(`   ⚠️ ${s}: NOT CHECKED (no neighborhood_boundary.json)`); continue }
  const r = rimDisagreements(f, makeMembership(f).isInside)
  if (r.polygon) { console.log(`   · ${s}: membership reads its AUTHORED polygon — said, not judged (Layer 0 Q3); the ground reads the ring`); continue }
  if (r.n) red++
  console.log(`${r.n ? '⛔' : '✅'} ${s}: ${r.n} of ${r.samples} rim sample(s) where membership's isInside disagrees with the ring the ground is stamped with (centre ${r.center.join(', ')})`
    + (r.worst ? ` — worst at (${r.worst.at.join(', ')}), ${r.worst.ring} the ring; origin vs centre differ there by ${r.worst.off} m` : ''))
}
console.log(red ? `\n⛔ ${red} town(s): membership's "inside" is not the disc (neighborhood-membership.mjs#makeMembership.isInside: a circle about the origin)` : '\n✅ membership is the disc wherever no polygon is authored')
process.exit(red ? 1 : 0)
