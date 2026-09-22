#!/usr/bin/env node
/**
 * claims-coplanar-groups-do-not-overlap
 *
 * ⛔ THE RULE, BOTH WAYS — this is ARCHITECTURE §8's ZEROTH RULE, enforced:
 *  A. Groups baked to the SAME Y must NOT overlap each other (or they z-fight).
 *  B. Groups given DIFFERENT Y must actually overlap something (or the
 *     separation is pointless — and on contoured ground it is worse than
 *     pointless, it tears edges; see the chord-error table in §8).
 *
 * ⭐ A is a hard failure. B is a warning: a layer may legitimately be lifted for
 * a reason this check cannot see (a real physical height), so it is surfaced,
 * not enforced.
 *
 * ⭐ WHY THIS IS RE-DERIVED PER TOWN AND NEVER ASSUMED. The shared plane is only
 * safe while those layers are a PARTITION, and that is a property of the POUR, not
 * of the code — a future town whose land use or roadway genuinely self-overlaps
 * would break it. Measured on huron: the 11 LU faces tile the parcels (0 of 219,065
 * cells overlapping) AND the street cross-section tiles the roadway (asphalt ∩
 * sidewalk ZERO, asphalt ∩ curb ZERO, sidewalk ∩ curb 0.0%, at 0.25 m resolution).
 * How many groups share a plane per town is printed per run — ⛔ do not quote it here;
 * this line used to carry a count and it had already drifted. ▶ run the check.
 *
 * ⚠️ RESOLUTION IS PART OF THE MEASUREMENT. An 8 m sample grid FATTENS a 2 m
 * sidewalk and invents overlap that is not there — the first pass of this analysis
 * did exactly that and reported sidewalk ∩ asphalt at 1%, which is zero. Cells here
 * are ~1 m and pairs under OVERLAP_NOISE_PCT are treated as shared-edge sampling,
 * not contact.
 *
 * ⛔ THE HISTORY THIS PREVENTS (2026-09-20): the eleven face groups were stacked on
 * eleven 2 mm slots. They never overlapped, so the separation bought nothing — and
 * it COST every land-use boundary, because the runtime DEM displacement is
 * interpolated per-triangle and differently-tessellated layers disagree about the
 * ground by up to 1.6 m. A 10x A/B changed nothing. There is no epsilon that works
 * on contoured ground; the only fix is not to separate. ARCHITECTURE §8 ZEROTH RULE.
 *
 * READS THE ARTIFACTS. Run: node checks/claims-the-land-use-faces-are-one-plane.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')
// ⭐⭐ THE GRID IS SIZED IN METRES, NOT IN CELLS — and that is the whole point.
// ⛔ This was `N = 2200` cells town-wide, a FIXED COUNT, so the cell SIZE scaled
// with the town: 0.8 m on Lafayette Square's ~1.8 km span, but 3.26 m on huron's
// 7.18 km and worse on altadena. The instrument therefore got blurrier the bigger
// the town — and then reported the blur as a defect. huron's `island` ∩
// `treelawn:island` was flagged as a 5% overlap that "will z-fight"; re-measured at
// ~1 m the same slab is clean, 33 groups sharing a plane with nothing overlapping.
// ⛔ A traffic island is a few metres across, so at 3.26 m cells its own perimeter
// IS most of its area — the grid fattened two adjacent bands into an overlap that
// does not exist. That is this file's own header warning ("an 8 m sample grid
// FATTENS a 2 m sidewalk and invents overlap that is not there") coming true in the
// file that wrote it, and it is `CLAUDE.md` Layer 0 q3 committed by a detector:
// it calls correct output a defect, and it does so WORST on the biggest town.
// ⇒ Fix the cell in METRES and let the count follow the span. Cost is bounded by
// MAX_N so a very large town degrades loudly rather than allocating a huge grid.
const CELL_M = 1.0                  // metres per sample cell — the real resolution
const MAX_N = 8192                  // allocation ceiling; see the warning below
const OVERLAP_NOISE_PCT = 2.0       // below this = shared-edge sampling, not contact
let fail = 0, warn = 0, checked = 0

for (const look of readdirSync(BAKED)) {
  const gPath = join(BAKED, look, 'ground.json')
  const bPath = join(BAKED, look, 'ground.bin')
  if (!existsSync(gPath) || !existsSync(bPath)) continue
  const g = JSON.parse(readFileSync(gPath, 'utf8'))
  const buf = readFileSync(bPath)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const groups = (g.groups || []).filter(x => x.vertexCount > 0 && x.indexCount > 0)
  if (groups.length < 2) continue
  checked++

  const bb = g.bbox
  // Cells are CELL_M metres on a side, so the measurement means the same thing on
  // every town. ⛔ If the span forces more than MAX_N, say so — a silently coarser
  // grid is exactly the failure this constant replaced.
  const spanX = bb.max[0] - bb.min[0], spanZ = bb.max[2] - bb.min[2]
  const wantN = Math.ceil(Math.max(spanX, spanZ) / CELL_M)
  const N = Math.min(MAX_N, wantN)
  if (wantN > MAX_N) {
    console.log(`  \u26a0\ufe0f  ${look}: span ${Math.max(spanX, spanZ).toFixed(0)} m needs `
      + `${wantN} cells at ${CELL_M} m; capped at ${MAX_N} \u21d2 `
      + `${(Math.max(spanX, spanZ) / MAX_N).toFixed(2)} m cells. Small features may read as overlapping.`)
  }
  const sx = spanX / N, sz = spanZ / N

  // baked Y per group → the slot it shares with its peers
  const yOf = (x) => {
    const p = new Float32Array(ab, x.vertexByteOffset, x.vertexCount * 3)
    let mn = Infinity
    for (let i = 1; i < p.length; i += 3) if (p[i] < mn) mn = p[i]
    return Math.round(mn * 10000) / 10000
  }
  const slots = new Map()
  for (const x of groups) {
    const k = yOf(x)
    if (!slots.has(k)) slots.set(k, [])
    slots.get(k).push(x)
  }

  // ONE owner grid; conflicts recorded as pairs. Memory-safe vs a mask per group.
  const rasterise = (list) => {
    const owner = new Int16Array(N * N).fill(-1)
    const counts = new Map()
    const area = new Int32Array(list.length)
    list.forEach((x, gi) => {
      const p = new Float32Array(ab, x.vertexByteOffset, x.vertexCount * 3)
      const idx = new Uint32Array(ab, x.indexByteOffset, x.indexCount)
      for (let t = 0; t < idx.length; t += 3) {
        const i0 = idx[t] * 3, i1 = idx[t + 1] * 3, i2 = idx[t + 2] * 3
        const ax = p[i0], az = p[i0 + 2], bx = p[i1], bz = p[i1 + 2], cx = p[i2], cz = p[i2 + 2]
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
        if (Math.abs(d) < 1e-12) continue
        const u0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - bb.min[0]) / sx))
        const u1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx, cx) - bb.min[0]) / sx))
        const v0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - bb.min[2]) / sz))
        const v1 = Math.min(N - 1, Math.ceil((Math.max(az, bz, cz) - bb.min[2]) / sz))
        for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) {
          const px = bb.min[0] + (u + 0.5) * sx, pz = bb.min[2] + (v + 0.5) * sz
          const wa = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / d
          const wb = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / d
          // ⛔ STRICT interior — a point ON a shared edge is adjacency, not overlap.
          if (wa <= 0.002 || wb <= 0.002 || wa + wb >= 0.998) continue
          const k = v * N + u
          if (owner[k] === -1) { owner[k] = gi; area[gi]++ }
          else if (owner[k] !== gi) {
            const key = owner[k] < gi ? `${owner[k]},${gi}` : `${gi},${owner[k]}`
            counts.set(key, (counts.get(key) || 0) + 1)
          }
        }
      }
    })
    return { counts, area }
  }

  // ── A. nothing sharing a slot may overlap ────────────────────────────────
  let townBad = false
  for (const [y, list] of [...slots].sort((a, b) => a[0] - b[0])) {
    if (list.length < 2) continue
    const { counts, area } = rasterise(list)
    for (const [key, n] of counts) {
      const [i, j] = key.split(',').map(Number)
      const pct = 100 * n / Math.max(1, Math.min(area[i], area[j]))
      if (pct < OVERLAP_NOISE_PCT) continue
      console.error(`⛔ ${look}: "${list[i].id}" and "${list[j].id}" share slot y=${y} `
        + `but OVERLAP (${pct.toFixed(0)}% of the smaller). They will z-fight.`)
      console.error(`   ▶ one of them is a true overlay and needs its own slot. ARCHITECTURE §8.`)
      fail++; townBad = true
    }
  }
  // ── B. a layer alone on its slot must overlap SOMETHING ──────────────────
  // ⛔ WITHOUT THIS THE CHECK IS A LIE ON THE WORST CASE: a town where EVERY group
  // has its own slot — the pre-fix state, the one that tears — passes half A
  // trivially, because nothing shares a plane to conflict. B is what sees it.
  // ⚠️ Warning, not failure: a layer can be lifted for a real physical height this
  // check cannot know about. But a layer that overlaps NOTHING is paying the
  // tearing cost for no benefit, and on contoured ground that cost is up to 1.6 m.
  const solo = [...slots].filter(([, l]) => l.length === 1).map(([, l]) => l[0])
  if (solo.length > 1) {
    const { counts, area } = rasterise(groups)
    const touches = new Set()
    for (const [key, n] of counts) {
      const [i, j] = key.split(',').map(Number)
      const pct = 100 * n / Math.max(1, Math.min(area[i], area[j]))
      if (pct < OVERLAP_NOISE_PCT) continue
      touches.add(groups[i].id); touches.add(groups[j].id)
    }
    const pointless = solo.filter(x => !touches.has(x.id) && x.indexCount > 60)
    if (pointless.length) {
      console.warn(`⚠️  ${look}: ${pointless.length} layer(s) on their OWN slot that overlap nothing `
        + `— separated for no reason, and paying the terrain-chord tearing cost:`)
      console.warn(`     ${pointless.map(x => x.id).join(', ')}`)
      console.warn(`     ▶ ARCHITECTURE §8 ZEROTH RULE. If this town predates the fix, re-bake it.`)
      warn++
    }
  }

  if (!townBad) {
    const biggest = [...slots].sort((a, b) => b[1].length - a[1].length)[0]
    console.log(`  ok    ${look.padEnd(26)} ${groups.length} groups in ${slots.size} slot(s); `
      + `largest plane holds ${biggest[1].length}, none overlapping`)
  }
}

console.log(`\n${checked} town(s) checked · ${warn} with pointless separation`)
if (fail) { console.error('⛔ FAIL'); process.exit(1) }
process.exit(0)
