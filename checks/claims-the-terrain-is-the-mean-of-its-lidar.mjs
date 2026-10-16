// claims-the-terrain-is-the-mean-of-its-lidar.mjs — IS EVERY LAND CELL OF terrain.bin THE MEAN OF ITS 1 m LIDAR?
//
// ⭐ THE INVARIANT: a terrain grid node stands for its own box (one grid step square, centred on the node), so its value
// is the MEAN of the source pixels whose centres fall in that box — not a point read of a coarser copy of the source.
// Read off the town's own raw/elevation-sources.txt at level 0 by range request (nothing downloaded whole), so it cannot
// drift from what the bake reads. ▶ cartograph/elevationSources.mjs#rasterToGrid is the bake's side of it.
//
// ⛔ WHY (2026-10-15, ground budget step 5): the served grid was a bilinear read of the source's 4 m overview. Against
// the true 5 m mean it read p90 1.00 m off on Provincetown's coast and tens of mm across the land of every town
// (scratch/ground-budget/heightmap/*.summary.txt, |r2|). Every reader of the grid inherited it: the datum, the ground's
// lift, lineHeights, the bed.
//
// The mean here is computed its own way — each node's box projected corner by corner into the source's pixel space and
// tested pixel by pixel against that quadrilateral — and the bake's (an affine per node, a priority across tiles) is
// never imported.
//
// ⭐ THE TOLERANCE, DERIVED: the bake holds the mean as Float32 of the ABSOLUTE elevation, then writes Float32 of
// (that − baseElev), and terrain.json carries baseElev ROUNDED TO 1 cm. So stored − (mean − baseElev_json) = one constant
// c (the rounding: |c| ≤ 0.005 m for a local-minimum datum; 0 for a water datum, which is itself a 1 cm bucket) plus two
// Float32 roundings. c is read as the median over the asserted cells and must lie within its bound; each cell must then
// sit within one Float32 ulp of the town's largest absolute elevation plus one of its largest |stored| of c.
//
// CLASSES (each counted, never filled): asserted = every pixel in the box from ONE source (whole), some no-data pixels
// with one source holding the rest (partial; the mean of the valid ones), or two sources holding pixels in the box
// (seam: the mean of the UNION of their valid pixels, a pixel position held by both taken once, from the first in list
// order — asserted only when the sources share one CRS and one pixel lattice, else counted as seam-unaligned) · no lidar = no valid pixel in the box (the bake's miss) · water = under the mapped coast
// (the bed is written there; not this check's question) · coarser source = a source whose pixel is not finer than the
// grid (read bilinear by design; counted, not asserted).
//
// ⭐ MUTATION TEST: --mutate=lift (adds 1 mm to every other stored value — a uniform lift is the rounding constant c and
// is rightly absorbed) and --mutate=shift (the check's box moved 1 m east)
// must each turn a GREEN terrain RED. Today's served terrain (an overview read) must be RED with no mutation.
//
//   node --max-old-space-size=4096 checks/claims-the-terrain-is-the-mean-of-its-lidar.mjs [--town=a,b]
//        [--terrain-dir=<dir holding terrain.json + terrain.bin>] [--windows=24] [--size=40] [--mutate=lift|shift] [--at=coast]
// --at=coast centres each window on a vertex of the mapped coast inside the grid, where the partial boxes (no-data over
// the water) and the coast's own detail are; the default places windows at random over the grid.
// ⚠️ Reads the network (USGS S3 range requests). Exits 1 on any asserted cell out of tolerance.
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { elevationSpecs, openRasters, readWindow, NODATA_THRESHOLD } from '../cartograph/elevationSources.mjs'
import { coastRings } from '../cartograph/coastline.mjs'
import { ringsInDrawing } from '../cartograph/coast-in-drawing.mjs'

const ROOT = new URL('../cartograph/data/', import.meta.url).pathname
const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=')
const towns = arg('town')?.split(',') || readdirSync(ROOT).filter(t => existsSync(join(ROOT, t, 'raw', 'elevation-sources.txt')) && existsSync(join(ROOT, t, 'clean', 'terrain.bin')))
const WINDOWS = +(arg('windows') || 24), SIZE = +(arg('size') || 40), MUTATE = arg('mutate') || null, AT = arg('at') || 'random'
if (!['random', 'coast'].includes(AT)) throw new Error(`--at=${AT}: random or coast`)
if (MUTATE && !['lift', 'shift'].includes(MUTATE)) throw new Error(`--mutate=${MUTATE}: lift or shift`)
// TIE, DERIVED PER BOX: the bake places a pixel in a box by an affine map from three of its corners; the exact box is a
// quadrilateral whose fourth corner sits off that parallelogram by the projection's curvature. A pixel centre closer to an
// edge than that defect is in the box by one reading and out by the other, so it belongs to either box (Huron: a 26-pixel
// box 3.9 mm off, its disputed pixel 1.1e-6 px from the edge, the defect 3.5e-6 px; scratch/ground-budget/terrain-mean/
// edge-pixel.mjs). LATTICE: two tiles whose origins differ by less than this (in pixels) are one pixel lattice — USGS tile origins carry
// float noise (Huron x36y459 vs x37y459: 3.4e-5 px).
const LATTICE = 1e-3
const valid = (v) => Number.isFinite(v) && v >= NODATA_THRESHOLD
const f32ulp = (x) => { const a = Math.abs(Math.fround(x)); if (a === 0) return 2 ** -149; const e = Math.floor(Math.log2(a)); return 2 ** (e - 23) }

// A deterministic stream, so a RED is reproducible window for window.
let seed = 0x9e3779b9
const rand = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296 }

let bad = 0
for (const town of towns) {
  const dir = join(ROOT, town)
  const tdir = arg('terrain-dir') || join(dir, 'clean')
  const tj = JSON.parse(readFileSync(join(tdir, 'terrain.json'), 'utf8'))
  const buf = readFileSync(join(tdir, 'terrain.bin'))
  const stored = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const { width: W, height: H, bounds: B, baseElev } = tj
  if (stored.length !== W * H) throw new Error(`⛔ ${town}: terrain.bin holds ${stored.length} values, terrain.json says ${W}×${H}`)
  const sx = (B.maxX - B.minX) / (W - 1), sz = (B.maxZ - B.minZ) / (H - 1)
  const geo = JSON.parse(readFileSync(join(dir, 'geography.json'), 'utf8'))
  const toLL = (x, z) => [geo.lon + x / geo.lonToMeters, geo.lat - z / geo.latToMeters]
  const toLocal = (lon, lat) => [(lon - geo.lon) * geo.lonToMeters, (geo.lat - lat) * geo.latToMeters]

  // The mapped coast, as the bake asks it (coastline.mjs + coast-in-drawing.mjs — the shared definitions, not a copy).
  const osm = JSON.parse(readFileSync(join(dir, 'raw', 'osm.json'), 'utf8'))
  const bnd = JSON.parse(readFileSync(join(dir, 'neighborhood_boundary.json'), 'utf8'))
  let rings = []
  if (osm.bbox) {
    const a = toLocal(osm.bbox.minLon, osm.bbox.maxLat), b = toLocal(osm.bbox.maxLon, osm.bbox.minLat)
    const bb = { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }
    rings = ringsInDrawing(coastRings({ ground: osm.ground || {}, buildings: osm.buildings || [], center: bnd.center, discR: bnd.radius, bb }).rings || [], B).inDrawing
  }
  const inWater = (x, z) => { let c = false
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const p = r[i], q = r[j]
      if ((p[1] > z) !== (q[1] > z) && x < (q[0] - p[0]) * (z - p[1]) / (q[1] - p[1]) + p[0]) c = !c }
    return c }

  const specs = elevationSpecs(dir).filter(s => s.kind === 'url')
  if (!specs.length) { console.log(`  ${town}: no URL elevation list — not this check's question`); continue }
  const opened = await openRasters(specs, { cacheMB: 64 })
  // A source's pixel in metres, at the town's centre (a pixel may be in degrees).
  const [cx, cz] = bnd.center
  const pixM = opened.map(o => { const p = o.proj.to(...toLL(cx, cz)), q = o.proj.to(...toLL(cx + 1, cz))
    return Math.abs(o.base.getResolution()[0]) / Math.hypot(q[0] - p[0], q[1] - p[1]) })
  const step = Math.min(sx, sz)

  const n = { asserted: 0, whole: 0, partial: 0, seam: 0, seamUnaligned: 0, none: 0, water: 0, coarse: 0 }
  const coastPts = [], unalignedWhy = []
  for (const r of rings) for (const [x, z] of r) { const i = Math.round((x - B.minX) / sx), j = Math.round((z - B.minZ) / sz)
    if (i >= SIZE / 2 && j >= SIZE / 2 && i < W - SIZE / 2 && j < H - SIZE / 2) coastPts.push([i, j]) }
  if (AT === 'coast' && !coastPts.length) { console.log(`  ${town}: no coast vertex inside the grid — --at=coast has nothing to read`); continue }
  const rows = []                                       // [k, stored, mean − baseElev_json]
  for (let w = 0; w < WINDOWS; w++) {
    const [i0, j0] = AT === 'coast' ? (([ci, cj]) => [ci - SIZE / 2, cj - SIZE / 2])(coastPts[Math.floor(rand() * coastPts.length)])
                                    : [Math.floor(rand() * (W - SIZE)), Math.floor(rand() * (H - SIZE))]
    const shift = MUTATE === 'shift' ? 1 : 0
    const X = (i) => B.minX + i * sx + shift, Z = (j) => B.minZ + j * sz
    const corners = [toLL(X(i0) - sx, Z(j0) - sz), toLL(X(i0 + SIZE) + sx, Z(j0) - sz), toLL(X(i0 + SIZE) + sx, Z(j0 + SIZE) + sz), toLL(X(i0) - sx, Z(j0 + SIZE) + sz)]
    const win = await readWindow(opened, { cornersLL: corners, quiet: true })
    const fine = win.map(S => pixM[opened.findIndex(o => o.label === S.label)] < step)
    for (let j = j0; j < j0 + SIZE; j++) for (let i = i0; i < i0 + SIZE; i++) {
      const k = j * W + i, x = X(i), z = Z(j)
      if (inWater(x - shift, z)) { n.water++; continue }
      const quadLL = [toLL(x - sx / 2, z - sz / 2), toLL(x + sx / 2, z - sz / 2), toLL(x + sx / 2, z + sz / 2), toLL(x - sx / 2, z + sz / 2)]
      const held = []                                  // per source holding a valid pixel in the box: { sum, cnt, invalid }
      let coarseHit = false
      win.forEach((S, s) => {
        // the box in this source's PIXEL INDEX space (centre of pixel (a, b) = (a, b))
        const q = quadLL.map(ll => { const [px, py] = S.proj.to(...ll); return [(px - S.x0) / S.rx, (py - S.y0) / S.ry] })
        const a0 = Math.ceil(Math.min(...q.map(p => p[0]))), a1 = Math.floor(Math.max(...q.map(p => p[0])))
        const b0 = Math.ceil(Math.min(...q.map(p => p[1]))), b1 = Math.floor(Math.max(...q.map(p => p[1])))
        const area = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0])
        const sg = Math.sign(area)
        const TIE = Math.max(1e-12, Math.hypot(q[1][0] + q[3][0] - q[0][0] - q[2][0], q[1][1] + q[3][1] - q[0][1] - q[2][1]))
        let sum = 0, cnt = 0, invalid = 0, outside = 0, ties = []
        const px = []                                  // [x, y, v] in the source's own CRS units, for a seam's union
        for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
          // inside, with each edge's distance in pixels; a pixel within TIE of an edge is a TIE (see below)
          let inside = true, tie = false
          for (let e = 0; e < 4 && inside; e++) { const p = q[e], r = q[(e + 1) % 4]
            const cr = sg * ((r[0] - p[0]) * (b - p[1]) - (r[1] - p[1]) * (a - p[0])) / Math.hypot(r[0] - p[0], r[1] - p[1])
            if (cr < -TIE) inside = false; else if (cr <= TIE) tie = true }
          if (!inside) continue
          if (a < 0 || b < 0 || a >= S.winW || b >= S.winH) { outside++; continue }
          const v = S.band[b * S.winW + a]
          if (valid(v)) { if (tie) { ties.push(v); continue } sum += v; cnt++; px.push([S.x0 + a * S.rx, S.y0 + b * S.ry, v]) } else invalid++
        }
        if (!cnt && !ties.length) return
        if (!fine[s]) { coarseHit = true; return }
        held.push({ sum, cnt, invalid: invalid + outside, S, px, ties })
      })
      if (coarseHit && !held.length) { n.coarse++; continue }
      if (!held.length) { n.none++; continue }
      if (held.length > 1) {
        const S0 = held[0].S
        const aligned = held.every(({ S }) => S.proj.epsg === S0.proj.epsg && S.rx === S0.rx && S.ry === S0.ry
          && Math.abs(((S.x0 - S0.x0) / S.rx) - Math.round((S.x0 - S0.x0) / S.rx)) < LATTICE && Math.abs(((S.y0 - S0.y0) / S.ry) - Math.round((S.y0 - S0.y0) / S.ry)) < LATTICE)
        if (!aligned) { n.seamUnaligned++; if (unalignedWhy.length < 3) unalignedWhy.push(held.map(({ S }) => `${S.label.slice(0, 40)} epsg ${S.proj.epsg} rx ${S.rx} ry ${S.ry} x0 ${S.x0} y0 ${S.y0}`).join(' | ')); continue }
        const seen = new Map()
        if (held.some(h => h.ties.length)) { n.seamTie = (n.seamTie || 0) + 1; continue }
        for (const { S, px } of held) for (const [x, y, v] of px) { const key = `${Math.round((x - S0.x0) / S0.rx)},${Math.round((y - S0.y0) / S0.ry)}`; if (!seen.has(key)) seen.set(key, v) }
        let sum = 0; for (const v of seen.values()) sum += v
        n.seam++; n.asserted++
        rows.push([k, stored[k] + (MUTATE === 'lift' && (i + j) % 2 ? 0.001 : 0), sum / seen.size - baseElev, sum / seen.size, 'seam', seen.size])
        continue
      }
      const h = held[0]
      h.invalid ? n.partial++ : n.whole++
      n.asserted++
      // a TIE pixel sits on the box's edge to within TIE: which of the two boxes owns it is decided by the bake's arithmetic,
      // not by the claim, so the cell passes with any subset of its ties counted (the mean is checked against each)
      if (!h.cnt) { n.tieOnly = (n.tieOnly || 0) + 1; continue }
      const alts = []; for (let m = 0; m < (1 << Math.min(h.ties.length, 4)); m++) { let su = h.sum, cn = h.cnt
        h.ties.forEach((v, t) => { if (m >> t & 1) { su += v; cn++ } }); alts.push(su / cn) }
      if (h.ties.length) n.ties = (n.ties || 0) + 1
      const st = stored[k] + (MUTATE === 'lift' && (i + j) % 2 ? 0.001 : 0)
      const best = alts.reduce((x, y) => Math.abs(st - (y - baseElev)) < Math.abs(st - (x - baseElev)) ? y : x)
      rows.push([k, st, best - baseElev, best, h.invalid ? 'partial' : 'whole', h.cnt + h.ties.length])
    }
  }
  if (!rows.length) { console.log(`  ⛔ ${town}: no asserted cell in ${WINDOWS} windows — nothing was measured`); bad++; continue }
  const d = rows.map(([, s, m]) => s - m).sort((a, b) => a - b)
  const c = d[Math.floor(d.length / 2)]
  const maxAbs = rows.reduce((m, [, s]) => Math.max(m, Math.abs(s)), 0)
  const maxElev = rows.reduce((m, r) => Math.max(m, Math.abs(r[3])), 0)
  const tol = f32ulp(maxElev) + f32ulp(maxAbs)
  const off = rows.map(([, s, m]) => Math.abs(s - m - c)).sort((a, b) => a - b)
  const over = off.filter(e => e > tol).length
  const q = (p) => off[Math.min(off.length - 1, Math.floor(p * off.length))]
  const cBound = tj.datum === 'water' ? tol : 0.005 + tol
  const cOk = Math.abs(c) <= cBound
  const ok = !over && cOk
  if (!ok) bad++
  const mm = (v) => (v * 1000).toFixed(v < 0.001 ? 4 : 1) + ' mm'
  console.log(`  ${ok ? '✅' : '⛔'} ${town}${MUTATE ? ` [mutate=${MUTATE}]` : ''}: ${n.asserted.toLocaleString()} land cells asserted (${n.whole.toLocaleString()} whole, ${n.partial.toLocaleString()} partial, ${n.seam.toLocaleString()} seam) in ${WINDOWS} ${AT} windows of ${SIZE}×${SIZE}`
    + ` · offset c ${mm(c)} (${cOk ? 'within' : 'OUTSIDE'} its bound ${mm(cBound)}: ${tj.datum === 'water' ? 'a water datum is a 1 cm bucket' : "baseElev's 1 cm rounding"}) · tolerance ${mm(tol)} (a Float32 ulp at ${maxElev.toFixed(2)} m + one at ${maxAbs.toFixed(2)} m)`
    + ` · ${over.toLocaleString()} over (${(100 * over / rows.length).toFixed(1)}%) · |stored − mean − c| p50 ${mm(q(0.5))} p90 ${mm(q(0.9))} p99 ${mm(q(0.99))} max ${mm(off[off.length - 1])}`)
  if (over) for (const r of rows.filter(r => Math.abs(r[1] - r[2] - c) > tol).sort((x, y) => Math.abs(y[1] - y[2] - c) - Math.abs(x[1] - x[2] - c)).slice(0, 5))
    console.log(`      over: node ${r[0] % W},${Math.floor(r[0] / W)} (${r[4]}, ${r[5]} pixels) stored ${r[1].toFixed(6)} · mean − baseElev ${r[2].toFixed(6)} · off ${mm(r[1] - r[2] - c)}`)
  for (const w of unalignedWhy) console.log(`      seam not asserted (lattices differ): ${w}`)
  console.log(`      not asserted: seam on unaligned lattices ${n.seamUnaligned} · seam with an edge tie ${n.seamTie || 0} · ties only ${n.tieOnly || 0} · (asserted with an edge tie, either owner allowed: ${n.ties || 0}) · no lidar ${n.none} · water ${n.water.toLocaleString()} · coarser source ${n.coarse} · source pixel ${pixM.map(p => p.toFixed(2)).join('/')} m vs grid ${step.toFixed(3)} m`)
}
if (bad) { console.error(`⛔ ${bad} town(s) whose terrain is not the mean of its lidar`); process.exit(1) }
console.log('✅ every asserted land cell is the mean of its lidar')
