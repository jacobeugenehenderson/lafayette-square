#!/usr/bin/env node
// claims-the-ground-is-painted-once.mjs — IS EVERY POINT OF THE GROUND PAINTED BY EXACTLY ONE GROUP?
//
// ⭐ THE INVARIANT: the paint stack is pressed down into ONE partition (bake-ground.js `flattenPaintStack`), so inside the
// town's own boundary ring every point lies in exactly one triangle of exactly one `partition: true` group. A point
// painted by none is a HOLE in the ground; a point painted by two is a DOUBLE (two groups on one plane, z-fighting).
// ⭐ Why this and not the two checks beside it: `claims-coplanar-groups-do-not-overlap` forgives a pair under 2% of
// the smaller group, which a 1.25 ha double of two big faces passes; `claims-the-ground-tiles-without-a-gap` asks the
// edge topology, which a double whose outline is made of shared edges passes. This asks the point.
//
// HOW: the slab's own triangles, sampled on a grid of --cell metres inside the boundary ring the bake clipped to
// (`loadSceneStencil`, read, not restated). A sample on a shared edge goes to exactly one of the two triangles (the
// edge's side is read with its endpoints in one canonical order, and a tie goes to the triangle that walks the edge in
// that order), so a conforming mesh counts 1 everywhere, with no tolerance. Each defect is reported as a connected
// region: its kind, area, centre, and the groups that paint it (a DOUBLE) or border it (a HOLE).
// ⚠️ A piece thinner than the cell can fall between samples. The exact residue is printed beside the sampled one:
// Σ triangle area − the ring's area = double area − hole area, exactly, at any resolution; where the two disagree, the
// difference is what the grid could not see. Beside them, the bake's own count of rings it resolved below the lattice's
// rounding (`ground.json#flatten.subLattice`, bake-ground.js `itemsByMembership`), whose role is Clipper's winding, and
// of those, the orphan holes it dropped (no outer meets them, so they remove no paint), each with its area and point.
//
// ⭐ MUTATION TEST: `--selftest` drops one interior triangle (must report a HOLE there) and copies one triangle into a
// second group (must report a DOUBLE naming both), in memory.
//
//   node checks/claims-the-ground-is-painted-once.mjs [--town=a,b] [--dir=<slab dir>] [--scene=<scene>] [--cell=0.25] [--show=8] [--selftest]
// Read-only. Exits 1 on any hole or double.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { loadSceneStencil } from '../cartograph/sceneStencil.js'
const ROOT = new URL('..', import.meta.url).pathname
const BAKED = join(ROOT, 'public/baked')
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const H = +(arg('cell') || 0.25), SHOW = +(arg('show') || 8), STRIP = 1024
const dirs = arg('dir') ? [arg('dir')] : (arg('town')?.split(',') || readdirSync(BAKED).filter(t => existsSync(join(BAKED, t, 'ground.json')))).map(t => join(BAKED, t))

function readSlab(dir) {
  const gj = JSON.parse(readFileSync(join(dir, 'ground.json'), 'utf8'))
  const gb = readFileSync(join(dir, gj.bin || 'ground.bin')), AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
  const groups = gj.groups.filter(g => g.partition === true && g.indexCount > 0)
  const T = [], G = []                                    // per triangle: 6 coords (x, z) · its group's index
  groups.forEach((g, gi) => {
    const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
    for (let i = 0; i < I.length; i += 3) { T.push(P[I[i] * 3], P[I[i] * 3 + 2], P[I[i + 1] * 3], P[I[i + 1] * 3 + 2], P[I[i + 2] * 3], P[I[i + 2] * 3 + 2]); G.push(gi) }
  })
  return { gj, ids: groups.map(g => g.id), T, G }
}

function measure({ gj, ids, T, G }, ring) {
  if (ids.length > 254) throw new Error(`${ids.length} partition groups — the owner grid holds 254`)
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) }
  const W = Math.ceil((x1 - x0) / H), NV = Math.ceil((z1 - z0) / H)
  const X = (u) => x0 + (u + 0.5) * H, Z = (v) => z0 + (v + 0.5) * H
  // the ring's inside, per row (even-odd crossings at the row's sample z)
  const inside = (v) => {
    const z = Z(v), xs = []
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j]
      if ((zi > z) !== (zj > z)) xs.push(xi + (z - zi) * (xj - xi) / (zj - zi))
    }
    return xs.sort((a, b) => a - b)
  }
  // exact areas
  let ringA = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) ringA += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]) / 2
  ringA = Math.abs(ringA)
  let triA = 0; const nT = G.length
  for (let t = 0; t < nT; t++) { const o = t * 6; triA += Math.abs((T[o + 2] - T[o]) * (T[o + 5] - T[o + 1]) - (T[o + 4] - T[o]) * (T[o + 3] - T[o + 1])) / 2 }
  // triangles bucketed by strip of rows
  const nS = Math.ceil(NV / STRIP), bucket = Array.from({ length: nS }, () => [])
  for (let t = 0; t < nT; t++) {
    const o = t * 6, zmin = Math.min(T[o + 1], T[o + 3], T[o + 5]), zmax = Math.max(T[o + 1], T[o + 3], T[o + 5])
    const va = Math.max(0, Math.ceil((zmin - z0) / H - 0.5)), vb = Math.min(NV - 1, Math.floor((zmax - z0) / H - 0.5))
    if (vb < va) continue
    for (let s = Math.floor(va / STRIP); s <= Math.floor(vb / STRIP); s++) bucket[s].push(t)
  }
  const cnt = new Uint8Array(W * STRIP), own = new Uint8Array(W * STRIP)
  const defects = new Map()                                // global cell → { k: 'hole'|'double', g: Set }
  const CAP = 2e6
  let holeN = 0, dblN = 0, samples = 0
  // the side of p against edge a→b, read in the edge's CANONICAL order so both triangles on it agree; a tie goes to
  // the triangle that walks the edge canonically ⇒ a point on a shared edge is in exactly one of the two
  const E = new Float64Array(15)                           // per edge: Px, Pz, Qx−Px, Qz−Pz, canonical?
  const edge = (e, ax, az, bx, bz) => {
    const canon = ax < bx || (ax === bx && az < bz), o = e * 5
    if (canon) { E[o] = ax; E[o + 1] = az; E[o + 2] = bx - ax; E[o + 3] = bz - az } else { E[o] = bx; E[o + 1] = bz; E[o + 2] = ax - bx; E[o + 3] = az - bz }
    E[o + 4] = canon ? 1 : 0
  }
  const side = (e, px, pz) => {
    const o = e * 5, r = E[o + 2] * (pz - E[o + 1]) - E[o + 3] * (px - E[o])
    return E[o + 4] ? r >= 0 : r < 0
  }
  for (let s = 0; s < nS; s++) {
    const vS = s * STRIP, vE = Math.min(NV, vS + STRIP)
    cnt.fill(0); own.fill(0)
    for (const t of bucket[s]) {
      const o = t * 6
      let ax = T[o], az = T[o + 1], bx = T[o + 2], bz = T[o + 3], cx = T[o + 4], cz = T[o + 5]
      const d = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
      if (d === 0) continue                                 // a degenerate triangle covers nothing
      if (d < 0) { const tx = bx, tz = bz; bx = cx; bz = cz; cx = tx; cz = tz }   // wind it counter-clockwise
      const u0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - x0) / H - 0.5)), u1 = Math.min(W - 1, Math.floor((Math.max(ax, bx, cx) - x0) / H - 0.5))
      const v0 = Math.max(vS, Math.ceil((Math.min(az, bz, cz) - z0) / H - 0.5)), v1 = Math.min(vE - 1, Math.floor((Math.max(az, bz, cz) - z0) / H - 0.5))
      const g = G[t] + 1
      edge(0, ax, az, bx, bz); edge(1, bx, bz, cx, cz); edge(2, cx, cz, ax, az)
      for (let v = v0; v <= v1; v++) { const pz = Z(v), row = (v - vS) * W
        for (let u = u0; u <= u1; u++) { const px = X(u)
          if (!side(0, px, pz) || !side(1, px, pz) || !side(2, px, pz)) continue
          const k = row + u
          if (cnt[k] === 0) { own[k] = g; cnt[k] = 1; continue }
          if (cnt[k] < 255) cnt[k]++
          const gk = v * W + u
          let e = defects.get(gk)
          if (!e && defects.size < CAP) { e = { k: 'double', g: new Set([ids[own[k] - 1]]) }; defects.set(gk, e) }
          if (e) e.g.add(ids[g - 1])
        } }
    }
    for (let v = vS; v < vE; v++) {
      const xs = inside(v), row = (v - vS) * W
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const ua = Math.max(0, Math.ceil((xs[i] - x0) / H - 0.5)), ub = Math.min(W - 1, Math.floor((xs[i + 1] - x0) / H - 0.5))
        for (let u = ua; u <= ub; u++) { samples++; const k = row + u
          if (cnt[k] > 1) { dblN++; continue }
          if (cnt[k] === 1) continue
          holeN++
          if (defects.size >= CAP) continue
          const nb = new Set()
          for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const uu = u + du, vv = v + dv
            if (uu < 0 || uu >= W || vv < vS || vv >= vE) continue
            const q = (vv - vS) * W + uu; if (cnt[q] === 1) nb.add(ids[own[q] - 1])
          }
          defects.set(v * W + u, { k: 'hole', g: nb })
        }
      }
    }
  }
  // doubles outside the ring are not the ground's; drop any double the inside pass did not count
  // (cells the ring excludes were never visited above, so a defect recorded there is outside)
  // regions: 4-connected cells of one kind
  const seen = new Set(), regions = []
  for (const [k0, e0] of defects) {
    if (seen.has(k0)) continue
    const v0 = Math.floor(k0 / W), u0 = k0 % W, inRing = (() => { const xs = inside(v0), x = X(u0); for (let i = 0; i + 1 < xs.length; i += 2) if (x >= xs[i] && x <= xs[i + 1]) return true; return false })()
    const stack = [k0], cells = []; seen.add(k0)
    while (stack.length) { const k = stack.pop(); cells.push(k); const u = k % W
      for (const q of [k + 1, k - 1, k + W, k - W]) {
        if ((q === k + 1 && u === W - 1) || (q === k - 1 && u === 0)) continue
        const e = defects.get(q); if (e && e.k === e0.k && !seen.has(q)) { seen.add(q); stack.push(q) } } }
    if (!inRing && e0.k === 'double') continue
    const g = new Set(); let sx = 0, sz = 0
    for (const k of cells) { for (const n of defects.get(k).g) g.add(n); sx += X(k % W); sz += Z(Math.floor(k / W)) }
    regions.push({ k: e0.k, n: cells.length, m2: cells.length * H * H, at: [sx / cells.length, sz / cells.length], g: [...g].sort() })
  }
  regions.sort((a, b) => b.m2 - a.m2)
  return { samples, holeN, dblN, regions, capped: defects.size >= CAP, ringA, triA, groups: ids.length, tris: nT, subLattice: gj.flatten?.subLattice || null }
}

function ringOf(gj, dir) {
  const scene = arg('scene') || gj.look
  const st = loadSceneStencil(ROOT, scene)
  if (!st.clipPolygon) throw new Error(`${dir}: scene "${scene}" has no boundary ring (cartograph/data/${scene}/neighborhood_boundary.json) — the ground's extent is unknown`)
  return st.clipPolygon
}

function report(dir, r) {
  const name = dir.split('/').pop(), a = (x) => x.toFixed(x < 10 ? 3 : 1)
  const hA = r.holeN * H * H, dA = r.dblN * H * H
  const sl = r.subLattice ? Object.values(r.subLattice).reduce((t, x) => ({ n: t.n + x.rings, m2: t.m2 + x.m2, orphans: [...t.orphans, ...(x.orphanHoles || [])] }), { n: 0, m2: 0, orphans: [] }) : null
  const orph = sl?.orphans.length ? ` (of them ${sl.orphans.length} orphan hole(s) dropped, ${sl.orphans.reduce((t, o) => t + o.m2, 0).toFixed(9)} m²: ${sl.orphans.slice(0, 3).map(o => `(${o.at.map(v => v.toFixed(2)).join(', ')})`).join(' ')}${sl.orphans.length > 3 ? ' …' : ''})` : ''
  const line = `${r.groups} groups · ${r.tris} triangles · ${r.samples} samples at ${H} m · exact: Σ triangles − ring = ${a(r.triA - r.ringA)} m² · sampled: double − hole = ${a(dA - hA)} m²`
    + ` · below the lattice: ${sl ? `${sl.n} ring(s), ${sl.m2.toFixed(9)} m², role by Clipper's winding${orph}` : 'not disclosed (the slab predates ground.json#flatten)'}`
  if (!r.holeN && !r.dblN) { console.log(`  ok  ${name}: painted once everywhere · ${line}`); return true }
  console.error(`  ⛔  ${name}: ${a(hA)} m² painted by NO group (${r.regions.filter(x => x.k === 'hole').length} region(s)) · ${a(dA)} m² painted TWICE (${r.regions.filter(x => x.k === 'double').length} region(s))${r.capped ? ' · ⚠️ defect cells capped, regions incomplete' : ''}`)
  console.error(`        ${line}`)
  for (const x of r.regions.slice(0, SHOW)) console.error(`        ${x.k.padEnd(6)} ${a(x.m2).padStart(10)} m² at (${x.at.map(v => v.toFixed(2)).join(', ')}) · ${x.k === 'double' ? 'painted by' : 'bordered by'} ${x.g.join(' + ') || '—'}`)
  if (r.regions.length > SHOW) console.error(`        … ${r.regions.length - SHOW} more region(s), ${a(r.regions.slice(SHOW).reduce((t, x) => t + x.m2, 0))} m²`)
  return false
}

if (process.argv.includes('--selftest')) {
  const dir = dirs[0], slab = readSlab(dir), ring = ringOf(slab.gj, dir)
  const base = measure(slab, ring)
  // the largest triangle near the ring's middle: dropped, it must read as a HOLE; copied to another group, a DOUBLE
  let cx = 0, cz = 0; for (const [x, z] of ring) { cx += x; cz += z } cx /= ring.length; cz /= ring.length
  let best = -1, bestA = 0
  for (let t = 0; t < slab.G.length; t++) { const o = t * 6, T = slab.T
    const mx = (T[o] + T[o + 2] + T[o + 4]) / 3, mz = (T[o + 1] + T[o + 3] + T[o + 5]) / 3
    if (Math.hypot(mx - cx, mz - cz) > 300) continue
    const ar = Math.abs((T[o + 2] - T[o]) * (T[o + 5] - T[o + 1]) - (T[o + 4] - T[o]) * (T[o + 3] - T[o + 1])) / 2
    if (ar > bestA) { bestA = ar; best = t } }
  const o = best * 6, at = [(slab.T[o] + slab.T[o + 2] + slab.T[o + 4]) / 3, (slab.T[o + 1] + slab.T[o + 3] + slab.T[o + 5]) / 3], gi = slab.G[best]
  const near = (r, k) => r.regions.filter(x => x.k === k && Math.hypot(x.at[0] - at[0], x.at[1] - at[1]) < Math.sqrt(bestA) + H)
  const dropped = { ...slab, T: [...slab.T.slice(0, o), ...slab.T.slice(o + 6)], G: [...slab.G.slice(0, best), ...slab.G.slice(best + 1)] }
  const rd = measure(dropped, ring)
  const other = (gi + 1) % slab.ids.length
  const copied = { ...slab, T: [...slab.T, ...slab.T.slice(o, o + 6)], G: [...slab.G, other] }
  const rc = measure(copied, ring)
  const hole = near(rd, 'hole').length > 0 && near(base, 'hole').length === 0
  const dbl = near(rc, 'double').some(x => x.g.includes(slab.ids[gi]) && x.g.includes(slab.ids[other])) && near(base, 'double').length === 0
  console.log(`selftest on ${dir}: ${slab.ids[gi]}'s triangle of ${bestA.toFixed(1)} m² at (${at.map(v => v.toFixed(1)).join(', ')})`)
  console.log(`  dropped → ${hole ? '✅ a HOLE there' : '⛔ no hole seen'} (${(rd.holeN * H * H).toFixed(1)} m² of hole in all)`)
  console.log(`  copied into ${slab.ids[other]} → ${dbl ? '✅ a DOUBLE there, naming both' : '⛔ no double seen'} (${(rc.dblN * H * H).toFixed(1)} m² double in all)`)
  process.exit(hole && dbl ? 0 : 1)
}

let bad = 0
for (const d of dirs) {
  const slab = readSlab(d)
  if (!slab.ids.length) { console.error(`  ⛔  ${d}: no group stamped \`partition: true\` — nothing says which groups tile the ground`); bad++; continue }
  if (!report(d, measure(slab, ringOf(slab.gj, d)))) bad++
}
if (bad) { console.error(`⛔ ${bad} slab(s) whose ground is not painted exactly once`); process.exit(1) }
console.log('✅ every slab\'s ground is painted exactly once')
