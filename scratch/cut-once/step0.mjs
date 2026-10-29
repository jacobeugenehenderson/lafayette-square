// DESIGN-candidate-3.md, build step 0 (read-only measurements, nothing in the kit changes):
//  (a) does clipper's union, given an input already noded by latticeNode.js#nodeCrossings, emit only the noded vertices and
//      the noded segments (so a tag rides by exact identity)?
//  (b) nodeCrossings' cost on a raw offset curve fed as one open path per edge (the measurement stands in for the `self`
//      option Zob rules on; the build uses whichever he picks)
//  (c) parity: the tagged erode (step 1) built point for point as clipper-lib's ClipperOffset (jtMiter, MiterLimit 2:
//      OffsetPoint / DoMiter / DoSquare, each point rounded as clipper rounds it), resolved by (a), against
//      ClipperOffset.Execute(−h) itself: area and part counts
// node scratch/cut-once/step0.mjs --fixture=decks|huron [--engine=faces|clipper] [--collinear=default]
//   faces (Zob's ruling (ii)): nodeCrossings with `self` over the closed raw rings, then latticeFaces.js#facesOf (w > 0);
//   clipper: one open path per edge, then clipper's union, the measurement that failed (a) on Huron  (Zob C2: clipper's PreserveCollinear defaults to
//   false and REMOVES collinear vertices; the default run measures what that drops: unmapped edges = runs spanning two segments)
import fs from 'fs'
import clipperLib from 'clipper-lib'
import { nodeCrossings } from '../../src/lib/latticeNode.js'
import { facesOf } from '../../src/lib/latticeFaces.js'
import { tagRun } from './tagRun.mjs'
const { IntPoint, Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, PolyTree, Paths, JoinType, EndType } = clipperLib
const SCALE = 1000
const arg = (k) => process.argv.slice(2).map(a => a.match(new RegExp(`^--${k}=(.+)$`))).find(Boolean)?.[1]
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'))
const ip = (pp) => pp.map(p => p.map(q => (Array.isArray(q) ? new IntPoint(q[0], q[1]) : new IntPoint(q.X, q.Y))))
const FIX = { decks: () => { const d = fx('ptown-deck-inputs'); return { src: ip(d.inputs.flat()), stepM: d.fineM } },
  huron: () => { const d = fx('huron-traced'); return { src: ip(d.traced), stepM: d.fineM } } }
const engine = arg('engine') || 'faces', keep = arg('collinear') !== 'default', name = arg('fixture') || 'decks', { src, stepM } = FIX[name](), h = (stepM / 2) * SCALE
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

// the faces engine: the raw rings as rings (consecutive repeats dropped; one under 3 distinct points carries no area), noded
// against themselves and each other, then the faces whose winding is positive. Each noded segment's tag is its input edge's
function resolveFaces(rawRings) {
  const rings = rawRings.map(r => r.filter((a, i) => { const b = r[(i + 1) % r.length]; return a.X !== b.X || a.Y !== b.Y })).filter(r => new Set(r.map(q => q.X + ',' + q.Y)).size >= 3)
  const t0 = Date.now(), R = nodeCrossings(rings.map((r, ri) => ({ p: r.map(q => [q.X / SCALE, q.Y / SCALE]), tag: `raw${ri}` })), { pairs: () => true, self: true, who: 'step0' }), nodeMs = Date.now() - t0
  const edges = [], verts = new Set(), seg = new Set()
  R.forEach((o, ri) => o.forEach((v, q) => { const w = o[(q + 1) % o.length]; verts.add(v.k.join(','))
    edges.push({ a: v.k, b: w.k, set: 0, tag: rings[ri][v.edge].tag }); seg.add(`${v.k}>${w.k}`) }))
  const t1 = Date.now(), F = facesOf(edges, w => w[0] > 0, { sets: 1, who: 'step0', allTags: true }), unionMs = Date.now() - t1
  const out = F.rings.map(r => r.map(q => new IntPoint(q.X, q.Y)))
  let newV = 0, unmapped = 0, mapped = 0; const outV = new Set()
  for (const p of out) for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; outV.add(a.X + ',' + a.Y)
    if (!verts.has(a.X + ',' + a.Y)) newV++
    if (seg.has(`${a.X},${a.Y}>${b.X},${b.Y}`) || seg.has(`${b.X},${b.Y}>${a.X},${a.Y}`)) mapped++; else unmapped++ }
  // Zob's tag run (tagRun.mjs) on every eroded segment carrying several tags: the outcome per clause, and the refusals' instances
  // Zob's gate on each 'cut' (his revised clause 3): the corner's turn (P lies LEFT of every source ring, so a left turn from
  // L_from to L_to is CONVEX and a right turn REFLEX), and the local area the cut path takes from P there: the loop from the
  // source run's start along the source to its end, back through the cut point; counter-clockwise ⇒ the cut path runs inside P
  // (material taken). ⚠ A local measure at the corner, before step 5's ∩P on the arrangement.
  const cutReport = (r) => { const R = SRC[r.ring], n = R.length, f0 = R[r.from], f1 = R[(r.from + 1) % n], l0 = R[r.to], l1 = R[(r.to + 1) % n]
    const turn = Math.sign((f1.X - f0.X) * (l1.Y - l0.Y) - (f1.Y - f0.Y) * (l1.X - l0.X))
    const loop = []; for (let j = r.from; ; j = (j + 1) % n) { loop.push([R[j].X, R[j].Y]); if (j === (r.to + 1) % n) break }
    loop.push(r.X); let A2 = 0; for (let k = 0; k < loop.length; k++) { const a = loop[k], b = loop[(k + 1) % loop.length]; A2 += a[0] * b[1] - b[0] * a[1] }
    return { at: r.at.map(v => v / SCALE), corner: turn > 0 ? 'convex' : turn < 0 ? 'reflex' : 'straight', worstU: r.worstU, takenMm2: +(Math.max(0, A2 / 2)).toFixed(3), loopMm2: +(A2 / 2).toFixed(3) } }
  const cuts = []
  let multi = 0; const kinds = {}, refused = []
  F.tags.forEach((tr, ri) => tr.forEach((tg, e) => { if (!Array.isArray(tg) || tg.length < 2) return; multi++
    const r = tagRun(tg, SRC), k = r.ok ? `${r.kind}${r.gaps ? '+gap' : ''}` : r.clause; kinds[k] = (kinds[k] || 0) + 1
    if (r.ok && r.kind === 'cut') cuts.push(cutReport(r))
    if (!r.ok && refused.length < 8) { const a = F.rings[ri][e], b = F.rings[ri][(e + 1) % F.rings[ri].length]; refused.push({ ...r, segment: [[a.X / SCALE, a.Y / SCALE], [b.X / SCALE, b.Y / SCALE]] }) } }))
  const adjacent = kinds, other = refused, cutsOut = cuts
  const tagged = F.tags.flat().filter(t => t != null && (!Array.isArray(t) || t.length)).length
  return { out, nodeMs, unionMs, crossings: R.crossings, newV, mapped, unmapped, rawEdges: edges.length, nodedVerts: verts.size, outVerts: outV.size, newAt: [], nodedSegs: [], tagged, nullTags: F.tags.flat().length - tagged, multi, adjacent, other, cuts: cutsOut }
}

const t = uni(src), P = parts(t)
let raw = [], ref = []
const SRC = []                                      // every source ring, by its GLOBAL id (a tag is (ring, i), Zob C4)
const srcLen = (g) => SRC[g].length
for (const part of P) { part.forEach((ring) => { SRC.push(ring); raw.push(rawOffset(ring, -h, SRC.length - 1)) })
  const co = new ClipperOffset(), o = new Paths(); co.AddPaths(part, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, -h); ref.push(...o) }
const r = engine === 'faces' ? resolveFaces(raw) : resolve(raw, PolyFillType.pftPositive)
const x = new Clipper(), xo = new Paths(); x.AddPaths(r.out, PolyType.ptSubject, true); x.AddPaths(ref, PolyType.ptClip, true); x.Execute(ClipType.ctXor, xo, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
console.log(JSON.stringify({ fixture: name, engine, preserveCollinear: engine === 'faces' ? null : keep, tagged: r.tagged, nullTags: r.nullTags, multiTag: { edges: r.multi, adjacent: r.adjacent, other: r.other, cuts: r.cuts }, parts: P.length, rawEdges: r.rawEdges, nodeMs: r.nodeMs, unionMs: r.unionMs, crossings: r.crossings,
  a: { newAt: r.newAt.map(([X, Y]) => { let best = null; for (const k of r.nodedSegs) { const [u, w] = k.split('>').map(q => q.split(',').map(Number)), dx = w[0] - u[0], dy = w[1] - u[1], L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((X - u[0]) * dx + (Y - u[1]) * dy) / L2)), d = Math.hypot(X - u[0] - t * dx, Y - u[1] - t * dy); if (!best || d < best.d) best = { d: +d.toFixed(3), seg: k, t: +t.toFixed(4) } } return { at: [X / SCALE, Y / SCALE], nearest: best } }), nodedVertices: r.nodedVerts, outputVertices: r.outVerts, newVertices: r.newV, edgesMapped: r.mapped, edgesUnmapped: r.unmapped },
  c: { tagged: { m2: +areaM2(r.out).toFixed(3), ...topo(r.out) }, clipper: { m2: +areaM2(ref).toFixed(3), ...topo(ref) }, xorM2: +areaM2(xo).toFixed(4) } }))
