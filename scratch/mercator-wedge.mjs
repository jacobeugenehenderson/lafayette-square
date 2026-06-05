// Mercator — which run's asphalt stadium covers the wedge that eats the park NW corner?
import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
import clipperLib from 'clipper-lib'

const SCALE = 1000
const toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
function strokeOpen(polyline, delta) {
  if (!(delta > 1e-9) || !polyline || polyline.length < 2) return []
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05 * SCALE)
  co.AddPath(polyline.map(toC), JoinType.jtRound, EndType.etOpenButt)
  const out = []
  co.Execute(out, delta * SCALE)
  return out.map(p => p.map(q => [q.X / SCALE, q.Y / SCALE]))
}
function pointInRing(px, py, r) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const streets = (r.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
const tiles = extractFaces(streets)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const NODE = [166.5, 221.9]
const tile = tiles.find(t => t.ring.some(p => dist(p, NODE) < 0.5) && t.ring.some(p => p[0] > 400))

// groupRuns (copied minimal)
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
const TESTPTS = [[200, 180], [210, 200], [190, 150], [220, 210]]
const runs = groupRuns(tile)
for (const run of runs) {
  const s = streets[run.streetIdx]
  const m = s.measure?.[run.side]
  const hw = Math.max(0, Number.isFinite(m?.pavementHW) ? m.pavementHW : 0)
  if (hw <= 1e-6) continue
  const stads = strokeOpen(run.poly, hw)
  for (const tp of TESTPTS) {
    for (const ring of stads) {
      if (pointInRing(tp[0], tp[1], ring)) {
        console.log('COVERS', JSON.stringify(tp), '←', s.skelId + '/' + run.side, 'hw=' + hw.toFixed(2), 'runPoly[0..2]:', JSON.stringify(run.poly.slice(0, 3).map(p => p.map(v => +v.toFixed(1)))))
      }
    }
  }
}
