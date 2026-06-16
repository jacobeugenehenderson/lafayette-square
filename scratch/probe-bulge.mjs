#!/usr/bin/env node
// Measure the curb (iA) deviation in the JUNCTION ZONE at each divided
// transition node — the "d" the litmus is blind to. For each carriageway's
// spineAt* shared node, build the welded outboard offset line (the IDEAL outer
// curb) and measure how far the live iA curb sits from it within R of the node.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const byId = new Map(ribbons.streets.map(s => [s.skelId, s]))

const pr = buildTileGround(ribbons, {
  stencil: null, curbWidth: 0.15, smooth: 0, blockLandUse: null,
  cornerRadiusScale: 1, cornerRadiusOverrides: null, cornerCornerRadiusOverrides: null,
  blockCustoms: null, emitArtifact: true,
})
const tiles = pr._shapeArtifact || []

const k3 = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`
const eq = (a, b) => k3(a) === k3(b)
const perp = (t, side) => side === 'right' ? [-t[1], t[0]] : [t[1], -t[0]]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// welded centerline + outboard offset (the ideal outer curb) for a carriageway
function weldOffset(cwId) {
  const cw = byId.get(cwId), ph = cw.phase || {}
  let pts = cw.points.map(p => [...p])
  if (ph.spineAtStart) {
    let sp = byId.get(ph.spineAtStart).points.map(p => [...p])
    if (eq(sp[0], pts[0])) sp = sp.reverse()
    pts = [...sp.slice(0, -1), ...pts]
  }
  if (ph.spineAtEnd) {
    let sp = byId.get(ph.spineAtEnd).points.map(p => [...p])
    if (eq(sp[sp.length - 1], pts[pts.length - 1])) sp = sp.reverse()
    pts = [...pts, ...sp.slice(1)]
  }
  const side = cw.innerSign === +1 ? 'left' : 'right'
  const hw = cw.measure?.[side]?.pavementHW || 0
  const off = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const tx = b[0] - a[0], tz = b[1] - a[1], L = Math.hypot(tx, tz) || 1
    const n = perp([tx / L, tz / L], side)
    off.push([pts[i][0] + n[0] * hw, pts[i][1] + n[1] * hw])
  }
  return { pts, off, hw, side, cw }
}

// nearest distance from point P to polyline segments
function distToPolyline(P, poly) {
  let best = Infinity
  for (let i = 1; i < poly.length; i++) {
    const A = poly[i - 1], B = poly[i]
    const ex = B[0] - A[0], ez = B[1] - A[1], L2 = ex * ex + ez * ez || 1
    let t = ((P[0] - A[0]) * ex + (P[1] - A[1]) * ez) / L2
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(P[0] - (A[0] + ex * t), P[1] - (A[1] + ez * t)))
  }
  return best
}

const R = 14  // transition-box radius
const carr = ribbons.streets.filter(s => /^carriageway/.test(s.phase?.role || '') && (s.phase?.spineAtStart || s.phase?.spineAtEnd))
const seen = new Set()
for (const cw of carr) {
  const ph = cw.phase
  for (const [end, spId] of [['start', ph.spineAtStart], ['end', ph.spineAtEnd]]) {
    if (!spId) continue
    const node = end === 'start' ? cw.points[0] : cw.points[cw.points.length - 1]
    const nk = k3(node)
    const w = weldOffset(cw.skelId)
    // gather iA curb segments near the node, measure their deviation from the ideal offset line
    let maxDev = 0, nSamp = 0, devSum = 0
    for (const t of tiles) {
      if (!t.iA) continue
      for (const ring of t.iA) {
        for (const V of ring) {
          if (dist(V, node) > R) continue
          // only the outboard side of the corridor (skip the median / far side):
          // measure deviation from the ideal welded offset line
          const d = distToPolyline(V, w.off)
          // ignore curb vertices that belong to the cross street or the median
          // (far from the ideal line) — we want the corridor outer curb only
          if (d > 6) continue
          maxDev = Math.max(maxDev, d); devSum += d; nSamp++
        }
      }
    }
    console.log(`${cw.skelId.padEnd(28)} ${end.padEnd(5)} node ${node.map(n => n.toFixed(0)).join(',').padEnd(12)} hw=${w.hw.toFixed(1)}  curb-vtx-near=${nSamp}  maxDev=${maxDev.toFixed(2)}m  avgDev=${nSamp ? (devSum / nSamp).toFixed(2) : '-'}m`)
  }
}
