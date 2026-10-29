// DESIGN-candidate-3.md, build step 0 (read-only measurements, nothing in the kit changes):
//  (a) does clipper's union, given an input already noded by latticeNode.js#nodeCrossings, emit only the noded vertices and
//      the noded segments (so a tag rides by exact identity)?
//  (b) nodeCrossings' cost on a raw offset curve fed as one open path per edge (the measurement stands in for the `self`
//      option Zob rules on; the build uses whichever he picks)
//  (c) parity: the tagged erode (step 1) built point for point as clipper-lib's ClipperOffset (jtMiter, MiterLimit 2:
//      OffsetPoint / DoMiter / DoSquare, each point rounded as clipper rounds it), resolved by (a), against
//      ClipperOffset.Execute(−h) itself: area and part counts
// node scratch/cut-once/step0.mjs --fixture=decks|huron [--collinear=default]  (Zob C2: clipper's PreserveCollinear defaults to
//   false and REMOVES collinear vertices; the default run measures what that drops: unmapped edges = runs spanning two segments)
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { nodeCrossings } from '../../src/lib/latticeNode.js'
const { IntPoint, Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, PolyTree, Paths, JoinType, EndType } = clipperLib
const SCALE = 1000
const arg = (k) => process.argv.slice(2).map(a => a.match(new RegExp(`^--${k}=(.+)$`))).find(Boolean)?.[1]
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const ip = (pp) => pp.map(p => p.map(q => (Array.isArray(q) ? new IntPoint(q[0], q[1]) : new IntPoint(q.X, q.Y))))
const FIX = { decks: () => { const d = fx('ptown-deck-inputs'); return { src: ip(d.inputs.flat()), stepM: d.fineM } },
  huron: () => { const d = fx('huron-traced'); return { src: ip(d.traced), stepM: d.fineM } } }
const keep = arg('collinear') !== 'default', name = arg('fixture') || 'decks', { src, stepM } = FIX[name](), h = (stepM / 2) * SCALE
const uni = (pp, fill = PolyFillType.pftNonZero, keepCollinear = true) => { const c = new Clipper(), t = new PolyTree(); c.PreserveCollinear = keepCollinear; c.AddPaths(pp, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, t, fill, fill); return t }
const flat = (t) => { const o = []; const w = (n) => { for (const ch of n.Childs()) { o.push(ch.Contour()); for (const hh of ch.Childs()) { o.push(hh.Contour()); w(hh) } } }; w(t); return o }
const parts = (t) => { const o = []; const w = (n) => { for (const ch of n.Childs()) { o.push([ch.Contour(), ...ch.Childs().map(c => c.Contour())]); for (const hh of ch.Childs()) w(hh) } }; w(t); return o }
const areaM2 = (pp) => pp.reduce((t, p) => t + Clipper.Area(p), 0) / SCALE / SCALE
const topo = (pp) => ({ outers: pp.filter(p => Clipper.Area(p) > 0).length, holes: pp.filter(p => Clipper.Area(p) < 0).length })

// ── step 1: one ring's raw offset curve at `d`, each point carrying `tag`: the source edge its OUTGOING raw edge offsets
// (null for a join's own edges). ClipperOffset's rules, verbatim in effect (clipper.js OffsetPoint, DoMiter, DoSquare).
const miterLim = 0.5                     // clipper's own constant for MiterLimit 2 (2 / MiterLimit², floored at 0.5): parity ONLY
function rawOffset(ring, d, ringId) {
  const n = ring.length, N = []
  for (let j = 0; j < n; j++) { const a = ring[j], b = ring[(j + 1) % n], dx = b.X - a.X, dy = b.Y - a.Y, f = 1 / Math.hypot(dx, dy); N.push([dy * f, -dx * f]) }
  const out = [], R = (v) => Math.round(v), put = (x, y, tag) => out.push({ X: R(x), Y: R(y), tag })
  for (let j = 0; j < n; j++) { const k = (j - 1 + n) % n, p = ring[j], nk = N[k], nj = N[j]
    let sinA = nk[0] * nj[1] - nj[0] * nk[1]; const cosA = nk[0] * nj[0] + nk[1] * nj[1]
    const edge = { ring: ringId, i: j }                                    // the raw edge leaving this vertex's LAST point offsets source edge j
    if (Math.abs(sinA * d) < 1.0 && cosA > 0) { put(p.X + nk[0] * d, p.Y + nk[1] * d, edge); continue }
    sinA = Math.max(-1, Math.min(1, sinA))
    if (sinA * d < 0) { put(p.X + nk[0] * d, p.Y + nk[1] * d, null); put(p.X, p.Y, null); put(p.X + nj[0] * d, p.Y + nj[1] * d, edge); continue }
    const r = 1 + cosA
    if (r >= miterLim) { const q = d / r; put(p.X + (nk[0] + nj[0]) * q, p.Y + (nk[1] + nj[1]) * q, edge) }
    else { const t = Math.tan(Math.atan2(sinA, cosA) / 4)
      put(p.X + d * (nk[0] - nk[1] * t), p.Y + d * (nk[1] + nk[0] * t), null); put(p.X + d * (nj[0] + nj[1] * t), p.Y + d * (nj[1] - nj[0] * t), edge) } }
  return out
}

// ── resolve: node every raw edge against every other (one open path per edge), reassemble the rings, union (positive)
function resolve(rawRings, fill) {
  const items = [], owner = []
  rawRings.forEach((r, ri) => r.forEach((a, i) => { const b = r[(i + 1) % r.length]; if (a.X === b.X && a.Y === b.Y) return
    items.push({ p: [[a.X / SCALE, a.Y / SCALE], [b.X / SCALE, b.Y / SCALE]], tag: `r${ri}e${i}`, open: true }); owner.push({ ri, tag: a.tag }) }))
  const t0 = Date.now(), R = nodeCrossings(items, { pairs: () => true, who: 'step0' }), nodeMs = Date.now() - t0
  const seg = new Map(), verts = new Set(), noded = rawRings.map(() => [])
  R.forEach((o, m) => { const { ri, tag } = owner[m]
    for (let q = 0; q + 1 < o.length; q++) { const a = o[q].k, b = o[q + 1].k; seg.set(`${a[0]},${a[1]}>${b[0]},${b[1]}`, tag); verts.add(`${a[0]},${a[1]}`) }
    verts.add(`${o[o.length - 1].k[0]},${o[o.length - 1].k[1]}`)
    for (let q = 0; q + 1 < o.length; q++) noded[ri].push(new IntPoint(o[q].k[0], o[q].k[1])) })
  const t1 = Date.now(), out = flat(uni(noded.filter(p => p.length >= 3), fill, keep)), unionMs = Date.now() - t1
  // (a): every output vertex a noded vertex; every output edge a noded segment, in either direction (holes reverse)
  const newAt = []; let newV = 0, unmapped = 0, mapped = 0; const outV = new Set(); for (const p of out) for (const q of p) outV.add(`${q.X},${q.Y}`)
  for (const p of out) for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]
    if (!verts.has(`${a.X},${a.Y}`)) { newV++; if (newAt.length < 6) newAt.push([a.X, a.Y]) }
    if (seg.has(`${a.X},${a.Y}>${b.X},${b.Y}`) || seg.has(`${b.X},${b.Y}>${a.X},${a.Y}`)) mapped++; else unmapped++ }
  return { out, nodeMs, unionMs, crossings: R.crossings, newV, mapped, unmapped, rawEdges: items.length, nodedVerts: verts.size, outVerts: outV.size, newAt, nodedSegs: [...seg.keys()] }
}

const t = uni(src), P = parts(t)
let raw = [], ref = []
for (const part of P) { part.forEach((ring, ri) => raw.push(rawOffset(ring, -h, ri)))
  const co = new ClipperOffset(), o = new Paths(); co.AddPaths(part, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, -h); ref.push(...o) }
const r = resolve(raw, PolyFillType.pftPositive)
const x = new Clipper(), xo = new Paths(); x.AddPaths(r.out, PolyType.ptSubject, true); x.AddPaths(ref, PolyType.ptClip, true); x.Execute(ClipType.ctXor, xo, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
console.log(JSON.stringify({ fixture: name, preserveCollinear: keep, parts: P.length, rawEdges: r.rawEdges, nodeMs: r.nodeMs, unionMs: r.unionMs, crossings: r.crossings,
  a: { newAt: r.newAt.map(([X, Y]) => { let best = null; for (const k of r.nodedSegs) { const [u, w] = k.split('>').map(q => q.split(',').map(Number)), dx = w[0] - u[0], dy = w[1] - u[1], L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((X - u[0]) * dx + (Y - u[1]) * dy) / L2)), d = Math.hypot(X - u[0] - t * dx, Y - u[1] - t * dy); if (!best || d < best.d) best = { d: +d.toFixed(3), seg: k, t: +t.toFixed(4) } } return { at: [X / SCALE, Y / SCALE], nearest: best } }), nodedVertices: r.nodedVerts, outputVertices: r.outVerts, newVertices: r.newV, edgesMapped: r.mapped, edgesUnmapped: r.unmapped },
  c: { tagged: { m2: +areaM2(r.out).toFixed(3), ...topo(r.out) }, clipper: { m2: +areaM2(ref).toFixed(3), ...topo(ref) }, xorM2: +areaM2(xo).toFixed(4) } }))
