/**
 * structures.mjs — the STRUCTURES OVER WATER a town maps, read the same way by every consumer.
 *
 * Jacob, 2026-09-27: "it is universal and it answers many questions regarding how the land meets the water."
 * Ruled: every mapped pier · quay · wharf · jetty · platform is a DECK above the water at the height of the land
 * where it meets the shore (so it joins with no step); what stands on it stands on the deck; a line with no width
 * takes OSM's `width`, else a sourced typical width (references f-ufc-main-walkway-width). Breakwaters and groynes
 * are stone — the revetment's, not this module's.
 *
 * ⛔ EVERY BUCKET, READ BY TAG. The fetch files a feature under ONE bucket, so 78 of provincetown's 90 deck
 * structures sit under `highway` (MacMillan Wharf is highway=service + man_made=pier). A structure is what its
 * tags say, wherever it was filed.
 */
import fs from 'fs'
import { join } from 'path'
import { CARTOGRAPH_DIR } from './config.js'
import clipperLib from 'clipper-lib'
import { CLIP_SCALE as SCALE } from '../src/lib/lattice.js'          // clipper units per metre: 1 mm

const { Clipper, ClipperOffset, Paths, Path, IntPoint, PolyTree, ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib
const toPath = (ring) => { const p = new Path(); for (const [x, z] of ring) p.push(new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))); return p }
const fromPath = (path) => path.map(q => [q.X / SCALE, q.Y / SCALE])
const signedArea = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const union = (paths) => { if (!paths.length) return new Paths(); const c = new Clipper(), out = new Paths(); c.AddPaths(paths, PolyType.ptSubject, true)
  if (!c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error('⛔ structures: the deck union FAILED'); return out }

export const DECK_KINDS = ['pier', 'quay', 'wharf', 'jetty', 'platform']
/** Rock structures — built as the revetment's stone; the terrain keeps the lidar's rock under them (bake-terrain). */
export const STONE_KINDS = ['breakwater', 'groyne']

const kindOf = (f) => (DECK_KINDS.includes(f?.tags?.man_made) ? f.tags.man_made : null)
const pts = (f) => (f.coords || []).map(c => [c.x, c.z]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))

/** A mapped width in metres, or null. OSM `width` is metres unless it says otherwise; anything unparsed is null. */
function widthM(tags) {
  const w = tags?.width
  if (w == null) return null
  const m = String(w).trim().match(/^([\d.]+)\s*(m|ft|')?$/i)
  if (!m) return null
  const v = +m[1]
  return m[2] && /ft|'/i.test(m[2]) ? v * 0.3048 : v
}

/** The kit's width for a line with none mapped — read from the references, never typed here. */
export function defaultDeckWidthM() {
  const reg = JSON.parse(fs.readFileSync(join(CARTOGRAPH_DIR, '..', 'references', 'registry.json'), 'utf8'))
  const f = reg.findings.find(x => x.id === 'f-ufc-main-walkway-width')
  if (!f) throw new Error('⛔ structures: references has no f-ufc-main-walkway-width — a pier line has no width to take')
  return f.value.width_m
}

/**
 * The deck structures in a raw fetch's `ground`: AREAS (closed ways — drawn as mapped) and LINES (open ways — a
 * walkway of their width). Each once, by identity, whichever bucket it sat in.
 */
export function deckStructures(ground) {
  const areas = [], lines = [], seen = new Set()
  for (const bucket of Object.values(ground || {})) {
    if (!Array.isArray(bucket)) continue
    for (const f of bucket) {
      const kind = kindOf(f)
      if (!kind || seen.has(f)) continue
      seen.add(f)
      const p = pts(f)
      const base = { id: f.osmId ?? null, kind, name: f.tags?.name || null, floating: f.tags?.floating === 'yes', tags: f.tags }
      if (f.isClosed && p.length >= 4) areas.push({ ...base, ring: p.slice(0, -1) })
      else if (p.length >= 2) lines.push({ ...base, line: p, widthM: widthM(f.tags) })
    }
  }
  return { areas, lines }
}

/** Breakwaters and groynes: AREAS (closed) and LINES (open), each once, whatever bucket it sat in. */
export function stoneStructures(ground) {
  const areas = [], lines = [], seen = new Set()
  for (const bucket of Object.values(ground || {})) {
    if (!Array.isArray(bucket)) continue
    for (const f of bucket) {
      const kind = STONE_KINDS.includes(f?.tags?.man_made) ? f.tags.man_made : null
      if (!kind || seen.has(f)) continue
      seen.add(f)
      const p = pts(f), base = { id: f.osmId ?? null, kind, name: f.tags?.name || null, tags: f.tags }
      if (f.isClosed && p.length >= 4) areas.push({ ...base, ring: p.slice(0, -1) })
      else if (p.length >= 2) lines.push({ ...base, line: p })
    }
  }
  return { areas, lines }
}

/** The convex hull of points (Andrew's monotone chain), counter-clockwise. */
function convexHull(pts) {
  const P = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo = [], hi = []
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p) }
  for (const p of [...P].reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p) }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)]
}

/**
 * THE DECK FOOTPRINTS (structures.mjs#deckStructures): an area as mapped, a line buffered to its width (OSM `width`,
 * else structures.mjs#defaultDeckWidthM: the sourced typical width), butt ends, a joint filled where ways end together. One union, as clipper paths, with a
 * point test for the samplers. ⛔ From the data's tags, never a site list.
 */
export function deckFootprints(osmGround, stepM) {
  if (!(stepM > 0)) throw new Error(`⛔ structures: deckFootprints needs the trace's step (got ${stepM}) — a deck is closed at the step the lidar is traced at, and there is no other`)
  const { areas, lines } = deckStructures(osmGround)
  let typical = null
  const paths = new Paths()
  for (const a of areas) paths.push(toPath(a.ring))
  let unmapped = 0
  for (const l of lines) {
    const wM = l.widthM ?? (typical ??= defaultDeckWidthM())
    if (l.widthM == null) unmapped++
    const co = new ClipperOffset(), out = new Paths()
    co.AddPath(toPath(l.line), JoinType.jtMiter, EndType.etOpenButt)
    co.Execute(out, (wM / 2) * SCALE)
    for (const p of out) paths.push(p)
    l._halfM = wM / 2
  }
  // ⭐ A NODE WHERE TWO OR MORE DECK WAYS END IS A JOINT (Boz's ruling, 2026-10-27; PTown: two marina piers of widths 3 and 2
  // ending on one node at 90° left an unfilled wedge, a 1.5 m hairpin ① could not outline). Each way's butt end there is the
  // segment across its own end, half its width either side; the joint is filled by the convex hull of those segments, from
  // the ways' own geometry, wound as the offsets are so the nonzero union keeps it.
  const ends = new Map()
  for (const l of lines) { const L = l.line; if (L.length < 2) continue
    for (const [e, f] of [[L[0], L[1]], [L[L.length - 1], L[L.length - 2]]]) { const k = toPath([e])[0], key = `${k.X},${k.Y}`
      const dx = e[0] - f[0], dz = e[1] - f[1], n = Math.hypot(dx, dz); if (!n) continue
      const h = l._halfM, px = -dz / n * h, pz = dx / n * h
      ;(ends.get(key) || ends.set(key, []).get(key)).push([e[0] + px, e[1] + pz], [e[0] - px, e[1] - pz]) } }
  let joints = 0
  for (const pts of ends.values()) { if (pts.length < 4) continue
    const hull = convexHull(pts); if (hull.length < 3) continue
    const hp = toPath(hull); if (Clipper.Orientation(hp) !== Clipper.Orientation(paths[paths.length - 1])) hp.reverse()
    paths.push(hp); joints++ }
  for (const l of lines) delete l._halfM
  // ⭐ EACH DECK IS CLOSED AT THE TRACE'S STEP (Boz's ruling (b), 2026-10-27; Huron: a pier line with no width, buffered at
  // the typical 1.8 m beside the mapped pier area, left a notch 5 m deep and under a cell wide, which no trace can follow and
  // the lidar cannot see). Each connected deck, its own parts unioned, is dilated then eroded by half a trace cell, and kept
  // with what it was, so a gap between its parts narrower than one cell is filled and nothing is lost. ⛔ Per deck, never
  // across two: separate decks a metre apart stay two. What each adds is counted and named (`closed`).
  const parts = new PolyTree(), cu = new Clipper(); cu.AddPaths(paths, PolyType.ptSubject, true)
  if (!cu.Execute(ClipType.ctUnion, parts, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error('⛔ structures: the deck union FAILED')
  const h = (stepM / 2) * SCALE, closedPaths = new Paths(), closed = []
  const closeAll = (node) => { for (const ch of node.Childs()) {
    const deck = [ch.Contour(), ...ch.Childs().map(c => c.Contour())]
    const off = (src, d) => { const co = new ClipperOffset(), o = new Paths(); co.AddPaths(src, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, d); return o }
    const kept = union([...deck, ...off(off(deck, h), -h)])
    const added = kept.reduce((t, q) => t + Clipper.Area(q), 0) - deck.reduce((t, q) => t + Clipper.Area(q), 0)
    if (added > 0) { const c0 = ch.Contour()[0]; closed.push({ m2: +(added / SCALE / SCALE).toFixed(3), at: [+(c0.X / SCALE).toFixed(3), +(c0.Y / SCALE).toFixed(3)] }) }
    for (const q of kept) closedPaths.push(q)
    for (const hole of ch.Childs()) closeAll(hole) } }   // a deck inside a deck's hole is a deck of its own
  closeAll(parts)
  const u = union(closedPaths)
  const rings = u.map(fromPath)
  const boxes = rings.map(r => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } return [x0, x1, z0, z1] })
  // nonzero over the union's rings: an outer counts +1, a hole −1, so a point in a deck's courtyard is not on the deck
  const on = (x, z) => { let wn = 0; for (let k = 0; k < rings.length; k++) { const b = boxes[k]; if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue; if (inRing(x, z, rings[k])) wn += Math.sign(signedArea(rings[k])) } return wn !== 0 }
  // ⭐ WHERE A SEGMENT a→b LEAVES THE DECK (Zob, 2026-10-26): the exact crossing of the deck's own ring nearest a (the deck
  // end), so a coast traced against a deck lies ON the deck's edge, never a sample's guess at it; a itself when a lies on
  // the ring (within the clip grid); else null.
  const crossing = (a, b) => { let best = null, bt = Infinity
    const sx0 = Math.min(a[0], b[0]), sx1 = Math.max(a[0], b[0]), sz0 = Math.min(a[1], b[1]), sz1 = Math.max(a[1], b[1])
    for (let k = 0; k < rings.length; k++) { const bx = boxes[k]; if (sx1 < bx[0] || sx0 > bx[1] || sz1 < bx[2] || sz0 > bx[3]) continue
      const r = rings[k]
      for (let m = 0; m < r.length; m++) { const p = r[m], q = r[(m + 1) % r.length]
        const dx = b[0] - a[0], dz = b[1] - a[1], ex = q[0] - p[0], ez = q[1] - p[1], den = dx * ez - dz * ex
        if (den === 0) continue
        const t = ((p[0] - a[0]) * ez - (p[1] - a[1]) * ex) / den, u2 = ((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / den
        if (t >= 0 && t <= 1 && u2 >= 0 && u2 <= 1 && t < bt) { bt = t; best = [a[0] + t * dx, a[1] + t * dz] } } }
    if (best) return best
    // ⭐ No proper crossing: a runs along a ring edge (collinear) or sits on the ring itself, so the deck end IS the crossing,
    // exact, but only if a lies on the ring within the clip grid. Otherwise null, and the caller refuses: never a guess.
    let dmin = Infinity
    for (let k = 0; k < rings.length; k++) { const bx = boxes[k]; if (a[0] < bx[0] - 1 || a[0] > bx[1] + 1 || a[1] < bx[2] - 1 || a[1] > bx[3] + 1) continue
      const r = rings[k]; for (let m = 0; m < r.length; m++) { const p = r[m], q = r[(m + 1) % r.length], ex = q[0] - p[0], ez = q[1] - p[1], L2 = ex * ex + ez * ez || 1
        const u = Math.max(0, Math.min(1, ((a[0] - p[0]) * ex + (a[1] - p[1]) * ez) / L2)); dmin = Math.min(dmin, Math.hypot(a[0] - p[0] - u * ex, a[1] - p[1] - u * ez)) } }
    return dmin <= 1 / SCALE ? a : null }
  return { paths: u, rings, on, crossing, closed, closedM2: +closed.reduce((t, c) => t + c.m2, 0).toFixed(3), count: { areas: areas.length, lines: lines.length, joints, unmappedWidth: unmapped, typicalWidthM: typical }, m2: u.reduce((t, p) => t + Clipper.Area(p), 0) / (SCALE * SCALE) }
}

/**
 * ⭐ THE STREET RIDES THE DECK (Jacob, 2026-10-25: "a, the street rides the deck"). The deck footprints a mapped street
 * crosses, by CONSTRUCTION (Zob): each street polyline is clipped at the footprint, and a footprint any street's clipped
 * segment lies inside carries that street. No fraction, no threshold. The mint takes these footprints OUT of ①'s water,
 * so the deck is a land face and the street's walk and curb are built on it at the land's height; a deck that carries no
 * street stays water (the off-ground deck object, later).
 * @param streets [{ points: [[x, z], …], skelId? }] — the chains the mint is given
 * @returns { rings: [ring], decks: [{ ring, streets: [skelId] }] }
 */
export function streetDecks(ground, streets, stepM) {
  const fp = deckFootprints(ground, stepM)
  const outers = fp.rings.filter(r => signedArea(r) !== 0)
  const decks = []
  for (const ring of outers) {
    if (signedArea(ring) < 0 && outers.some(o => o !== ring && signedArea(o) > 0 && inRing(ring[0][0], ring[0][1], o))) continue   // a hole of another
    const rp = toPath(ring), on = []
    for (const st of streets) {
      const c = new Clipper(), tree = new PolyTree()
      const line = toPath(st.points || [])
      if (line.length < 2) continue
      c.AddPath(line, PolyType.ptSubject, false); c.AddPath(rp, PolyType.ptClip, true)
      c.Execute(ClipType.ctIntersection, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
      if (Clipper.OpenPathsFromPolyTree(tree).some(p => p.length >= 2)) on.push(st.skelId ?? st.name ?? null)
    }
    if (on.length) decks.push({ ring, streets: on })
  }
  return { rings: decks.map(d => d.ring), decks }
}

/** ①'s water rings and shoreline arcs with the street decks taken OUT: the rings minus the decks (outers positive, holes
 *  negative), the arcs clipped where they run under a deck.
 *  ⭐ AND THE DECK'S EDGE OVER THE WATER IS SHORE (Boz's ruling, 2026-10-27, after PTown's absorb refused 4 cells): taking a
 *  deck out of the water gives the water a new edge along the deck, so that edge is emitted as shoreline ARCS too: each
 *  the returned rings' own edges on a deck (below). Every edge of the returned rings is then stroked by exactly one arc
 *  (checks/claims-the-coast-is-the-lidars F, D). Such an arc is TAGGED with its deck's identity, `arc.deck`
 *  = the deck's index in `deckRings` (the order of streetDecks' record), so a reader tells a deck's edge from a beach; it is
 *  stroked as any coast (Boz: how a deck edge LOOKS is the filed deck work). */
export function waterWithoutDecks(rings, arcs, deckRings) {
  if (!deckRings.length) return { rings, arcs }
  // ⭐ THE DECK IS NODED BY THE COAST FIRST (PTown, 10-27): where the coast follows a deck (bake-coast#followDecks), its
  // crossings lie on the deck's oblique edges only to the millimetre lattice, so the difference cut 0.08–0.2 mm slivers of
  // water beside them. Every water-ring vertex lying on a deck edge (at the lattice) becomes a vertex of that deck, so the
  // two outlines share it exactly and the difference leaves nothing between them.
  const lat = 1 / SCALE, cellOf = new Map(), ck = (x, z) => `${Math.floor(x)},${Math.floor(z)}`
  for (const r of rings) for (const p of r) { const k = ck(p[0], p[1]); (cellOf.get(k) || cellOf.set(k, []).get(k)).push(p) }
  const noded = deckRings.map(d => d.flatMap((a, m) => { const b = d[(m + 1) % d.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, on = []
    if (!L2) return [a]
    for (let i = Math.floor(Math.min(a[0], b[0])) - 1; i <= Math.floor(Math.max(a[0], b[0])) + 1; i++) for (let j = Math.floor(Math.min(a[1], b[1])) - 1; j <= Math.floor(Math.max(a[1], b[1])) + 1; j++)
      for (const p of cellOf.get(`${i},${j}`) || []) { const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2
        if (t > 0 && t < 1 && Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) <= lat) on.push([t, p]) }
    return [a, ...on.sort((x, y) => x[0] - y[0]).map(([, p]) => p)] }))
  const c = new Clipper(), tree = new PolyTree()
  c.AddPaths(rings.map(toPath), PolyType.ptSubject, true); c.AddPaths(noded.map(toPath), PolyType.ptClip, true)
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
    const k = deckRings.findIndex(d => onRing(a, d) && onRing(b, d) && onRing(mid, d)); return k < 0 ? null : k })
  // ⭐ THE ARCS ARE THE RETURNED RINGS' OWN EDGES, each stroked once (Zob's read, 2026-10-27; PTown, 10-27): built by clipping
  // the coast arcs and the deck outlines as open paths, an edge where the coast FOLLOWS a deck (bake-coast#followDecks) was
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
  return { rings: out, arcs: a2 }
}
