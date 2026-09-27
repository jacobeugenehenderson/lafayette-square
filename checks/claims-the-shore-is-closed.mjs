#!/usr/bin/env node
/**
 * claims-the-shore-is-closed
 *
 * ⛔ THE CLASS: bare space between the water and the land (Jacob, 2026-09-26: "there must be
 * no bare space between the water and the land, no matter what it's made of, no matter
 * what distance or angle"). The water is a LEVEL sheet; the land is DRAPED over the terrain.
 * Where the land's edge stands above the water and nothing lies under the water to meet it,
 * the gap between them is open and you see the sky through it. `docs/briefs/BRIEF-the-shore-is-closed.md`.
 *
 * ⭐ THE WALK. Every boundary edge of every water group, at the terrain grid's own step. At
 * each station, look just across the edge on BOTH sides and ask what drawn ground is there:
 *   · ground on the WATER side and on the LAND side → CLOSED (named by the water-side group).
 *     The two meet with no step because the ground is ONE conformed mesh — that half of the
 *     guarantee is `claims-the-ground-has-no-cross-polygon-t-junctions.mjs`, not restated here.
 *   · nothing under the water, and the land's edge stands above the water (draped the way the
 *     GPU drapes it: terrain × the town's exag) → OPEN, by that height: the gap.
 *   · nothing under the water, and the land's edge is at or below the water → the water
 *     covers the meeting; closed, counted as `awash`.
 *   · nothing on the land side → OPEN in plan: the drawing has a hole at the shore.
 * ⛔ And the waterline is where the level meets the ground (Jacob, 2026-09-26): √2 terrain cells from every part
 * of the mapped shore (a bilinear cell's reach), whatever ground is drawn — the bed, or a land face over the water — must be under the sheet.
 * ⛔ And the bed deepens going out: under a terrain that carries the bed (bake-terrain `bed`), the median
 * depth at each distance from the nearest mapped shore never shrinks, out to the visibility depth.
 * ⛔ And first: the water must draw after every other ground group, or the ground under it paints
 * over it — a closed shore with no water visible is the picture this check once passed.
 * Stations on the disc rim are the EDGE OF THE DRAWING (`project_neighborhood_is_a_compound_shape`),
 * not a shore, and are counted as such.
 *
 * ⭐ READS THE ARTIFACTS: water groups by the runtime's own `isWaterGroupId`, the drape by
 * `terrainCommon`'s sampler at the slab's own exag, the disc from `ground.json#stencil`.
 * ⛔ A slab that draws water but carries no terrain FAILS — nothing can say how high the land stands.
 * ⚠️ Water drawn OUTSIDE the slab (Lafayette Square's pond, `LafayettePark.jsx`) is not walked
 * here, and the check says so by name rather than passing it.
 *
 * Run: node checks/claims-the-shore-is-closed.mjs
 *      node checks/claims-the-shore-is-closed.mjs --dir=<slab dir>   (a scratch bake; needs terrain.* beside it)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { isWaterGroupId } from '../src/components/waterMaterial.js'
import { makeElevationSampler, DEFAULT_V_EXAG } from '../src/lib/terrainCommon.js'

const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')

const dirArg = process.argv.find(a => a.startsWith('--dir='))?.slice(6)
const dirs = dirArg ? [dirArg]
  : readdirSync(BAKED).map(l => join(BAKED, l)).filter(d => existsSync(join(d, 'ground.json')))
const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }

let fail = 0, ok = 0, dry = 0
for (const dir of dirs) {
  const look = basename(dir)
  if (!dirArg && !existsSync(join(ROOT, 'public/looks', look))) continue   // phantom output, nothing reads it
  const m = readJSON(join(dir, 'ground.json'))
  const water = m.groups.filter(g => g.kind !== 'face' && isWaterGroupId(g.id))
  const outside = existsSync(join(ROOT, 'src/data', look, 'park_water.json'))
  if (!water.length) {
    console.log(`  --    ${look}  no water in the slab${outside ? ` — ⚠️ its pond is drawn OUTSIDE the slab (src/data/${look}/park_water.json) and is NOT WALKED here` : ''}`)
    dry++
    continue
  }
  const tj = readJSON(join(dir, 'terrain.json'))
  if (!tj || !existsSync(join(dir, 'terrain.bin'))) {
    console.error(`⛔ ${look}: draws ${water.length} water group(s) but has no terrain beside ground.json — cannot say how high the land stands`)
    fail++
    continue
  }
  // ⛔ THE WATER MUST STILL SHOW. Every ground group is drawn in `renderOrder` (they are all
  // transparent in BakedGround — the fade), and the water writes no depth, so a group drawn
  // AFTER the water paints straight over it. 2026-09-26: the first `bed` was appended after
  // water and hid the whole harbour while the walk below passed.
  const lastLand = Math.max(...m.groups.filter(g => !water.includes(g)).map(g => g.renderOrder))
  const over = water.filter(w => w.renderOrder < lastLand)
  if (over.length) {
    const painters = m.groups.filter(g => !water.includes(g) && g.renderOrder > Math.min(...over.map(w => w.renderOrder)))
    console.error(`⛔ ${look}: the water is PAINTED OVER — ${over.map(w => `${w.id} (slot ${w.renderOrder})`).join(', ')} draws before ${painters.map(g => `${g.id} (slot ${g.renderOrder})`).join(', ')}`)
    fail++
    continue
  }
  const tb = readFileSync(join(dir, 'terrain.bin'))
  const exag = readJSON(join(dir, 'scene.json'))?.terrainExag ?? DEFAULT_V_EXAG
  const lift = makeElevationSampler({ ...tj, data: new Float32Array(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength)) }, exag).getElevation
  const STEP = Math.min((tj.bounds.maxX - tj.bounds.minX) / (tj.width - 1), (tj.bounds.maxZ - tj.bounds.minZ) / (tj.height - 1))
  const ACROSS = STEP / 8   // how far across the edge to look: well inside the thinnest triangle beside it

  const bin = readFileSync(join(dir, m.bin || 'ground.bin'))
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
  const view = g => [new Float32Array(ab, g.vertexByteOffset, g.vertexCount * 3), new Uint32Array(ab, g.indexByteOffset, g.indexCount)]

  // Every non-water triangle, draped, in a grid.
  const CELL = STEP * 4, grid = new Map(), tris = []
  for (const g of m.groups) {
    if (water.includes(g)) continue
    const [P, I] = view(g)
    const drape = i => P[i * 3 + 1] + lift(P[i * 3], P[i * 3 + 2])
    for (let t = 0; t < I.length; t += 3) {
      const v = [I[t], I[t + 1], I[t + 2]].map(i => [P[i * 3], P[i * 3 + 2], drape(i)])
      const k = tris.push({ v, id: g.id }) - 1
      const xs = v.map(p => p[0]), zs = v.map(p => p[1])
      for (let cx = Math.floor(Math.min(...xs) / CELL); cx <= Math.floor(Math.max(...xs) / CELL); cx++)
        for (let cz = Math.floor(Math.min(...zs) / CELL); cz <= Math.floor(Math.max(...zs) / CELL); cz++) {
          const key = cx + ',' + cz
          if (!grid.has(key)) grid.set(key, [])
          grid.get(key).push(k)
        }
    }
  }
  // The topmost drawn triangle over (x, z), and its draped height there.
  const groundAt = (x, z) => {
    let best = null
    for (const k of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
      const [a, b, c] = tris[k].v
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
      if (!d) continue
      const w0 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d
      const w1 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d
      if (w0 < 0 || w1 < 0 || w0 + w1 > 1) continue
      const y = w0 * a[2] + w1 * b[2] + (1 - w0 - w1) * c[2]
      if (!best || y > best.y) best = { y, id: tris[k].id }
    }
    return best
  }

  const st = m.stencil
  // Every point of the mapped shore (the water groups' boundary, off the disc rim), and the distance to the nearest.
  const shorePts = []
  for (const g of water) { const [P, I] = view(g); const cnt = new Map()
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a2 = I[t + e], b2 = I[t + (e + 1) % 3], kk = a2 < b2 ? a2 + '_' + b2 : b2 + '_' + a2; cnt.set(kk, (cnt.get(kk) || 0) + 1) }
    for (const [kk, c] of cnt) { if (c !== 1) continue; const [a2, b2] = kk.split('_').map(Number); const L2 = Math.hypot(P[b2 * 3] - P[a2 * 3], P[b2 * 3 + 2] - P[a2 * 3 + 2])
      for (let u = 0; u <= L2; u += STEP / 2) { const px = P[a2 * 3] + (P[b2 * 3] - P[a2 * 3]) * u / L2, pz = P[a2 * 3 + 2] + (P[b2 * 3 + 2] - P[a2 * 3 + 2]) * u / L2
        if (!st || Math.hypot(px - st.center[0], pz - st.center[1]) <= st.radius - STEP) shorePts.push([px, pz]) } } }
  const SC = STEP * 8, sg = new Map()
  for (const q of shorePts) { const kk = Math.floor(q[0] / SC) + ',' + Math.floor(q[1] / SC); if (!sg.has(kk)) sg.set(kk, []); sg.get(kk).push(q) }
  const nearest = (x, z) => { let best = Infinity; const cx = Math.floor(x / SC), cz = Math.floor(z / SC)
    // ring r's cells are at least (r − 1)·SC away, so stop only once the best found is nearer than that
    for (let r = 0; r < 4 && best > (r - 1) * SC; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
      for (const q of sg.get((cx + di) + ',' + (cz + dj)) || []) best = Math.min(best, Math.hypot(q[0] - x, q[1] - z)) } return best }
  // Is (x, z) under the drawn water? (a normal stepped in from a corner can land back on the land)
  const wgrid = new Map(), wtris = []
  for (const g of water) { const [P, I] = view(g)
    for (let t = 0; t < I.length; t += 3) { const v = [0, 1, 2].map(e => [P[I[t + e] * 3], P[I[t + e] * 3 + 2]]); const k = wtris.push(v) - 1
      const xs = v.map(q => q[0]), zs = v.map(q => q[1])
      for (let cx = Math.floor(Math.min(...xs) / CELL); cx <= Math.floor(Math.max(...xs) / CELL); cx++) for (let cz = Math.floor(Math.min(...zs) / CELL); cz <= Math.floor(Math.max(...zs) / CELL); cz++) {
        const kk = cx + ',' + cz; if (!wgrid.has(kk)) wgrid.set(kk, []); wgrid.get(kk).push(k) } } }
  const inWater = (x, z) => (wgrid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []).some(k => { const [a2, b2, c2] = wtris[k]
    const d = (b2[1] - c2[1]) * (a2[0] - c2[0]) + (c2[0] - b2[0]) * (a2[1] - c2[1]); if (!d) return false
    const w0 = ((b2[1] - c2[1]) * (x - c2[0]) + (c2[0] - b2[0]) * (z - c2[1])) / d, w1 = ((c2[1] - a2[1]) * (x - c2[0]) + (a2[0] - c2[0]) * (z - c2[1])) / d
    return w0 >= 0 && w1 >= 0 && w0 + w1 <= 1 })
  let depthLine = ''
  const len = { rim: 0, closed: 0, awash: 0, open: 0 }, by = {}, opens = [], proud = { len: 0, first: null, by: {} }
  for (const g of water) {
    const [P, I] = view(g)
    const WY = P[1]
    const edges = new Map()
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = I[t + e], b = I[t + (e + 1) % 3], key = a < b ? a + '_' + b : b + '_' + a
      const r = edges.get(key)
      if (r) r.n++; else edges.set(key, { n: 1, a, b, o: I[t + (e + 2) % 3] })
    }
    for (const { n, a, b, o } of edges.values()) {
      if (n !== 1) continue
      const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], L = Math.hypot(bx - ax, bz - az)
      if (!L) continue
      let nx = -(bz - az) / L, nz = (bx - ax) / L   // unit normal, flipped to point at the LAND
      if ((P[o * 3] - (ax + bx) / 2) * nx + (P[o * 3 + 2] - (az + bz) / 2) * nz > 0) { nx = -nx; nz = -nz }
      const k = Math.max(1, Math.ceil(L / STEP)), seg = L / k
      for (let s = 0; s < k; s++) {
        const f = (s + 0.5) / k, x = ax + (bx - ax) * f, z = az + (bz - az) * f
        if (st && Math.hypot(x - st.center[0], z - st.center[1]) > st.radius - STEP) { len.rim += seg; continue }
        const land = groundAt(x + nx * ACROSS, z + nz * ACROSS)
        const bed = groundAt(x - nx * ACROSS, z - nz * ACROSS)
        // The bank is the terrain's own step from the land to the bed. A bilinear terrain lets a land cell reach a point
        // up to √2 cells away, so the water is tested only where EVERY part of the mapped shore is at least that far —
        // at an inlet, a point one cell in from this edge can be one cell from the opposite one, correctly.
        const REACH = Math.SQRT2 * STEP, dx = x - nx * REACH, dz = z - nz * REACH
        const deep = nearest(dx, dz) >= REACH - 1e-6 && inWater(dx, dz) ? groundAt(dx, dz) : null
        if (deep && deep.y > WY + 1e-6) { proud.len += seg; proud.by[deep.id] = (proud.by[deep.id] || 0) + seg; proud.first ||= { x: dx, z: dz, h: deep.y - WY, id: deep.id } }
        let gap
        if (!land) gap = Infinity                                  // the drawing ends at the water
        else if (bed) gap = 0                                      // one conformed mesh on both sides
        else gap = land.y > WY ? land.y - WY : 0
        if (gap === 0) {
          if (bed) { len.closed += seg; by[bed.id] = (by[bed.id] || 0) + seg } else len.awash += seg
          continue
        }
        len.open += seg
        opens.push({ x, z, gap, land: land?.id ?? 'nothing', bed: bed?.id ?? 'nothing' })
      }
    }
  }
  const km = v => (v / 1000).toFixed(2)
  // ⛔ THE WATERLINE IS THE MAPPED SHORE (Jacob, 2026-09-26). Just inside the water the bed must be UNDER the
  // sheet; where it stands above it, dry sand shows inside the drawn water and the shore reads as moved out.
  if (proud.len) {
    console.error(`⛔ ${look}: ground stands ABOVE the water just inside the mapped shore along ${km(proud.len)} km `
      + `(${Object.entries(proud.by).sort((p, q) => q[1] - p[1]).map(([id, v]) => `${id} ${km(v)}`).join(' · ')}) — `
      + `first at (${proud.first.x.toFixed(1)}, ${proud.first.z.toFixed(1)}), ${proud.first.id} ${proud.first.h.toFixed(2)} m proud, ${(Math.SQRT2 * STEP).toFixed(2)} m (√2 terrain cells) from every part of the shore`)
    fail++
    continue
  }
  // ⭐ THE BED DEEPENS GOING OUT (bake-terrain `bed`): sample the water, bin by distance to the nearest mapped
  // shore at the terrain step, and the median depth must not fall bin to bin out to where the bed reaches the
  // visibility depth. By distance to the NEAREST shore, not along a normal: across a channel the depth rises
  // again past the middle, and that is correct.
  if (tj.bed) {
    const reach = Math.pow(tj.bed.visibleToM / tj.bed.A, 1.5), bins = []
    for (const g of water) { const [P, I] = view(g)
      for (let t = 0; t < I.length && bins.flat().length < 60000; t += 3) { const V = [0, 1, 2].map(e => [P[I[t + e] * 3], P[I[t + e] * 3 + 2]])
        for (let q = 0; q < 6; q++) { let a2 = ((q + 1) * 0.7548776662) % 1, b2 = ((q + 1) * 0.5698402909) % 1; if (a2 + b2 > 1) { a2 = 1 - a2; b2 = 1 - b2 }
          const x = V[0][0] + a2 * (V[1][0] - V[0][0]) + b2 * (V[2][0] - V[0][0]), z = V[0][1] + a2 * (V[1][1] - V[0][1]) + b2 * (V[2][1] - V[0][1])
          const d = nearest(x, z); if (!(d < reach)) continue
          const bi = Math.floor(d / STEP); (bins[bi] ||= []).push(-lift(x, z) / exag) } } }
    const med = bins.map(b2 => b2 && b2.length >= 20 ? b2.sort((p2, q2) => p2 - q2)[Math.floor(b2.length / 2)] : null)
    let prev = -Infinity, bad = null
    med.forEach((m2, bi) => { if (m2 == null) return; if (m2 < prev - 0.01 && !bad) bad = { bi, m2, prev }; prev = Math.max(prev, m2) })
    if (bad) {
      console.error(`⛔ ${look}: the bed gets SHALLOWER going out — median depth ${bad.m2.toFixed(2)} m at ${(bad.bi * STEP).toFixed(0)} m from the shore, after ${bad.prev.toFixed(2)} m nearer in`)
      fail++
      continue
    }
    depthLine = ` · bed deepens to ${tj.bed.visibleToM.toFixed(2)} m over ${reach.toFixed(0)} m (medians ${med.filter(v => v != null).slice(0, 4).map(v => v.toFixed(2)).join(' → ')} …)`
  }
  const walked = len.closed + len.awash + len.open
  const closedBy = Object.entries(by).sort((p, q) => q[1] - p[1]).map(([id, v]) => `${id} ${km(v)}`).join(' · ') || 'none'
  if (!len.open) {
    console.log(`  ok    ${look}  ${km(walked)} km of shore walked at ${STEP.toFixed(2)} m, none bare — closed by ${closedBy} km · awash ${km(len.awash)} km · rim ${km(len.rim)} km${depthLine}`)
    ok++
    continue
  }
  fail++
  const gaps = opens.map(o => o.gap).filter(Number.isFinite).sort((p, q) => p - q)
  const q = p => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))].toFixed(2) : '—'
  console.error(`⛔ ${look}: ${km(len.open)} of ${km(walked)} km of shore is BARE (walked at ${STEP.toFixed(2)} m, exag ${exag})`)
  console.error(`   gap between water and land (m): median ${q(0.5)} · p90 ${q(0.9)} · max ${q(1)} · ${opens.length - gaps.length} station(s) with no land drawn at all`)
  const kinds = {}
  for (const o of opens) { const k = `${o.bed} under the water / ${o.land} on the land`; kinds[k] = (kinds[k] || 0) + 1 }
  console.error(`   what meets there: ${Object.entries(kinds).sort((p, q) => q[1] - p[1]).slice(0, 4).map(([k, v]) => `${v} × ${k}`).join(' · ')}`)
  for (const o of opens.sort((p, q) => q.gap - p.gap).slice(0, 3))
    console.error(`   at (${o.x.toFixed(1)}, ${o.z.toFixed(1)}): ${Number.isFinite(o.gap) ? o.gap.toFixed(2) + ' m open' : 'nothing drawn landward'}`)
  if (len.closed) console.error(`   closed elsewhere by: ${closedBy} km`)
  console.error(`   ▶ node cartograph/bake-ground.js --scene=${look} --look=${look}`)
}

console.log(`\n${ok} closed · ${fail} bare · ${dry} with no water in the slab`)
if (fail) { console.error('⛔ FAIL'); process.exit(1) }
process.exit(0)
