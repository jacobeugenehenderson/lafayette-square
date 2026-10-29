// ⛔ FROZEN — NOT A LIVE RULE. structures.mjs#openCloseAtStep, #isRoundingSliver and #waterWithoutDecks verbatim as of 464dfa5f,
// before the cut-once port (BRIEF-cut-once-in-full-precision): the open/close by clipper-lib's INTEGER offsets, whose re-offset
// makes a second, re-rounded copy of an edge it did not change, and the deck take-out's open and close on the same integer form.
// Kept ONLY as the mutants of checks/claims-the-open-close-cuts-once.mjs ("an integer re-offset restored"): its copy rows must
// read RED on it, and its topology is the topology row's reference. Imports repointed; nothing else changed. Never import this
// from src/ or cartograph/.
import clipperLib from 'clipper-lib'
import { CLIP_SCALE as SCALE } from '../../src/lib/lattice.js'
import { NODE_BOUND } from '../../src/lib/latticeNode.js'
const { Clipper, ClipperOffset, Paths, Path, IntPoint, PolyTree, ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib
const toPath = (ring) => { const p = new Path(); for (const [x, z] of ring) p.push(new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))); return p }
const fromPath = (path) => path.map(q => [q.X / SCALE, q.Y / SCALE])
const signedArea = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const union = (paths) => { if (!paths.length) return new Paths(); const c = new Clipper(), out = new Paths(); c.AddPaths(paths, PolyType.ptSubject, true)
  if (!c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error('⛔ structures: the deck union FAILED'); return out }

/** ⭐ A ROUNDING SLIVER (Zob, 2026-10-28): a piece (clipper paths, outer + holes) that eroded by the lattice's own bound
 *  (latticeNode.js#NODE_BOUND) leaves nothing: it lies wholly within the rounding of the boundary. */
export function isRoundingSliver(pp) {
  const co = new ClipperOffset(), o = new Paths(); co.AddPaths(pp, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, -NODE_BOUND)
  return o.every(q => Clipper.Area(q) <= 0)
}
export function openCloseAtStep(paths, stepM, what, { cutOnce = true } = {}) {
  if (!(stepM > 0)) throw new Error(`⛔ structures: openCloseAtStep (${what}) needs the trace's step (got ${stepM})`)
  const parts = new PolyTree(), cu = new Clipper(); cu.AddPaths(paths, PolyType.ptSubject, true)
  if (!cu.Execute(ClipType.ctUnion, parts, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error(`⛔ structures: the union of ${what} FAILED`)
  const h = (stepM / 2) * SCALE, kept = new Paths(), closed = [], opened = [], belowResolution = []
  const off = (src, d) => { const co = new ClipperOffset(), o = new Paths(); co.AddPaths(src, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, d); return o }
  const op = (type, a, b, name) => { const c = new Clipper(), o = new Paths(); c.AddPaths(a, PolyType.ptSubject, true); if (b) c.AddPaths(b, PolyType.ptClip, true)
    if (!c.Execute(type, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error(`⛔ structures: the ${name} of ${what} FAILED`); return o }
  const areaOf = (ps) => ps.reduce((t, q) => t + Clipper.Area(q), 0)
  const place = (ch) => { const c0 = ch.Contour()[0]; return [+(c0.X / SCALE).toFixed(3), +(c0.Y / SCALE).toFixed(3)] }
  // a piece is the rounding iff eroding it by the lattice's own bound leaves nothing
  const sliver = (pp, m2, lenM) => cutOnce ? isRoundingSliver(pp)
    : !(m2 / Math.max(lenM, 1 / SCALE) > 2 / SCALE)             // ⛔ the debt's own rule (a mean width against 2 units): see above
  // each connected piece of a − b, { m2, lenM, at, poly, paths } (its holes subtracted), split into features and slivers
  const pieces = (a, b) => { const c = new Clipper(), t = new PolyTree(); c.AddPaths(a, PolyType.ptSubject, true); c.AddPaths(b, PolyType.ptClip, true)
    if (!c.Execute(ClipType.ctDifference, t, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error(`⛔ structures: the pieces of ${what} FAILED`)
    const out = [], walk = (n) => { for (const ch of n.Childs()) { const pp = [ch.Contour(), ...ch.Childs().map(hh => hh.Contour())], m2 = areaOf(pp) / SCALE / SCALE
      const c0 = ch.Contour(), xs = c0.map(q => q.X), ys = c0.map(q => q.Y), lenM = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / SCALE
      if (m2 > 0) out.push({ m2: +m2.toFixed(4), lenM: +lenM.toFixed(3), at: place(ch), poly: pp.map(fromPath), paths: pp, sliver: sliver(pp, +m2.toFixed(4), +lenM.toFixed(3)) }); for (const hh of ch.Childs()) walk(hh) } }
    walk(t); return out }
  const openedPieces = [], closedPieces = []
  const closeAll = (node) => { for (const ch of node.Childs()) {
    const part = [ch.Contour(), ...ch.Childs().map(c => c.Contour())], a0 = areaOf(part)
    const open = op(ClipType.ctIntersection, off(off(part, -h), h), part, 'open'), a1 = areaOf(open)
    if (!open.length || a1 <= 0) belowResolution.push({ m2: +(a0 / SCALE / SCALE).toFixed(3), at: place(ch), ring: fromPath(ch.Contour()) })
    else {
      const closedK = op(ClipType.ctUnion, [...open, ...off(off(open, h), -h)], null, 'close')
      const taken = pieces(part, open), filled = pieces(closedK, open)
      let k
      if (cutOnce) {
        const tf = taken.filter(p => !p.sliver), ff = filled.filter(p => !p.sliver)
        // cut once: the source, minus the features the open took, plus the features the close filled
        k = tf.length ? op(ClipType.ctDifference, part, tf.flatMap(p => p.paths), 'cut') : part
        if (ff.length) k = op(ClipType.ctUnion, [...k, ...ff.flatMap(p => p.paths)], null, 'fill')
        const tm = tf.reduce((t, p) => t + p.m2, 0), fm = ff.reduce((t, p) => t + p.m2, 0)
        if (tm > 0) opened.push({ m2: +tm.toFixed(3), at: place(ch) })
        if (fm > 0) closed.push({ m2: +fm.toFixed(3), at: place(ch) })
      } else {                                                        // ⛔ the debt (above): the a115eaab result, the re-offset copy
        k = closedK
        if (a0 - a1 > 0) opened.push({ m2: +((a0 - a1) / SCALE / SCALE).toFixed(3), at: place(ch) })
        const added = areaOf(k) - a1; if (added > 0) closed.push({ m2: +(added / SCALE / SCALE).toFixed(3), at: place(ch) })
      }
      openedPieces.push(...taken); closedPieces.push(...filled)
      for (const q of k) kept.push(q) }
    for (const hole of ch.Childs()) closeAll(hole) } }   // a part inside a part's hole is a part of its own
  closeAll(parts)
  const big = (a, b) => b.m2 - a.m2, strip = ({ paths: _p, sliver: _s, ...f }) => f
  const split = (xs) => ({ features: xs.filter(f => !f.sliver).sort(big).map(strip), slivers: { n: xs.filter(f => f.sliver).length, m2: +xs.filter(f => f.sliver).reduce((t, f) => t + f.m2, 0).toFixed(4) } })
  return { paths: kept, opened, closed, belowResolution, openedPieces: split(openedPieces), closedPieces: split(closedPieces) }
}

/** The deck footprints' INPUTS, before the union: each area as mapped, each line buffered, each joint's hull, each one
 *  normalized on its own (below). `inputs` [[path…]] one entry per input; `paths` the same, flat, which deckFootprints unions.
 *  Exported so a check reads the inputs the union is given, not a copy. */

export function waterWithoutDecks(rings, arcs, deckRings, stepM) {
  if (!deckRings.length) return { rings, arcs, decks: [], slivers: [] }
  if (!(stepM > 0)) throw new Error(`⛔ structures: waterWithoutDecks needs the trace's step (coast.json fineM; got ${stepM}) — water beside a deck narrower than one cell is the deck's, and there is no other measure`)
  const lat = 1 / SCALE
  // ⭐ WATER BESIDE A STREET DECK NARROWER THAN ONE TRACE CELL IS THE DECK'S (Boz's ruling (B), 2026-10-27; PTown's MacMillan:
  // the trace, at its own resolution, put the shore centimetres off the mapped deck, and the deck taken out left a 4–73 cm
  // wedge of water ① could not ink). The trace stays the trace; here, the ONE place the deck and the coast meet, the water
  // within two cells of each deck is opened at half a cell, and what the open removes that lies within one cell of the deck
  // and touches it goes with the deck. Counted and named (`slivers`: deck, m², place); the deck so extended is what is taken
  // out, tagged, and returned (`decks`) for streetDecks' record, so every later reader sees the deck ① drew.
  // strictly simple: a piece pinched off at one vertex comes back as a ring of its own, never as a self-touching path
  const op = (type, a, b) => { const k = new Clipper(), o = new Paths(); k.StrictlySimple = true; k.AddPaths(a, PolyType.ptSubject, true); if (b) k.AddPaths(b, PolyType.ptClip, true)
    if (!k.Execute(type, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error('⛔ structures: a deck\'s slivers FAILED'); return o }
  const grow = (src, d) => { const co = new ClipperOffset(), o = new Paths(); co.AddPaths(src, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, d); return o }
  const cellU = stepM * SCALE, waterP = rings.map(toPath), area = (ps) => ps.reduce((t, q) => t + Clipper.Area(q), 0)
  const w0 = op(ClipType.ctDifference, waterP, deckRings.map(toPath)), slivers = []
  const ext = deckRings.map((d, k) => { const D = [toPath(d)]
    const loc = op(ClipType.ctIntersection, w0, grow(D, 2 * cellU)), open = op(ClipType.ctIntersection, grow(grow(loc, -cellU / 2), cellU / 2), loc)
    const thin = op(ClipType.ctIntersection, op(ClipType.ctDifference, loc, open), grow(D, cellU))
    const touching = thin.filter(q => Clipper.Area(q) > 0 && area(op(ClipType.ctIntersection, grow([q], 2), D)) > 0)
    for (const q of touching) { const a = fromPath(q); slivers.push({ deck: k, m2: +(Clipper.Area(q) / SCALE / SCALE).toFixed(3), at: a[0].map(v => +v.toFixed(3)) }) }
    // ⛔ a sliver meeting the deck at a single point would be left a separate piece of deck standing in the water (a hole the
    // coast did not draw: "clear of every shore" would refuse it, Zob 10-27): closed at half a cell, as each deck's footprint
    // is (deckFootprints), it joins the deck
    const u0 = op(ClipType.ctUnion, [...D, ...touching]), e = op(ClipType.ctUnion, [...u0, ...grow(grow(u0, cellU / 2), -cellU / 2)]), outers = e.filter(q => Clipper.Area(q) > 0)
    // a street deck is its OUTER ring (streetDecks keeps outers; its holes are deck). A sliver meeting the deck at a single point
    // comes back from the union as an outer of its own: every piece inside the main ring or touching it (to the lattice) is this
    // deck's, taken out and tagged with it; the record keeps the main ring. A piece standing apart from it refuses by name
    const main = outers.reduce((m, q) => (Clipper.Area(q) > Clipper.Area(m) ? q : m), outers[0]), mainR = fromPath(main)
    const touches = (q) => fromPath(q).some(p => mainR.some((a, i) => { const b = mainR[(i + 1) % mainR.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
      const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) <= lat }))
    const apart = outers.filter(q => q !== main && !inRing(q[0].X / SCALE, q[0].Y / SCALE, mainR) && !touches(q))
    if (!outers.length || apart.length) throw new Error(`⛔ structures: deck ${k} with the water beside it narrower than one trace cell is ${1 + apart.length} piece(s), not one${apart.length ? `: a piece at (${apart[0][0].X / SCALE}, ${apart[0][0].Y / SCALE})` : ''}. Refusing.`)
    const all = outers.map(q => { const r = fromPath(q); return signedArea(r) > 0 ? r : r.reverse() })
    return { main: signedArea(mainR) > 0 ? mainR : mainR.reverse(), all } })
  const c = new Clipper(), tree = new PolyTree(); c.StrictlySimple = true
  c.AddPaths(waterP, PolyType.ptSubject, true); c.AddPaths(ext.flatMap(e => e.all.map(toPath)), PolyType.ptClip, true)
  if (!c.Execute(ClipType.ctDifference, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error('⛔ structures: water minus decks FAILED')
  const out = []
  const walk = (node) => { for (const ch of node.Childs()) { const o = fromPath(ch.Contour()); out.push(signedArea(o) > 0 ? o : o.reverse())
    for (const h of ch.Childs()) { const r = fromPath(h.Contour()); out.push(signedArea(r) < 0 ? r : r.reverse()); walk(h) } } }
  walk(tree)
  // each returned ring's edges that lie on a deck carry that deck (`ring.deck[i]` for the edge i → i+1, else null): the
  // difference made them from the deck's own edges, so both ends lie on its ring at the clip lattice
  const tol = 1 / SCALE, onRing = (p, r) => r.some((a, m) => { const b = r[(m + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) <= tol })
  for (const r of out) r.deck = r.map((a, i) => { const b = r[(i + 1) % r.length], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const k = ext.findIndex(e => e.all.some(d => onRing(a, d) && onRing(b, d) && onRing(mid, d))); return k < 0 ? null : k })
  // …and what the subtraction itself leaves: a water ring narrower than one cell whose every edge is ONE deck's is that deck's
  // too (PTown's FMP: a 1.2 cm² pocket between deck 3's edge and the coast running along it), counted with the slivers
  for (let i = out.length - 1; i >= 0; i--) { const r = out[i], k = r.deck[0], per = r.reduce((t, p, j) => { const q = r[(j + 1) % r.length]; return t + Math.hypot(q[0] - p[0], q[1] - p[1]) }, 0)
    // a water POCKET only (positive): a negative ring is a hole, the deck itself standing clear of the shore (Zob, 10-27)
    if (!(signedArea(r) > 0) || k == null || !r.deck.every(x => x === k) || !(2 * Math.abs(signedArea(r)) / per < stepM)) continue
    slivers.push({ deck: k, m2: +Math.abs(signedArea(r)).toFixed(3), at: r[0].map(v => +v.toFixed(3)) }); out.splice(i, 1) }
  // ⭐ THE ARCS ARE THE RETURNED RINGS' OWN EDGES, each stroked once (Zob's read, 2026-10-27; PTown, 10-27): built by clipping
  // the coast arcs and the deck outlines as open paths, an edge where the coast runs along a deck's edge was
  // stroked twice, and a deck's landward root left a stray arc inside the land, because Clipper's choice for a path lying ON
  // the clip boundary is no rule. So each returned edge is classed once: a deck's (`ring.deck[i]`), else the coast's when it
  // lies on a given arc, else none (the fetched square's own sides, which no arc strokes). Each maximal run of one class is
  // one arc, wrapping at the ring's start; a ring of one class throughout is one closed arc.
  const G = 4, cells = new Map(), key = (x, z) => `${Math.floor(x / G)},${Math.floor(z / G)}`
  arcs.forEach((a, ai) => { for (let i = 0; i + 1 < a.length; i++) { const p = a[i], q = a[i + 1], n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / G) || 1
    for (let t = 0; t <= n; t++) for (const dx of [-1, 0, 1]) for (const dz of [-1, 0, 1]) { const k = key(p[0] + (q[0] - p[0]) * t / n + dx * G, p[1] + (q[1] - p[1]) * t / n + dz * G); (cells.get(k) || cells.set(k, []).get(k)).push([ai, i]) } } })
  const near = (v, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((v[0] - a[0]) * dx + (v[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(v[0] - a[0] - t * dx, v[1] - a[1] - t * dz) <= tol }
  const onArc = (v) => (cells.get(key(v[0], v[1])) || []).some(([ai, i]) => near(v, arcs[ai][i], arcs[ai][i + 1]))
  const a2 = []
  for (const r of out) {
    const n = r.length, cls = r.map((a, i) => { if (r.deck[i] != null) return `d${r.deck[i]}`; const b = r[(i + 1) % n]
      return onArc(a) && onArc(b) && onArc([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]) ? 'c' : null })
    const tag = (arc, c) => { if (c[0] === 'd') arc.deck = +c.slice(1); a2.push(arc) }
    const start = cls.findIndex((c, i) => c !== cls[(i - 1 + n) % n])
    if (start < 0) { if (cls[0]) tag([...r.map(p => [p[0], p[1]]), [r[0][0], r[0][1]]], cls[0]); continue }
    for (let s = 0; s < n;) { const i0 = (start + s) % n, c = cls[i0]; let e = s; while (e + 1 < n && cls[(start + e + 1) % n] === c) e++
      if (c) { const pts = []; for (let q = s; q <= e + 1; q++) pts.push([r[(start + q) % n][0], r[(start + q) % n][1]]); tag(pts, c) }
      s = e + 1 }
  }
  return { rings: out, arcs: a2, decks: ext.map(e => e.main), slivers }
}
