// cap-authoring-roundtrip.mjs — THE REAL GATE for "the dead-end legs don't respond
// to the ribbon authoring controls". Slot-existence is not enough: simulate the
// whole round trip the app performs, with the app's own resolution rules —
//
//   click a point on the leg's strip
//     → side  = sign of the perpendicular offset from the CENTERLINE frame
//               (MeasureOverlay.resolveStripHit)
//     → fe    = nearest frontage polyline on that chain+side
//               (MeasureOverlay.nearestFeForSide)
//     → slot  = feCustomKey(fe) = [skelId, side, min(segOrds)], fanned across
//               fe.segOrds (expandCustomsAcrossFeSegOrds)
//     → read  = blockCustoms[run.skelId][run.side][run.segOrd]  (sectionPassTile)
//
// If the written slots don't contain the run's slot, the edit lands nowhere and
// the strip renders Δ=0.0 — the reported symptom.
//   node scratch/cap-authoring-roundtrip.mjs
import fs from 'fs'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'
import { feCustomKey } from '../src/lib/feCustomKey.js'

const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const nb = JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf8'))
let design = {}
try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const sc0 = ((nb?.streetFade?.outer ?? nb.radius) + 50) / nb.radius
const [cx, cz] = nb.center
const stencil = nb.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const o = console.log; console.log = () => {}
const v2 = buildBlockGeometryV2(ribbons, {
  stencil, blockCustoms: design.blockCustoms || null,
  cornerRadiusScale: design.cornerRadiusScale,
  cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides,
  curbWidth: design.curbWidth ?? 0.15, blockLandUse: design.blockLandUse,
})
console.log = o
const fes = v2.frontageEdges || []

// — the app's geometry helpers, mirrored —
function projectOntoPolyline(pts, px, pz) {
  let best = null, bestD = Infinity, acc = 0, total = 0
  const lens = []
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); total += l }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1
    let t = ((px - a[0]) * dx + (pz - a[1]) * dz) / L2
    t = Math.max(0, Math.min(1, t))
    const qx = a[0] + t * dx, qz = a[1] + t * dz
    const d = Math.hypot(px - qx, pz - qz)
    if (d < bestD) { bestD = d; best = { x: qx, z: qz, t: (acc + t * lens[i]) / (total || 1) } }
    acc += lens[i]
  }
  return best
}
function frameAtPoint(pts, px, pz) {
  const proj = projectOntoPolyline(pts, px, pz)
  const lens = []; let total = 0
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(l); total += l }
  const targetCum = proj.t * total
  let cum = 0, segI = 0
  for (let i = 0; i < pts.length - 1; i++) { if (cum + lens[i] >= targetCum) { segI = i; break } cum += lens[i] }
  const a = pts[segI], b = pts[Math.min(segI + 1, pts.length - 1)]
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1
  return { cx: proj.x, cz: proj.z, nx: -dz / len, nz: dx / len }
}
const nearestFeForSide = (skelId, sideKey, px, pz) => {
  let best = null, bestD = Infinity
  for (const fe of fes) {
    if (fe.side !== sideKey) continue
    if (fe.chainSkelId !== skelId) continue
    if (!fe.points || fe.points.length < 2) continue
    const pr = projectOntoPolyline(fe.points, px, pz)
    const d = Math.hypot(pr.x - px, pr.z - pz)
    if (d < bestD) { bestD = d; best = fe }
  }
  return best
}

// — the dead-end legs the renderer draws, from the FROZEN shape —
const tipKey = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)
const legs = []
for (const t of shape.tiles) {
  const tips = [...(t.roundTips || []), ...(t.bluntTips || [])]
  for (const v of tips) {
    for (const run of (t.runs || [])) {
      if (!run.poly || run.poly.length < 2 || !run.skelId) continue
      const last = run.poly[run.poly.length - 1]
      if (tipKey(run.poly[0]) !== tipKey(v.p) && tipKey(last) !== tipKey(v.p)) continue
      legs.push({ cap: `${v.skelId}:${v.capEnd}`, run, hw: v.hw })
    }
  }
}

const chainOf = (skelId) => ribbons.streets.find(s => (s.skelId || s.name) === skelId)
let dead = 0, wrongSide = 0, ok = 0
for (const L of legs) {
  const st = chainOf(L.run.skelId)
  if (!st) continue
  // a click in the middle of this leg's strip, one curb-ish offset off the centreline
  const mid = [(L.run.poly[0][0] + L.run.poly[L.run.poly.length - 1][0]) / 2,
               (L.run.poly[0][1] + L.run.poly[L.run.poly.length - 1][1]) / 2]
  const fr = frameAtPoint(st.points, mid[0], mid[1])
  // probe BOTH physical sides; the operator clicks the strip they can see
  for (const s of [+1, -1]) {
    const px = fr.cx + fr.nx * (L.hw + 1), pz = fr.cz + fr.nz * (L.hw + 1)
    const qx = fr.cx + fr.nx * s * (L.hw + 1), qz = fr.cz + fr.nz * s * (L.hw + 1)
    const clickSide = s >= 0 ? 'right' : 'left'          // resolveStripHit: signedPerp >= 0 → right
    if (clickSide !== L.run.side) continue                // only the click that targets THIS leg
    const fe = nearestFeForSide(L.run.skelId, clickSide, qx, qz)
    if (!fe) { dead++; console.log(`  DEAD  ${L.cap}  leg ${L.run.skelId}|${L.run.side}|${L.run.segOrd} — no fe resolves for a click on this side`); break }
    const k = feCustomKey(fe)
    const written = new Set(fe.segOrds)                   // the fan
    if (!k) { dead++; break }
    if (!written.has(L.run.segOrd)) {
      wrongSide++
      console.log(`  MISS  ${L.cap}  leg ${L.run.skelId}|${L.run.side}|${L.run.segOrd} — click writes [${[...written].sort((a, b) => a - b)}]`)
    } else ok++
    break
  }
}
console.log(`\n${legs.length} dead-end legs · ${ok} respond · ${wrongSide} write to a slot the render doesn't read · ${dead} resolve to no fe`)
