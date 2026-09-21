#!/usr/bin/env node
/**
 * claims-the-land-use-faces-are-one-plane
 *
 * ⛔ TWO CLAIMS, AND THE SECOND IS THE PREMISE OF THE FIRST.
 *  A. Every `kind === 'face'` group bakes to the SAME Y. One plane.
 *  B. Those groups genuinely DO NOT OVERLAP — measured per town, not assumed.
 *
 * ⭐ WHY B MATTERS MORE THAN A. Putting non-overlapping surfaces on one plane is
 * correct and removes the fighting. Putting OVERLAPPING surfaces on one plane is a
 * z-fight. So the single plane is only safe while land use is a PARTITION, and that
 * is a property of the POUR, not of the code — a future town whose LU polygons
 * genuinely overlap would break it. This check re-derives the property per town so
 * the day it stops being true we are told, instead of shipping a tearing map.
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
const N = 700                        // sample grid per axis
let fail = 0, checked = 0

for (const look of readdirSync(BAKED)) {
  const gPath = join(BAKED, look, 'ground.json')
  const bPath = join(BAKED, look, 'ground.bin')
  if (!existsSync(gPath) || !existsSync(bPath)) continue
  const g = JSON.parse(readFileSync(gPath, 'utf8'))
  const buf = readFileSync(bPath)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const faces = (g.groups || []).filter(x => x.kind === 'face')
  if (faces.length < 2) continue
  checked++

  // ── A. one plane ──────────────────────────────────────────────────────────
  const ys = faces.map(x => {
    const p = new Float32Array(ab, x.vertexByteOffset, x.vertexCount * 3)
    let mn = Infinity
    for (let i = 1; i < p.length; i += 3) if (p[i] < mn) mn = p[i]
    return { id: x.id, y: mn }
  })
  const spread = Math.max(...ys.map(v => v.y)) - Math.min(...ys.map(v => v.y))
  let planeOk = true
  if (spread > 1e-6) {
    planeOk = false
    console.error(`⛔ ${look}: face groups are NOT coplanar — Y spread ${(spread * 1000).toFixed(1)} mm`)
    for (const v of ys) console.error(`     ${v.id.padEnd(16)} y=${v.y.toFixed(4)}`)
    console.error(`   ▶ they are a partition; separating them is what tears the boundaries. ARCHITECTURE §8.`)
    fail++
  }

  // ── B. the premise: do they actually overlap? ─────────────────────────────
  const bb = g.bbox
  const sx = (bb.max[0] - bb.min[0]) / N, sz = (bb.max[2] - bb.min[2]) / N
  const owner = new Int16Array(N * N).fill(-1)
  let over = 0, occ = 0
  faces.forEach((x, gi) => {
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
        if (owner[k] === -1) { owner[k] = gi; occ++ }
        else if (owner[k] !== gi) over++
      }
    }
  })
  const pct = occ ? (100 * over / occ) : 0
  if (over > 0) {
    console.error(`⛔ ${look}: land use is NOT a partition — ${over} of ${occ} cells (${pct.toFixed(2)}%) `
      + `covered by two different LU interiors. The single plane WILL z-fight there.`)
    console.error(`   ▶ Either the pour is assigning overlapping LU, or these need real separation.`)
    fail++
  } else if (planeOk) {
    console.log(`  ok    ${look.padEnd(26)} ${faces.length} face groups, one plane, 0 of ${occ} cells overlapping`)
  } else {
    // ⛔ Say the premise held even while the artifact is wrong — it is the reason
    // the fix is safe, and a reader seeing only the failure would not know it.
    console.error(`   (land use IS a partition here — 0 of ${occ} cells overlap — so the `
      + `single plane is correct for this town too; it just has a pre-fix bake.)`)
  }
}

console.log(`\n${checked} town(s) checked`)
if (fail) { console.error('⛔ FAIL'); process.exit(1) }
process.exit(0)
