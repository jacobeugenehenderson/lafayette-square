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
import { NODE_BOUND } from '../src/lib/latticeNode.js'                 // the rounding's own bound: what a sliver is
import { openCloseCutOnce, openAt, closeAt, partsOf } from './openClose.mjs'   // the open/close, cut once (openCloseAtStep, waterWithoutDecks)
import { structureOverWater } from '../src/cartograph/streetClass.js'   // the over-water vocabulary's one home
import { pourMeasureOf } from '../src/cartograph/streetProfiles.js'      // the pour's measure, the one rule (derive calls it too)
import { DECK_KINDS } from '../src/cartograph/streetClass.js'   // the deck vocabulary's one home, beside isOffGradeWay

const { Clipper, ClipperOffset, Paths, Path, IntPoint, PolyTree, ClipType, PolyType, PolyFillType, JoinType, EndType } = clipperLib
const toPath = (ring) => { const p = new Path(); for (const [x, z] of ring) p.push(new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE))); return p }
const fromPath = (path) => path.map(q => [q.X / SCALE, q.Y / SCALE])
const signedArea = (r) => r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2
const inRing = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
const union = (paths) => { if (!paths.length) return new Paths(); const c = new Clipper(), out = new Paths(); c.AddPaths(paths, PolyType.ptSubject, true)
  if (!c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)) throw new Error('⛔ structures: the deck union FAILED'); return out }

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
// ⭐ A FOOTPRINT AT THE TRACE'S OWN SCALE, BOTH WAYS: OPEN, THEN CLOSE, AT THE TRACE'S STEP (Boz's rulings, 2026-10-27; the
// decks first, then the traced water, one method). A SPIKE or a GAP narrower than one cell is something neither the source nor
// the line can resolve: the OPEN (eroded then dilated by half a cell, kept inside the source) finds what is narrower than a
// cell, the CLOSE (dilated then eroded by half a cell, kept with the open) finds a gap narrower than a cell. ⛔ Per connected
// part, never across two: two parts a metre apart stay two.
// ⭐⭐ CUT ONCE, IN FULL PRECISION (Boz's ruling, 2026-10-28; BRIEF-cut-once-in-full-precision): the open and the close only FIND
// the features; what comes out is the SOURCE minus each feature the open took, plus each feature the close filled, and every
// edge of it lies on the line it was born on: the source's own edge where nothing changed, never a re-rounded copy. The means
// is openClose.mjs (one noded arrangement per boolean, provenance on every edge). ⛔ It was clipper's integer re-offset, whose
// copy of a source edge lay within the rounding of it (PTown's decks 109 copies, Huron's traced water 91,990).
// ⭐ A ROUNDING SLIVER is a piece that lies wholly within the rounding of the boundary: eroded by the lattice's own bound
// (latticeNode.js#NODE_BOUND, √½ of a step) it leaves NOTHING (Zob, 2026-10-28). It is the rounding, not the source, and is
// dropped, counted. Anything that survives the erosion is a FEATURE: applied and named. ⛔ No area, no width, no constant.
// Counted and named, per connected PART of the source (a part in a part's hole is its own): `opened` and `closed` [{ m2, at }]
// (the features applied); a part the open removes ENTIRELY is `belowResolution` [{ m2, at, ring }], never silently lost;
// `openedPieces` / `closedPieces` name each feature taken or filled, largest first ({ features: [{ m2, lenM: its longer bounding
// side, at, poly: [outer, …holes] }], slivers: { n, m2 } }); the features' polygons are what bake-coast's settle may not cross
// (bake-coast.mjs#wallsOf). `dropped` names each input ring wholly a rounding sliver, removed before the arrangement.
// Returns the kept paths. ⛔ A hole of the source that the result opens, or two parts it joins, refuses by name (Boz's).
// ▶ node checks/claims-the-open-close-cuts-once.mjs · checks/claims-a-coast-finer-than-its-trace-is-not-drawn.mjs
/** ⭐ A ROUNDING SLIVER (Zob, 2026-10-28): a piece (clipper paths, outer + holes) that eroded by the lattice's own bound
 *  (latticeNode.js#NODE_BOUND) leaves nothing: it lies wholly within the rounding of the boundary. */
export function isRoundingSliver(pp) {
  const co = new ClipperOffset(), o = new Paths(); co.AddPaths(pp, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, -NODE_BOUND)
  return o.every(q => Clipper.Area(q) <= 0)
}
export function openCloseAtStep(paths, stepM, what) {
  if (!(stepM > 0)) throw new Error(`⛔ structures: openCloseAtStep (${what}) needs the trace's step (got ${stepM})`)
  const m2 = (pp) => pp.reduce((t, q) => t + ringAreaU(q), 0) / SCALE / SCALE, place = (q) => [+(q[0].X / SCALE).toFixed(3), +(q[0].Y / SCALE).toFixed(3)]
  const feature = (pp) => { const xs = pp[0].map(q => q.X), ys = pp[0].map(q => q.Y)
    return { m2: +m2(pp).toFixed(4), lenM: +(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / SCALE).toFixed(3), at: place(pp[0]), poly: pp.map(q => q.map(v => [v.X / SCALE, v.Y / SCALE])) } }
  const kept = new Paths(), opened = [], closed = [], belowResolution = [], dropped = [], taken = [], filled = []
  // ⛔ PER PART, NEVER ACROSS TWO: each connected part (its own outer and holes; a part in a part's hole is its own) is opened and
  // closed alone, so two parts a metre apart stay two. The parts are the noded union's own (openClose.mjs#partsOf), never a
  // second, re-rounded union's
  for (const part of partsOf(paths, what)) {
    const r = openCloseCutOnce(part, stepM, what), at = place(part[0])
    dropped.push(...r.dropped.map(x => ({ stage: x.who, m2: +(x.u2 / SCALE / SCALE).toFixed(6), at: x.at })))
    if (!r.rings.length) belowResolution.push({ m2: +(part.reduce((t, q) => t + Clipper.Area(q), 0) / SCALE / SCALE).toFixed(3), at, ring: fromPath(part[0]) })
    else { const tm = r.tf.reduce((t, pp) => t + m2(pp), 0), fm = r.ff.reduce((t, pp) => t + m2(pp), 0)
      if (tm > 0) opened.push({ m2: +tm.toFixed(3), at }); if (fm > 0) closed.push({ m2: +fm.toFixed(3), at })
      taken.push(...r.taken.map(pp => ({ pp, kept: r.tf.includes(pp) }))); filled.push(...r.filled.map(pp => ({ pp, kept: r.ff.includes(pp) })))
      for (const q of r.rings) { const p = new Path(); for (const v of q) p.push(new IntPoint(v.X, v.Y)); kept.push(p) } } }
  const split = (xs) => { const sl = xs.filter(x => !x.kept)
    return { features: xs.filter(x => x.kept).map(x => feature(x.pp)).sort((a, b) => b.m2 - a.m2), slivers: { n: sl.length, m2: +sl.reduce((t, x) => t + m2(x.pp), 0).toFixed(4) } } }
  return { paths: kept, opened, closed, belowResolution, openedPieces: split(taken), closedPieces: split(filled), dropped }
}
const ringAreaU = (q) => { let a = 0; for (let i = 0; i < q.length; i++) { const p = q[i], w = q[(i + 1) % q.length]; a += p.X * w.Y - w.X * p.Y } return a / 2 }

/** The deck footprints' INPUTS, before the union: each area as mapped, each line buffered, each joint's hull, each one
 *  normalized on its own (below). `inputs` [[path…]] one entry per input; `paths` the same, flat, which deckFootprints unions.
 *  Exported so a check reads the inputs the union is given, not a copy. */
export function deckInputs(osmGround) {
  const { areas, lines } = deckStructures(osmGround)
  let typical = null
  const raw = []
  for (const a of areas) raw.push([toPath(a.ring)])
  let unmapped = 0
  for (const l of lines) {
    const wM = l.widthM ?? (typical ??= defaultDeckWidthM())
    if (l.widthM == null) unmapped++
    const co = new ClipperOffset(), out = new Paths()
    co.AddPath(toPath(l.line), JoinType.jtMiter, EndType.etOpenButt)
    co.Execute(out, (wM / 2) * SCALE)
    raw.push(out)
    l._halfM = wM / 2
  }
  // ⭐ A NODE WHERE TWO OR MORE DECK WAYS END IS A JOINT (Boz's ruling, 2026-10-27; PTown: two marina piers of widths 3 and 2
  // ending on one node at 90° left an unfilled wedge, a 1.5 m hairpin ① could not outline). Each way's butt end there is the
  // segment across its own end, half its width either side; the joint is filled by the convex hull of those segments, from
  // the ways' own geometry.
  const ends = new Map()
  for (const l of lines) { const L = l.line; if (L.length < 2) continue
    for (const [e, f] of [[L[0], L[1]], [L[L.length - 1], L[L.length - 2]]]) { const k = toPath([e])[0], key = `${k.X},${k.Y}`
      const dx = e[0] - f[0], dz = e[1] - f[1], n = Math.hypot(dx, dz); if (!n) continue
      const h = l._halfM, px = -dz / n * h, pz = dx / n * h
      ;(ends.get(key) || ends.set(key, []).get(key)).push([e[0] + px, e[1] + pz], [e[0] - px, e[1] - pz]) } }
  let joints = 0
  for (const pts of ends.values()) { if (pts.length < 4) continue
    const hull = convexHull(pts); if (hull.length < 3) continue
    raw.push([toPath(hull)]); joints++ }
  for (const l of lines) delete l._halfM
  // ⭐ EACH INPUT IS NORMALIZED ON ITS OWN BEFORE THE UNION (Boz's ruling, 2026-10-27; per INPUT, not per path: Zob): the
  // nonzero union sums windings, so where an area mapped clockwise overlapped a line's offset (counter-clockwise) the overlap
  // summed to 0 and was NOT deck: deck two OSM objects both cover went missing and one deck split in two (PTown, the Coast
  // Guard Pier and the USCG pier @(-56.78, 989.78); Huron 3.37 m² in 13 pieces). A mapper's drawing order is never a statement
  // about the deck. Each input is unioned ALONE (nonzero), which returns its outers counter-clockwise and its holes clockwise:
  // the drawing order is gone and a hole stays a hole (a line whose buffer encloses water, a pier hooked back on itself).
  const inputs = raw.map(ps => union(ps))
  return { inputs, paths: inputs.flat(), count: { areas: areas.length, lines: lines.length, joints, unmappedWidth: unmapped, typicalWidthM: typical } }
}

/** A footprint's rings, its point test and its exact edge crossing, off its union `u` (clipper paths): one index for the decks and
 *  the embankments, so the coast is traced against either the same way. */
function footprintOf(u) {
  const rings = u.map(fromPath)
  const boxes = rings.map(r => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z) } return [x0, x1, z0, z1] })
  // nonzero over the union's rings: an outer counts +1, a hole −1, so a point in a footprint's courtyard is not on it
  const on = (x, z) => { let wn = 0; for (let k = 0; k < rings.length; k++) { const b = boxes[k]; if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue; if (inRing(x, z, rings[k])) wn += Math.sign(signedArea(rings[k])) } return wn !== 0 }
  // ⭐ WHERE A SEGMENT a→b LEAVES THE FOOTPRINT (Zob, 2026-10-26): the exact crossing of its own ring nearest a (the
  // footprint end), so a coast traced against a deck or an embankment lies ON its edge, never a sample's guess at it; a itself when a lies on
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
    // ⭐ No proper crossing: a runs along a ring edge (collinear) or sits on the ring itself, so the footprint end IS the crossing,
    // exact, but only if a lies on the ring within the clip grid. Otherwise null, and the caller refuses: never a guess.
    let dmin = Infinity
    for (let k = 0; k < rings.length; k++) { const bx = boxes[k]; if (a[0] < bx[0] - 1 || a[0] > bx[1] + 1 || a[1] < bx[2] - 1 || a[1] > bx[3] + 1) continue
      const r = rings[k]; for (let m = 0; m < r.length; m++) { const p = r[m], q = r[(m + 1) % r.length], ex = q[0] - p[0], ez = q[1] - p[1], L2 = ex * ex + ez * ez || 1
        const u = Math.max(0, Math.min(1, ((a[0] - p[0]) * ex + (a[1] - p[1]) * ez) / L2)); dmin = Math.min(dmin, Math.hypot(a[0] - p[0] - u * ex, a[1] - p[1] - u * ez)) } }
    return dmin <= 1 / SCALE ? a : null }
  return { rings, on, crossing }
}

export function deckFootprints(osmGround, stepM) {
  if (!(stepM > 0)) throw new Error(`⛔ structures: deckFootprints needs the trace's step (got ${stepM}) — a deck is closed at the step the lidar is traced at, and there is no other`)
  const { paths, count } = deckInputs(osmGround)
  // ⭐ EACH DECK IS OPENED, THEN CLOSED, AT THE TRACE'S STEP (Boz's rulings, 2026-10-27): Huron, a pier line with no width beside
  // its mapped area left a notch 5 m deep and under a cell wide; footprint corners were as sharp as 0.20° (Huron) and 1.13°
  // (PTown), which the ink cannot outline where a deck's edge is drawn as shore. The one rule, `openCloseAtStep`, below.
  const { paths: closedPaths, opened, closed, belowResolution } = openCloseAtStep(paths, stepM, 'a deck')
  const u = union(closedPaths)
  const { rings, on, crossing } = footprintOf(u)
  return { paths: u, rings, on, crossing, closed, closedM2: +closed.reduce((t, c) => t + c.m2, 0).toFixed(3), opened, openedM2: +opened.reduce((t, c) => t + c.m2, 0).toFixed(3), belowResolution, count, m2: u.reduce((t, p) => t + Clipper.Area(p), 0) / (SCALE * SCALE) }
}

/**
 * ⭐ THE COAST BAKE HOLDS AN EMBANKMENT AS LAND (Jacob, 2026-10-28, `r-the-coast-bake-holds-an-embankment-as-land`): a street way
 * tagged embankment=* (streetClass.js#structureOverWater 'ground') is evidence the land is there, so its footprint is held as
 * LAND while the high-water line is traced (bake-coast.mjs), and the coast and the dike are one line by construction. ⛔ This
 * replaces the embankment take-out in the mint (held WIP, never merged). The land is the street's whole section at the POUR's
 * measure (streetProfiles.js#pourMeasureOf, the rule derive calls), out to its OUTER edge, pavement + treelawn + sidewalk a side
 * (`r-a-way-tag-decides-before-byCoast`, embankmentExtent), along the mint's own centreline (the skeleton tessellated as
 * mintInputs tessellates it), butt-ended and cut once (stripOf); never opened or closed (it is at the trace's resolution). The tag SELECTS the class and never
 * sizes it: ⛔ the `width` tag is not read.
 * ⛔ Each refuses by name: a run only partly embankment; a chain that is a divided carriageway (derive's pair pass, innerEdgeAssign,
 * re-assigns its measure after pourMeasureOf, and the coast bake cannot reproduce it); a chain whose overlay carries per-segment
 * `segmentMeasures` (derive's later pass, likewise); no width; unequal sides (an exact one-sided footprint is not built); a
 * strip narrower than one trace cell; a side that folds (stripOf).
 * @param skeletonStreets clean/skeleton.json's streets
 * @param opt { overlay: clean/overlay.json `streets` (or {}), std: () => the highway standard, tessellate: derive.js#tessellateAdaptive, stepM }
 * @returns { paths, rings, on, crossing, embankments: [{ street, name, ways, outerM, m2 }] }
 */
/**
 * ⭐ A STRIP CUT ONCE (Boz's ruling, 2026-10-28, ORIENTATION's rounding rule): the polyline `P` widened by `h` a side, butt-ended,
 * built in FLOATS and rounded to the lattice ONCE. Each side is the polyline's offset; each join is the EXACT intersection of
 * its two adjacent offset lines, so one join is one vertex by construction. ⛔ It was ClipperOffset's jtMiter, which emits two
 * vertices 1 u apart at a near-straight join (the Breakwater: −0.09° and −0.38° turns, 6 verifier violations).
 * ⛔ A FOLD refuses by name: a join whose intersection lies farther along than either adjacent offset segment reaches (the side
 * would turn back on itself; a sharp bend's miter spike), so no miter limit and no constant. After the one rounding, adjacent
 * vertices landing on one lattice point are one vertex. → a clipper path, wound positive.
 */
function stripOf(P, h, who) {
  const n = P.length, N = []
  for (let i = 0; i < n - 1; i++) { const dx = P[i + 1][0] - P[i][0], dz = P[i + 1][1] - P[i][1], L = Math.hypot(dx, dz)
    if (!(L > 0)) throw new Error(`⛔ structures: ${who}: its centreline repeats a point at (${P[i].map(v => v.toFixed(3)).join(', ')}). Refusing.`)
    N.push({ n: [-dz / L, dx / L], t: [dx / L, dz / L], L }) }
  const side = (s) => { const out = [[P[0][0] + s * h * N[0].n[0], P[0][1] + s * h * N[0].n[1]]]
    for (let k = 1; k < n - 1; k++) { const a = N[k - 1], b = N[k], c = a.n[0] * b.n[0] + a.n[1] * b.n[1]
      if (!(c > -1 + 1e-12)) throw new Error(`⛔ structures: ${who}: its centreline turns back on itself at (${P[k].map(v => v.toFixed(3)).join(', ')}). Refusing.`)
      const m = [(a.n[0] + b.n[0]) / (1 + c), (a.n[1] + b.n[1]) / (1 + c)]          // the miter: the exact intersection of the two offset lines
      const q = [P[k][0] + s * h * m[0], P[k][1] + s * h * m[1]]
      // how far along each adjacent segment the join lies past its own end: beyond either segment's length, the side folds
      const along = Math.abs(s * h * (m[0] * a.t[0] + m[1] * a.t[1]))
      if (along > a.L || along > b.L) throw new Error(`⛔ structures: ${who}: at (${P[k].map(v => v.toFixed(3)).join(', ')}) its ${h} m side would fold (the join reaches ${along.toFixed(3)} m along a ${Math.min(a.L, b.L).toFixed(3)} m segment). Refusing.`)
      out.push(q) }
    out.push([P[n - 1][0] + s * h * N[n - 2].n[0], P[n - 1][1] + s * h * N[n - 2].n[1]]); return out }
  const ring = [...side(1), ...side(-1).reverse()]
  const p = new Path(); for (const [x, z] of ring) { const q = new IntPoint(Math.round(x * SCALE), Math.round(z * SCALE)), l = p[p.length - 1]; if (!l || l.X !== q.X || l.Y !== q.Y) p.push(q) }
  if (p.length > 1 && p[0].X === p[p.length - 1].X && p[0].Y === p[p.length - 1].Y) p.pop()
  if (!Clipper.Orientation(p)) p.reverse()
  return p
}

export function embankmentFootprints(skeletonStreets, { overlay, std, tessellate, stepM }) {
  if (!(stepM > 0)) throw new Error(`⛔ structures: embankmentFootprints needs the trace's step (got ${stepM})`)
  if (!overlay || typeof tessellate !== 'function' || typeof std !== 'function') throw new Error('⛔ structures: embankmentFootprints needs the overlay (or {}), the highway standard and the mint\'s tessellation')
  const all = new Paths(), embankments = []
  for (const st of skeletonStreets || []) {
    if (!st.name || !st.points || st.points.length < 2) continue          // derive's own filter: a chain it does not pour
    const ground = (w) => structureOverWater((st.ways || {})[w]) === 'ground'
    const runs = (st.segmentWays || []).filter(r => r.ways.some(ground))
    if (!runs.length) continue
    const who = `street ${st.id} (${st.name}; ways ${[...new Set(runs.flatMap(r => r.ways))].join(', ')})`
    for (const r of runs) if (!r.ways.every(ground)) throw new Error(`⛔ structures: ${who} is an embankment on only part of a run (${r.from}→${r.to}) — its extent cannot be read. Refusing.`)
    if (st.phase?.pairKey && /^carriageway-[AB]$/.test(st.phase.role || '')) throw new Error(`⛔ structures: ${who} is an embankment on a divided carriageway — derive's divided-pair pass (innerEdgeAssign) re-assigns its measure after the shared rule, and the coast bake cannot reproduce that pass. Refusing.`)
    const ov = overlay[st.id] || null
    if (ov?.segmentMeasures) throw new Error(`⛔ structures: ${who} is an embankment whose overlay carries per-segment measures (segmentMeasures) — a pass the coast bake cannot reproduce. Refusing.`)
    const m = pourMeasureOf(st, ov, std).measure
    const outer = ['left', 'right'].map(side => { const d = m?.[side]; return d && d.pavementHW > 0 ? d.pavementHW + (d.treelawn || 0) + (d.sidewalk || 0) : null })
    if (!outer.every(h => h > 0)) throw new Error(`⛔ structures: ${who} is an embankment with no roadway width at the pour (left ${outer[0]}, right ${outer[1]}). Refusing.`)
    if (Math.abs(outer[0] - outer[1]) > 1 / SCALE) throw new Error(`⛔ structures: ${who} is an embankment with unequal sides (left ${outer[0]}, right ${outer[1]} m) — an exact one-sided footprint is not built. Refusing.`)
    const pts = tessellate(st.points.map(q => (Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])), st.segments), at = pts.anchorAt || pts.map((_, i) => i)
    if (at.length !== st.points.length) throw new Error(`⛔ structures: ${who}: ${at.length} anchor index(es) for ${st.points.length} skeleton point(s) — the tessellation lost the anchors' identity. Refusing.`)
    const raw = new Paths()
    for (const r of runs) { const P = pts.slice(at[r.from], at[r.to] + 1)
      if (P.length < 2) throw new Error(`⛔ structures: ${who}: its embankment run ${r.from}→${r.to} has no centreline. Refusing.`)
      raw.push(stripOf(P, outer[0], who)) }
    // ⭐ NOT OPENED OR CLOSED (Boz's ruling, 2026-10-28): the strip is cut once at the pour's width, so it is at the trace's
    // resolution by construction; ⛔ the integer open/close manufactured a 7 mm × 100 m wedge at a butt end of a clean strip
    // (a 0.38° join, the Breakwater's own). A strip narrower than one step refuses by name.
    if (2 * outer[0] < stepM) throw new Error(`⛔ structures: ${who} is an embankment narrower than one trace cell (${stepM} m) at its own measure (${+(2 * outer[0]).toFixed(3)} m) — it is below the trace's resolution. Refusing.`)
    const u = union(raw)
    all.push(...u)
    embankments.push({ street: st.id, name: st.name, ways: [...new Set(runs.flatMap(r => r.ways))], outerM: outer[0], m2: +(u.reduce((t, p) => t + Clipper.Area(p), 0) / SCALE / SCALE).toFixed(3) })
  }
  const u = union(all)
  return { paths: u, ...footprintOf(u), embankments }
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
  // ⛔ a street rides its deck, so a deck the open removed entirely (narrower than one trace cell everywhere) that a street
  // crosses has nothing left for the street to ride: refused by name (Boz, 2026-10-27)
  for (const b of fp.belowResolution) for (const st of streets) {
    const c = new Clipper(), tree = new PolyTree(), line = toPath(st.points || [])
    if (line.length < 2) continue
    c.AddPath(line, PolyType.ptSubject, false); c.AddPath(toPath(b.ring), PolyType.ptClip, true)
    c.Execute(ClipType.ctIntersection, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    if (Clipper.OpenPathsFromPolyTree(tree).some(p => p.length >= 2)) throw new Error(`⛔ structures: street ${st.skelId ?? st.name} rides a deck at (${b.at.join(', ')}), ${b.m2} m², that is narrower than one trace cell (${stepM} m) everywhere, so nothing of it survives the trace's resolution and the street has no deck to ride. Refusing.`)
  }
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
    const loc = op(ClipType.ctIntersection, w0, grow(D, 2 * cellU)), open = openAt(loc, stepM, `deck ${k}'s water`)
    const thin = op(ClipType.ctIntersection, op(ClipType.ctDifference, loc, open), grow(D, cellU))
    const touching = thin.filter(q => Clipper.Area(q) > 0 && area(op(ClipType.ctIntersection, grow([q], 2), D)) > 0)
    for (const q of touching) { const a = fromPath(q); slivers.push({ deck: k, m2: +(Clipper.Area(q) / SCALE / SCALE).toFixed(3), at: a[0].map(v => +v.toFixed(3)) }) }
    // ⛔ a sliver meeting the deck at a single point would be left a separate piece of deck standing in the water (a hole the
    // coast did not draw: "clear of every shore" would refuse it, Zob 10-27): closed at half a cell, as each deck's footprint
    // is (deckFootprints), it joins the deck
    const u0 = op(ClipType.ctUnion, [...D, ...touching]), e = closeAt(u0, stepM, `deck ${k}`), outers = e.filter(q => Clipper.Area(q) > 0)
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
