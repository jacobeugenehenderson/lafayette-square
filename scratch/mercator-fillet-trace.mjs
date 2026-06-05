// Mercator — instrument filletRing's input for tile#11: the pre-fillet
// (tile − aFill) ring near the corner, each corner's theta/R/inset.
import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
import clipperLib from 'clipper-lib'

const SCALE = 1000
const toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromC = p => [p.X / SCALE, p.Y / SCALE]
function strokeOpen(polyline, delta) {
  if (!(delta > 1e-9) || !polyline || polyline.length < 2) return []
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05 * SCALE)
  co.AddPath(polyline.map(toC), JoinType.jtRound, EndType.etOpenButt)
  const out = []
  co.Execute(out, delta * SCALE)
  return out.map(p => p.map(fromC))
}
function unionRings(rings) {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  let n = 0
  for (const r of rings) if (r && r.length >= 3) { c.AddPath(r.map(toC), PolyType.ptSubject, true); n++ }
  if (!n) return []
  const out = []
  c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromC))
}
function intersectRings(s, cl) {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  for (const r of s) if (r && r.length >= 3) c.AddPath(r.map(toC), PolyType.ptSubject, true)
  for (const r of cl) if (r && r.length >= 3) c.AddPath(r.map(toC), PolyType.ptClip, true)
  const out = []
  c.Execute(ClipType.ctIntersection, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromC))
}
function differenceRings(s, cl) {
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  for (const r of s) if (r && r.length >= 3) c.AddPath(r.map(toC), PolyType.ptSubject, true)
  for (const r of cl) if (r && r.length >= 3) c.AddPath(r.map(toC), PolyType.ptClip, true)
  const out = []
  c.Execute(ClipType.ctDifference, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromC))
}
function signedArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 } return a / 2 }

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const streets = (r.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const tiles = extractFaces(streets)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const NODE = [166.5, 221.9]
const tile = tiles.find(t => t.ring.some(p => dist(p, NODE) < 0.5) && t.ring.some(p => p[0] > 400))

// groupRuns minimal
function groupRuns(tile) {
  const { ring, edges } = tile
  const n = edges.length
  const same = (a, b) => a.streetIdx === b.streetIdx && a.side === b.side
  let seam = 0, found = false
  for (let i = 0; i < n; i++) if (!same(edges[i], edges[(i - 1 + n) % n])) { seam = i; found = true; break }
  if (!found) return [{ streetIdx: edges[0].streetIdx, side: edges[0].side, poly: [...ring, ring[0]] }]
  const runs = []
  let start = seam
  for (let c = 0; c < n;) {
    const i0 = start % n
    let len = 1
    while (len < n && same(edges[(start + len) % n], edges[i0])) len++
    const poly = []
    for (let k = 0; k <= len; k++) poly.push(ring[(i0 + k) % n])
    runs.push({ streetIdx: edges[i0].streetIdx, side: edges[i0].side, poly })
    start = (start + len) % n
    c += len
  }
  return runs
}
const runs = groupRuns(tile)
const aStads = []
for (const run of runs) {
  const s = streets[run.streetIdx]
  const m = s.measure?.[run.side]
  const hw = Math.max(0, Number.isFinite(m?.pavementHW) ? m.pavementHW : 0)
  if (hw > 1e-6) aStads.push(...strokeOpen(run.poly, hw))
}
const aFill = aStads.length ? intersectRings(unionRings(aStads), [tile.ring]) : []
const pre = differenceRings([tile.ring], aFill)
console.log('pre-fillet rings:', pre.length, 'sizes:', pre.map(rr => rr.length).join(','))

// corner analysis on the ring containing the corner window
const FILLET_TURN_TOL = 18 * Math.PI / 180
for (const ring of pre) {
  if (!ring.some(p => p[0] > 150 && p[0] < 280 && p[1] > 100 && p[1] < 245)) continue
  const n = ring.length
  const sign = signedArea(ring) >= 0 ? 1 : -1
  console.log('ring verts:', n, 'area sign:', sign)
  for (let i = 0; i < n; i++) {
    const A = ring[(i - 1 + n) % n], V = ring[i], B = ring[(i + 1) % n]
    let inx = V[0] - A[0], iny = V[1] - A[1], outx = B[0] - V[0], outy = B[1] - V[1]
    const li = Math.hypot(inx, iny), lo = Math.hypot(outx, outy)
    if (li < 1e-6 || lo < 1e-6) continue
    inx /= li; iny /= li; outx /= lo; outy /= lo
    if ((inx * outy - iny * outx) * sign <= 0) continue
    const turn = Math.acos(Math.max(-1, Math.min(1, inx * outx + iny * outy)))
    if (turn < FILLET_TURN_TOL) continue
    const theta = Math.PI - turn
    const tanH = Math.tan(theta / 2)
    const inset = 4.5 / tanH
    if (V[0] > 140 && V[0] < 300 && V[1] > 100 && V[1] < 250)
      console.log(`corner v${i} (${V[0].toFixed(1)},${V[1].toFixed(1)}) turn:${(turn * 180 / Math.PI).toFixed(1)}° theta:${(theta * 180 / Math.PI).toFixed(1)}° uncapped-inset:${inset.toFixed(1)}m legIn:${li.toFixed(1)} legOut:${lo.toFixed(1)}`)
  }
}
