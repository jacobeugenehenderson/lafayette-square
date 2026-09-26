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
 * ⛔ And the waterline is the mapped shore: just inside the water (the walk's water-side sample), whatever
 * ground is drawn there — the bed, or a land face overlapping the water — must be under the sheet; ground
 * standing proud there moves the visible shore out.
 * ⛔ And the bed stays UNDER its water: every bed vertex off the shore carries the height of the water
 * drawn over it and drapes no higher (bake-ground.js "THE BED NEVER RISES"); a bed with no ceiling fails.
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
  const bedGroup = m.groups.find(g => g.kind !== 'face' && g.id === 'bed')
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
    const C = g.clampByteOffset != null ? new Float32Array(ab, g.clampByteOffset, g.vertexCount * 2) : null
    const drape = i => { const y = P[i * 3 + 1] + lift(P[i * 3], P[i * 3 + 2]); return C && C[i * 2] > 0.5 ? Math.min(y, C[i * 2 + 1]) : y }
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
        let gap
        if (!land) gap = Infinity                                  // the drawing ends at the water
        else if (bed && bed.y > WY + 1e-6) { proud.len += seg; proud.by[bed.id] = (proud.by[bed.id] || 0) + seg; proud.first ||= { x, z, h: bed.y - WY, id: bed.id }; gap = 0 }   // closed, but ground shows through the water
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
  // ⛔ THE BED STAYS UNDER ITS WATER (Jacob, 2026-09-26: the drawn water's edge IS the mapped shoreline).
  // Every bed vertex that is not on the shore must carry a ceiling, and drape no higher than the water over it.
  let risen = 0, worst = null
  if (bedGroup) {
    if (bedGroup.clampByteOffset == null) {
      console.error(`⛔ ${look}: the bed carries NO ceiling (baked before it) — it breaks through the water wherever the terrain stands above it`)
      fail++
      continue
    }
    const [P] = view(bedGroup), C = new Float32Array(ab, bedGroup.clampByteOffset, bedGroup.vertexCount * 2)
    const Y = water.map(w => view(w)[0][1])
    for (let i = 0; i < bedGroup.vertexCount; i++) {
      if (!(C[i * 2] > 0.5)) continue
      const y = Math.min(P[i * 3 + 1] + lift(P[i * 3], P[i * 3 + 2]), C[i * 2 + 1])
      if (!(C[i * 2 + 1] < Math.max(...Y))) { risen++; worst ||= { x: P[i * 3], z: P[i * 3 + 2], why: `ceiling ${C[i * 2 + 1]} is not under any water's drawn surface` }; continue }
      if (y > C[i * 2 + 1] + 1e-6) { risen++; worst ||= { x: P[i * 3], z: P[i * 3 + 2], why: `${(y - C[i * 2 + 1]).toFixed(2)} m above` } }
    }
  }
  if (risen) {
    console.error(`⛔ ${look}: ${risen} bed vertex/vertices stand ABOVE the water over them — first at (${worst.x.toFixed(1)}, ${worst.z.toFixed(1)}): ${worst.why}`)
    fail++
    continue
  }
  const km = v => (v / 1000).toFixed(2)
  // ⛔ THE WATERLINE IS THE MAPPED SHORE (Jacob, 2026-09-26). Just inside the water the bed must be UNDER the
  // sheet; where it stands above it, dry sand shows inside the drawn water and the shore reads as moved out.
  if (proud.len) {
    console.error(`⛔ ${look}: ground stands ABOVE the water just inside the mapped shore along ${km(proud.len)} km `
      + `(${Object.entries(proud.by).sort((p, q) => q[1] - p[1]).map(([id, v]) => `${id} ${km(v)}`).join(' · ')}) — `
      + `first at (${proud.first.x.toFixed(1)}, ${proud.first.z.toFixed(1)}), ${proud.first.id} ${proud.first.h.toFixed(2)} m proud, ${ACROSS.toFixed(2)} m inside`)
    fail++
    continue
  }
  const walked = len.closed + len.awash + len.open
  const closedBy = Object.entries(by).sort((p, q) => q[1] - p[1]).map(([id, v]) => `${id} ${km(v)}`).join(' · ') || 'none'
  if (!len.open) {
    console.log(`  ok    ${look}  ${km(walked)} km of shore walked at ${STEP.toFixed(2)} m, none bare — closed by ${closedBy} km · awash ${km(len.awash)} km · rim ${km(len.rim)} km`)
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
