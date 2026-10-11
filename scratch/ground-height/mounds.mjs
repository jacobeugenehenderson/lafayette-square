// mounds.mjs — BRIEF-the-ground-knows-its-height §5 "a block on a mound", READ-ONLY (range reads; nothing written but
// the report). For every sidewalk stretch of a town (shape.json tile × run), at stations along the curb ring, a profile
// along the inward normal: the DRAWN group at each depth (which band you are in) and the height from TWO sources —
// the 5 m terrain field the ground is drawn from, and the town's 1 m lidar (USGS, range-read, URLs on the command line).
// Per station: the walk's own cross-slope on each source, and the RISE behind the walk (max height gained within
// BEHIND_M of its back edge, over the walk's back-edge height), its RUN (10%→90% of that rise) and its OFFSET (back edge
// → the 10% point). Heights in metres above the terrain's zero (lidar − baseElev).
// Usage: node scratch/ground-height/mounds.mjs <scene> <lidar url> [<lidar url> …] [--behind=20] [--every=5]
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { loadSceneTerrain } from '../../cartograph/terrainLoad.js'
import { openRasters, readWindow, sampleSources } from '../../cartograph/elevationSources.mjs'
const args = process.argv.slice(2)
const scene = args[0], urls = args.filter(a => a.startsWith('http'))
const opt = (k, d) => +(args.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d)
const BEHIND_M = opt('behind', 20), EVERY = opt('every', 5), STEP = 0.5, DEPTH = 45
const root = new URL('../../', import.meta.url).pathname
const slab = join(root, 'public/baked', scene)
const geo = JSON.parse(readFileSync(join(root, 'cartograph/data', scene, 'geography.json')))
const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
const T = loadSceneTerrain(scene), raw = T.getElevationRaw, base = T.baseElev
const gj = JSON.parse(readFileSync(join(slab, 'ground.json')))
const gb = readFileSync(join(slab, 'ground.bin')); const AB = gb.buffer.slice(gb.byteOffset, gb.byteOffset + gb.byteLength)
const shape = JSON.parse(readFileSync(join(slab, 'shape.json')))
// the drawn group at a point (sidewalk / curb / treelawn / face …) — a triangle grid
const CELL = 10, grid = new Map()
for (const g of gj.groups) {
  if (g.partition === false) continue
  const P = new Float32Array(AB, g.vertexByteOffset, g.vertexCount * 3), I = new Uint32Array(AB, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < I.length; i += 3) {
    const v = [I[i], I[i + 1], I[i + 2]].map(k => [P[k * 3], P[k * 3 + 2]])
    const x0 = Math.floor(Math.min(v[0][0], v[1][0], v[2][0]) / CELL), x1 = Math.floor(Math.max(v[0][0], v[1][0], v[2][0]) / CELL)
    const z0 = Math.floor(Math.min(v[0][1], v[1][1], v[2][1]) / CELL), z1 = Math.floor(Math.max(v[0][1], v[1][1], v[2][1]) / CELL)
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 4000) continue
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 100003 + z; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([g.id, v]) }
  }
}
function groupAt(x, z) {
  for (const [id, [a, b, c]] of grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) || []) {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-12) continue
    const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / d, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / d
    if (l1 >= -1e-7 && l2 >= -1e-7 && 1 - l1 - l2 >= -1e-7) return id
  }
  return null
}
function pip(x, z, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const opened = await openRasters(urls.map(u => ({ kind: 'url', ref: u })), { cacheMB: 256 })
const rows = []
let tilesRead = 0, noLidar = 0
for (let ti = 0; ti < shape.tiles.length; ti++) {
  const t = shape.tiles[ti], ia = t.iA?.[0]
  if (!ia || ia.length < 3) continue
  const runs = (t.runs || []).filter(r => r.skelId && !r.skelId.startsWith('__') && r.poly?.length >= 2)
  if (!runs.length) continue
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity
  for (const [x, z] of ia) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z) }
  minx -= 5; minz -= 5; maxx += 5; maxz += 5
  const W = await readWindow(opened, { cornersLL: [toLL(minx, minz), toLL(maxx, minz), toLL(maxx, maxz), toLL(minx, maxz)], stepM: null, quiet: true })
  tilesRead++
  const lid = (x, z) => sampleSources(W, ...toLL(x, z)) - base
  for (const run of runs) {
    const p = run.poly
    let acc = 0, next = EVERY / 2
    for (let i = 0; i + 1 < p.length; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1], L = Math.hypot(bx - ax, bz - az); if (L < 1e-6) { continue }
      const tx = (bx - ax) / L, tz = (bz - az) / L
      let nx = -tz, nz = tx
      if (!pip((ax + bx) / 2 + nx * 0.5, (az + bz) / 2 + nz * 0.5, ia)) { nx = -nx; nz = -nz }
      for (; next <= acc + L; next += EVERY) {
        const u = next - acc, x0 = ax + tx * u, z0 = az + tz * u
        // the bands along the normal, from the drawing
        let wf = null, wb = null
        for (let d = 0.25; d <= DEPTH; d += 0.25) {
          const g = groupAt(x0 + nx * d, z0 + nz * d)
          if (g === 'sidewalk') { if (wf == null) wf = d; wb = d } else if (wf != null) break
        }
        if (wf == null || wb - wf < 0.75) continue
        const at = (d) => [x0 + nx * d, z0 + nz * d]
        const L0 = lid(...at(wf)), L1 = lid(...at(wb))
        if (!Number.isFinite(L0) || !Number.isFinite(L1)) { noLidar++; continue }
        const F0 = raw(...at(wf)), F1 = raw(...at(wb))
        const prof = (h) => { const out = []; for (let d = wb; d <= wb + BEHIND_M + 1e-9; d += STEP) out.push([d - wb, h(...at(d))]); return out }
        const measure = (pr) => {
          const h0 = pr[0][1]; let mx = -Infinity, dm = 0
          for (const [d, h] of pr) if (Number.isFinite(h) && h > mx) { mx = h; dm = d }
          const rise = mx - h0
          if (!(rise > 0)) return { rise: 0 }
          let d10 = null, d90 = null
          for (const [d, h] of pr) { if (d > dm) break; if (d10 == null && h - h0 >= 0.1 * rise) d10 = d; if (d90 == null && h - h0 >= 0.9 * rise) d90 = d }
          return { rise, run: d90 - d10, offset: d10 }
        }
        rows.push({ ti, key: `${run.skelId}|${run.side}|${run.segOrd}`, x: +x0.toFixed(1), z: +z0.toFixed(1), n: [+nx.toFixed(3), +nz.toFixed(3)],
          walkW: wb - wf, lidCross: (L1 - L0) / (wb - wf), fldCross: (F1 - F0) / (wb - wf), lid: measure(prof(lid)), fld: measure(prof(raw)) })
      }
      acc += L
    }
  }
}
const q = (a, ps) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return ps.map(p => s.length ? s[Math.floor(p * (s.length - 1))] : NaN) }
const f2 = v => Number.isFinite(v) ? v.toFixed(2) : '—'
const pct = v => Number.isFinite(v) ? (100 * v).toFixed(2) + '%' : '—'
console.log(`\n=== ${scene}: ${rows.length} walk stations (every ${EVERY} m on ${tilesRead} tiles; ${noLidar} with no lidar) · behind = ${BEHIND_M} m past the walk's back edge`)
const [a50, a90, a99] = q(rows.map(r => Math.abs(r.lidCross)), [0.5, 0.9, 0.99]), [b50, b90, b99] = q(rows.map(r => Math.abs(r.fldCross)), [0.5, 0.9, 0.99])
console.log(`  the walk's own cross-slope (edge to edge, as the source has it): 1 m lidar p50 ${pct(a50)} p90 ${pct(a90)} p99 ${pct(a99)} · 5 m field p50 ${pct(b50)} p90 ${pct(b90)} p99 ${pct(b99)}`)
for (const lim of [1 / 48, 0.05]) console.log(`    over ${pct(lim)}: lidar ${pct(rows.filter(r => Math.abs(r.lidCross) > lim).length / rows.length)} · field ${pct(rows.filter(r => Math.abs(r.fldCross) > lim).length / rows.length)} of stations`)
for (const [nm, k] of [['1 m lidar', 'lid'], ['5 m field', 'fld']]) {
  const R = rows.map(r => r[k])
  const [r50, r90, r99] = q(R.map(m => m.rise), [0.5, 0.9, 0.99])
  console.log(`  ${nm}: rise behind the walk p50 ${f2(r50)} p90 ${f2(r90)} p99 ${f2(r99)} m`)
  for (const lim of [0.5, 1.0, 1.5]) {
    const M = R.filter(m => m.rise >= lim)
    const [n50, n90] = q(M.map(m => m.run), [0.5, 0.1]), [o50, o90] = q(M.map(m => m.offset), [0.5, 0.9])
    console.log(`    rise ≥ ${lim} m: ${M.length} stations (${pct(M.length / rows.length)}) · run (10→90%) p50 ${f2(n50)} m, p10 ${f2(n90)} m · offset behind the walk p50 ${f2(o50)} p90 ${f2(o90)} m · steepness p50 ${f2(q(M.map(m => 0.8 * m.rise / Math.max(m.run, 0.5)), [0.5])[0])}`)
  }
}
// the same station on both sources: how the 5 m field carries a 1 m rise
const P = rows.filter(r => r.lid.rise >= 1.0)
const [g50, g90] = q(P.map(r => r.fld.run - r.lid.run), [0.5, 0.9]), [h50] = q(P.map(r => r.fld.rise / r.lid.rise), [0.5])
console.log(`  at the ${P.length} stations with a ≥ 1 m lidar rise: the field's run is longer by p50 ${f2(g50)} p90 ${f2(g90)} m; field rise / lidar rise p50 ${f2(h50)}`)
// by stretch: the worst mounds with a tilted walk
const by = new Map(); for (const r of rows) { const k = r.ti + '#' + r.key; if (!by.has(k)) by.set(k, []); by.get(k).push(r) }
const st = [...by].map(([k, R]) => { const best = R.reduce((b, r) => (0.8 * r.lid.rise / Math.max(r.lid.run || 1e9, 0.5) > 0.8 * b.lid.rise / Math.max(b.lid.run || 1e9, 0.5) && r.lid.rise >= 1 ? r : b), R[0]); return { k, n: R.length, best } })
  .filter(s => s.best.lid.rise >= 1).sort((a, b) => b.best.lid.rise / Math.max(b.best.lid.run, 0.5) - a.best.lid.rise / Math.max(a.best.lid.run, 0.5))
console.log(`  steepest lidar mounds behind a walk (tile # skelId|side|segOrd): rise / run / offset · walk cross lidar vs field · at (x,z) facing`)
for (const s of st.slice(0, 12)) { const r = s.best; console.log(`    ${s.k.padEnd(44)} ${f2(r.lid.rise)} m / ${f2(r.lid.run)} m / ${f2(r.lid.offset)} m · walk ${pct(r.lidCross)} vs ${pct(r.fldCross)} · field rise ${f2(r.fld.rise)} over ${f2(r.fld.run)} m · (${r.x}, ${r.z}) n ${r.n}`) }
writeFileSync(join(root, 'scratch/ground-height', `mounds-${scene}.json`), JSON.stringify(rows))
