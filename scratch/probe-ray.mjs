#!/usr/bin/env node
// Precise: walk the welded centerline across a transition node, raycast OUTBOARD
// to the live iA curb, compare hit distance to the ideal half-width. >hw = curb
// bulges OUT (extra asphalt); <hw = notch (curb pulled toward centerline).
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
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const cross = (a, b) => a[0] * b[1] - a[1] * b[0]

function welded(cwId) {
  const cw = byId.get(cwId), ph = cw.phase || {}
  let pts = cw.points.map(p => [...p])
  if (ph.spineAtStart) { let sp = byId.get(ph.spineAtStart).points.map(p => [...p]); if (eq(sp[0], pts[0])) sp = sp.reverse(); pts = [...sp.slice(0, -1), ...pts] }
  if (ph.spineAtEnd)   { let sp = byId.get(ph.spineAtEnd).points.map(p => [...p]);   if (eq(sp[sp.length - 1], pts[pts.length - 1])) sp = sp.reverse(); pts = [...pts, ...sp.slice(1)] }
  const side = cw.innerSign === +1 ? 'left' : 'right'
  const hw = cw.measure?.[side]?.pavementHW || 0
  return { pts, side, hw }
}
// resample welded centerline every 1m, with arc position
function resample(pts, step = 1) {
  const out = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.round(L / step))
    for (let k = 0; k < n; k++) { const f = k / n; out.push({ p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] }) }
  }
  out.push({ p: pts[pts.length - 1], t: out.length ? out[out.length - 1].t : [1, 0] })
  return out
}
function rayHitAll(O, D, edgeSets) {
  let best = Infinity
  for (const edges of edgeSets) for (let i = 1; i < edges.length; i++) {
    const A = edges[i - 1], B = edges[i], E = sub(B, A), den = cross(E, D)
    if (Math.abs(den) < 1e-12) continue
    const W = sub(A, O), t = cross(E, W) / den, s = cross(D, W) / den
    if (t > 1e-4 && s >= -1e-9 && s <= 1 + 1e-9 && t < best) best = t
  }
  return best
}
const allCurb = tiles.flatMap(t => (t.iA || []))

const targets = ['lafayette-avenue-2', 'park-avenue-0', 'south-jefferson-avenue-1']
for (const id of targets) {
  const w = welded(id)
  const cw = byId.get(id), ph = cw.phase
  const node = ph.spineAtEnd ? cw.points[cw.points.length - 1] : cw.points[0]
  console.log(`\n=== ${id}  node=${node.map(n => n.toFixed(0))}  hw=${w.hw.toFixed(2)} side=${w.side} ===`)
  const samp = resample(w.pts, 1)
  // restrict to within 14m of node, print outboard ray hit
  for (const s of samp) {
    const dn = Math.hypot(s.p[0] - node[0], s.p[1] - node[1])
    if (dn > 12) continue
    const N = perp(s.t, w.side)
    const hit = rayHitAll(s.p, N, allCurb)
    const flag = !isFinite(hit) ? '—' : (hit > w.hw + 0.5 ? `BULGE +${(hit - w.hw).toFixed(2)}` : (hit < w.hw - 0.5 ? `NOTCH ${(hit - w.hw).toFixed(2)}` : 'ok'))
    console.log(`  s@${s.p.map(n => n.toFixed(0)).join(',').padEnd(11)} dNode=${dn.toFixed(1).padStart(5)}  rayHit=${isFinite(hit) ? hit.toFixed(2) : 'inf'}  ${flag}`)
  }
}
