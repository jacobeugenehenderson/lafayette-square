// Shared street-label data — same source feeds both Cartograph's
// MapLayers (Designer) and LafayetteScene (Preview/LS) so they
// never drift apart. ribbonsData is a static import, so the result
// is computed once at module load.
//
// What ships out: [{ name, x, z, angle }] — one label per named
// street, positioned at the arclength midpoint of that street's
// longest chain, with the segment's local angle (normalized to
// [-π/2, π/2] so text always reads left-to-right).
//
// Filtering:
//   - Skip motorway / motorway_link / trunk_link entirely. Their
//     synthetic 'motorway_link 13' names are positional indices
//     from skeleton.js, not walkable destinations. Doctrine
//     [[project_labels_encourage_walking]].
//   - Skip labels whose midpoint falls outside the tight label
//     boundary derived from the four LS boundary corridors
//     (Jefferson / Lafayette / Truman / Chouteau). The wider
//     neighborhood_boundary 1.8 km circle is too generous to gate
//     anything in this scene.
//
// Boundary derivation: pairwise segment intersection between
// adjacent corridors → 4 corners → pad 30 m outward from the
// centroid. Falls back to the nearest-endpoint pair if two
// corridors T into each other without a true crossing.

import ribbonsData from '../data/ribbons.json'

const NO_LABEL_HIGHWAY = new Set(['motorway_link', 'trunk_link', 'motorway'])
const BOUNDARY_CORRIDORS = ['South Jefferson Avenue', 'Lafayette Avenue', 'Truman Parkway', 'Chouteau Avenue']

function segXSeg(p1, p2, p3, p4) {
  const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1]
  const x3 = p3[0], y3 = p3[1], x4 = p4[0], y4 = p4[1]
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(den) < 1e-9) return null
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
}

function findCorner(byCorridor, nameA, nameB) {
  const A = byCorridor.get(nameA) || [], B = byCorridor.get(nameB) || []
  for (const sa of A) {
    const pa = sa.points
    for (let i = 0; i < pa.length - 1; i++) {
      for (const sb of B) {
        const pb = sb.points
        for (let j = 0; j < pb.length - 1; j++) {
          const hit = segXSeg(pa[i], pa[i + 1], pb[j], pb[j + 1])
          if (hit) return hit
        }
      }
    }
  }
  let best = null
  for (const sa of A) for (const pa of [sa.points[0], sa.points[sa.points.length - 1]]) {
    for (const sb of B) for (const pb of [sb.points[0], sb.points[sb.points.length - 1]]) {
      const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1])
      if (!best || d < best.d) best = { d, pt: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2] }
    }
  }
  return best?.pt || null
}

function buildLabelBoundary() {
  const byCorridor = new Map(BOUNDARY_CORRIDORS.map(c => [c, []]))
  for (const st of ribbonsData.streets) {
    if (byCorridor.has(st.name) && st.points?.length >= 2) byCorridor.get(st.name).push(st)
  }
  const nw = findCorner(byCorridor, 'South Jefferson Avenue', 'Lafayette Avenue')
  const ne = findCorner(byCorridor, 'Lafayette Avenue',       'Truman Parkway')
  const se = findCorner(byCorridor, 'Truman Parkway',         'Chouteau Avenue')
  const sw = findCorner(byCorridor, 'Chouteau Avenue',        'South Jefferson Avenue')
  if (!nw || !ne || !se || !sw) return null
  const corners = [nw, ne, se, sw]
  const cx = (nw[0] + ne[0] + se[0] + sw[0]) / 4
  const cz = (nw[1] + ne[1] + se[1] + sw[1]) / 4
  const PAD = 30
  return corners.map(([x, z]) => {
    const dx = x - cx, dz = z - cz
    const len = Math.hypot(dx, dz) || 1
    return [x + (dx / len) * PAD, z + (dz / len) * PAD]
  })
}

function pointInPolygon(x, z, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1]
    const xj = poly[j][0], zj = poly[j][1]
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside
  }
  return inside
}

function compute() {
  const boundary = buildLabelBoundary()
  const byName = new Map()
  for (const st of ribbonsData.streets) {
    if (!st.name || !st.points || st.points.length < 2) continue
    if (NO_LABEL_HIGHWAY.has(st.highway)) continue
    if (!byName.has(st.name)) byName.set(st.name, [])
    byName.get(st.name).push(st)
  }
  const labels = []
  for (const [name, chains] of byName) {
    let best = null
    for (const st of chains) {
      const pts = st.points
      const segLens = []
      let totalLen = 0
      for (let i = 0; i < pts.length - 1; i++) {
        const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        segLens.push(L)
        totalLen += L
      }
      if (totalLen === 0) continue
      const halfLen = totalLen / 2
      let acc = 0, segIdx = 0
      for (; segIdx < segLens.length - 1; segIdx++) {
        if (acc + segLens[segIdx] >= halfLen) break
        acc += segLens[segIdx]
      }
      const t = segLens[segIdx] > 0 ? (halfLen - acc) / segLens[segIdx] : 0
      const ax = pts[segIdx][0],     ay = pts[segIdx][1]
      const bx = pts[segIdx + 1][0], by = pts[segIdx + 1][1]
      const cx = ax + (bx - ax) * t
      const cy = ay + (by - ay) * t
      if (boundary && !pointInPolygon(cx, cy, boundary)) continue
      if (best && totalLen <= best.totalLen) continue
      let angle = Math.atan2(by - ay, bx - ax)
      if (angle >  Math.PI / 2) angle -= Math.PI
      if (angle < -Math.PI / 2) angle += Math.PI
      // Pavement width of this chain (both sides of centerline). Drives
      // per-label size scaling in SceneLabel — wide arterials get bigger
      // labels, narrow residentials stay quieter. Divided corridors
      // expose one carriageway per chain, so the value is half the
      // total ROW; the chain-selection-by-longest-arclength still picks
      // a representative geometry.
      const m = st.measure || {}
      const widthM = (m.left?.pavementHW || 0) + (m.right?.pavementHW || 0) || null
      best = { cx, cy, totalLen, angle, widthM }
    }
    if (!best) continue
    labels.push({ name, x: best.cx, z: best.cy, angle: best.angle, widthM: best.widthM })
  }
  return labels
}

const STREET_LABELS = compute()

export default function getStreetLabels() {
  return STREET_LABELS
}
