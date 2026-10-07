#!/usr/bin/env node
/**
 * "PAST THE RIM, DOES THE WATER END WHERE THE REAL COAST DOES?" — BRIEF-the-coast-runs-on-past-the-rim.
 *
 * WHY (Jacob, 2026-10-06, Huron Hero: "the artificial extensions where the water meets land on the outside of the
 * radius circle is a hard edge"). The water past the rim was 256 pie slices, each all water or all land: a straight
 * radial edge wherever wet met dry, lake painted over land and land over lake wherever the coast bent (measured: Huron
 * 1 ray of land painted wet + 9 dry rim directions with lake behind them; Provincetown 25 + 16). Ruled (option b): past
 * the rim the water/land boundary follows the real coast to the fetched square's edge, then the coast's own heading.
 *
 * ⭐ READS THE SLAB AND THE TOWN'S OWN COAST: public/baked/<town>/{ground.json, ground.bin, outer-coast.json}, and the
 * coast rings recomputed from raw/osm.json by coastline.mjs#coastRings exactly as the bake does. Asserts per town:
 *   1. THE SEAM — in 512 directions round the rim, the baked water just inside it (the body mesh) and the outer water
 *      just outside it agree: no gap, no overlap. Directions within one sector of a coast crossing the rim are exempt.
 *   2. THE REAL COAST — inside the fetched square, past the rim, wherever the outer water and the real coast disagree,
 *      the disagreement lies within one sector's width (2πr/256) of the real shore.
 *   3. A CLOSED BODY (synthetic: a lake wholly inside the square, cut by the rim) ends at its own shore — never run on.
 *   4. THE FEATHER past each exit is the coast's OWN uncertainty: its angle equals the length-weighted heading spread
 *      over the coast's last town-radius (outer-coast.mjs#headingSpread), bounded only by the square's edge — no constant.
 * ⭐ Each is proven against a BAD CONTROL in the same run: the old pie-slice construction must FAIL 1–2, and an
 *    outerCoast that runs every ring on must FAIL 3 — a check seen only green proves nothing.
 *
 *   node checks/claims-the-coast-runs-on-past-the-rim.mjs [--town=huron,provincetown]
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1] ?? d
const { coastRings } = await import(join(ROOT, 'cartograph/coastline.mjs'))
const { outerCoast, headingSpread } = await import(join(ROOT, 'cartograph/outer-coast.mjs'))
const { isWaterGroupId } = await import(join(ROOT, 'src/components/waterMaterial.js'))
const { horizonFor } = await import(join(ROOT, 'src/lib/horizonReach.js'))

let failed = 0
const check = (ok, what, detail = '') => { console.log(`  ${ok ? '✅ pass' : '❌ FAIL'}  ${what}${!ok && detail ? `\n           ${detail}` : ''}`); if (!ok) failed++ }
const inRing = (x, z, r) => { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) o = !o } return o }
const inPolys = (x, z, polys) => polys.some((p) => inRing(x, z, p.outer) && !p.holes.some((h) => inRing(x, z, h)))
const segDist = (x, z, r) => { let best = Infinity; for (let i = 0; i < r.length; i++) { const [ax, az] = r[i], [bx, bz] = r[(i + 1) % r.length], ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)); best = Math.min(best, Math.hypot(ax + ex * t - x, az + ez * t - z)) } return best }
const SECTORS = 256, SEAM = 512

// The old construction, as a bad control: every wet rim sector run radially to fadeOuter.
function pieSlices(wetAt, cx, cz, R) {
  const outer = horizonFor(R).fadeOuter, polys = []
  for (let k = 0; k < SECTORS; k++) { const a0 = k / SECTORS * Math.PI * 2, a1 = (k + 1) / SECTORS * Math.PI * 2
    if (!wetAt((a0 + a1) / 2)) continue
    polys.push({ outer: [[cx + Math.cos(a0) * R, cz + Math.sin(a0) * R], [cx + Math.cos(a1) * R, cz + Math.sin(a1) * R], [cx + Math.cos(a1) * outer, cz + Math.sin(a1) * outer], [cx + Math.cos(a0) * outer, cz + Math.sin(a0) * outer]], holes: [] }) }
  return polys
}

function judge(name, polys, { wetAt, rings, bb, cx, cz, R, quiet }) {
  // 1. the seam
  let seamBad = 0
  const wetIn = Array.from({ length: SEAM }, (_, k) => !!wetAt((k + 0.5) / SEAM * Math.PI * 2))
  for (let k = 0; k < SEAM; k++) {
    const a = (k + 0.5) / SEAM * Math.PI * 2
    const near = [-2, -1, 1, 2].some((d) => wetIn[(k + d + SEAM) % SEAM] !== wetIn[k])   // a coast crossing the rim here
    if (near) continue
    if (wetIn[k] !== inPolys(cx + Math.cos(a) * R * 1.005, cz + Math.sin(a) * R * 1.005, polys)) seamBad++
  }
  // 2. the real coast inside the square, past the rim
  let coastBad = 0, worst = 0, n = 0
  const STEP = Math.max(20, (bb.x1 - bb.x0) / 220)
  for (let x = bb.x0 + STEP / 2; x < bb.x1; x += STEP) for (let z = bb.z0 + STEP / 2; z < bb.z1; z += STEP) {
    const d = Math.hypot(x - cx, z - cz)
    if (d <= R * 1.01) continue
    n++
    const real = rings.some((r) => inRing(x, z, r)), drawn = inPolys(x, z, polys)
    if (real === drawn) continue
    const off = Math.min(...rings.map((r) => segDist(x, z, r)))
    const tol = 2 * Math.PI * d / SECTORS
    if (off > tol) { coastBad++; worst = Math.max(worst, off / tol) }
  }
  if (!quiet) {
    check(seamBad === 0, `${name}: the water meets the rim with no gap or overlap (${SEAM} directions)`, `${seamBad} direction(s) disagree across the rim`)
    check(coastBad === 0, `${name}: past the rim, inside the fetched square, the water/land edge is the real coast (within one sector)`, `${coastBad} of ${n} samples are off the real coast by more than a sector (worst ${worst.toFixed(1)}× the tolerance)`)
  }
  return { seamBad, coastBad }
}

for (const town of arg('town', 'huron,provincetown').split(',')) {
  const B = join(ROOT, 'public/baked', town)
  console.log(`\n${town}`)
  if (!existsSync(join(B, 'outer-coast.json'))) { check(false, `${town}: the slab carries outer-coast.json`, `▶ node cartograph/bake-coast-distance.js --scene=${town}`); continue }
  const rec = JSON.parse(readFileSync(join(B, 'outer-coast.json'), 'utf8'))
  if (rec.absent) { console.log(`  (no coast: ${rec.why})`); continue }
  const m = JSON.parse(readFileSync(join(B, 'ground.json'), 'utf8'))
  const bin = readFileSync(join(B, m.bin)); const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  const [cx, cz] = m.stencil.center, R = m.stencil.radius
  const tris = []
  for (const g of m.groups) { if (g.kind === 'face' || !isWaterGroupId(g.id)) continue
    const P = new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(ab, g.indexByteOffset, g.indexCount)
    for (let t = 0; t < I.length; t += 3) { const v = [0, 1, 2].map((e) => [P[I[t + e] * 3], P[I[t + e] * 3 + 2]]); if (v.some(([x, z]) => Math.hypot(x - cx, z - cz) > R * 0.95)) tris.push(v) } }
  const inTri = (x, z, [a, b, c]) => { const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (!d) return false
    const w0 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, w1 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d; return w0 >= 0 && w1 >= 0 && w0 + w1 <= 1 }
  const wetAt = (a) => tris.some((t) => inTri(cx + Math.cos(a) * R * 0.995, cz + Math.sin(a) * R * 0.995, t))
  const osm = JSON.parse(readFileSync(join(ROOT, 'cartograph/data', town, 'raw/osm.json'), 'utf8'))
  const rings = coastRings({ ground: osm.ground || {}, buildings: osm.buildings || [], center: [cx, cz], discR: R, bb: rec.bb }).rings || []
  const ctx = { wetAt, rings, bb: rec.bb, cx, cz, R }
  judge(town, rec.polygons, ctx)
  check((rec.refused || []).length === 0, `${town}: no coast heading was refused`, (rec.refused || []).map((r) => r.why).join('; '))
  // 4. each exit's feather angle = the coast's own heading spread there (recomputed from the coast, not read from the record)
  const isEdge = ([x, z]) => Math.min(Math.abs(x - rec.bb.x0), Math.abs(x - rec.bb.x1), Math.abs(z - rec.bb.z0), Math.abs(z - rec.bb.z1)) < 0.5
  const outN = ([x, z]) => Math.abs(x - rec.bb.x0) < 0.5 ? [-1, 0] : Math.abs(x - rec.bb.x1) < 0.5 ? [1, 0] : Math.abs(z - rec.bb.z0) < 0.5 ? [0, -1] : [0, 1]
  const featherOff = (exits) => exits.map((ex) => {
    const ring = rings[ex.ring]; if (!ring) return `ring ${ex.ring} missing`
    const i = ring.findIndex(([x, z]) => Math.hypot(x - ex.at[0], z - ex.at[1]) < 0.2); if (i < 0) return `exit ${ex.at} not on its ring`
    const n = ring.length, arriving = !isEdge(ring[(i - 1 + n) % n])   // the coast arrives before the edge run (ps) or leaves after it (pe)
    const h = [Math.cos(ex.heading * Math.PI / 180), Math.sin(ex.heading * Math.PI / 180)], o = outN(ring[i])
    const want = Math.min(headingSpread(ring, i, arriving ? -1 : +1, R, isEdge), Math.asin(Math.min(1, h[0] * o[0] + h[1] * o[1])) * 0.999) * 180 / Math.PI
    return Math.abs(want - ex.featherDeg) < 0.05 ? null : `exit ${ex.at}: feather ${ex.featherDeg}° but the coast's spread there is ${want.toFixed(2)}°`
  }).filter(Boolean)
  const fo = featherOff(rec.exits || [])
  check((rec.exits || []).every((e) => Number.isFinite(e.featherDeg)) && fo.length === 0, `${town}: each exit's feather is the coast's own heading spread (${(rec.exits || []).map((e) => e.featherDeg + '°').join(', ')})`, fo.join('; ') || 'an exit carries no featherDeg')
  check(featherOff((rec.exits || []).map((e) => ({ ...e, featherDeg: 10 }))).length > 0, `${town}: the feather assertion REJECTS a fixed 10° (bad control)`, 'it accepted a constant')
  // the bad control: the old pie slices must fail at least one of the two
  const bad = judge(`${town} (old pie slices)`, pieSlices(wetAt, cx, cz, R), { ...ctx, quiet: true })
  check(bad.seamBad + bad.coastBad > 0, `${town}: the check REJECTS the old pie-slice construction (bad control)`, 'it passed the pie slices — the check cannot tell the defect from the fix')
}

// 3. A closed body cut by the rim (synthetic): ends at its own shore. Bad control: run every ring on.
{
  console.log('\nsynthetic: a lake closed inside the square, cut by the rim')
  const R = 1000, cx = 0, cz = 0, bb = { x0: -2500, x1: 2500, z0: -2500, z1: 2500 }
  const lake = Array.from({ length: 64 }, (_, i) => { const a = i / 64 * Math.PI * 2; return [900 + Math.cos(a) * 400, Math.sin(a) * 300] })   // straddles the rim at x≈1000
  const sea = [[-2500, -2500], [2500, -2500], [2500, -1800], [-2500, -1600]]                                                                  // a coast reaching the square's edge
  const ok = outerCoast({ rings: [lake, sea], bb, center: [cx, cz], R })
  const lakeOut = ok.polygons.filter((p) => p.ring === 0)
  const far = (polys) => Math.max(0, ...polys.flatMap((p) => p.outer.map(([x, z]) => Math.hypot(x - 900, z) )))
  check(lakeOut.length > 0 && far(lakeOut) <= 401, 'the lake past the rim is drawn, and ends at its own far shore', `reach from the lake's centre ${far(lakeOut).toFixed(0)} m (its shore is ≤ 400 m)`)
  check(ok.polygons.some((p) => p.ring === 1), 'the sea beside it still runs on past the square')
  // bad control: the same lake, made to "reach" the square's edge, is run on to the horizon — the assertion must see it
  const runOn = outerCoast({ rings: [[...lake.slice(0, 32), [2500, 0], ...lake.slice(32)], sea], bb, center: [cx, cz], R }).polygons.filter((p) => p.ring === 0)
  check(far(runOn) > 401, 'the closed-body assertion REJECTS a lake that is run on (bad control)', 'it accepted a run-on lake')
}

console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed')
process.exit(failed ? 1 : 0)
