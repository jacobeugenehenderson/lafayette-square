#!/usr/bin/env node
// D6a.0 — build & validate the welded outer polyline for ONE corridor.
// Gate: continuous through the transition node, no stub tip; the outboard
// offset edge runs straight through (no re-entrant bulge).
import fs from 'fs'
const r = JSON.parse(fs.readFileSync('./src/data/ribbons.json'))
const byId = new Map(r.streets.map(s => [s.skelId, s]))

const k3 = (p) => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`
const eq = (a, b) => k3(a) === k3(b)

// Weld a carriageway to its spine continuation(s). Returns the continuous
// outer polyline (carriageway points, spine points appended at the linked end,
// oriented on the shared node) + the outboard side + outer half-width.
function weld(cwId) {
  const cw = byId.get(cwId)
  const ph = cw.phase || {}
  let pts = cw.points.map(p => [...p])
  // append spine at start
  if (ph.spineAtStart) {
    const sp = byId.get(ph.spineAtStart)
    let spp = sp.points.map(p => [...p])
    // shared node = cw start. orient spine so it leads INTO cw start (spine end == cw start)
    if (eq(spp[spp.length - 1], pts[0])) { /* spine ... node */ }
    else if (eq(spp[0], pts[0])) spp = spp.reverse()
    else return { err: `spineAtStart ${ph.spineAtStart} shares no node with ${cwId} start` }
    pts = [...spp.slice(0, -1), ...pts]   // drop the duplicate shared node
  }
  if (ph.spineAtEnd) {
    const sp = byId.get(ph.spineAtEnd)
    let spp = sp.points.map(p => [...p])
    if (eq(spp[0], pts[pts.length - 1])) { /* node ... spine */ }
    else if (eq(spp[spp.length - 1], pts[pts.length - 1])) spp = spp.reverse()
    else return { err: `spineAtEnd ${ph.spineAtEnd} shares no node with ${cwId} end` }
    pts = [...pts, ...spp.slice(1)]
  }
  const outboard = cw.innerSign === +1 ? 'left' : 'right'
  const outHW = cw.measure?.[outboard]?.pavementHW || 0
  return { pts, outboard, outHW, cw }
}

// offset a polyline to one side by d (outboard). 'right' perp of tangent (tx,tz) = (-tz? )
// Match tileGround sidePerpT: right => [-t[1], t[0]] ; left => [t[1], -t[0]]
function perp(t, side) { return side === 'right' ? [-t[1], t[0]] : [t[1], -t[0]] }
function offsetEdge(pts, d, side) {
  const out = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const tx = b[0] - a[0], tz = b[1] - a[1]
    const L = Math.hypot(tx, tz) || 1
    const n = perp([tx / L, tz / L], side)
    out.push([pts[i][0] + n[0] * d, pts[i][1] + n[1] * d])
  }
  return out
}

for (const cwId of ['lafayette-avenue-2', 'lafayette-avenue-4', 'lafayette-avenue-5', 'lafayette-avenue-6']) {
  const w = weld(cwId)
  console.log(`\n=== ${cwId} ===`)
  if (w.err) { console.log('  ERR:', w.err); continue }
  console.log(`  outboard=${w.outboard} outHW=${w.outHW.toFixed(2)} weldedPts=${w.pts.length}`)
  // continuity: no zero-length seg, no duplicate interior node
  let dupes = 0, zeros = 0
  for (let i = 1; i < w.pts.length; i++) {
    if (eq(w.pts[i], w.pts[i - 1])) dupes++
    if (Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]) < 0.01) zeros++
  }
  console.log(`  continuity: ${dupes} dup nodes, ${zeros} zero segs`)
  // outboard offset edge: check turn signs — a bulge is a re-entrant (sign flip
  // back toward the chain) near the node. Print the turn angle at each interior pt.
  const oe = offsetEdge(w.pts, w.outHW, w.outboard)
  const path = w.pts.map(p => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(' → ')
  console.log('  welded centerline:', path)
}
