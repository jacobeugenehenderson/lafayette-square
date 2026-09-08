// tileGround — the pure-ribbon TILE construction (T1 of the reconceived
// pipeline; spike-validated, HANDOFF-spike-pure-ribbon.md → HANDOFF-tile-T1-
// live-path.md). ONE module shared by the LIVE Designer (BlockGeometryV2Debug)
// and the bake (bake-ground) so live == bake by construction (WYSIWYG).
//
// This is THE live ground construction for every scene — and since T4
// (2026-07-15) the ONLY one. Figure-ground, its predecessor, is deleted;
// what remains of buildBlockGeometryV2 is the frontage-edge identity builder.
//
// The construction:
//   1. TILES = bounded faces of the street centerline graph. Centerlines are
//      the grout (shared tile edges). Faces partition the plane by
//      construction — no gaps, no overlaps, no figure-ground complement.
//      Extracted by a half-edge (DCEL) planar face walk.
//   2. Each tile (a closed ring with SHARP corners at the centerline nodes)
//      is offset INWARD by cumulative band depths with a ROUND join:
//        asphalt (at grout) | curb | treelawn | sidewalk | land-use (center)
//      The inward offset's round join rounds the tile's CONVEX corners — so
//      the curb corner rounds for free (radius = inset depth). The tile stays
//      sharp; rounding lives on the strips. (This is the keystone's
//      "round the block, offset the polygon" applied to a robust graph face.)
//   3. asphalt = union of every tile's outer (grout-hugging) strip. The road
//      between two tiles = each tile's half, meeting at the shared grout;
//      asymmetric widths fall out (each tile offsets its own side's hw). At a
//      node the meeting tiles each contribute their asphalt, so coverage is
//      emergent — but the junction is NOT left emergent: [E3.2] consumes
//      ribbons.junctionMap and CONSTRUCTS the intersection positively at every
//      stamped node (runs trimmed back by a window, a window polygon welding
//      the continuity pair at a shared curb point, one apron per node), and
//      [E3.3] constructs the corner identities off it. Emergent coverage is
//      the substrate; the junction silhouette is built.
//   4. The perimeter beyond the outermost streets is the unbounded outer face
//      (not a tile); it fills as LU = stencil − union(tiles).
//
// Returns raw Clipper ring lists per material; bake-ground packs them.

import clipperLib from 'clipper-lib'
import { CURB_WIDTH } from '../cartograph/streetProfiles.js'
import { smoothChain, jKey, junctionKeysOf } from './smoothCenterline.js'
import { pickLuFromHash, hashKey, blockKeyFromRing } from './buildBlockGeometryV2.js'
import { resolveChainSegmentation } from './chainSegmentation.js'
import { readCapCustom } from './feCustomKey.js'
// [SLICE 2 — TEMPORARY] The substrate walk, imported but NOT called unless the
// flag is on (`electSubstrateTiles`). An import is not a call site: with the
// flag off nothing in this module reaches it. Goes when the hybrid goes.
import { walkSubstrate, tilesFromWalk } from './substrateWalk.js'
import { createVocabularyGate } from '../../cartograph/osm-vocabulary.mjs'

const SCALE = 1000
const toClipper = (p) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const fromClipper = (p) => [p.X / SCALE, p.Y / SCALE]

// Offset CLOSED rings by `delta`. Negative = erode/inset. `join` selects the
// corner treatment:
//   • 'round' (default) — for morphological openRound + smooth clip zones.
//   • 'miter' — for the concentric ped bands. RIBBONS §3.9a step 7 (the V1
//     keystone) is explicit: the band offsets MUST be jtMiter, NOT jtRound.
//     The asphalt-inner ring (iA) is ALREADY rounded once (filletRing emits a
//     dense arc per corner); jtMiter inherits those arcs as concentric nested
//     arcs (r→r+d via dense-sample miters) AND passes operator-authored R=0
//     square corners through SHARP. jtRound would re-round every corner by
//     radius=d — a SECOND rounding stacked on the curb fillet, corrupting
//     squares. "The corner is the band bent, never a separately-built shape."
function offsetRings(rings, delta, join = 'round') {
  if (!rings.length) return []
  if (delta === 0) return rings.map(r => r.slice())
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05 * SCALE)     // miterLimit 2 → 90° squares stay sharp; very-acute corners bevel
  const jt = join === 'miter' ? JoinType.jtMiter : JoinType.jtRound
  for (const r of rings) if (r && r.length >= 3) co.AddPath(r.map(toClipper), jt, EndType.etClosedPolygon)
  const out = []
  co.Execute(out, delta * SCALE)
  return out.map(p => p.map(fromClipper))
}
// ── D6a · the per-edge variable offset (the curb, as a polygon) ────────────
// POLYGON-FIRST §3 / SKELETON §5f: the curb is `chain ⊕ pavementHW`, a PARALLEL
// OFFSET of the frozen frame, with corners as the INTERSECTION of adjacent
// offset lines — NOT carved from the asphalt union (which bows where junction
// windows swell it). Offset each ring edge inward by its own depth; each vertex
// is where its two neighbour offset lines cross. Acute spikes are miter-clamped
// to a bevel; the result is Clipper-cleaned of any self-intersection (pinched/
// non-convex tiles). depthAt(i) = inward depth for edge i (ring[i]→ring[i+1]).
// cornerAt(i) = whether vertex i is a REAL corner (two DIFFERENT streets meet).
// At a non-corner — a THROUGH-node where one street continues (a T's far side, a
// centerline dogleg) — the curb runs continuous, never an offset-intersection
// corner (osm2streets doctrine: corners come from leg adjacency; "T-sensitivity").
// capAt(i) = null | 'round' | 'blunt' — a dead-end TIP vertex; the cap is built
// INTO the polygon (a semicircle / flat butt spanning the two legs' offset
// endpoints), tangent to the legs by construction → no graft, and it matches the
// authored per-fe leg width automatically.
function capArc(PL, PR, bx, bz, N = 16) {
  const Cx = (PL[0] + PR[0]) / 2, Cy = (PL[1] + PR[1]) / 2
  const r = Math.hypot(PL[0] - PR[0], PL[1] - PR[1]) / 2
  if (!(r > 1e-6)) return [PL]
  const aL = Math.atan2(PL[1] - Cy, PL[0] - Cx)
  const target = Math.atan2(-bz, -bx)            // tip side = away from the street body
  const adiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d) }
  const ccw = adiff(aL + Math.PI / 2, target) < adiff(aL - Math.PI / 2, target)   // sweep through the tip side
  const out = []
  for (let k = 0; k <= N; k++) { const a = aL + (ccw ? 1 : -1) * Math.PI * (k / N); out.push([Cx + r * Math.cos(a), Cy + r * Math.sin(a)]) }
  return out
}
// ⛔⛔ `easeRing` WAS HERE AND IS EXCISED (2026-09-06). It rounded ②'s corners by walking
// arc-length, computing a setback `R/tan(θ/2)`, budgeting against neighbouring corners, declining
// when it did not fit, and reverting a ring whose result self-intersected.
// ⭐⭐ IT WAS A CORNER CONSTRUCTOR, AND THAT IS THE ONE THING THE MODEL SAYS A CORNER IS NOT.
// Jacob: "the chains should be smooth, the corners should be native." `RIBBONS §1` had already
// retired `cornerAt`/`capAt`/`filletRing` for the same reason — "a contour already IS its corners
// and caps" — and this was those three rebuilt under a new name.
// ⛔ ITS HISTORY IS THE ARGUMENT AGAINST IT: every guard it grew existed to prop up the previous
// guard. It drew 100 m chords across blocks (setback diverging at shallow angles); the budget added
// to stop that used an invented 7° threshold that ordinary curvature tripped, so real corners came
// back "too tight"; the cluster-collapse added to fix THAT silently zeroed every corner on every
// clean quadrilateral block, because all four of a block's vertices are crossings; removing the
// collapse then broke the rings outright.
// ⇒ ② is now the plain offset of ①, which renders correctly on a block. The authored corner radius
// is owed and belongs in the NODE's bezier handles — where `RIBBONS §1` puts it, and where it is a
// property the contour carries rather than a shape something builds onto it afterwards.
// Remove FOLD NEEDLES from a per-vertex offset ring. On a bend tighter than the
// offset depth (exposed by the curve-fit knob's smooth dense curves) the inward
// offset overshoots and the ring doubles back on itself, leaving a thin spike —
// a near-180° reversal whose tip ≈ coincides with a neighbour. unionRings keeps
// it as an ATTACHED needle (the two legs nearly touch but don't fully cross, so
// the boolean can't split it off), and that needle pinches the curb band (iA−iC)
// into a sliver/loop downstream. Iteratively drop the reversal-tip vertices
// (interior turn > 165° — the gate's own spur threshold; an authored corner turns
// far less) and collapse the near-coincident points the cut leaves behind.
// Identity on clean offsets: gentle curve samples + real corners never reverse.
// [D6a robust-offset, 2026-06-14 — POLYGON-FIRST §3, the iA-source fix; the
// band-side sliver filter is forbidden, fix the pinch where it's born.]
const SPUR_COS = Math.cos(165 * Math.PI / 180)   // in·out < this ⇒ turn > 165°
// [A10-③ STAMP] Tracked twin. Identical logic, vertex-for-vertex; it additionally
// returns `src`, where src[k] is the index in the INPUT ring of output vertex k.
// dropFoldSpurs() below is this function with the bookkeeping thrown away, so the
// two can never diverge — there is one implementation, not two.
function dropFoldSpursTracked(ring) {
  let r = ring, ri = ring.map((_, i) => i)
  for (let pass = 0; pass < 8; pass++) {
    const d = [], di = []                          // collapse near-coincident points
    for (let k = 0; k < r.length; k++) { const p = r[k], q = d[d.length - 1]; if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.03) continue; d.push(p); di.push(ri[k]) }
    while (d.length >= 3 && Math.hypot(d[0][0] - d[d.length - 1][0], d[0][1] - d[d.length - 1][1]) < 0.03) { d.pop(); di.pop() }
    if (d.length < 3) return { ring: r, src: ri }
    const n = d.length, keep = new Array(n).fill(true)
    let removed = 0
    for (let i = 0; i < n; i++) {
      const a = d[(i - 1 + n) % n], v = d[i], b = d[(i + 1) % n]
      const ix = v[0] - a[0], iy = v[1] - a[1], ox = b[0] - v[0], oy = b[1] - v[1]
      const li = Math.hypot(ix, iy) || 1, lo = Math.hypot(ox, oy) || 1
      if ((ix / li) * (ox / lo) + (iy / li) * (oy / lo) < SPUR_COS) { keep[i] = false; removed++ }
    }
    if (!removed) return { ring: d, src: di }
    const nx = d.filter((_, i) => keep[i])
    if (nx.length < 3) return { ring: d, src: di }
    r = nx; ri = di.filter((_, i) => keep[i])
  }
  return { ring: r, src: ri }
}
function dropFoldSpurs(ring) { return dropFoldSpursTracked(ring).ring }
// Count curb-band degenerates a given iA would produce — the gate's own metric
// (tiny rings <8 m² + near-180° reversal spurs) on band = iA − (iA inset by cw).
// Used to SELF-VALIDATE a median fold-strip: adopt it only when it lowers this.
function bandSliverCount(ia, cw) {
  if (!ia.length) return 0
  const band = differenceRings(ia, offsetRings(ia, -cw, 'round'))
  let c = 0
  for (const r of band) {
    if (!r || r.length < 3) continue
    const a = Math.abs(signedArea(r))
    if (a > 0.01 && a < 8) { c++; continue }
    for (let i = 0; i < r.length; i++) {
      const p0 = r[(i - 1 + r.length) % r.length], v = r[i], p1 = r[(i + 1) % r.length]
      const e1 = Math.hypot(p0[0] - v[0], p0[1] - v[1]), e2 = Math.hypot(v[0] - p1[0], v[1] - p1[1])
      if (e1 < 1 || e2 < 1 || e1 > 60 || e2 > 60) continue
      const d = ((v[0] - p0[0]) / e1) * ((p1[0] - v[0]) / e2) + ((v[1] - p0[1]) / e1) * ((p1[1] - v[1]) / e2)
      if (Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI > 165) c++
    }
  }
  return c
}
// ─────────────────────────────────────────────────────────────────────────
// [A03 · ROADMAP A03 — the curb producer, split at the CHAIN boundary]
//
// The curb was a photograph of a live chain-stroke: `buildTileGround(liveRibbons)`
// minted it with chains in scope and the result was snapshotted (POLYGON-FIRST
// Check C, RED). The cure is not "move it to prebake" — prebake is authoring-BLIND
// (derive.js never reads design.json), and the curb is a function of the AUTHORED
// width, so freezing it there would bake a bare-defaults curb (CLAUDE.md Layer 0
// q3). The requirement was always CHAIN-freedom, not prebake-location.
//
// So the producer splits in two:
//
//   freezeCurbEdgeFacts()  the CHAIN-DERIVED half. Reduces runs/streets/measures
//                          to ONE fact per RING EDGE. The only half that touches a
//                          chain; it is what moves to prebake (D6b).
//   buildCurbRings()       the CHAIN-FREE half. ring + frozen facts + authored
//                          widths → the curb. This is the producer, and it can no
//                          more reach a chain than `sectionPass` can.
//
// ⛔ buildCurbRings' SIGNATURE IS THE GUARD (the sectionPass pattern). It takes
// frozen facts and scalars — no `streets`, no `runs`, no `measures`, no `ribbons`.
// If something is missing, the reflex is to pass the chain in "just for this one
// case": that silently re-opens Check C. Freeze a new FACT instead, and let the
// signature change be visible in review.
// ─────────────────────────────────────────────────────────────────────────

// The chain-derived half. Per RING EDGE i (ring[i]→ring[i+1]) it emits:
//   { skelId, side, segOrd, baseHW, prof, streetKey }
// `baseHW` is the PRE-authoring half-width; the authored override is applied at
// build time (not here), which is what keeps the frozen facts look-agnostic — one
// scene's facts serve every look bound to it.
// `prof` is the divided-transition OUTER profile sampled at this edge's two chain
// vertices (SKELETON §5d/§5h — "the outer curb runs straight through"): a
// `[a|null, b|null]` pair, null where the profile does not speak. It reduces to a
// per-edge fact because the profile is a per-VERTEX frozen stamp already
// (`outerHWProfile`, vKey→hw) — we resolve the two lookups here and freeze the
// numbers, so the builder never needs the chain that carried them.
function freezeCurbEdgeFacts({ ring, runs, streetsOrig, measures, segOrdOf, curbWidth, isMedianTile }) {
  const edgeKey = (p, q) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}|${Math.round(q[0] * 50)},${Math.round(q[1] * 50)}`
  const factByEdge = new Map()
  for (const run of runs) {
    const so = streetsOrig[run.streetIdx]
    const skelId = (so && (so.skelId || so.name)) || null
    // BASE half-width — authoring deliberately NOT applied (see above).
    const baseHW = edgeDepth(measures[run.streetIdx], run.side, curbWidth, 'A')
    // Canonical through-road id — so cornerAt reads a name-transition seam as ONE
    // road (a THROUGH node, not a corner). Preserved verbatim from the live path.
    // ⭐ TWO UNIONS, BOTH CONSULTED (see cornerAt below). They are deliberately
    // DIFFERENT unions (derive.js "Distinct from roadId"): `throughId` spans a
    // spine↔carriageway divided transition that `roadId` does not, and `roadId`
    // spans a continuesAs NAME transition that `throughId` does not — because
    // throughId IS the name (skeleton.js `idKeyOf = corridor || name`). Keeping
    // only the first is what re-opened the 2026-06-15 name-transition corner.
    const streetKey = (so && (so.throughId || so.roadId || so.skelId || so.name)) || run.streetIdx
    const roadKey = (so && (so.roadId || so.skelId || so.name)) || run.streetIdx
    let profPts = null
    if (so?.outerHWProfile && !isMedianTile && /^carriageway/.test(so.phase?.role || '')) {
      profPts = []
      for (const key in so.outerHWProfile) { const c = key.split(','); profPts.push([+c[0], +c[1], so.outerHWProfile[key]]) }
    }
    const hwAt = (p) => { if (!profPts) return null; for (const e of profPts) { const dx = e[0] - p[0], dy = e[1] - p[1]; if (dx * dx + dy * dy < 0.09) return e[2] } return null }
    for (let i = 0; i < run.poly.length - 1; i++) {
      const prof = profPts ? [hwAt(run.poly[i]), hwAt(run.poly[i + 1])] : null
      const fact = { skelId, side: run.side, segOrd: segOrdOf(run), baseHW, prof, streetKey, roadKey }
      const k1 = edgeKey(run.poly[i], run.poly[i + 1]), k2 = edgeKey(run.poly[i + 1], run.poly[i])
      // FORWARD key authoritative, REVERSE only as a fallback that must never
      // clobber another run's forward key — the dead-end slit is traversed twice,
      // once per leg, and an unconditional reverse write collapsed both legs to
      // one width. Directed keys keep the two legs distinct. (Verbatim from the
      // live path; the ordering IS load-bearing.)
      factByEdge.set(k1, fact)
      if (!factByEdge.has(k2)) factByEdge.set(k2, fact)
    }
  }
  const n = ring.length
  const out = new Array(n)
  for (let i = 0; i < n; i++) out[i] = factByEdge.get(edgeKey(ring[i], ring[(i + 1) % n])) || null
  return out
}

// The CHAIN-FREE half — the producer. Everything it needs is a frozen fact or a
// scalar; `authoredHW(skelId, side, segOrd)` returns the operator's override or
// null. ⛔ Do not widen this signature with a chain-shaped argument.
function buildCurbRings({ ring, facts, authoredHW, capAtVertex, curved, stamp = null }) {
  const n = ring.length
  const depthAt = (i) => {
    const f = facts[i]
    if (!f) return 0
    // The authored width wins over the frozen base — the override IS the product
    // (Layer 0 q3). Frozen facts carry the frame; authoring carries the operator.
    const a = f.skelId != null ? authoredHW(f.skelId, f.side, f.segOrd) : null
    const base = Number.isFinite(a) ? Math.max(0, a) : f.baseHW
    if (!f.prof) return base
    // ⭐ The frozen fact is ALREADY a two-ENDED ramp — `freezeCurbEdgeFacts` samples
    // the divided-transition profile at this edge's two chain vertices. Hand the
    // producer both ends. Averaging them to a scalar (what this line used to do)
    // is what forced the outer curb to run PARALLEL to a splaying nose instead of
    // straight through it: a constant-depth offset of a splaying edge cannot be
    // collinear with the spine's outer line, however good the datum is
    // (SKELETON §5d). A null end still falls back to `base`, so an edge the
    // profile does not speak for is unchanged.
    return [f.prof[0] ?? base, f.prof[1] ?? base]
  }
  // A real corner = the two edges at this vertex belong to DIFFERENT streets.
  // Same street both sides = a through-node → run straight through, no corner.
  // ⭐ A THROUGH-NODE IF *EITHER* UNION AGREES. The two identities answer
  // different questions and neither subsumes the other, so a corner requires BOTH
  // to say "different road". Consulting only `throughId` re-opened the exact
  // defect the 2026-06-15 name-aware cure closed (RIBBONS §3.3): at a continuesAs
  // seam the NAME changes, so throughId disagrees while the canonical roadId —
  // computed, frozen, and carried on runMeta for precisely this — agrees. The
  // offset then cornered two near-tangent legs (measured 3.24°) at stepped
  // depths, and the miter clamp's bevel is the visible tooth.
  // ⛔ This is NOT a reorder: dropping `throughId` would lose the spine↔carriageway
  // divided transition it was added for. Both are consulted; either one suffices.
  const streetAt = (i) => facts[i]?.streetKey
  const roadAt = (i) => facts[i]?.roadKey
  const cornerAt = (i) => {
    const a = streetAt((i - 1 + n) % n), b = streetAt(i)
    if (a == null || b == null) return true          // unknown identity → corner (loud, not silent)
    if (a === b) return false                        // the throughId union agrees
    const ra = roadAt((i - 1 + n) % n), rb = roadAt(i)
    if (ra != null && rb != null && ra === rb) return false   // the roadId union agrees
    return true
  }
  return offsetRingVariable(ring, depthAt, cornerAt, capAtVertex, curved, stamp)
}

// ─────────────────────────────────────────────────────────────────────────
// [A10-③ · THE SOURCE-EDGE STAMP] Carry a ring-edge INDEX from `tile.ring` to
// `iA`. Ruled by Jacob 2026-08-09: iA is stamped with WHICH RING EDGE PRODUCED
// EACH PIECE — an index, never a street name. Street identity stays a label on
// the ring edge, exactly where it lives today (`tile.edges[i]`), so this adds no
// chain state anywhere; it records provenance the geometry already had and threw
// away. (ROADMAP A15: the wiring is load-bearing precisely BECAUSE iA carries no
// owner stamp, so `sectionPassTile` re-strokes a run's polyline to get from a
// ring-side owner to an iA-side arc. This is the missing half of that route.)
//
// THE LABEL, stated exactly: a stamped iA vertex carries the index `i` of the
// tile.ring VERTEX whose emission step produced it. Ring vertex i is the START of
// ring edge i (ring[i]→ring[i+1]), so the arc running from the first stamped `i`
// to just before the first stamped `i+1` is ring edge i's piece of the curb, and
// the corner geometry minted AT vertex i (miter point, bevel pair, or dead-end cap
// arc) sits at the head of it. That is a half-open convention applied uniformly —
// ⛔ not a judgment about who OWNS a corner, which is the FILL's question and is
// deliberately not answered here.
//
// ⛔ NOTHING IS EVER GUESSED. Every transform below either preserves the label by
// index or the tile REFUSES the stamp with a named reason. There is no proximity
// projection, no nearest-vertex fallback, no empty array standing in for "none".
// ─────────────────────────────────────────────────────────────────────────
//
// ⭐⭐ THE PROVENANCE CHANNEL — carry the label THROUGH the boolean instead of
// trying to recover it afterwards.
//
// The defect was never the fold. It is that a folded walk was handed to Clipper and
// repaired ANONYMOUSLY: the union mints a vertex at each self-crossing, that vertex
// has no source, and the tile loses its stamp (43% of A10's defect area, measured).
//
// ⛔ SO WE DO NOT REPAIR THE FOLD OURSELVES, AND THAT IS THE DESIGN, NOT A SHORTCUT.
// Clipper still performs exactly the boolean it performed before — same code, same
// integers, same output — and we simply stop throwing away who each point came
// from. Three things fall out that a hand-rolled repair would have had to earn:
//   • the geometry is byte-identical BY CONSTRUCTION, not by comparison;
//   • a legitimate SPLIT is preserved for free — a block that pinches in the middle
//     still returns two rings, because nothing about the boolean changed. There is
//     no way for this code to weld two curb rings into one;
//   • degenerate cases still reach A07's `degenerate:*` gate untouched.
//
// The mechanism is Clipper's own `SetZ`: a surviving vertex inherits its Z from the
// endpoint it coincides with, and ONLY a genuine intersection reaches ZFillFunction.
// ⚠️ Z === 0 is Clipper's "unset" sentinel (`SetZ`: `if (pt.Z !== 0) return`), so
// labels ride as label+1 and a 0 coming back means "this is a crossing point".
//
// ⭐ THE ONE CONVENTION, stated because it is a choice and not a derivation:
// A CROSSING POINT IS OWNED BY THE ARC THAT LEAVES IT. That is the same rule the
// rest of the stamp already uses — a label names the arc STARTING at that vertex —
// and it is what keeps the partition contiguous by construction: the crossing joins
// the HEAD of the outgoing run, so no run is ever split in two. It is resolved on
// the OUTPUT walk (where "leaves" is well defined), never inside ZFillFunction
// (where Clipper offers only scanbeam order, an implementation detail).
// [A06] THE LABELLED BOOLEAN — one primitive, every clip type.
// Generalized from `unionRingLabelled` (which is now a thin wrapper, so the proven
// offset path is byte-identical by construction). Labels ride Clipper's Z channel:
// a vertex contributed by an input keeps `label + 1`; a vertex MINTED at a crossing
// gets Z = 0 and is resolved by scanning FORWARD around the output ring to the next
// labelled vertex — ring adjacency, never distance.
//
// ⭐ WHY THIS IS THE A06 ROUTE, MEASURED (2026-08-11). On LS's 42 carve tiles the
// carve output's 529 vertices come from: `tile.ring` 10.2% · a labelled stad 39.7% ·
// ⛔ NEITHER 50.1%. That last half are Clipper's own crossing points — they sit on no
// input curve, so NO lookup after the fact can label them, which is why the carve
// path's "recovering one would be a proximity guess" was true of a post-hoc map and
// false of the boolean itself. The label has to ride THROUGH the operation.
//
// ⛔ ONE LABEL SPACE. Every label here is an index into `tile.ring`, for subject and
// clip alike — the same space `_iaLabels` speaks — so a carve vertex inherited from
// the asphalt side and one inherited from the ring side are directly comparable.
// ⚠️ Unlabelled clip geometry is legitimate (the junction/median constructions add
// polygons that belong to no single run): its vertices land as crossings and inherit
// forward, which is the same ring-adjacency rule the keyhole clip seam uses.
// ─────────────────────────────────────────────────────────────────────────────
// ① THE PROTOPOLYGON — width-free, permanent, never seen, never authored.
//
// ⭐⭐⭐ Every chain expanded at ε and united into ONE closed compound path; the
// blocks are its HOLES. `RIBBONS §1` (ruled 2026-09-04/05): the grout is a
// POSITIVE object and we offset from IT, not the chains. ② the curb is a
// SEPARATE object offset FROM ① — ⛔ not one object at two moments.
//
// ⭐ THIS IS A PURE FUNCTION OF THE FRAME, and that is the whole point: it takes
// chains and ε and nothing else. No `blockCustoms`, no look, no authored width —
// so it can be minted ONCE AT PREBAKE and frozen, which is `PIPELINE §5 (the Wall)`'s
// Check C for the object the curb is offset from. `POLYGON-FIRST §3`'s blocker on
// D6b ("freezing iA at prebake would bake a bare-defaults curb") does NOT apply,
// because ① HAS no width to bake.
//
// ⛔ ε IS A DECLARATION, NOT A TOLERANCE. Zero and ε render identically and are
// different objects: zero is an ABSENCE, ε a PRESENCE with an interior, two sides
// and TWO nodes at every mouth. Its VALUE carries no information; its
// non-zero-ness is the whole of it. Its one constraint is that it must clear the
// integer floor of the stage that freezes it (`claims-zero-separation-offset`).
//
// ⛔ NOTHING IS ROUNDED. No join style is chosen anywhere — the union does the
// joining and the ends are flat. Smoothing is SKELETON, rounding is SURVEY; ①
// sits between the two stages and does NEITHER.
//
// ⛔ NOT `ClipperOffset`: an offset MINTS every output vertex, so the only label
// it can carry is one scalar for the whole chain — an edge would know WHICH chain
// but not WHICH SIDE. Building each outline explicitly (right boundary forward,
// left boundary back) makes every vertex a SOURCE vertex whose index gives both.
// ⭐ It also removes the density trap: expanding a path SEGMENT-BY-SEGMENT makes
// the result depend on sampling (consecutive rectangles overlap by ε·tan(θ/2),
// which on a dense polyline falls under the 1 mm integer grid and the ink rounds
// into a DOTTED line). One polygon per chain has no such term.
//
// ⭐ THE OWNER CARRIES IDENTITY ONLY — {skelId, side, segOrd, gradeSeparated}.
// Authored values resolve downstream off that identity, so ① is look-agnostic:
// one scene's ① serves every Look.
export function mintProtopolygon({ streets, gradeSep = [], eps = 0.005, boundary = null }) {
  const owners = [], rings = [], labels = []
  // ⭐ segOrd is TOPOLOGY — the count of intersection vertices at or before this
  // one — so it is computed unconditionally here. ⚠️ The live path used to gate
  // the segmentation on `blockCustoms` being present (it only needed the map to
  // look an override up), which made an UNAUTHORED scene stamp segOrd 0
  // everywhere. Harmless while the value was only a lookup key into an absent
  // table; ⛔ NOT harmless in a frozen fact, which must carry the real ordinal
  // whether or not anyone has authored against it yet.
  const seg = resolveChainSegmentation(streets)
  const ixIdxs = streets.map(st => {
    const n = st?.points?.length || 0
    return [...(seg.get(st) || [])].filter(i => i > 0 && i < n - 1).sort((a, b) => a - b)
  })
  const segOrdAt = (ci, i) => { let so = 0; for (const k of (ixIdxs[ci] || [])) if (k <= i) so++; return so }
  // ⛔⛔ GRADE-SEPARATED ROADS BELONG IN ① (Jacob, 2026-09-05: "the highways etc.
  // are gone from the protopoly rendering; they have to be there"). Excluding
  // them CONFLATES two rules: the canon pulls them out of the BLOCK GRID — they
  // do not bound a city block — which says nothing about whether they are in the
  // DRAWING. ① is the ink of the whole network; drop the highway from it and the
  // highway does not exist. ⭐ They carry `gradeSeparated` on the stamp so
  // downstream still tells a highway from a street — by IDENTITY, not by absence.
  const chains = [...streets.map((st, ci) => ({ st, ci })), ...gradeSep.map(st => ({ st, ci: -1 }))]
  for (const { st, ci } of chains) {
    if (!(st?.points?.length >= 2)) continue
    const P = st.points, nrm = []
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz)
      nrm.push(L > 1e-9 ? [-dz / L * eps, dx / L * eps] : (nrm[nrm.length - 1] || [0, 0]))
    }
    const skelId = st?.skelId ?? st?.name ?? null, gs = !!st?.gradeSeparated
    // ⭐ `srcIdx` is the chain POINT INDEX this boundary vertex was struck from — carried, never
    // recovered. The corner-R key space is `ixKeyOf(node)|legA|legB` (`resolveVertR`), i.e. it is
    // keyed on the CENTRELINE node, and ①'s contour sits ε off it. Without the index there is no
    // way back to that node except by proximity, which is `A15`'s explicitly forbidden third
    // recovery. ⛔ A MINTED crossing vertex has no source and carries no label — that is not a gap
    // to paper over, it is where two chains actually cross.
    // ⭐ `hard` — this node has BROKEN handles, i.e. it is a CORNER (`RIBBONS §1`). Stamped here so
    // ② can ask the question off carried identity instead of reaching back to the chain.
    const hardAt = st?.hard || null
    // ⭐ `tipEnd` — the STRUCTURAL fact that this vertex is a chain end of DEGREE 1, i.e. a dead end.
    // ⛔ The structural fact only: which END it is, never whether it is round or blunt. That is
    // authoring (`capEnds`) plus a gleaned default, and ① is look-agnostic — one scene's ① serves
    // every Look, so a cap STYLE baked in here would freeze one Look's decision into the substrate.
    const dg0 = st?.caps?.start?.degree, dg1 = st?.caps?.end?.degree
    const lastI = P.length - 1
    const tipOf = (i) => (i === 0 && dg0 === 1) ? 'start' : (i === lastI && dg1 === 1) ? 'end' : null
    // ⛔⛔ ① HAS NO NODES, AND NOTHING DOWNSTREAM ASKS WHICH ROAD THIS IS. A chain cut and a segOrd
    // boundary are bookkeeping in the CHAIN world; ①'s contour runs straight through them, and the
    // only thing that changes there is the label. So a consumer that mints a CORNER wherever
    // `skelId` changes has put the chain graph's nodes back into a construction built to have none
    // — and the operator sees the ribbon disrupted at every junction.
    // ⭐ LS cuts South 18th Street into ELEVEN chains; 58 of 174 roads are multi-chain.
    // ⭐⭐⭐ `segOrd` NAMES THE SPAN THE EDGE LEAVING THIS VERTEX LIES ON, not the vertex.
    // `segOrdAt(ci, i)` counts IX vertices at-or-before i, so it names the span STARTING at i —
    // right for the forward (right-hand) pass and off by one for the backward (left-hand) one,
    // where the edge leaving vertex i is the offset of span i−1. ⛔ Unfixed, the two frontages on
    // either side of an intersection can land on ONE authoring slot: measured, 165 of LS's 795
    // slots painted ≥2 m in more than one block, which is *(Jacob)* "the dead end strip in the
    // adjacent dead end" changing when he swaps a leg two blocks away.
    // ⛔ `srcIdx` STAYS THE VERTEX — the corner ease resolves its radius through it, and that is a
    // per-VERTEX question. Only the span ordinal takes the edge's answer.
    const stamp = (side, i, segI) => owners.push({ skelId, side, segOrd: ci >= 0 ? segOrdAt(ci, segI) : 0, gradeSeparated: gs, srcIdx: i, hard: hardAt ? !!hardAt[i] : true, tipEnd: tipOf(i) }) - 1
    const ring = [], labs = []
    for (let i = 0; i < P.length; i++) {
      ring.push([P[i][0] + nrm[i][0], P[i][1] + nrm[i][1]])
      // ⛔ (-dz, dx) IS MEASURE-RIGHT — derived from the artifact twice. Naming it
      // 'left' puts every ASYMMETRIC authored width on the wrong side of its street.
      labs.push(stamp('right', i, i))
    }
    for (let i = P.length - 1; i >= 0; i--) {
      ring.push([P[i][0] - nrm[i][0], P[i][1] - nrm[i][1]])
      labs.push(stamp('left', i, Math.max(0, i - 1)))
    }
    if (ring.length < 3) continue
    // ⛔ UNIFORM WINDING. Non-zero fill CANCELS where an opposite-wound polygon
    // overlaps, so a mixed pile unions into confetti instead of one object.
    // ⛔⛔ AND THE LABELS REVERSE WITH IT AND ARE **NOT** ROTATED. I rotated them here for an hour
    // on the reasoning that `labs` is per-EDGE, so a reversal must shift it by one — the same
    // correction that is right at `carryEdgeLabels`. IT IS WRONG HERE, and bisected: this ring is
    // [right pass forward, left pass BACKWARD], and each vertex is already paired with the span it
    // bounds by the `segI` argument above. Rotating on top of that shifts the pairing a second
    // time — and it does it ACROSS THE SEAM between the two passes, so a `right` label lands on a
    // `left` vertex and both blocks flanking the street write to one slot.
    // ▶ measured, ① re-poured both ways, same oracle: runs whose `side` disagrees with their
    // geometry **47 with the rotation, 2 without**; slots painting in two blocks **54 → 41**; and
    // the stamp gate did not move either way, so nothing recommended it.
    // ⭐ THE LESSON, and it is the one to keep: the SAME correction was right three times today and
    // wrong the fourth. "Per-edge arrays shift on reversal" is a property of a construction, not a
    // law of the file — check the construction each time.
    if (clipperLib.Clipper.Orientation(ring.map(toClipper)) !== true) { ring.reverse(); labs.reverse() }
    rings.push(ring); labels.push(labs)
  }
  // ⭐⭐⭐ THE CORNER NODE, FROZEN — so ② NEVER TOUCHES A CHAIN.
  // ② needs one thing from the centreline: where two chains meet, because the authored corner
  // radius is keyed on that point (`ixKeyOf(node)`). Reading it from `streetsOrig` at build time
  // is a reach back across the wall — "the centreline must be completely inert and unreachable by
  // the protopolygon" (Jacob, 2026-09-06). ⭐ The MINT is the one place reading a chain is
  // legitimate — ① *is* the expanded chain — so the node is resolved here and frozen.
  // ⛔ EXACT SHARED VERTEX, never the nearest point: the skeleton graph is shared-vertex, so the
  // node of a corner between chains A and B is the vertex they both carry, keyed at 0.1 mm.
  // ⛔ AMBIGUITY IS REFUSED, NOT GUESSED: two chains can share more than one vertex (a loop), and
  // such a pair freezes as `null` so the consumer takes the class seed and COUNTS it. A wrong node
  // hands a corner someone else's authored radius.
  const nodes = (() => {
    const at = new Map(), pair = {}
    const qk = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`
    for (const { st } of chains) {
      const id = st?.skelId ?? st?.name; if (id == null) continue
      for (const p of st.points || []) { const k = qk(p); let m = at.get(k); if (!m) at.set(k, m = new Map()); if (!m.has(id)) m.set(id, [p[0], p[1]]) }
    }
    for (const [, m] of at) {
      if (m.size < 2) continue
      const ids = [...m.keys()]
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const k = ids[i] < ids[j] ? `${ids[i]}|${ids[j]}` : `${ids[j]}|${ids[i]}`
        pair[k] = Object.prototype.hasOwnProperty.call(pair, k) ? null : m.get(ids[i])
      }
    }
    return pair
  })()

  // ⭐ IDENTITY RIDES THE UNION — `booleanLabelled`, N subject rings each with its
  // own label, labels on Clipper's Z channel, crossings resolved by walking the
  // output ring forward. ⛔ NOT `unionRingLabelled`: that self-unions ONE ring and
  // cannot carry identity across ~200 chain rectangles.
  const R = booleanLabelled(clipperLib.ClipType.ctUnion, rings, labels, [], null, true)   // ① needs the edge ledger; nothing else does

  // ⭐⭐⭐ THE CIRCLE IS THE STENCIL, NOT A CHAIN. Home: `RIBBONS §1`, "THE RIM BOUNDS, IT DOES
  // NOT OWN" — ruled 2026-08-12 and re-ruled aloud 2026-09-06: "EITHER we build the entire grid
  // of streets and the circle stencils out the circle OR the circle adds the geometry such that
  // the whole perimeter is made of weird odd shapes", and "there should be no tips; the streets
  // clip at the perimeter edge."
  // ⇒ Build the WHOLE grid, then INTERSECT. The boundary is the CLIP, never a subject.
  //
  // ⛔ WHY THE OTHER READING IS WORSE, AND IT IS NOT A STYLE CHOICE. Uniting a boundary line
  // into ① leaves every street's ink running THROUGH and PAST the perimeter, so the rim becomes
  // a chain of slivers between the circle and each crossing street — Jacob's "weird odd shapes".
  // Intersecting cuts every street SQUARE at the edge: "there should be no tips; the streets clip
  // at the perimeter edge." A square cut has no endpoint, so there is nothing for a cap, a bulb
  // or a fillet to be built on. That is the point — the defect class is removed rather than
  // guarded against downstream.
  //
  // ⭐ IDENTITY SURVIVES THE CUT, which is the only reason this can be done here. The clip ring
  // is labelled like any subject, so `booleanLabelled` carries `__boundary__` THROUGH the boolean
  // (`RIBBONS §1`: never recovered from ring geometry afterward) and a perimeter edge comes out
  // owned, not anonymous. ⛔ A vertex where a street meets the circle is a genuine crossing and
  // is minted — it appears in `crossings`, exactly like a street-street corner, because that is
  // what it is.
  //
  // ⛔ NO FALLBACK: a scene with no boundary keeps the full-bb ①, and says so. It is not
  // silently stencilled with a guess, and it is not refused — an unbounded pour is a real state.
  if (boundary && boundary.length > 2 && R.rings?.length) {
    const bIdx = owners.length
    owners.push({ skelId: BOUNDARY_EDGE_SKEL, side: 'right', segOrd: 0, gradeSeparated: false, srcIdx: -1, boundary: true })
    const bRing = boundary.map(p => [p[0], p[1]])
    const bLabs = bRing.map(() => bIdx)
    // ⛔⛔ ① IS **NOT** CUT HERE. It was, briefly, and that was the same order error as cutting the
    // blocks: it left ① stopping at the arc while the curb built from it ran on past, so Survey
    // showed two different rules in one view (Jacob: "still happening in Survey"). Under "build
    // the whole grid flat and stamp the circle LAST" the ONLY place the disc is applied is to the
    // finished geometry — see `[PROTO⊙]`. ① is the ink of the WHOLE frame, always.
    // ⭐ `boundaryRing` is carried out so the late stamp has it; it is a payload here, not a clip.

    // ⭐⭐⭐ BLOCKS = BOUNDARY − STROKED ROADS. The substrate ruling (`RIBBONS §1`), and it has to
    // be a SUBTRACTION rather than "the holes of the stencilled ink", because those are not the
    // same set at the rim.
    // ⛔ WHY, measured on LS 2026-09-06 the moment the stencil landed: a block the circle CUTS is
    // bounded partly by street ink and partly by the circle — and the circle is a CLIP, not ink —
    // so it is no longer enclosed by ink at all. It stops being a hole and becomes exterior.
    // 36 blocks vanished, 30 of them in the outer 20% of the radius (90–100% of R: 21 missing
    // against 6 kept). Jacob's eye found it as Park Avenue having chains on both sides of the
    // circle and NO drawing between them. Interior blocks were untouched, which is why every
    // aggregate gate stayed green.
    // ⇒ Subtract the ink FROM the disc: a rim block comes out whole, bounded by ink on some edges
    // and by the circle on the rest. Its circle-side edges carry `__boundary__` and resolve to NO
    // measure, so `depthAt` returns 0 there — which is already the ruled behaviour at the map edge
    // ("edgeDepth → 0, land-use floods to the boundary, no curb/sidewalk on the map edge").
    //
    // ⛔⛔ ORIENTATION IS CONVERTED DELIBERATELY, NOT ASSUMED. The consumer walks blocks wound as
    // HOLES of ① (it skips `signedArea(ring) > 0`) and insets by a POSITIVE depth. `disc − ink`
    // hands back the same regions wound the OTHER way, and offsetting those inward by the same
    // sign would push the curb OUTWARD. So each block ring — and its label array with it — is
    // reversed here, once, at the source. ⭐ This repo carries both shoelace conventions and
    // mis-reading them has cost a full day; converting at the boundary beats every consumer
    // guessing.
    // ⛔⛔ THE SUBTRACTION SUBJECT IS THE FRAME, NOT THE DISC — "build the whole grid flat and then
    // stamp out the circle LAST" (Jacob, 2026-09-06). Subtracting from the DISC cuts each rim block
    // BEFORE ②③ run, so the circle arrives at the offset stage looking like an ordinary block edge
    // and the curb + ped ribbon wrap around it and turn corners at the rim — visible immediately,
    // and wrong: nothing is built at the map edge, it is simply where the drawing stops.
    // ⭐ The "subtract from the frame and the outer motorways enclose enormous faces" objection —
    // which briefly made the subject a disc-plus-margin — was the FLAT RING LIST, not the frame.
    // The enormous ring was the exterior's own ink contour; read as a compound face it leaves with
    // the exterior. The frame is the subject, the margin is only a clearance.
    // ⇒ Subtract the ink from a RECTANGLE that contains everything. Every block comes out WHOLE,
    // ②③ offset a whole block, and the disc is applied to the RESULT (see the artifact clip).
    // ⭐ This also deletes machinery rather than adding it: no `__boundary__` depth-0 special case,
    // no rim corner rule, no "is this the rim?" question inside the offset at all.
    // ⛔ THE CIRCLE TOUCHES NOTHING HERE. Jacob, twice: "build the whole grid flat and then stamp
    // out the circle last", and "obviously the circle stencil is happening too early". A disc, or
    // a disc plus a margin, is STILL the circle deciding block geometry — one step further out is
    // the same error. The subject is a plain rectangle around everything.
    let fx0 = Infinity, fx1 = -Infinity, fz0 = Infinity, fz1 = -Infinity
    for (const rg of R.rings) for (const p of rg) { if (p[0]<fx0)fx0=p[0]; if (p[0]>fx1)fx1=p[0]; if (p[1]<fz0)fz0=p[1]; if (p[1]>fz1)fz1=p[1] }
    for (const p of bRing) { if (p[0]<fx0)fx0=p[0]; if (p[0]>fx1)fx1=p[0]; if (p[1]<fz0)fz0=p[1]; if (p[1]>fz1)fz1=p[1] }
    const M = 50
    const grown = [[fx0-M,fz0-M],[fx1+M,fz0-M],[fx1+M,fz1+M],[fx0-M,fz1+M]]
    // ⭐⭐⭐ `asTree` — A BLOCK IS A COMPOUND FACE, and the boolean already knows which ring
    // is a hole of which. Read as a flat list, `frame − ink` hands back the exterior as the
    // frame ring PLUS one hole per connected ink component, and every one of those holes was
    // being carried out as a block. See `booleanLabelled`'s header for the measurement.
    const D = booleanLabelled(clipperLib.ClipType.ctDifference, [grown], [grown.map(() => bIdx)], R.rings, R.labels, true, true)
    let blocks = null, blockLabels = null, blockHoles = null, blockHoleLabels = null
    if (!D.refused && D.faces?.length) {
      blocks = []; blockLabels = []; blockHoles = []; blockHoleLabels = []
      // ⛔⛔ THE COMPONENT THAT TOUCHES THE FRAME IS THE EXTERIOR, NOT A BLOCK. `frame − ink`
      // necessarily yields the whole region beyond the outermost streets as one huge component.
      // It is not a city block — the frame is an artificial bound, not a street — and treating it
      // as one made ② offset INSIDE it and hand back a frame-sized curb ring. Survey fills
      // `tg.curb` (`ringsToFlatGeo(..., true)`), so the whole view went solid blue: Jacob,
      // "basically just wrecked survey interface".
      // ⭐ Identified by GEOMETRY, not by size: a real block never reaches the frame, because the
      // frame was built with a 50 m margin beyond every piece of ink. A size threshold would be a
      // guess that fails on a town with one genuinely huge block.
      // ⛔⛔ THE EXTERIOR IS THE COMPONENT THAT CONTAINS A FRAME CORNER. Not "the biggest", not
      // "the one whose bbox spans 99% of the frame" — both are thresholds and both failed here:
      // the exterior's bbox hugs the INK, not the frame (the frame carries a 50 m margin), so it
      // measured 97.3% and slipped through. A corner of the subtraction rectangle is by
      // construction outside every street and inside exactly one output component: the exterior.
      // That is a containment test, so it has no tuning and no town where it degrades.
      let dropped = 0, unlabelledHoles = 0
      const corner = [fx0 - M + 1e-3, fz0 - M + 1e-3]
      const FT = 1e-3
      const touchesFrame = (p) => Math.abs(p[0] - (fx0 - M)) < FT || Math.abs(p[0] - (fx1 + M)) < FT
                                || Math.abs(p[1] - (fz0 - M)) < FT || Math.abs(p[1] - (fz1 + M)) < FT
      const holdsCorner = (rg) => {
        let inside = false
        for (let a = 0, b = rg.length - 1; a < rg.length; b = a++) {
          const p1 = rg[a], p2 = rg[b]
          if ((p1[1] > corner[1]) !== (p2[1] > corner[1]) &&
              corner[0] < (p2[0]-p1[0]) * (corner[1]-p1[1]) / ((p2[1]-p1[1]) || 1e-12) + p1[0]) inside = !inside
        }
        return inside
      }
      let degenerate = 0
      for (const f of D.faces) {
        const rg = D.rings[f.outer], lb = D.labels?.[f.outer]
        // ⛔ NOT SILENT. A face the boolean returned but that carries fewer than 3 vertices or no
        // identity is a real state and must be countable — on town #2 nobody is looking.
        if (!(rg?.length >= 3) || !lb) { degenerate++; continue }
        // ⛔⛔ EVERY COMPONENT THAT TOUCHES THE FRAME IS ARTIFICIAL, not just the one holding the
        // corner. The frame is a construction convenience, so any face resting against it exists
        // only because we drew a rectangle — it is not a face of the street graph.
        // ⭐ Coincidence with the frame, at 1e-3 m — the frame is an EXACT input we chose, so this
        // is an identity test against a known line, not a tuned tolerance. Both tests are kept:
        // the corner test is the containment one, the frame test catches a component resting on
        // an edge without enclosing a corner. Under `asTree` the exterior is ONE face and its
        // holes leave with it, which is what removed the ghost block.
        if (holdsCorner(rg) || rg.some(touchesFrame)) { dropped++; continue }
        // ⛔⛔ A HOLE IS WOUND OPPOSITE ITS OUTER AND MUST STAY THAT WAY. The outer is converted
        // below to the winding the consumer expects (blocks wound as ①'s holes, offset inward by
        // a POSITIVE depth); a hole of that face has to carry the opposite sign or the compound
        // path's fill is inverted. Converted HERE, once, at the source — this repo carries both
        // shoelace conventions and letting each consumer guess has already cost a day.
        const hs = [], hls = []
        for (const hi of f.holes) {
          const hr = D.rings[hi], hl = D.labels?.[hi]
          // ⛔ NO SILENT DROP. A hole with no identity cannot be offset at its authored width,
          // and dropping it would offset the face AS IF SOLID — a plausible-looking wrong curb,
          // which is the one outcome a kit may not have. Counted and reported by name.
          if (!(hr?.length >= 3) || !hl) { unlabelledHoles++; continue }
          if (signedArea(hr) < 0) { hs.push([...hr].reverse()); hls.push([...hl].reverse()) }
          else { hs.push(hr); hls.push(hl) }
        }
        if (signedArea(rg) > 0) { blocks.push([...rg].reverse()); blockLabels.push([...lb].reverse()) }
        else { blocks.push(rg); blockLabels.push(lb) }
        blockHoles.push(hs); blockHoleLabels.push(hls)
      }
      const withHoles = blockHoles.filter(h => h.length).length
      if (dropped) console.log(`    [①] dropped ${dropped} face(s) resting on the clip frame — the EXTERIOR, not a block.`)
      if (degenerate) console.warn(`    ⛔ [①] ${degenerate} face(s) came back degenerate (<3 vertices or no identity) and are NOT blocks — reported, not hidden.`)
      console.log(`    [①] ${blocks.length} block face(s); ${withHoles} carry hole(s) (a compound face — outer + its holes, carried together)`)
      if (unlabelledHoles) console.warn(`    ⛔ [①] ${unlabelledHoles} hole(s) came back with NO identity — those faces would be offset as if SOLID. NOT trustworthy.`)
    } else if (D.refused) {
      console.warn(`    ⛔ [①] BLOCK SUBTRACTION REFUSED (${D.refused}) — falling back to ①'s HOLES, which LOSE every block the circle cuts. Rim geometry from this pour is NOT trustworthy.`)
    }

    return { rings: R.rings, labels: R.labels, owners, refused: R.refused, chainRings: rings.length,
             crossings: R.crossings, stencilled: false, boundaryOwner: bIdx, blocks, blockLabels,
             blockHoles, blockHoleLabels, boundaryRing: bRing, nodes }
  }
  return { rings: R.rings, labels: R.labels, owners, refused: R.refused, chainRings: rings.length, crossings: R.crossings, stencilled: false, nodes }
}

// ⛔⛔ `carryEdges` IS OPT-IN, AND THAT IS THE WHOLE POINT OF THIS PARAMETER (`ROADMAP A18`).
// The edge ledger below was added for the protopolygon (`0e879687`, "identity rides the boolean")
// and it is a real requirement — `RIBBONS §1`: identity must be carried THROUGH the boolean, never
// recovered from ring geometry afterward. ⛔ But it was added by changing this SHARED helper for
// ALL SIX callers, and only ONE is the proto path; the other five build the SHIPPED map. So a
// capability only the experiment uses silently changed what the operator sees.
// ⭐ MEASURED, which is why this is a fix and not a preference — `claims-band-reaches-lu.mjs`, LS:
//        ledger unconditional   34 tiles · 3669.6 m² of band falling into land use
//        ledger opt-in (this)   28 tiles ·     0.2 m² — production's number exactly
// That 3669 m² IS the sidewalk stopping mid-block. The probe's own verdict: "This is the sidewalk
// the operator sees stop."
// ⇒ default OFF = shipped behaviour byte-for-byte; the proto caller asks for it.
// ⭐⭐ THE GENERAL RULE: a flag on a BLOCK is not a wall if the block edits something the rest of
// the map calls. Anything an experiment needs from shared code is opt-in AT THE CALL SITE.
// ⭐⭐⭐ `asTree` — THE NESTING COMES OUT OF THE BOOLEAN, NOT OUT OF THE RINGS AFTERWARDS.
// Clipper knows which output ring is a HOLE OF WHICH OTHER RING; executing into a flat
// `Paths` list throws that away and leaves winding as the only record, which is what
// `RIBBONS §1` forbids ("identity must be carried THROUGH the boolean, never recovered
// from ring geometry afterward"). ⛔ MEASURED, and it is not theoretical: `frame − ink`
// hands back the exterior region as an outer ring (the frame) PLUS one hole per connected
// ink component — and those holes were being read as blocks. LS: a 4.49 km² "block"
// containing 276 of the other 281; HPDM: 29.79 km² containing 1,272 of 1,290. Neither
// touches the frame and neither holds a frame corner, so no drop test can see them.
// ⭐ Returns `faces: [{ outer, holes: [] }]` — INDICES into `rings`/`labels`, so nothing
// about the existing return shape moves and a caller that does not ask sees no change.
function booleanLabelled(clipType, subjectRings, subjectLabels, clipRings = [], clipLabels = null, carryEdges = false, asTree = false) {
  const { Clipper, PolyType, PolyFillType } = clipperLib
  const prev = clipperLib.use_xyz
  clipperLib.use_xyz = true
  let out = []
  let faces = null
  const enc = (p, lab) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE), Z: Number.isInteger(lab) ? lab + 1 : 0 })
  // ⭐⭐ THE CROSSING LEDGER — who MET here. Additive: `pt.Z` is still left at 0, so every
  // existing caller's labels are byte-identical; this only records what Clipper already
  // hands us and would otherwise throw away.
  // ⛔ WHY IT IS NEEDED: the forward scan below resolves a minted vertex from the next
  // LABELLED one, which works whenever a ring has at least one. A BLOCK HAS NONE — its
  // corners are precisely where two streets' ink crosses, and a source vertex lies ALONG a
  // chain, never at a crossing of two. Measured on LS's protopolygon: of 106 output rings,
  // 24 are wholly minted and every one is a 4-vertex HOLE. So `all-vertices-minted` is not
  // an anomaly, it is the normal condition of a block, and vertices are the wrong carrier.
  // ⭐ EDGES ARE THE RIGHT ONE, and that is the substrate ruling already: "every ring edge is
  // owned by one (skelId, side) BY CONSTRUCTION". A block corner belongs to no single street
  // — two owners meet there — but the EDGE between two corners lies on the one they share.
  // ⛔ And this is carried THROUGH the boolean, not recovered after it: Clipper hands
  // ZFillFunction the four contributing vertices, so both owners are known AT the crossing.
  // A post-hoc lookup could not do this (`§A06`: half the carve vertices sit on no input
  // curve), which is exactly why the label has to ride the operation.
  const met = new Map()                 // "X,Y" → Set(label) — the owners that met at a crossing
  const mkey = (q) => q.X + ',' + q.Y
  try {
    const c = new Clipper()
    // ⛔ Records only; deliberately does NOT set pt.Z. Setting it would change the label
    // stream every current caller reads, and their byte-identity is a shipped proof.
    // ⛔ THE LABEL SET ALONE IS NOT ENOUGH — measured. Where two chains cross at BOTH ends
    // of an output edge the shared set is {a,b} and the edge is ambiguous. So record what
    // Clipper also knows: the DIRECTION of each contributing edge. The output edge lies ON
    // one of them, so its owner is the contributor running parallel to it. Still carried
    // through the boolean — the direction comes from Clipper's own edge pair, not from a
    // lookup against unrelated geometry afterward.
    if (!carryEdges) c.ZFillFunction = () => {}          // leave pt.Z = 0 ⇒ "an intersection point"
    else c.ZFillFunction = (b1, t1, b2, t2, pt) => {
      let arr = met.get(mkey(pt)); if (!arr) met.set(mkey(pt), arr = [])
      for (const [bo, to] of [[b1, t1], [b2, t2]]) {
        if (!bo || !to) continue
        const lab = bo.Z > 0 ? bo.Z - 1 : (to.Z > 0 ? to.Z - 1 : -1)
        if (lab < 0) continue
        const dx = to.X - bo.X, dy = to.Y - bo.Y, L = Math.hypot(dx, dy) || 1
        arr.push({ lab, dx: dx / L, dy: dy / L })
      }
    }
    let s = 0
    for (let k = 0; k < subjectRings.length; k++) {
      const r = subjectRings[k]; if (!r || r.length < 3) continue
      const L = subjectLabels?.[k]
      c.AddPath(r.map((p, i) => enc(p, Array.isArray(L) ? L[i] : L)), PolyType.ptSubject, true); s++
    }
    if (!s) return { rings: [], labels: [], refused: null }
    for (let k = 0; k < clipRings.length; k++) {
      const r = clipRings[k]; if (!r || r.length < 3) continue
      const L = clipLabels?.[k]
      c.AddPath(r.map((p, i) => enc(p, Array.isArray(L) ? L[i] : L)), PolyType.ptClip, true)
    }
    if (!asTree) c.Execute(clipType, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
    else {
      // ⭐ A FACE IS AN OUTER NODE PLUS ITS IMMEDIATE HOLE CHILDREN. A hole's own children
      // are outer nodes again — faces nested inside a hole — so the walk recurses and they
      // are emitted as faces in their own right. ⛔ The Z channel survives the PolyTree
      // build (Clipper carries the same IntPoints into the contours), so the label
      // resolution below is byte-for-byte the same work on the same points.
      const tree = new clipperLib.PolyTree()
      c.Execute(clipType, tree, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
      faces = []
      const walk = (node) => {
        for (const ch of node.Childs()) {
          if (!ch.IsHole()) {
            const f = { outer: out.length, holes: [] }
            out.push(ch.Contour())
            for (const h of ch.Childs()) { if (h.IsHole()) { f.holes.push(out.length); out.push(h.Contour()) } }
            faces.push(f)
          }
          walk(ch)
        }
      }
      walk(tree)
    }
  } finally { clipperLib.use_xyz = prev }
  const rings = out.map(p => p.map(fromClipper))
  const labs = []
  // ⭐⭐ PER-VERTEX CROSSING IDENTITY — carried THROUGH the boolean, never recovered after it
  // (`RIBBONS §1`). `met` already records every contributor Clipper hands ZFillFunction; until now
  // it was consumed only to resolve EDGE owners and thrown away for vertices.
  // ⛔ WHY IT IS NEEDED: a CORNER IS EXACTLY WHERE TWO CHAINS CROSS, so a corner vertex is always a
  // minted crossing. The forward scan below gives it an INHERITED label from a neighbouring edge —
  // correct for "who owns this arc", useless for "is this vertex a node", because the inherited
  // owner's source index points mid-chain. Consumers that needed the second question had no way to
  // ask it and were reduced to snapping to the nearest node, which hands a corner radius to every
  // mid-chain vertex.
  // ⛔ Computed only under `carryEdges` (which is `met`'s own gate), so the five shipped callers see
  // an unchanged object plus one additive key nothing reads. `ROADMAP A18`: anything an experiment
  // needs from shared code is opt-in at the call site.
  const crossings = carryEdges ? out.map(p => p.map(q => (q.Z ? null : (met.get(mkey(q)) || []).map(e => e.lab)))) : null
  for (const p of out) {
    const raw = p.map(q => (q.Z ? q.Z - 1 : -1))          // -1 = a crossing
    const n = raw.length
    const res = new Array(n)
    // ⭐⭐⭐ ASK THE CROSSING LEDGER BEFORE THE FORWARD SCAN. The scan below inherits a minted
    // vertex's label from the next surviving one, which is right only when nothing else ran out in
    // between. ⛔ AT A BLOCK'S CORNER IT IS ROUTINELY WRONG: a straight cross-street with no interior
    // vertex contributes NO surviving vertex to that side of the hole — both its ends are crossings —
    // so the whole side inherited the owner of whatever came next around the ring. Measured on LS:
    // the 102 m south side of the Dolman/South-18th block IS Hickory Street (0.3 m from its
    // centreline) and ① stamped it `south-18th-street-4|left|1`, which is why swapping one leg
    // swapped two sides. *(Jacob, 2026-09-07: "I believe we need to fix the skeleton > proto
    // polygon." He was right and I had cleared the mint by checking for MISSING labels rather than
    // WRONG ones — absence is not correctness.)*
    // ⭐ The ledger already knows: Clipper hands `ZFillFunction` both contributing edges AT the
    // crossing, so the owner of the edge leaving vertex i is the label present at BOTH of its ends,
    // disambiguated by DIRECTION when two are shared. That is the existing edge resolver below,
    // which until now ran ONLY on a wholly-minted ring. ⛔ Identity carried through the boolean,
    // never recovered from ring geometry afterward (`RIBBONS §1`) — the direction comes from
    // Clipper's own edge pair, not from a lookup against unrelated geometry.
    // ⛔ Scoped to `carryEdges` callers, which is ① and the two differences that opt in; every other
    // caller's `met` is empty and its labels are byte-identical.
    const cand0 = carryEdges ? p.map(q => met.get(mkey(q)) || []) : null
    const ownerLeaving = (i) => {
      if (!cand0) return -1
      const j = (i + 1) % n
      const a = raw[i] >= 0 ? [{ lab: raw[i], dx: 0, dy: 0 }] : cand0[i]
      const bLabs = new Set(raw[j] >= 0 ? [raw[j]] : cand0[j].map(e => e.lab))
      const shared = [...new Set(a.map(e => e.lab))].filter(x => bLabs.has(x))
      if (!shared.length) return -1
      // ⛔⛔ DIRECTION IS REQUIRED, NOT A TIE-BREAK — and taking it as a tie-break was a REGRESSION
      // I shipped this afternoon. `shared.length === 1` returned that label unchecked, and at a
      // chain's BUTT END its left and right ε-boundaries meet, so the one shared label can be the
      // SAME CHAIN'S OTHER SIDE. Measured against a pinned pre-change ①: runs whose `side` label
      // disagrees with their geometry went 2 → 47. Two blocks flanking one street then write to
      // the same slot, which is the very defect the ledger was added to remove.
      // ⭐ The output edge LIES ON one contributor, so its owner's contributing edge must be
      // PARALLEL to it. A candidate that is not is not a candidate — including the one that would
      // have won by being alone. Where none is parallel the ledger has no answer and says so; the
      // forward scan takes it, exactly as before this block existed.
      const ex = p[j].X - p[i].X, ey = p[j].Y - p[i].Y, eL = Math.hypot(ex, ey) || 1
      let best = -1, bestDot = 0.9
      for (const e of a) {
        if (!bLabs.has(e.lab)) continue
        const d = Math.abs((e.dx * ex + e.dy * ey) / eL)
        if (d > bestDot) { bestDot = d; best = e.lab }
      }
      return best
    }
    for (let i = 0; i < n; i++) {
      if (raw[i] >= 0) { res[i] = raw[i]; continue }
      const led = ownerLeaving(i)
      if (led >= 0) { res[i] = led; continue }
      let v = -1
      for (let k = 1; k <= n; k++) { const j = raw[(i + k) % n]; if (j >= 0) { v = j; break } }
      // ⭐ THE REFUSAL IS THE SHIPPED CONTRACT: a wholly-minted ring has no owner this function
      // can honestly name, so it says so and hands back `labels: null` — and the tile construction
      // branches on exactly that. Guessing an owner instead is what mislabelled the shipped bands.
      if (v < 0 && !carryEdges) return { rings, labels: null, refused: 'all-vertices-minted', faces }
      if (v < 0) { res[i] = -1; continue }        // wholly minted → the edge resolver below
      res[i] = v
    }
    // ⭐ EDGE RESOLUTION, for a ring the forward scan could not touch. The convention is
    // unchanged — "a crossing point is owned by the ARC THAT LEAVES IT" — so the label at
    // vertex i names the edge i→i+1, and that edge's owner is the one label present at BOTH
    // of its ends. ⛔ Ambiguity is REFUSED, never guessed: if the two ends share none, or
    // share more than one, this ring gets no labels rather than a plausible wrong one.
    if (res.some(v => v < 0)) {
      const cand = p.map(q => met.get(mkey(q)) || [])
      let ok = true
      for (let i = 0; i < n && ok; i++) {
        if (res[i] >= 0) continue
        const j = (i + 1) % n
        const a = cand[i], b = cand[j]
        const bLabs = new Set(b.map(e => e.lab))
        const shared = [...new Set(a.map(e => e.lab))].filter(x => bLabs.has(x))
        if (shared.length === 1) { res[i] = shared[0]; continue }
        if (shared.length > 1) {
          // ⭐ Disambiguate by DIRECTION: the output edge lies on one contributor's line.
          const ex = p[j].X - p[i].X, ey = p[j].Y - p[i].Y, eL = Math.hypot(ex, ey) || 1
          let best = -1, bestDot = 0.999            // near-parallel only; never a loose pick
          for (const e of a) {
            if (!bLabs.has(e.lab)) continue
            const d = Math.abs((e.dx * ex + e.dy * ey) / eL)
            if (d > bestDot) { bestDot = d; best = e.lab }
          }
          if (best >= 0) { res[i] = best; continue }
        }
        ok = false
      }
      if (!ok) return { rings, labels: null, refused: 'all-vertices-minted', faces }
    }
    labs.push(res)
  }
  return { rings, labels: labs, refused: null, crossings, faces }
}
// The original single-ring union, preserved EXACTLY as a wrapper — the offset path's
// byte-identity proof (`a03-curb-identity`) covers it and must keep covering it.
// [A06] The stamp's own structural claim, per ring: each source ring edge owns ONE
// cyclic arc, and the arcs walk the ring in source order with a SINGLE wrap.
// ⛔ Cyclic, not linear — a run may straddle index 0, and treating that as two runs
// would refuse every tile whose first edge happens to start there.
// ⚠️ Both halves are needed: one-arc-per-edge still permits visiting the arcs OUT OF
// ORDER (centrum tile 157 did exactly that and passed a contiguity-only test).
function _labsContiguous(labs) {
  for (const L of labs || []) {
    const n = L.length; if (n < 2) continue
    let start = 0
    while (start < n && L[start] === L[(start - 1 + n) % n]) start++
    const runs = new Map(), seq = []
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n, prev = (start + k - 1 + n) % n
      if (k === 0 || L[i] !== L[prev]) { runs.set(L[i], (runs.get(L[i]) || 0) + 1); seq.push(L[i]) }
    }
    for (const c of runs.values()) if (c > 1) return false
    let desc = 0
    for (let k = 1; k < seq.length; k++) if (seq[k] < seq[k - 1]) desc++
    if (desc > 1) return false
  }
  return true
}
function unionRingLabelled(ring, labels) {
  return booleanLabelled(clipperLib.ClipType.ctUnion, [ring], [labels])
}
// `stamp` (optional) collects the per-output-ring source labels described above:
// on return it carries either `{ labels: number[][] }` parallel to the returned
// rings, or `{ refused: '<reason>' }`. Passing it changes no geometry.
// ⭐ `outward` — OFFSET AWAY FROM THE RING'S OWN INTERIOR, for a COMPOUND FACE's HOLES.
// The normal here is winding-aware, so it points into the ring's enclosed area whichever
// way the ring is traversed — reversing a hole ring does NOT flip it. A face's curb is the
// outer eroded inward AND every hole DILATED into the face, so the second one needs the
// direction stated, not inferred. ⛔ One flag on the one expression the whole construction
// derives from; every existing caller passes nothing and is byte-identical.
// `easeAt` (optional, opt-in at the call site per `ROADMAP A18`) — realize each node's handle
// configuration. ⭐⭐⭐ THE ORDER IS **OFFSET → UNION → EASE** (Jacob, 2026-09-06), and the union
// must be the LABELLED one. It was offset → ease → union until then; the swap removes a defect
// class instead of guarding it.
//
// ⛔⛔ WHY THE OLD ORDER PRODUCED THE OPERATOR'S "PROTRUSIONS", measured end to end:
// the raw offset polyline contains near-REVERSAL vertices — self-intersections the offset just
// made, not corners. `easeContour` planned a setback of `R·tan(θ/2)` at each, and that DIVERGES as
// θ→180° (11× R at 170°, 57× R at 178°). On LS: 77 of 1,192 in-disc arcs were planned at θ ≥ 140°,
// with setbacks reaching 41.7 m and 101.4 m against ~3.8 m for a real corner. `s = min(want,
// legBack/2, legFwd/2)` bounds it only by HALF THE LEG, so on a long straight run the bound never
// bites. The oversized arc overlapped the contour, the union cut it, and the residue was a
// sub-half-metre stub turning 146°–161° — under `SPUR_COS`'s 165°, so nothing caught it, and it is
// exactly what the marker circles were pointing at.
// ⭐⭐ THIS IS THE SAME DIVERGENCE AS THE MITER APEX (`hw/sin(θ/2)`, the clamp below), at a second
// site. One mechanism, two places; the comment at the IX-straighten block names it as the rejoin.
//
// ⭐⭐⭐ AND THE CURE IS NOT A BOUND ON THE SETBACK — that is the clamp shape `RIBBONS §1` retires,
// and it is how `easeRing` died (a threshold, then a budget, then a cluster-collapse, each aiming
// at the previous one). Union FIRST and there is no reversal vertex left to ease: the ruling is
// "self-intersection means the feature GOES TO ZERO, there", and the union is what performs it.
// ⇒ `R·tan(θ/2)` is never asked about a 178° "corner", because after the union there isn't one.
// **No threshold is introduced anywhere.**
//
// ⛔ THE ONE CONDITION, AND IT IS WHAT MAKES THIS SAFE NOW: the middle union must be
// `unionRingLabelled`. The ease resolves each vertex's authored R through `easeAt(srcIdx)`, where
// `srcIdx` is the ① block-ring vertex the point was struck from; the labelled union carries that
// index THROUGH the boolean on the Z channel (`RIBBONS §1`: identity is carried, never recovered).
// With plain `unionRings` the labels are gone and every corner resolves to 0 — which is most of
// what the earlier "687 of 893 corners died, survivors at 3.15 m instead of 4.50 m" was.
// ⚠️ A union-MINTED vertex inherits a neighbour's source index. That is correct for owner identity
// (it lies on one of the two edges that made it) but it means the correspondence is exact only
// where the union did not cut — i.e. everywhere except the rings this change exists to fix.
// ⇒ Tripwire, not a hope: `claims-proto-corner-is-authored-radius` must still read the class seed.
// ⭐⭐⭐ A LABEL IS A PROPERTY OF AN EDGE; A STAMP IS A PROPERTY OF A VERTEX. Conflating them is
// an off-by-one that only appears when the ring is TRAVERSED BACKWARDS — and it is, almost always.
// `offsetRingVariable` emits one point per ① VERTEX (`push(p, i)`), so `stamp.labels[j]` names the
// ① vertex a ② point was struck from. ①'s `labels` array is per-EDGE: `labs[q]` owns the edge
// q → q+1. Reading `labs[src[j]]` therefore means "the edge LEAVING ① vertex src[j]" — which is the
// ② edge leaving j only while the two rings run the same way. Clipper's union normalises winding,
// so they mostly do not: measured on LS, 133 of 138 ② rings run AGAINST their ① block ring, and
// a quarter of the town's contour BY LENGTH carried the neighbouring frontage's owner. That is the
// operator's "when I swap one treelawn/sidewalk pair, it swaps all 4 sides of the block" — the
// slot he authored owned a side it does not front.
// ⛔ NOT AN ORIENTATION FLAG AND NOT A THRESHOLD. The adjacency of the two endpoints' source
// indices SAYS which ① edge this ② edge lies along; there is no case to detect and nothing to tune.
// ⭐⭐ AND WHERE THE TWO SOURCES ARE NOT ADJACENT, THE ② EDGE SPANS SEVERAL ① EDGES — the union
// minted a point and its forward scan gave it an inherited source, or it collapsed a run. The
// provenance is not GONE, it is PLURAL: we hold both endpoints' indices, so we hold exactly which
// ① edges the ② edge lies over. ⭐ The LONGEST of them wins — the same tie-break the FILL already
// applies when one leg spans more than one frontage (`sectionPassProtoTile`, `SECTION §3.3` step 1),
// and it is a choice among KNOWN contributors, never a proximity lookup against unrelated geometry.
// ⛔ Still counted: a plural edge is a real fact about the union and the count must not go quiet.
// ▶ node scratch/claims-stamp-follows-the-edge.mjs
// ⭐⭐⭐ AND THE RING HAS ONE DIRECTION, SO A VERTEX THAT CANNOT SAY WHICH WAY ASKS THE RING.
// Where two consecutive ② points share a source (a corner's ease arc, a bevel's two points) the
// pair carries no direction of its own, and taking "the edge leaving a" is right only if ② runs
// WITH ①. ⛔ It usually does not, and this is not a rare case: it is every corner arc, which is
// where a block's sides MEET — so the arc, and the long straight edge leaving it, took the
// previous side's owner. Measured: on the Dolman/South-18th block ①'s south edge reads Hickory
// and ② carried South 18th across it anyway, which is the operator's "I swapped the left side leg
// and both the left side and the top swapped" surviving the mint fix.
// ⭐ The direction is READ OFF THE PAIRS THAT DO SAY — a majority over unambiguous evidence, not
// a threshold and not a winding heuristic. A ring with no such pair is a ring with no information
// and keeps ① order, which is what it did before.
const ringRunsWithProto = (src, L, n) => {
  let fwd = 0, rev = 0
  for (let i = 0; i < L; i++) {
    const a = src?.[i], b = src?.[(i + 1) % L]
    if (a == null || b == null || a === b) continue
    if ((b - a + n) % n === 1) fwd++
    else if ((a - b + n) % n === 1) rev++
  }
  return rev > fwd ? -1 : 1
}
function carryEdgeLabels(rg, src, labs, n, tally = null, ring = null) {
  const L = rg.length
  const dir = ringRunsWithProto(src, L, n)
  const eLen = (q) => { if (!ring) return 1
    const a = ring[q], b = ring[(q + 1) % n]; return Math.hypot(b[0] - a[0], b[1] - a[1]) }
  return rg.map((_, i) => {
    const a = src?.[i]; if (a == null) return null
    const b = src?.[(i + 1) % L]
    // ⛔ NO DIRECTION OF ITS OWN — take the ring's. Under ② running against ①, the edge LEAVING
    // this point in ② is the ① edge ENTERING the vertex it was struck from.
    if (b == null || b === a) return labs[dir > 0 ? a : (a - 1 + n) % n]
    if ((b - a + n) % n === 1) return labs[a]        // ② runs WITH ①: the edge leaving a
    if ((a - b + n) % n === 1) return labs[b]        // ② runs AGAINST ①: the edge leaving b
    if (tally) tally.lost++
    const fwd = (b - a + n) % n, rev = (a - b + n) % n
    const start = fwd <= rev ? a : b, span = Math.min(fwd, rev)
    let win = start, best = -1
    for (let k = 0; k < span; k++) { const q = (start + k) % n, w = eLen(q); if (w > best) { best = w; win = q } }
    return labs[win]
  })
}

function offsetRingVariable(ring, depthAt, cornerAt = () => true, capAt = () => null, clean = false, stamp = null, noMiterClamp = false, outward = false, easeAt = null) {
  const n = ring.length
  if (n < 3) return []
  const ccw = (signedArea(ring) > 0) !== outward
  const seg = []
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L
    const nx = ccw ? -dy : dy, ny = ccw ? dx : -dx          // inward normal (winding-aware)
    // ⭐ `depthAt(i)` may return a scalar (constant depth — every caller before
    // 2026-08-11) or a [start, end] PAIR (the depth varies linearly along the
    // edge). The offset of an edge whose depth ramps linearly is STILL A STRAIGHT
    // SEGMENT — it is simply no longer parallel to the edge. That is the whole
    // change: without it the curb can only ever be parallel to its ring edge, so a
    // divided nose that splays away from the spine's outer line drags the curb off
    // that line no matter what half-width it is given (SKELETON §5d).
    // ⛔ When the two ends are EQUAL this must reduce to the old code EXACTLY —
    // same expressions, same order — so the whole map stays byte-identical. The
    // tapered direction is computed only when they actually differ.
    const raw = depthAt(i)
    const dS = Math.max(0, (Array.isArray(raw) ? raw[0] : raw) || 0)
    const dE = Math.max(0, (Array.isArray(raw) ? raw[1] : raw) || 0)
    const P = [a[0] + nx * dS, a[1] + ny * dS]
    let dir = [dx, dy]
    if (dE !== dS) {
      const Q = [b[0] + nx * dE, b[1] + ny * dE]
      let ex = Q[0] - P[0], ey = Q[1] - P[1]; const eL = Math.hypot(ex, ey) || 1
      dir = [ex / eL, ey / eL]
    }
    seg.push({ dir, P, nrm: [nx, ny], dS, dE })
  }
  const W = []
  const WL = []                                            // [A10-③] source ring-vertex per emitted point
  const push = (p, i) => { W.push(p); WL.push(i) }
  for (let i = 0; i < n; i++) {
    const A = seg[(i - 1 + n) % n], B = seg[i]              // vertex i: between edge i-1 and edge i
    const capT = capAt(i)
    if (capT) {
      // DEAD-END cap built INTO the offset (no graft). PL/PR = the two legs'
      // offset endpoints at the tip (using the depths AT THIS VERTEX — A.dE/B.dS —
      // so the cap
      // matches the legs' authored width + is tangent). Round → a semicircle on
      // the tip side; blunt → a flat butt segment. bodyDir = −A.dir + B.dir.
      const PL = [ring[i][0] + A.nrm[0] * A.dE, ring[i][1] + A.nrm[1] * A.dE]
      const PR = [ring[i][0] + B.nrm[0] * B.dS, ring[i][1] + B.nrm[1] * B.dS]
      if (capT === 'blunt') { push(PL, i); push(PR, i) }
      else for (const p of capArc(PL, PR, -A.dir[0] + B.dir[0], -A.dir[1] + B.dir[1])) push(p, i)
      continue
    }
    const det = A.dir[0] * B.dir[1] - A.dir[1] * B.dir[0]
    // Through-node (same street both sides) or collinear → offset the vertex by
    // the AVERAGED normal at the averaged depth: the curb runs straight/smooth
    // through, no spurious corner from an off-chord vertex or a per-fe width step.
    if (!cornerAt(i) || Math.abs(det) < 1e-9) {
      let mx = A.nrm[0] + B.nrm[0], my = A.nrm[1] + B.nrm[1]; const mL = Math.hypot(mx, my) || 1; mx /= mL; my /= mL
      push([ring[i][0] + mx * ((A.dE + B.dS) / 2), ring[i][1] + my * ((A.dE + B.dS) / 2)], i); continue
    }
    const t = ((B.P[0] - A.P[0]) * A.dir[1] - (B.P[1] - A.P[1]) * A.dir[0]) / det
    const X = [B.P[0] + B.dir[0] * t, B.P[1] + B.dir[1] * t]
    // ⛔ THE MITER CLAMP. `RIBBONS §1` retires it under the grout ruling and measures it doing real
    // damage at West-18th↔Dolman (a 1.4369 m width step across a 3.24° turn puts the intersection
    // 26.15 m out, past the limit, so a bevel is substituted). `noMiterClamp` exists to switch it off
    // for the proto path.
    // ⛔⛔ IT IS OFF FOR THE PROTO PATH, AND THE REASON IS A PRINCIPLE, NOT A MEASUREMENT.
    // Jacob, 2026-09-06: "I am highly suspicious of 'if' or 'when' statements; there is no 'when the
    // corner' is anywhere — the corner is what it is, where it is, there's no conditional."
    // ⭐ This vertex loop carried FOUR conditionals deciding what a vertex IS: is it a cap · which
    // kind of cap · is it a real corner or a through-node · is the miter too long. The proto path
    // already neutralises the first three (`cornerAt` true, `capAt` null, per §1's retirement of
    // both). THIS WAS THE LAST ONE, and a corner is where the two offset lines meet — full stop.
    // ⚠️ I backed this out once on a weak number: the parallelism gate moved 101/101 → 97/101. But a
    // MITER APEX LIES ON BOTH OFFSET LINES, so it satisfies that test by construction — the dip was
    // the gate's block assignment shifting as rings changed shape, not the geometry degrading. ⛔ A
    // principled change dismissed on an uninterrogated number is the same error as adopting one.
    const lim = noMiterClamp ? Infinity : 2.5 * Math.max(A.dE, B.dS, 0.5) + 1
    if (Math.hypot(X[0] - ring[i][0], X[1] - ring[i][1]) > lim) {
      const pA = (ring[i][0] - A.P[0]) * A.dir[0] + (ring[i][1] - A.P[1]) * A.dir[1]
      const pB = (ring[i][0] - B.P[0]) * B.dir[0] + (ring[i][1] - B.P[1]) * B.dir[1]
      push([A.P[0] + A.dir[0] * pA, A.P[1] + A.dir[1] * pA], i)
      push([B.P[0] + B.dir[0] * pB, B.P[1] + B.dir[1] * pB], i)
    } else push(X, i)
  }
  // Robust cleanup (D6a "proper", 2026-06-14). A concave fold on a tight/dense
  // smooth bend (offset depth > local edge length, exposed by the curve-fit knob)
  // leaves degenerate residue the flat 0.5 m² floor missed: detached island lobes.
  // DEPTH-SCALED floor (a fold's area scales with depth²) drops them; converges to
  // identity on clean offsets. ⛔ NO morphological open here: openRound(0.08)
  // pre-rounded EVERY corner below filletRing's 18° tol → filletRing skipped the
  // authored fillet → SQUARE corners (459→93 rounded, 2026-06-14 regression).
  // The thin in-and-out needles are the iA-source concave pinch — fixed upstream,
  // not by morphology. Gated by the curve-fit + corner-roundness invariants in
  // scratch/correctness-detector.mjs.
  let maxD = 0; for (const s of seg) { if (s.dS > maxD) maxD = s.dS; if (s.dE > maxD) maxD = s.dE }
  const AREA_MIN = Math.max(0.5, maxD * maxD * 0.6)
  // Strip fold needles (curve-fit only — `clean`): on a bend tighter than the depth
  // the per-vertex offset overshoots into a thin near-180° spike that the union keeps
  // as an attached needle (legs near-touch, never fully cross) → it pinches the curb
  // band downstream. Off for smooth=0 so the frozen live map is byte-identical.
  // [A10-③] The two return paths below are the SAME expressions as before, split
  // into named steps so the stamp can ride each one by index. Geometry unchanged:
  // the `stamp` bookkeeping is read-only w.r.t. the rings.
  // [A10-③] The labelled union is gated on `stamp` so the live Survey path keeps
  // today's exact call. a03's byte-identity across both states is what proves the
  // two are the same boolean — the Z channel writes only .Z, never .X/.Y.
  // ⭐⭐⭐ STEP 1 — RESOLVE SELF-INTERSECTION, so the ease only ever sees a SIMPLE contour.
  // ⛔ With `easeAt` null this is byte-identical to the previous order by construction: the ease
  // was the only thing that used to sit ahead of here, and it did nothing when unasked.
  const t0 = clean ? dropFoldSpursTracked(W) : null
  const W0 = clean ? t0.ring : W
  const L0 = clean ? t0.src.map(k => WL[k]) : WL
  let uni, uniL = null
  if (stamp) { const r = unionRingLabelled(W0, L0); uni = r.rings; uniL = r.labels; if (r.refused) stamp.refused = r.refused }
  else uni = unionRings([W0])

  // ⭐⭐⭐ STEP 2 — THE EASE, per simple ring. A reversal vertex cannot reach here, so the
  // divergent `R·tan(θ/2)` setback has nothing to diverge on.
  if (easeAt) {
    const easeArcs = []
    for (let k = 0; k < uni.length; k++) {
      const preLab = uniL ? uniL[k] : null
      const arcs = []
      const e = easeContour(uni[k], (j) => easeAt(preLab ? preLab[j] : null) || 0, preLab, arcs)
      uni[k] = e.ring
      if (uniL) uniL[k] = e.labs || preLab
      for (const a of arcs) easeArcs.push({ ...a, src: preLab ? preLab[a.i] : null })
    }
    if (stamp) stamp.easeArcs = easeArcs
  }

  if (!clean) {
    const keep = uni.map((r, k) => k).filter(k => Math.abs(signedArea(uni[k])) > AREA_MIN)
    if (stamp && uniL) stamp.labels = keep.map(k => uniL[k])
    return keep.map(k => uni[k])
  }
  const out = [], outL = []
  for (let k = 0; k < uni.length; k++) {
    const t = dropFoldSpursTracked(uni[k])
    if (!(t.ring.length >= 3 && Math.abs(signedArea(t.ring)) > AREA_MIN)) continue
    out.push(t.ring)
    if (uniL) outL.push(t.src.map(j => uniL[k][j]))
  }
  if (stamp && uniL) stamp.labels = outL
  return out
}
// Morphological opening (erode R then dilate R, round join): rounds CONVEX
// corners sharper than R up to radius R, leaves gentler ones. Used to round the
// asphalt-inner region's sharp miter corners at the authored curb radius — the
// one place a corner is rounded, so the bands wrap it concentrically.
function openRound(rings, R) {
  if (!rings.length || !(R > 1e-6)) return rings
  const eroded = offsetRings(rings, -R)
  if (!eroded.length) return rings                  // too thin to open → keep as-is
  return offsetRings(eroded, R)
}
// ── Per-corner fillet ────────────────────────────────────────────────────
// The per-VERTEX analogue of openRound (which rounds every convex corner by one
// uniform radius). Replaces each SIGNIFICANT convex corner of a ring with a
// circular arc tangent to both legs, radius resolved PER-CORNER by
// `Rfn(point, interiorTheta) → metres` — so operator-authored per-corner /
// per-IX radii reshape individual corners. Self-contained (no figure-ground
// dependency); winding-aware so it rounds outer rings and holes correctly.
//   • near-straight vertices (turn < TURN_TOL) are curve samples, not corners
//     → passed through (keeps the rounding off the gentle smoothed runs).
//   • inset is clamped to 45% of the arc-length to each NEIGHBOUR corner so
//     adjacent fillets never overlap on a short leg.
// ⭐ DERIVED, not tuned: `tessellateAdaptive` subdivides to a 0.10 m arc tolerance, and a step of
// angle θ on radius R satisfies θ = 2·acos(1 − t/R). At 60° that is R = 0.10/(1 − cos30°) = 0.75 m,
// so a vertex turning this much cannot be a curve sample of any street — it is a broken handle
// whatever the skeleton's flag says. Move the tolerance and this moves with it.
const PROTO_HARD_TURN = 60
const FILLET_TURN_TOL = 18 * Math.PI / 180
// A corner exists only where two REAL legs meet (the osm2streets doctrine:
// corners come from leg adjacency, never from whatever stroke geometry falls
// at a vertex). Clipper's union/difference leaves near-duplicate vertices
// (sub-cm micro-edges) exactly at junction stations — where a tile-ring chain
// vertex meets coincident stroke edges — and the micro-edge's direction is
// quantization NOISE. Reading that noise as a corner leg extrapolated a 4.5 m
// tangent into a multi-meter bite (the Lafayette-park 105 m diagonal at the
// Waverly station; θ→0 made the Mackay wedge unbounded) and minted a spurious
// magenta corner handle on a straight run — "the initial thing".
// Cure at the ring layer: collapse micro-edges BEFORE corner detection, and
// never corner-test a vertex whose leg is shorter than MIN_CORNER_LEG.
const RING_DUP_EPS = 0.02      // m — collapse consecutive verts closer than this
const MIN_CORNER_LEG = 0.05    // m — a leg shorter than this is residue, not a leg
// [A10-③] Tracked twin, same shape as dropFoldSpursTracked: `src[k]` is the input
// index of output vertex k. dedupeRing() is this with the bookkeeping discarded.
function dedupeRingTracked(ring) {
  const n = ring.length
  if (n < 3) return { ring, src: ring.map((_, i) => i) }
  const out = [], src = []
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = out[out.length - 1]
    if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < RING_DUP_EPS) continue
    out.push(p); src.push(i)
  }
  // close-seam dup (last ≈ first)
  while (out.length >= 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < RING_DUP_EPS) { out.pop(); src.pop() }
  return out.length >= 3 ? { ring: out, src } : { ring, src: ring.map((_, i) => i) }
}
function dedupeRing(ring) { return dedupeRingTracked(ring).ring }
// `sink` (optional) collects the ACHIEVED fillet per corner — { apex, C, r, tA,
// tB } — so the authoring handle can draw the exact curb arc the construction
// produced (one corner truth; no independent re-derivation → no drift).
// [A10-③] `lab0` (optional) = a per-vertex source label parallel to `ring0`; when
// given, `outLab` is filled with the labels of the emitted ring. filletRing is
// already a pure index walk — dedupeRing shifts indices, `arcAt`/`drop` are keyed
// by index, and pass 2 emits in index order — so the carry is exact: an arc minted
// at corner i inherits ring vertex i's label, and a vertex dropped inside a
// fillet's inset takes its label with it (that ring edge simply has no piece of
// the curb left, which is a FACT, not a gap to paper over).
function filletRing(ring0, Rfn, sink, lab0 = null, outLab = null) {
  const dd = dedupeRingTracked(ring0)
  const ring = dd.ring
  const lab = lab0 ? dd.src.map(k => lab0[k]) : null
  const n = ring.length
  if (n < 3) { if (outLab && lab) outLab.push(...lab); return ring.slice() }
  const sign = signedArea(ring) >= 0 ? 1 : -1
  // Pass 1 — find corner vertices (convex relative to interior, turning > tol).
  const corners = []                                // { i, R, theta, inx,iny, outx,outy }
  for (let i = 0; i < n; i++) {
    const A = ring[(i - 1 + n) % n], V = ring[i], B = ring[(i + 1) % n]
    let inx = V[0] - A[0], iny = V[1] - A[1], outx = B[0] - V[0], outy = B[1] - V[1]
    const li = Math.hypot(inx, iny), lo = Math.hypot(outx, outy)
    if (li < MIN_CORNER_LEG || lo < MIN_CORNER_LEG) continue   // residue, not a leg
    inx /= li; iny /= li; outx /= lo; outy /= lo
    if ((inx * outy - iny * outx) * sign <= 0) continue          // concave
    const turn = Math.acos(Math.max(-1, Math.min(1, inx * outx + iny * outy)))
    if (turn < FILLET_TURN_TOL) continue                          // curve sample
    const theta = Math.PI - turn
    const R = Rfn(V, theta)
    if (!(R > 0.01)) continue
    corners.push({ i, R, theta, inx, iny, outx, outy })
  }
  if (!corners.length) { if (outLab && lab) outLab.push(...lab); return ring.slice() }
  // Arc-length to the previous / next corner (cyclic), to clamp the inset.
  const segLen = (a, b) => Math.hypot(ring[a][0] - ring[b][0], ring[a][1] - ring[b][1])
  const gapAfter = (ci) => {                                       // dist corner ci → ci+1
    const a = corners[ci].i, b = corners[(ci + 1) % corners.length].i
    let d = 0, k = a
    while (k !== b) { const nk = (k + 1) % n; d += segLen(k, nk); k = nk }
    return d
  }
  const drop = new Array(n).fill(false)               // intermediate verts inside a fillet
  const arcAt = new Map()                             // corner ring-index → arc points
  for (let ci = 0; ci < corners.length; ci++) {
    const c = corners[ci]
    const V = ring[c.i]
    const tanH = Math.tan(c.theta / 2)
    if (!(tanH > 1e-6)) continue
    const gPrev = corners.length > 1 ? gapAfter((ci - 1 + corners.length) % corners.length) : Infinity
    const gNext = corners.length > 1 ? gapAfter(ci) : Infinity
    const inset = Math.min(c.R / tanH, 0.45 * gPrev, 0.45 * gNext)
    if (!(inset > 1e-4)) continue
    const effR = inset * tanH
    const tA = [V[0] - c.inx * inset, V[1] - c.iny * inset]
    const tB = [V[0] + c.outx * inset, V[1] + c.outy * inset]
    const px = -c.iny * sign, py = c.inx * sign       // interior-perp of inDir
    const cx = tA[0] + px * effR, cy = tA[1] + py * effR
    let aA = Math.atan2(tA[1] - cy, tA[0] - cx)
    const aB = Math.atan2(tB[1] - cy, tB[0] - cx)
    let delta = aB - aA
    if (sign > 0) { while (delta <= 1e-9) delta += 2 * Math.PI } else { while (delta >= -1e-9) delta -= 2 * Math.PI }
    const segs = Math.max(2, Math.round(Math.abs(delta) / (Math.PI / 24)))   // fine arc
    const pts = []
    for (let k = 0; k <= segs; k++) { const a = aA + delta * (k / segs); pts.push([cx + effR * Math.cos(a), cy + effR * Math.sin(a)]) }
    arcAt.set(c.i, pts)
    if (sink) sink.push({ apex: [V[0], V[1]], C: [cx, cy], r: effR, tA: [tA[0], tA[1]], tB: [tB[0], tB[1]] })
    // mark intermediate vertices within the inset (back + forward) as dropped
    let w = 0, k = c.i
    while (true) { const p = (k - 1 + n) % n; const d = segLen(k, p); if (w + d > inset) break; w += d; drop[p] = true; k = p; if (k === c.i) break }
    w = 0; k = c.i
    while (true) { const q = (k + 1) % n; const d = segLen(k, q); if (w + d > inset) break; w += d; drop[q] = true; k = q; if (k === c.i) break }
  }
  // Pass 2 — rotate to a kept, non-corner start, then emit literals + arcs.
  let i0 = 0
  while (i0 < n && (drop[i0] || arcAt.has(i0))) i0++
  if (i0 >= n) i0 = 0
  const out = []
  for (let k = 0; k < n; k++) {
    const i = (i0 + k) % n
    if (arcAt.has(i)) { for (const p of arcAt.get(i)) { out.push(p); if (outLab && lab) outLab.push(lab[i]) } }
    else if (!drop[i]) { out.push(ring[i].slice()); if (outLab && lab) outLab.push(lab[i]) }
  }
  return out
}
// Map filletRing over a ring SET (outer rings + holes), preserving the rest.
// [A10-③] `labs` (optional) parallel to `rings`; `outLabs` receives one label
// array per emitted ring. A ring too short to fillet is passed through verbatim,
// so its labels are too.
function filletRings(rings, Rfn, sink, labs = null, outLabs = null) {
  return rings.map((r, k) => {
    if (!(r && r.length >= 3)) { if (outLabs) outLabs.push(labs ? labs[k] : null); return r }
    const o = outLabs ? [] : null
    const res = filletRing(r, Rfn, sink, labs ? labs[k] : null, o)
    if (outLabs) outLabs.push(o)
    return res
  })
}
// Indices of a ring's SHARP convex corners — the centerline NODES (real
// intersections / authored bends), excluding the dense intermediate vertices
// smoothing inserts along curved runs (whose per-vertex turn is below the
// fillet tolerance). Mirrors filletRing's pass-1 corner test exactly. Used to
// map an achieved-fillet apex back to the node the fillet rounded: the apex
// sits inboard along the bisector, so a nearest-of-ALL-vertices search snaps it
// to whatever smoothed sample happens to lie nearest (frequently a sample on
// the leg, within ~2× the inset, not the node) — which mis-keys the corner and
// detaches the authoring handle. Restricting to sharp corners pins it to the
// node every time.
function sharpCornerIndices(ring) {
  const n = ring.length
  if (n < 3) return []
  const sign = signedArea(ring) >= 0 ? 1 : -1
  const out = []
  for (let i = 0; i < n; i++) {
    const A = ring[(i - 1 + n) % n], V = ring[i], B = ring[(i + 1) % n]
    let inx = V[0] - A[0], iny = V[1] - A[1], outx = B[0] - V[0], outy = B[1] - V[1]
    const li = Math.hypot(inx, iny), lo = Math.hypot(outx, outy)
    if (li < MIN_CORNER_LEG || lo < MIN_CORNER_LEG) continue   // mirror filletRing's leg guard
    inx /= li; iny /= li; outx /= lo; outy /= lo
    if ((inx * outy - iny * outx) * sign <= 0) continue          // concave
    const turn = Math.acos(Math.max(-1, Math.min(1, inx * outx + iny * outy)))
    if (turn < FILLET_TURN_TOL) continue                          // curve sample, not a node
    out.push(i)
  }
  return out
}
// Offset an OPEN polyline by `delta` with round JOIN (handles the run's own
// bends, no compounding) and BUTT caps (so a run ends square at the tile
// vertex — no round-cap-at-depth bulge, which distorted the corners). Robust
// on noisy 100-vertex LS runs where per-edge half-plane intersection collapses.
function strokeOpen(polyline, delta) {
  if (!(delta > 1e-9) || !polyline || polyline.length < 2) return []
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05 * SCALE)
  co.AddPath(polyline.map(toClipper), JoinType.jtRound, EndType.etOpenButt)
  const out = []
  co.Execute(out, delta * SCALE)
  return out.map(p => p.map(fromClipper))
}
function unionRings(rings) {
  if (!rings.length) return []
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  let n = 0
  for (const r of rings) if (r && r.length >= 3) { c.AddPath(r.map(toClipper), PolyType.ptSubject, true); n++ }
  if (!n) return []
  const out = []
  c.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromClipper))
}
function differenceRings(subjectRings, clipRings) {
  if (!subjectRings.length) return []
  if (!clipRings.length) return subjectRings.map(r => r.slice())
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  let s = 0, cl = 0
  for (const r of subjectRings) if (r && r.length >= 3) { c.AddPath(r.map(toClipper), PolyType.ptSubject, true); s++ }
  for (const r of clipRings)    if (r && r.length >= 3) { c.AddPath(r.map(toClipper), PolyType.ptClip,    true); cl++ }
  if (!s) return []
  if (!cl) return subjectRings.map(r => r.slice())
  const out = []
  c.Execute(ClipType.ctDifference, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromClipper))
}
function intersectRings(subjectRings, clipRings) {
  if (!subjectRings.length || !clipRings.length) return []
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper()
  for (const r of subjectRings) if (r && r.length >= 3) c.AddPath(r.map(toClipper), PolyType.ptSubject, true)
  for (const r of clipRings)    if (r && r.length >= 3) c.AddPath(r.map(toClipper), PolyType.ptClip,    true)
  const out = []
  c.Execute(ClipType.ctIntersection, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromClipper))
}

// Segments the cap↔leg crossing is eased over (the shoulder dip-in). Enough to
// read as a curve at walking scale; the band is only ~2 m long there.
const XSTEPS = 10

// [DEAD-END PENDANT] The claim region on ONE side of a polyline: the polyline
// offset to the interior side by W, closed back on itself. `leftInside` says
// which side the tile face is on (positive ring signed area ⇒ left of travel).
// The region ENDS where the polyline does — so at a dead end a leg's claim stops
// at the shoulder (the diameter) and does NOT reach into the bulb. The bulb is
// NOT two halves: it is one continuous semicircle carrying ONE arrangement, the
// cap's own (Jacob, 2026-07-22). Splitting it between the legs invents a seam
// that isn't there.
function oneSideClaim(poly, W, leftInside) {
  const p = poly
  const n = p.length
  if (n < 2) return []
  const s = leftInside ? 1 : -1
  const off = []
  for (let i = 0; i < n; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1
    off.push([p[i][0] - dy / L * W * s, p[i][1] + dx / L * W * s])
  }
  const out = p.map(q => [q[0], q[1]])
  for (let i = n - 1; i >= 0; i--) out.push(off[i])
  return out.length >= 3 ? [out] : []
}

// ⭐⭐⭐ THE NODE IS A HANDLE CONFIGURATION — the ruled cure (`RIBBONS §1`, 2026-09-05/06).
// > "The nodes become bezier INTENTIONS where a blunt cap TURNS and a rounded cap EASES."
// > "A node is not a corner, a cap or a junction — it is a HANDLE CONFIGURATION. Broken handles
// >  turn; continuous handles ease. ⇒ cap style, corner radius and fillet stop being three things.
// >  R = 0 is zero-length handles, so the operator's dial survives unchanged."
//
// ⛔⛔ THIS IS NOT `easeRing`, AND THE DIFFERENCE IS THE WHOLE POINT. That pass was a CORNER
// CONSTRUCTOR: an invented ~7° turn threshold, a budget against neighbouring corners, a DECLINE
// when it did not fit, a REVERT when the result self-intersected, and a cluster-collapse to fix
// the budget — "each fix was aimed at the previous fix", which is why it was excised. Here there
// is no threshold, no budget, no decline and no revert. A node either carries handles or it does
// not; if the authored R does not fit its leg, the result renders as what it is (`§6.9.5`:
// self-intersection is SIGNAL, not error).
//
// ⭐ THE ONE BOUND IS TOPOLOGICAL, NOT A BUDGET: a corner's tangent point may not pass the
// midpoint of its own leg, because past that the leg belongs to the NEXT corner. That is the leg's
// own extent — the same class as the existing licensed capacity guard, not a tuned number.
//
// ⭐ R = 0 IS EXACT, BY CONSTRUCTION, NOT BY A BRANCH: zero setback and zero-length handles leave
// the vertex and its two edges untouched, so an un-eased contour is byte-identical to the sharp one.
//
// `rAt(i)` → the authored radius at vertex i (0 ⇒ broken handles ⇒ the contour turns).
// `labs` (optional) rides along: every emitted point inherits the label of the edge it lies on, so
// ①'s per-edge identity survives the ease instead of being recovered from the rounded geometry.
const easeSkips = { noR: 0, straight: 0, reversal: 0, degenerateLeg: 0, zeroSetback: 0, legClamped: 0, eased: 0 }
const EASE_ARC_TOL = 0.01            // m — the sagitta a tessellated arc may miss by (= `derive.js`'s ARC_TOL)
// `out` (optional) collects the ACHIEVED arc per eased corner — {i, V, R, C, r, tA, tB}. This is
// the corner TRUTH the authoring handle rides: `SURVEY §4` — "the ONE corner truth the magenta
// handle reads (no re-derivation)". ⛔ Without it the handle sits on the LEGACY fillet while the
// drawn curb is ②'s eased arc, and the operator's dial moves a corner that is not on screen.
function easeContour(ring, rAt, labs = null, arcsOut = null) {
  const n = ring.length
  if (n < 3) return { ring, labs }
  const seg = (a, b) => { const dx = b[0]-a[0], dz = b[1]-a[1]; const L = Math.hypot(dx, dz); return { L, d: L > 1e-12 ? [dx/L, dz/L] : [0, 0] } }
  const R_ = new Array(n); for (let i = 0; i < n; i++) R_[i] = Math.max(0, rAt(i) || 0)
  const eLen = new Array(n)
  for (let i = 0; i < n; i++) { const a = ring[i], b = ring[(i + 1) % n]; eLen[i] = Math.hypot(b[0]-a[0], b[1]-a[1]) }

  // ⭐⭐⭐ A LEG RUNS CORNER TO CORNER — it is NOT the adjacent edge. Jacob, 2026-09-06: "a square
  // offset into itself is a smaller square; 4 corners to 4 smaller corners." The sides of that
  // square are the legs; on a curved street one side is a whole run of tessellation samples.
  // ⛔⛔ BOUNDING THE SETBACK BY THE ADJACENT EDGE WAS THE DEFECT: on a tessellated contour that
  // edge is a 1–2 m curve sample, so `min(R·tan(θ/2), edge/2)` collapsed the ease and only 32% of
  // eligible corners rounded — the achieved radius reading 3.15 m against an authored 4.50 m was
  // that clamp biting, never a different radius being asked for.
  // ⭐ The bound stays TOPOLOGICAL — a corner may not eat past the midpoint of its own leg, because
  // past that the leg belongs to the next corner. Only the definition of "leg" is corrected.
  // ⭐⭐⭐ A NEAR-STRAIGHT VERTEX IS A CURVE SAMPLE, NOT A CORNER — `filletRing`'s ruled rule
  // (`FILLET_TURN_TOL`), which this constructor did not carry. ⛔ IT WAS THE DEFECT THE OPERATOR
  // MARKED as "sharp corners which look to be skipped altogether": 42% of the vertices this pass
  // planned a corner at turn under 18°, and because `legBack`/`legFwd` terminate on ANY vertex
  // wanting a radius, one of those curve samples sitting a metre from a real 90° corner TRUNCATED
  // ITS LEG. `s = min(want, legBack/2, legFwd/2)` then collapsed and `Reff = s/tan(θ/2)` with it —
  // so the corner was DRAWN at ~1 m while the stamp still read the authored 4.50 m.
  // ⭐ MEASURED on LS: 426 of 2,089 planned corners (20%) had `s` cut below 60% of `want`; of the
  // operator's 27 marked corners, 19 were achieving under 60% of their stamped radius.
  // ⛔ NOT a new threshold — `FILLET_TURN_TOL` is the existing constant, and this is the same
  // ruling applied at the second corner constructor. A leg must run to the next REAL corner.
  const turnAt_ = new Array(n)
  for (let i = 0; i < n; i++) {
    const A = seg(ring[(i - 1 + n) % n], ring[i]), B = seg(ring[i], ring[(i + 1) % n])
    turnAt_[i] = Math.atan2(Math.abs(A.d[0] * B.d[1] - A.d[1] * B.d[0]), A.d[0] * B.d[0] + A.d[1] * B.d[1])
  }
  const isCorner_ = new Array(n)
  for (let i = 0; i < n; i++) isCorner_[i] = R_[i] > 1e-9 && turnAt_[i] >= FILLET_TURN_TOL
  const legBack = new Array(n).fill(0), legFwd = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let L = 0
    for (let k = 1; k <= n; k++) { const j = (i - k + n) % n; L += eLen[j]; if (isCorner_[j]) break }
    legBack[i] = L
    L = 0
    for (let k = 0; k < n; k++) { const j = (i + k) % n; L += eLen[j]; if (isCorner_[(j + 1) % n]) break }
    legFwd[i] = L
  }
  // walk `dist` along the ring from vertex `from` (dir −1 back, +1 forward) → the point there
  const walk = (from, dir, dist) => {
    let left = dist, j = from
    for (let k = 0; k < n; k++) {
      const eIdx = dir < 0 ? (j - 1 + n) % n : j
      const L = eLen[eIdx]
      const a = ring[j], b = ring[dir < 0 ? eIdx : (j + 1) % n]
      if (L >= left) { const t = L > 1e-12 ? left / L : 0; return [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t] }
      left -= L; j = dir < 0 ? (j - 1 + n) % n : (j + 1) % n
    }
    return ring[j]
  }

  // ── PASS 1 — plan every corner, and which samples its arc swallows ──────────────────────────
  // ⛔ TWO PASSES, DELIBERATELY. A corner's arc reaches BACKWARD as well as forward, so the samples
  // it replaces include ones already emitted if this is done in a single walk. Planning first is
  // what makes the span honest instead of one-sided.
  const plan = new Map()          // corner index → { arc points, labels }
  const covered = new Set()
  for (let i = 0; i < n; i++) {
    // ⛔ Plan a corner only where there IS one — a curve sample is passed through, exactly as
    // `filletRing` passes it through. Rounding an 18° vertex is invisible and it costs its
    // neighbours their legs.
    const R = R_[i]; if (!isCorner_[i]) continue
    const P = ring[(i - 1 + n) % n], V = ring[i], N = ring[(i + 1) % n]
    const A = seg(P, V), B = seg(V, N)
    if (!(A.L > 1e-9) || !(B.L > 1e-9)) continue
    const cross = A.d[0]*B.d[1] - A.d[1]*B.d[0], dot = A.d[0]*B.d[0] + A.d[1]*B.d[1]
    const theta = Math.atan2(Math.abs(cross), dot)
    if (!(theta > 1e-6)) continue
    if (theta > Math.PI - 1e-6) continue
    const want = R * Math.tan(theta / 2)
    const s = Math.min(want, legBack[i] / 2, legFwd[i] / 2)
    if (!(s > 1e-9)) continue
    const Reff = s / Math.tan(theta / 2)
    // ⭐ The tangent points are placed ALONG THE RING, not along the adjacent edge's infinite line —
    // on a curved leg those diverge and the arc would lift off the curb.
    const T1 = walk(i, -1, s), T2 = walk(i, +1, s)
    const dIn = seg(T1, V).d, dOut = seg(V, T2).d
    const h = (4 / 3) * Math.tan(theta / 4) * Reff
    const c1 = [T1[0] + dIn[0]*h, T1[1] + dIn[1]*h]
    const c2 = [T2[0] - dOut[0]*h, T2[1] - dOut[1]*h]
    const steps = Math.max(2, Math.ceil(theta / (2 * Math.acos(Math.max(-1, Math.min(1, 1 - EASE_ARC_TOL / Math.max(Reff, EASE_ARC_TOL)))))))
    const pts = []
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, u = 1 - t
      const a3 = u*u*u, b3 = 3*u*u*t, c3 = 3*u*t*t, d3 = t*t*t
      pts.push([a3*T1[0] + b3*c1[0] + c3*c2[0] + d3*T2[0], a3*T1[1] + b3*c1[1] + c3*c2[1] + d3*T2[1]])
    }
    plan.set(i, { pts, lIn: labs ? labs[(i - 1 + n) % n] : null, lOut: labs ? labs[i] : null })
    // the samples strictly inside the arc's span are behind the curve now — keeping them folds it
    let back = 0
    for (let k = 1; k < n; k++) { const j = (i - k + n) % n; back += eLen[j]; if (back < s) covered.add(j); else break }
    let fwd = 0
    for (let k = 0; k < n; k++) { const j = (i + k) % n; fwd += eLen[j]; if (fwd < s) covered.add((j + 1) % n); else break }
    if (arcsOut) {
      const sgn = cross >= 0 ? 1 : -1
      const nA = [-dIn[1] * sgn, dIn[0] * sgn]
      arcsOut.push({ i, V, R: Reff, C: [T1[0] + nA[0]*Reff, T1[1] + nA[1]*Reff], r: Reff, tA: T1, tB: T2 })
    }
  }

  // ── PASS 2 — emit ──────────────────────────────────────────────────────────────────────────
  const out = [], outL = []
  for (let i = 0; i < n; i++) {
    const pl = plan.get(i)
    if (pl) { for (let k = 0; k < pl.pts.length; k++) { out.push(pl.pts[k]); outL.push(k < pl.pts.length / 2 ? pl.lIn : pl.lOut) } ; continue }
    if (covered.has(i)) continue
    out.push(ring[i]); outL.push(labs ? labs[i] : null)
  }
  return { ring: out.length >= 3 ? out : ring, labs: labs ? (out.length >= 3 ? outL : labs) : null }
}
function signedArea(r) {
  let a = 0
  for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; a += x1 * y2 - x2 * y1 }
  return a / 2
}
function circlePoly(cx, cy, r, seg = 32) {
  const out = []
  for (let i = 0; i < seg; i++) { const a = (i / seg) * 2 * Math.PI; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
  return out
}
// Kåsa least-squares circle fit → {cx,cy,R,res} (res = mean radial deviation, m),
// or null. Used to recognise turning-circle cul-de-sac loops: a tightly-fitting
// SMALL closed circle (SV/Park res ≈0.02 m), where the faceted teardrop/couplet
// loops (Benton res ~6 m, Waverly ~4 m) fall through — the "don't kill Benton" gate.
function fitLoopCircle(pts) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0; const N = pts.length
  for (const [x, y] of pts) { const z = x * x + y * y; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, N]], V = [sxz, syz, sz]
  const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const D = det3(M); if (Math.abs(D) < 1e-9) return null
  const rep = c => M.map((row, ri) => row.map((v, ci) => ci === c ? V[ri] : v))
  const cx = det3(rep(0)) / (2 * D), cy = det3(rep(1)) / (2 * D), C = det3(rep(2)) / D
  const R = Math.sqrt(Math.max(0, C + cx * cx + cy * cy))
  let res = 0; for (const [x, y] of pts) res += Math.abs(Math.hypot(x - cx, y - cy) - R); res /= N
  return { cx, cy, R, res }
}
// Clipper CleanPolygons wrapper: drop near-duplicate / near-collinear vertices
// within `dist` m — removes the sub-decimetre stutter a difference/offset leaves
// at a seam (the cul-de-sac keyhole mouth) without moving the shape.
function cleanRings(rings, dist) {
  const cp = rings.map(r => r.map(toClipper))
  const out = clipperLib.Clipper.CleanPolygons(cp, dist * SCALE)   // returns a new array
  return out.map(r => r.map(fromClipper)).filter(r => r.length >= 3)
}
// The bent-corner SECTOR (RIBBONS §3.9a step 10): the annular wedge swept from
// the frozen curb arc inward, bounded laterally by the two tangent radii — the
// band BENT around the arc, NEVER a disk. Built from the achieved fillet
// {C, r, tA, tB}: outer edge = the curb arc itself (radius r about C), inner
// edge = the concentric arc at radius r−depth (the band bottom), closed into
// one annular-sector polygon. `fullBand ∩ sector` (clipped to the corner depth)
// is the bent pad — a slice of the same continuous offsets, not a primitive.
// `margin` extends the sector straight OUTWARD along each leg's tangent beyond
// the arc, so it laps onto the leg slabs and the gap between them (the legs are
// pulled back by ~asphalt-hw+R) tiles seamlessly. The lap is harmless: bandRem
// already has the leg sectors subtracted, so the corner only reclaims leftover.
function arcSectorPoly(C, r, tA, tB, depth, margin = 0) {
  const [cx, cy] = C
  const aA = Math.atan2(tA[1] - cy, tA[0] - cx)
  const aB = Math.atan2(tB[1] - cy, tB[0] - cx)
  let delta = aB - aA
  while (delta > Math.PI) delta -= 2 * Math.PI        // a fillet corner is the MINOR arc (< π)
  while (delta < -Math.PI) delta += 2 * Math.PI
  const sgn = delta >= 0 ? 1 : -1
  const rin = Math.max(0.05, r - depth)
  const segs = Math.max(2, Math.round(Math.abs(delta) / (Math.PI / 24)))
  // radial (outward / curb-side) + tangent at each end; into-arc = +sgn·tangent,
  // so the leg continues OUTWARD = −sgn·tangent at A, +sgn·tangent at B.
  const uA = [Math.cos(aA), Math.sin(aA)], tgA = [-Math.sin(aA), Math.cos(aA)]
  const uB = [Math.cos(aB), Math.sin(aB)], tgB = [-Math.sin(aB), Math.cos(aB)]
  const oA = [cx + r * uA[0] - sgn * tgA[0] * margin, cy + r * uA[1] - sgn * tgA[1] * margin]
  const oB = [cx + r * uB[0] + sgn * tgB[0] * margin, cy + r * uB[1] + sgn * tgB[1] * margin]
  const iAx = [oA[0] - uA[0] * depth, oA[1] - uA[1] * depth]   // inner of the leg-A extension
  const iBx = [oB[0] - uB[0] * depth, oB[1] - uB[1] * depth]
  const out = [oA]
  for (let k = 0; k <= segs; k++) { const a = aA + delta * (k / segs); out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) }
  out.push(oB, iBx)
  for (let k = segs; k >= 0; k--) { const a = aA + delta * (k / segs); out.push([cx + rin * Math.cos(a), cy + rin * Math.sin(a)]) }
  out.push(iAx)
  return signedArea(out) >= 0 ? out : out.reverse()
}
// Pure ring/key helpers shared by the shape pass AND the chain-free sectionPass
// (module scope so sectionPass can use them without closing over the chain).
const tipKey = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)
const pushLu = (map, lu, rings) => { if (rings.length) (map[lu] || (map[lu] = [])).push(...rings) }
const nearestVertexIndex = (pt, ring) => {
  let bi = 0, bd = Infinity
  for (let i = 0; i < ring.length; i++) { const dx = ring[i][0] - pt[0], dy = ring[i][1] - pt[1]; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i } }
  return bi
}
const nearestCornerVertexIndex = (pt, ring, idxs) => {
  let bi = idxs[0], bd = Infinity
  for (const i of idxs) { const dx = ring[i][0] - pt[0], dy = ring[i][1] - pt[1]; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i } }
  return bi
}
const nearestVertR = (pt, ring, vertR) => vertR[nearestVertexIndex(pt, ring)]
function pointInRing(px, py, r) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}
// A robust interior point of a ring (midpoint nudged off the centroid toward
// the first edge — handles non-convex tiles where the centroid falls outside).
function ringInteriorPoint(r) {
  let cx = 0, cy = 0
  for (const p of r) { cx += p[0]; cy += p[1] }
  cx /= r.length; cy /= r.length
  if (pointInRing(cx, cy, r)) return [cx, cy]
  // fallback: a point just inside the first edge's midpoint
  const a = r[0], b = r[1 % r.length]
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  for (let i = 0; i < r.length; i++) {
    const t = i / r.length
    const px = mx + (cx - mx) * t, py = my + (cy - my) * t
    if (pointInRing(px, py, r)) return [px, py]
  }
  return [cx, cy]
}

// ── Planar face extraction (half-edge / DCEL face walk) ──────────────────
// Build the centerline graph (nodes = unique vertices, edges = polyline
// segments), then walk minimal cycles. next(he) at a node = the outgoing
// edge just CLOCKWISE of the incoming edge's reverse → traces the face on
// the left, yielding CCW bounded faces + one CW outer face.
export function extractFaces(streets) {
  const Q = 1e4                                   // 0.1 mm quantization for node identity
  const key = (p) => Math.round(p[0] * Q) + ',' + Math.round(p[1] * Q)
  const nodes = new Map()
  const nodeOf = (p) => {
    const k = key(p)
    let n = nodes.get(k)
    if (!n) { n = { id: nodes.size, p: [p[0], p[1]], edges: [] }; nodes.set(k, n) }
    return n
  }
  const heList = []
  const edgeSet = new Set()
  // Each half-edge carries (streetIdx, forward) so a face edge can resolve
  // back to its street-side: the CCW face interior is on the LEFT of each
  // directed half-edge, so a FORWARD half-edge (matching the street's point
  // order) has the tile on the street's LEFT; a reversed one, the RIGHT.
  const addEdge = (a, b, streetIdx) => {
    const na = nodeOf(a), nb = nodeOf(b)
    if (na.id === nb.id) return
    const ek = na.id < nb.id ? na.id + '_' + nb.id : nb.id + '_' + na.id
    if (edgeSet.has(ek)) return
    edgeSet.add(ek)
    const h1 = { from: na, to: nb, used: false, streetIdx, forward: true }
    const h2 = { from: nb, to: na, used: false, streetIdx, forward: false }
    h1.twin = h2; h2.twin = h1
    h1.angle = Math.atan2(nb.p[1] - na.p[1], nb.p[0] - na.p[0])
    h2.angle = Math.atan2(na.p[1] - nb.p[1], na.p[0] - nb.p[0])
    heList.push(h1, h2)
    na.edges.push(h1); nb.edges.push(h2)
  }
  // ⭐ WELD NEAR-COINCIDENT CHAIN ENDPOINTS. A loop body that closes within a few
  // cm — above the 0.1 mm node quantization (Benton 3.2 cm, Saint Vincent 2.2 cm)
  // — would otherwise read as an OPEN chain whose two endpoints are distinct nodes,
  // so its ring never closes and the enclosed interior face never forms.
  // LOOP-STREETS §0/§1: a loop median IS the emergent enclosed face — it only
  // exists if the ring closes. Park Place (gap 0.000) closes on its own and renders
  // right; this gives the near-closed loops the same footing. ENDPOINTS only
  // (mid-chain geometry untouched) within a tolerance well below junction
  // separation, so only true gap artifacts merge — general, so any near-miss
  // endpoint gap closes, not just the named loops.
  const ENDPOINT_SNAP = 0.15   // m
  const endReps = []
  const snapEnd = (p) => {
    for (const q of endReps) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < ENDPOINT_SNAP) return q
    endReps.push(p); return p
  }
  // Pre-register every endpoint so the chosen rep is stable before any edge reads it.
  streets.forEach((s) => { const pts = s?.points; if (pts && pts.length >= 2) { snapEnd(pts[0]); snapEnd(pts[pts.length - 1]) } })
  streets.forEach((s, si) => {
    const pts = s?.points
    if (!pts || pts.length < 2) return
    const last = pts.length - 1
    for (let i = 0; i < last; i++) {
      const A = i === 0 ? snapEnd(pts[0]) : pts[i]
      const B = i === last - 1 ? snapEnd(pts[last]) : pts[i + 1]
      addEdge(A, B, si)
    }
  })
  for (const n of nodes.values()) n.edges.sort((a, b) => a.angle - b.angle)
  // NOTE (2026-06-11): dead-end pendants are NOT pruned. A dead-ending street's
  // out-and-back spur reads as a degenerate (zero-width) face the inward Clipper
  // offset collapses on its own, so the street renders woven with its proper cap
  // (round bulb + ped wrap / flat abut) — verified clean map-wide on the render.
  // A prior pendant-prune (28f8856, now reverted) deleted the dead-ends' footprints
  // (asphalt is tile-sourced) to solve a slit pathology that the forensic + render
  // showed mostly isn't real (HANDOFF-dead-end-spike-prune, bollard). LOOPS are the
  // real enclosed-face case — handled above by the endpoint weld, not by pruning.
  const nextHE = (he) => {
    const out = he.to.edges
    const idx = out.indexOf(he.twin)
    return out[(idx - 1 + out.length) % out.length]
  }
  const faces = []
  for (const h0 of heList) {
    if (h0.used) continue
    const ring = []
    const edges = []   // edges[i] = the directed half-edge ring[i] → ring[i+1]
    let h = h0, guard = 0
    do {
      h.used = true
      ring.push(h.from.p)
      // The CCW face interior is on the geometric LEFT of a forward half-edge,
      // but that geometric side is the measure's RIGHT (production computePerps
      // calls (-dz,dx) the "right-perp"). So a FORWARD half-edge's tile sits on
      // the street's measure-RIGHT side; reversed → measure-LEFT. Label in the
      // measure convention so edgeDepth / effectiveMeasure / median detection
      // read the correct side's widths.
      edges.push({ streetIdx: h.streetIdx, forward: h.forward, side: h.forward ? 'right' : 'left' })
      h = nextHE(h)
      if (++guard > 500000) break
    } while (h !== h0)
    faces.push({ ring, edges })
  }
  // Bounded faces = positive signed area (CCW). The single outer face is the
  // most-negative; drop everything with non-positive area. Pendant (dead-end)
  // edges are walked out-and-back inside their surrounding face — they leave a
  // zero-width spur that the inward Clipper offset collapses on its own.
  return faces.filter(f => signedArea(f.ring) > 1e-3)
}

// [D2 — THE PREBAKE FACE FREEZE] Rehydrate the frozen tile topology.
// ribbons.tiles is the prebake artifact (derive.js runs extractFaces once
// over the serialized skeleton chains and freezes per tile the ring +
// per-edge (skelId, side)). Here each frozen edge resolves skelId → the
// CURRENT streets index, so every downstream lookup (measures[streetIdx],
// groupRuns, cornerKeyAt) reads exactly what a live walk would have tagged;
// `forward` is recovered from `side` (forward ⇔ 'right' — the convention
// documented in the walk above, bijective). Rings are copied: the parsed
// artifact arrays live for the session and downstream must never alias them
// across rebuilds. Returns null (caller falls back to the live walk) when
// the artifact carries no tiles (toy / pre-D2 data) or a skelId no longer
// resolves (stale artifact — topology must then be re-frozen, not papered).
// [F — EDGE OF MAP] The skelId a perimeter tile's map-edge carries (frozen by
// derive.js's D2 freeze when it injects the boundary ring as closing edges). It
// resolves to NO street: sentinel streetIdx -1 → edgeDepth returns 0 → land-use
// floods to the boundary, no curb/sidewalk on the map edge. Shared with derive.js.
export const BOUNDARY_EDGE_SKEL = '__boundary__'

// ⭐ THE CAP BULB'S CENTRE. A round dead-end's bulb is a symmetric circle on the
// road's REAL centerline, which is the chain displaced toward the wider side by
// half the difference of the two authored half-widths (the producer computes it
// once, in `deadEndTips`, and freezes it as `roundTips[].c`). ⛔ `t.p` is the
// chain's tip NODE and stays the identity key — never a circle centre.
//
// ⚠️ A shape.json frozen BEFORE this landed carries no `c`, and its `hw` is the
// old `Math.max`. The two travel together, so falling back to `p` reproduces
// that artifact's own geometry exactly rather than mixing a new centre with an
// old radius. It is disclosed once per session, not silent: a stale artifact
// must announce itself (Layer 0 q2), and the cure is one Survey-in/Survey-out
// re-freeze.
let __capCentreStaleWarned = false
export function capCentre(t) {
  if (Array.isArray(t?.c) && t.c.length === 2) return t.c
  if (!__capCentreStaleWarned) {
    __capCentreStaleWarned = true
    console.warn('[tileGround] STALE SHAPE ARTIFACT: roundTips carry no bulb centre `c`, so dead-end caps are drawn at the pre-2026-08-12 `Math.max` radius on the chain node. Asymmetric caps will show the shoulder step. Re-freeze (Survey in → Survey out) to pick up the fix.')
  }
  return t.p
}
// ⛔ `tilesFromProto` EXCISED 2026-09-06 — it had ZERO callers in `src/`, and its one scratch
// caller tested '① as the TILE SOURCE', which is the premise `5560cf6a` ruled wrong: "I CHANGED THE
// SUBSTRATE, NOT THE PRODUCER." Dead code is excised here, not archived; git holds it.

export function tilesFromFrozen(frozen, streets) {
  if (!Array.isArray(frozen) || !frozen.length) return null
  const idxBySkelId = new Map()
  streets.forEach((s, i) => {
    const k = s?.skelId || s?.name
    if (k != null && !idxBySkelId.has(k)) idxBySkelId.set(k, i)
  })
  const tiles = []
  for (const t of frozen) {
    const ring = t?.ring, fe = t?.edges
    if (!Array.isArray(ring) || !Array.isArray(fe) || ring.length !== fe.length || ring.length < 3) return null
    const edges = []
    for (const e of fe) {
      if (e?.skelId === BOUNDARY_EDGE_SKEL) {
        // Map edge: no street → sentinel idx, zero depth (edgeDepth handles
        // measures[-1] === undefined → 0). LU floods to the boundary.
        const forward = e.side === 'right'
        edges.push({ streetIdx: -1, forward, side: forward ? 'right' : 'left', boundary: true })
        continue
      }
      const si = idxBySkelId.get(e?.skelId)
      if (si === undefined) return null
      const forward = e.side === 'right'
      edges.push({ streetIdx: si, forward, side: forward ? 'right' : 'left' })
    }
    tiles.push({ ring: ring.map(p => [p[0], p[1]]), edges, ...(Array.isArray(t.caps) && t.caps.length ? { caps: t.caps.map(c => ({ ...c })) } : {}) })
  }
  return tiles
}

// ══ [SLICE 2 — TEMPORARY SCAFFOLDING] ELECT A TILE SOURCE, PER TILE ══════════
// ⛔ This function is here to be DELETED. It exists only because the walk emits
// no perimeter face and may not be given one (RIBBONS §1: "the rim BOUNDS, it
// does not own"). When the "what closes a face against the stencil?" question is
// ruled, one producer wins outright and this goes.
//
// The election, stated so nothing is implicit:
//   · a frozen RIM tile (carries a __boundary__ edge)      → FROZEN, always
//   · a frozen INTERIOR tile a walk face covers            → the WALK's face
//   · a frozen INTERIOR tile no walk face covers           → FROZEN, counted
//   · a walk face covering no frozen interior tile         → WITHHELD, named
//
// ⚠️ THE ONE THING HERE THAT IS NOT BY-CONSTRUCTION, DECLARED: the tile↔face
// correspondence is decided by CONTAINMENT of a robust interior point. That is
// geometry, and it is precisely the kind of matching the finished model must not
// need. It decides only WHICH SOURCE draws a tile — every edge's (streetIdx,
// side) identity still arrives attached from the half-edge that emitted it.
// ⛔ Interior point, never centroid: a face is a ring, not a convex blob, and the
// centroid rule already misfiled tile #3 once (RIBBONS §1, gate 1).
function electSubstrateTiles({ frozenTiles, ribbons, streets, widthAt }) {
  const R = walkSubstrate({ streets, junctionMap: ribbons.junctionMap, widthAt, orientation: 'a-to-b' })
  const { tiles: walkTiles, refused } = tilesFromWalk(R.faces, streets)

  const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
  const dSeg = (p, a, b) => { const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1; let t = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - (a[0] + ex * t), p[1] - (a[1] + ez * t)) }
  const interiorPoint = (r) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
    for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[1] < z0) z0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > z1) z1 = p[1] }
    let best = null, bd = -1
    for (let i = 1; i < 40; i++) for (let j = 1; j < 40; j++) {
      const p = [x0 + (x1 - x0) * i / 40, z0 + (z1 - z0) * j / 40]
      if (!inRing(p, r)) continue
      let d = Infinity
      for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const dd = dSeg(p, r[b], r[a]); if (dd < d) d = dd }
      if (d > bd) { bd = d; best = p }
    }
    return best
  }

  const isRim = (t) => (t.edges || []).some(e => e.boundary || e.streetIdx === -1)
  const out = [], usedFace = new Set()
  let fromWalk = 0, fromFrozenRim = 0, fromFrozenGap = 0, drawnSelfIntx = 0
  const gaps = []
  for (const t of frozenTiles) {
    if (isRim(t)) { out.push(t); fromFrozenRim++; continue }
    const p = interiorPoint(t.ring)
    let pick = -1
    if (p) for (let i = 0; i < walkTiles.length; i++) {
      if (!walkTiles[i] || usedFace.has(i)) continue
      if (inRing(p, walkTiles[i].ring)) { pick = i; break }
    }
    if (pick < 0) { out.push(t); fromFrozenGap++; gaps.push(t); continue }
    usedFace.add(pick)
    const w = walkTiles[pick]
    if (w.selfIntersections > 0) drawnSelfIntx++
    // caps are FACE-topology facts frozen at prebake; the walk does not restate
    // them, so a walk-sourced tile carries the frozen tile's caps unchanged.
    out.push({ ring: w.ring, edges: w.edges, ...(t.caps ? { caps: t.caps } : {}) })
    fromWalk++
  }
  const withheld = walkTiles.filter((w, i) => w && !usedFace.has(i))

  // ⛔ LOUD, EVERY RUN. A silent mix would be the worst possible outcome here.
  console.log(`[substrate] TEMPORARY HYBRID — tiles: ${fromWalk} from the WALK · ${fromFrozenRim} FROZEN (rim: the stencil question is unruled) · ${fromFrozenGap} FROZEN (interior, no walk face covers it)`)
  console.log(`[substrate]   walk faces ${R.faces.length} → adapted ${walkTiles.filter(Boolean).length}, refused ${refused.length}${refused.length ? ' (' + refused.map(r => r.reason).join('; ') + ')' : ''}`)
  console.log(`[substrate]   WITHHELD — walk faces covering no frozen interior tile: ${withheld.length}. ⛔ Not drawn, and what they ARE is unruled (median-is-a-block).`)
  console.log(`[substrate]   ⛔ DRAWN WITH A SELF-INTERSECTING CENTRELINE RING: ${drawnSelfIntx}. Reported, never repaired — they will draw as garbage and that is the point.`)
  console.log(`[substrate]   offset-ring degeneracies in the same walk (NOT drawn — the adapter feeds the centreline): ${R.stats.degenerateFaces}`)
  for (const g of gaps) console.log(`[substrate]   gap tile kept FROZEN, no walk face covers it`)

  // ⛔ DISJOINT AND TOTAL, ASSERTED. Not a warning — a throw. A hybrid that
  // silently drops or double-counts a tile is exactly the failure this whole
  // slice exists to make impossible.
  if (out.length !== frozenTiles.length) {
    throw new Error(`[substrate] election is not total: ${out.length} tiles out of ${frozenTiles.length} frozen (${fromWalk} walk + ${fromFrozenRim} rim + ${fromFrozenGap} gap)`)
  }
  if (fromWalk + fromFrozenRim + fromFrozenGap !== frozenTiles.length) {
    throw new Error(`[substrate] election is not disjoint: ${fromWalk}+${fromFrozenRim}+${fromFrozenGap} ≠ ${frozenTiles.length}`)
  }
  if (usedFace.size !== fromWalk) {
    throw new Error(`[substrate] a walk face was elected for more than one tile: ${usedFace.size} faces for ${fromWalk} tiles`)
  }
  return out
}

// ── Dead-end CAP identity on the frozen face (HANDOFF-dead-end-cap-flip §36) ──
// The prebake face freeze (derive.js → extractFaces) walks a dead-end spur
// OUT-and-BACK inside its enclosing face, so the turn-around at the tip is a
// ring vertex whose two adjacent edges carry the SAME chain (skelId) on OPPOSITE
// sides (right→left). That vertex — when it coincides with the chain's own
// start/end endpoint — IS the cul-de-sac / dead-end cap. This is the ONE cap
// criterion (RIBBONS §1 tile model): the fe layer (buildBlockGeometryV2) can't
// make it — it sees every naive degree-1 chain-end (LS: 100), half of them
// boundary danglers that never form an out-and-back inside a bounded face (LS:
// exactly 50 real caps survive, 1:1 with the rendered tips). So cap identity is
// a FACE-topology fact, frozen ONCE at prebake into ribbons.tiles[].caps and
// read identically by Survey/Designer (the flip) and section/bake (the render).

// skelId → { start, end } endpoint node-keys, for cap-end resolution.
export function chainEndpointKeys(streets) {
  const m = new Map()
  for (const s of streets || []) {
    const pts = s?.points
    if (!pts || pts.length < 2) continue
    const k = s.skelId || s.name
    if (k == null) continue
    m.set(k, { start: tipKey(pts[0]), end: tipKey(pts[pts.length - 1]) })
  }
  return m
}

// Detect dead-end cap tips on ONE tile face → [{ vertexIdx, skelId, capEnd }].
// `skelIdOfEdge` reads the chain id from an edge (frozen edges carry `.skelId`;
// live extractFaces edges carry `.streetIdx`, resolved by the caller).
export function detectTileCaps(ring, edges, endpointKeys, skelIdOfEdge = (e) => e?.skelId) {
  const caps = []
  const n = edges?.length || 0
  if (!n || !Array.isArray(ring) || ring.length !== n) return caps
  for (let i = 0; i < n; i++) {
    const inc = edges[(i - 1 + n) % n], out = edges[i]
    const sk = skelIdOfEdge(inc)
    if (sk == null || sk === BOUNDARY_EDGE_SKEL) continue
    if (sk !== skelIdOfEdge(out) || inc.side === out.side) continue   // not a same-chain turn-around
    const ends = endpointKeys?.get(sk)
    if (!ends) continue
    const tk = tipKey(ring[i])
    const capEnd = ends.start === tk ? 'start' : (ends.end === tk ? 'end' : null)
    if (!capEnd) continue   // same-skelId/opposite-side but NOT at a chain endpoint → not a cap
    caps.push({ vertexIdx: i, skelId: sk, capEnd })
  }
  return caps
}


// Inboard-side ped zeroing for divided carriageways (anchor='inner-edge'):
// the median-facing side keeps pavement but drops curb/treelawn/sidewalk, so
// the thin tile between the two carriageways floods to a bare median — the
// median geometry falls out of honest per-side widths + this transform, with
// no median-construction code.
// ⚠️ This is IDEMPOTENT re-resolution, NOT the primary decision: `derive.js
// innerEdgeAssign` already zeroed the inboard ped at bake using this SAME
// oracle, so re-running it lands on the same side. That is the whole reason it
// is safe. The `streetProfiles.innerEdgeMeasure` variant — which re-ran it
// through the persisted `innerSign` key instead, and so named the OUTBOARD side
// — was DELETED 2026-08-13; its D1 RECLAIM guard went with it, measured
// unreachable on 378/378 chains in six towns (see that file for the full
// adjudication). ⛔ Do not restore a side-KEY path here; ask the geometry.
// [construct-the-hard-polygons] The median-facing (inboard) side of a divided
// carriageway, resolved GEOMETRICALLY — the side whose inward (left) perp points toward
// the mate's centerline. ⛔ The persisted `innerSign` side-key is UNRELIABLE: it zeros
// the OUTBOARD side on real pairs (Lafayette never zeroed / whole-road width broadcast to
// both; Geyer/Chouteau zero 'left' while the median faces 'right' — Cambour 2026-06-15).
// This is the ONE inboard-side oracle, shared with the detector's `toMate` test
// (scratch/correctness-detector.mjs). [HANDOFF-construct-hard-polygons.md HALF B]
// (The frame-only inboard CLAMP + positive-median reservation were REVERTED 2026-06-15:
// they painted the full centerline-to-centerline gap → a too-big / phantom median where
// the surveyed pavement fills the gap, e.g. Lafayette. The real fix is the survey-based
// median at the source — median = what's left after the surveyed pavement — see Cambour's
// survey-based median spec. The geometric inboard oracle below STAYS.)
function inboardSideOf(s, mate) {
  const pa = s?.points, pb = mate?.points
  if (!pa || pa.length < 2 || !pb || pb.length < 2) return s?.innerSign === +1 ? 'right' : 'left'
  const i = Math.max(1, Math.floor(pa.length / 2))
  const ca = pa[i], cb = pb[Math.floor(pb.length / 2)]
  const dx = pa[i][0] - pa[i - 1][0], dz = pa[i][1] - pa[i - 1][1], L = Math.hypot(dx, dz) || 1
  const toMate = [cb[0] - ca[0], cb[1] - ca[1]]
  return ((-dz / L) * toMate[0] + (dx / L) * toMate[1] > 0) ? 'left' : 'right'
}
function effectiveMeasure(s, streets) {
  const m = s?.measure
  if (!m || s.anchor !== 'inner-edge') return m
  const mate = (s.pairId && streets) ? streets.find(x => x.skelId === s.pairId) : null
  if (!mate && !s.innerSign) return m
  const inboard = inboardSideOf(s, mate)
  const outboard = inboard === 'left' ? 'right' : 'left'
  const inb = m[inboard] || {}, out = m[outboard] || {}
  return { ...m, [outboard]: out, [inboard]: { ...inb, treelawn: 0, sidewalk: 0 } }
}
// (isMedianFacing + the G3a >40%-median-facing tile heuristic retired at E2 —
// the median is now a CONSTRUCTED polygon frozen at prebake (ribbons.medians,
// kind:'median', DIVIDED-CORRIDOR-PLAN §4.2); median tiles are detected by
// IDENTITY against it in the shape loop below.)

// Cumulative INWARD depth of a tile edge at each band level, from its own
// street-side measure. level: 'A' asphalt | 'C' +curb | 'T' +treelawn |
// 'W' +sidewalk. Returns 0 for edges with no resolvable street (e.g. a future
// map-boundary edge → no road, LU floods to it).
function edgeDepth(measure, side, curbWidth, level) {
  const m = measure?.[side]
  const a = Math.max(0, Number.isFinite(m?.pavementHW) ? m.pavementHW : 0)
  if (level === 'A' || a <= 0) return a
  const c = a + curbWidth
  if (level === 'C') return c
  const t = c + Math.max(0, Number.isFinite(m?.treelawn) ? m.treelawn : 0)
  if (level === 'T') return t
  return t + Math.max(0, Number.isFinite(m?.sidewalk) ? m.sidewalk : 0)
}

// ── Best-effort first fill (SECTION.md §3.1) ───────────────────────────────
// The default ped cross-section before any authoring. The system needs only two
// things per edge: treelawn Y/N + strip depths (ADA). Treelawn Y/N is GLEANED,
// not guessed: `measure.treelawn` is the surveyed "natural gap" (centerline→
// sidewalk minus the asphalt+curb), and its LS distribution is cleanly bimodal
// (~391 edges ≈0 = N · ~508 ≥0.75m = Y · ~50 in the 0.25–0.75 valley). Threshold
// the gap → Y/N for ~95% of edges; the strips then default to ADA-standard depths
// (also the Revert state). This replaces the old per-tile AVERAGED measures, which
// drew noisy sub-meter treelawn slivers everywhere.
const TREELAWN_YN_THRESHOLD = 0.6   // natural gap below this → no treelawn (the bimodal valley)
const STD_TREELAWN = 1.5            // standard treelawn depth where present (m) — tunable
const ADA_SIDEWALK = 1.5            // ADA-standard sidewalk depth — the Revert default (m) — tunable
const VALLEY_LO = 0.25, VALLEY_HI = 0.75   // the bimodal valley span (the ~92 ambiguous run-sides)
const gleanGap = (measure, side) =>
  Math.max(0, Number.isFinite(measure?.[side]?.treelawn) ? measure[side].treelawn : 0) >= TREELAWN_YN_THRESHOLD
// ── PER-STREET glean (2026-06-22) ──────────────────────────────────────────
// The raw gap-threshold mis-assigns the UNMEASURED side of a one-sided street.
// In LS, 14 streets are surveyed on ONE side (`source:'sidewalk-1side'`) and 4
// are ROW-only (`source:'assessor'`). measureFromSeed renders the unmeasured
// side of a one-sided street as terminal='lawn' with treelawn=0 (a modest grass
// strip placeholder, NOT a survey fact) — so the raw glean reads it N while the
// MEASURED side reads Y, and the treelawn flips mid-block → the corner reads as
// broken (Dillon/Grattan/Soulard/S-13th/S-21st, Henrietta Pl — the operator's
// circled corners). A terminal='lawn' side carries no measure of its own, so it
// INHERITS the measured (terminal='sidewalk') side's verdict. Two-sided streets
// keep their per-side glean — real L/R asymmetry (park-edge, divided median) is
// legitimate, and the threshold-straddle "valley" is the operator's eye-call
// (surfaced by `reportGlean`, NOT auto-flipped). terminal='none' (highway /
// median-facing) is genuinely treelawn-less and never inherits.
// DEFAULT-ONLY: this resolves live UNDER blockCustoms (resolvePedDepths merges
// the custom on top), so authored overrides win identically.
const gleanTreelawn = (measure, side) => {
  const sd = measure?.[side]
  if (sd && sd.terminal === 'lawn') {
    const otherKey = side === 'left' ? 'right' : 'left'
    const o = measure?.[otherKey]
    if (o && o.terminal === 'sidewalk') return gleanGap(measure, otherKey)
  }
  return gleanGap(measure, side)
}

// Surface the ambiguous run-sides the auto-default cannot decide for the
// operator — the bimodal VALLEY (gap 0.25–0.75 on a sidewalk-terminal side) and
// the ROW-only ASSESSOR guesses (no sidewalk measure → the treelawn is a guess).
// EMITTED, never auto-flipped (the operator's eye is the gate). Gated on
// `opts.reportGlean` so it fires only during bake — never in the browser path
// (no process.env; browser-reachable code stays opts.*-gated).
function reportGlean(measures, streets) {
  const valley = [], assessor = []
  const survey = (typeof globalThis !== 'undefined' && globalThis.__cartographSurvey) || null
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i], st = streets[i]
    if (!m) continue
    const src = survey?.[st?.name]?.source || null
    for (const side of ['left', 'right']) {
      const sd = m[side]; if (!sd) continue
      const g = Math.max(0, Number.isFinite(sd.treelawn) ? sd.treelawn : 0)
      if (sd.terminal === 'sidewalk' && g >= VALLEY_LO && g <= VALLEY_HI) {
        valley.push({ street: st?.name, skelId: st?.skelId, side, gap: +g.toFixed(2), source: src })
      }
      if (src === 'assessor') {
        assessor.push({ street: st?.name, skelId: st?.skelId, side, gap: +g.toFixed(2), verdict: gleanTreelawn(m, side) ? 'Y' : 'N', note: 'ROW-only guess' })
      }
    }
  }
  const dedup = (a, k) => { const seen = new Set(); return a.filter(x => { const s = JSON.stringify(k(x)); return seen.has(s) ? false : (seen.add(s), true) }) }
  const v = dedup(valley, x => [x.street, x.side, x.gap]).sort((a, b) => (a.street || '').localeCompare(b.street || ''))
  const as = dedup(assessor, x => [x.street, x.side]).sort((a, b) => (a.street || '').localeCompare(b.street || ''))
  console.log(`[glean] VALLEY (gap ${VALLEY_LO}-${VALLEY_HI}, sidewalk-terminal) — operator's eye-call, NOT auto-flipped: ${v.length} run-side(s)`)
  for (const x of v) console.log(`  ${x.street} [${x.skelId}] ${x.side}: gap=${x.gap}${x.source ? ` (${x.source})` : ''}`)
  console.log(`[glean] ASSESSOR / ROW-only guesses (flag — no sidewalk measure): ${as.length} run-side(s)`)
  for (const x of as) console.log(`  ${x.street} [${x.skelId}] ${x.side}: gap=${x.gap} verdict=${x.verdict} (${x.note})`)
}

// ⭐ THE ONE PER-EDGE DEPTH RESOLUTION (SECTION.md §3.3 step 1 / §5 one-depth-truth).
// override (blockCustoms[skelId][side][segOrd].{treelawn,sidewalk}) else the
// best-effort default (gleaned-Y ? STD_TREELAWN : 0; ADA_SIDEWALK). Exported so
// the FILL stroke (sectionPass) and the authoring-handle placement (Measure
// overlay) read the SAME resolution — if they read different depths they
// diverge, which was the root of both handle symptoms (don't match + don't
// respond). Pure data-in/data-out: no chain handle, the wall holds.
// ⭐ MONO-WIDTH, STRIPS SWAP — NOT COLLAPSE (Jacob 2026-06-10). The ribbon is two
// strips of EQUAL width; the gleaned treelawn Y/N is a MATERIAL decision (which
// strip is grass vs walk), NOT a width. A sidewalk-only edge is "sidewalk then
// LU/lawn" — the strips swap materials, they never collapse one to zero. So BOTH
// widths default to the same standard (STD_TREELAWN == ADA_SIDEWALK), and the
// ribbon total is uniform whether the edge is Y or N. `hasTL` carries the
// surveyed Y/N to drive the strip ORDERING / default materials downstream.
export function resolvePedDepths(baseMeasure, side, custom = null) {
  const tl = Number.isFinite(custom?.treelawn) ? Math.max(0, custom.treelawn) : STD_TREELAWN
  const sw = Number.isFinite(custom?.sidewalk) ? Math.max(0, custom.sidewalk) : ADA_SIDEWALK
  return { tl, sw, hasTL: gleanTreelawn(baseMeasure, side) }
}

// Group a tile's cyclic edges into maximal RUNS of the same (streetIdx, side).
// A run = a sub-polyline of the tile boundary that all carries the same
// street-side widths. Offsetting the run polyline (not each edge) is what
// keeps the variable-width inset robust: round join handles the run's internal
// bends with no compounding. Handles the cyclic seam (rotate to a boundary);
// a tile bounded entirely by one street-side (a loop interior) → one closed
// run (polyline closed back to its start).
// Remove `t0` arc-length from the start of a polyline and `t1` from the end.
// Used to pull each street-side run back from its corners so the treelawn slab
// ends at the tangent — the corner span then carries no treelawn and fills as
// one solid sidewalk pad. Returns null if nothing survives (short leg → all SW).
function trimPolyline(poly, t0, t1) {
  const dropStart = (pts, t) => {
    if (t <= 1e-6) return pts.slice()
    let acc = 0
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
      if (acc + seg <= t) { acc += seg; continue }
      const r = (t - acc) / seg
      const sx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r
      const sy = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r
      return [[sx, sy], ...pts.slice(i + 1)]
    }
    return null
  }
  let p = dropStart(poly, t0)
  if (!p || p.length < 2) return null
  p = dropStart(p.slice().reverse(), t1)
  if (!p || p.length < 2) return null
  return p.reverse()
}

// Split a street polyline at interior JUNCTION nodes (graph degree ≥ 3) into
// sub-segments between junctions — the perimeter analogue of a tile's runs, so
// the treelawn slab can be trimmed back from each corner.
function splitAtJunctions(pts, nodeDeg, key) {
  const segs = []
  let cur = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    cur.push(pts[i])
    if (i < pts.length - 1 && nodeDeg.get(key(pts[i])) >= 3) { segs.push(cur); cur = [pts[i]] }
  }
  segs.push(cur)
  return segs
}

function groupRuns(tile) {
  const { ring, edges } = tile
  const n = edges.length
  const same = (a, b) => a.streetIdx === b.streetIdx && a.side === b.side
  // find a seam: an edge whose predecessor differs
  let seam = 0, found = false
  for (let i = 0; i < n; i++) {
    if (!same(edges[i], edges[(i - 1 + n) % n])) { seam = i; found = true; break }
  }
  if (!found) {
    // whole ring is one street-side → one closed run
    return [{ streetIdx: edges[0].streetIdx, side: edges[0].side, poly: [...ring, ring[0]] }]
  }
  const runs = []
  let start = seam
  for (let c = 0; c < n; ) {
    const i0 = (start) % n
    let len = 1
    while (len < n && same(edges[(start + len) % n], edges[i0])) len++
    // run covers edges i0 .. i0+len-1 → vertices ring[i0] .. ring[i0+len]
    const poly = []
    for (let k = 0; k <= len; k++) poly.push(ring[(i0 + k) % n])
    runs.push({ streetIdx: edges[i0].streetIdx, side: edges[i0].side, poly })
    start = (start + len) % n
    c += len
  }
  return runs
}

// ══ [A10-③] PAINT THE BAND FROM THE PARTITION ════════════════════════════════
// "The ring is already partitioned, one owner per edge. The band must be painted
//  FROM THAT PARTITION — each owner painting its own arc of the inset — not by
//  re-stroking each run's polyline into an area and intersecting. Ends exist only
//  because we make areas out of lines that have ends." (Jacob, ratified 2026-08-08.)
//
// The three pieces below turn that sentence into geometry. They read ONLY the
// frozen artifact (ring / runs / iA / iaEdge / fillets) — no chain, no centerline,
// no street name, no tuned distance deciding ownership.
//
// ⛔ NO FALLBACK. Each returns `null` with the reason NAMED on `partitionDump`
// when it cannot establish the partition; the caller then leaves that tile on the
// old construction, and the A10 invariant still reports its defect, so a refusal
// can never read as a cure.
export const partitionDump = { rows: [] }
const _pdump = (why) => { if (partitionDump.rows.length < 5000) partitionDump.rows.push(why) }

// WHICH RUN OWNS EACH RING EDGE. `groupRuns` built `runs[]` by walking `edges[]`
// in ring order and grouping consecutive edges sharing (streetIdx, side), so the
// runs are consecutive and consume the ring exactly — that is the partition, and
// this recovers its index form from the frozen artifact without a new key.
// ⭐ INTERIOR vertices are asserted, ENDS are not: the shape pass may snap a
// dead-end run's END onto a fillet apex, but it never moves an interior vertex.
// The rotation is chosen by exact-match score and must be UNIQUE — a tie is a
// refusal, never a coin-flip.
export function ringRunOwners(st) {
  const ring = st.ring, runs = st.runs || [], n = ring?.length || 0
  if (!n || !runs.length) return null
  let total = 0
  for (const r of runs) { if (!r.poly || r.poly.length < 2) return null; total += r.poly.length - 1 }
  if (total !== n) { _pdump('runs-do-not-consume-ring'); return null }
  const K = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
  const key = ring.map(K)
  let best = null, bestScore = -1, ties = 0
  for (let s = 0; s < n; s++) {
    let c = s, ok = true, score = 0
    for (const r of runs) {
      for (let k = 1; k < r.poly.length - 1; k++) if (key[(c + k) % n] !== K(r.poly[k])) { ok = false; break }
      if (!ok) break
      for (let k = 0; k < r.poly.length; k++) if (key[(c + k) % n] === K(r.poly[k])) score++
      c = (c + r.poly.length - 1) % n
    }
    if (!ok) continue
    if (score > bestScore) { bestScore = score; best = s; ties = 1 }
    else if (score === bestScore) ties++
  }
  if (best == null) { _pdump('no-rotation-matches-the-ring'); return null }
  if (ties !== 1) { _pdump('ambiguous-rotation'); return null }
  const owner = new Array(n)
  let c = best
  runs.forEach((r, ri) => { for (let k = 0; k < r.poly.length - 1; k++) owner[(c + k) % n] = ri; c = (c + r.poly.length - 1) % n })
  return owner
}

// THE ARCS OF `iA`, ONE OWNER EACH. Cut the curb ring at (a) every fillet's two
// TANGENT POINTS — frozen, and exact vertices of `iA` (346/346 measured) — and
// (b) every ownership change that is not inside a fillet arc, which is a corner
// the curb rounded at R=0, where the two legs meet at a miter with no arc to hand
// over. Between the cuts sits exactly one owner: a run, or a corner.
// ⭐ This is doctrine §6.9.4 with the takeover made UNCONDITIONAL — "both legs
// stop at tA/tB; the corner ribbon takes over; legs resume". Step over and step
// back are now the SAME cut, so neither can leave a gap.
export function bandSpans(st, owner) {
  const K = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
  const out = []
  for (let r = 0; r < st.iA.length; r++) {
    const A = st.iA[r], lab = st.iaEdge[r], m = A.length
    if (!Array.isArray(lab) || lab.length !== m) { _pdump('stamp-shape-mismatch'); return null }
    if (m < 3) continue
    const idx = new Map()
    for (let k = 0; k < m; k++) { const kk = K(A[k]); if (!idx.has(kk)) idx.set(kk, k) }
    const arcs = []
    for (const f of (st.fillets || [])) {
      const a = idx.get(K(f.tA)), b = idx.get(K(f.tB))
      if (a == null || b == null) continue          // not this ring's corner
      const fwd = (b - a + m) % m, bwd = (a - b + m) % m
      const [s, e, len] = fwd <= bwd ? [a, b, fwd] : [b, a, bwd]
      if (len === 0 || len * 2 > m) continue        // a fillet is the MINOR arc, as arcSectorPoly says
      arcs.push({ s, e, len, f })
    }
    const inArc = new Array(m).fill(false)
    for (const ar of arcs) for (let k = 1; k < ar.len; k++) inArc[(ar.s + k) % m] = true
    const cuts = new Set()
    for (const ar of arcs) { cuts.add(ar.s); cuts.add(ar.e) }
    for (let k = 0; k < m; k++) {
      const a = owner[lab[(k - 1 + m) % m]], b = owner[lab[k]]
      if (a !== b && !inArc[k]) cuts.add(k)
    }
    const cs = [...cuts].sort((x, y) => x - y)
    if (!cs.length) { out.push({ r, i0: 0, i1: 0, len: m, owner: owner[lab[0]], fillet: null }); continue }
    const arcAt = new Map(arcs.map(ar => [`${ar.s}|${ar.e}`, ar.f]))
    for (let j = 0; j < cs.length; j++) {
      const i0 = cs[j], i1 = cs[(j + 1) % cs.length]
      const len = (i1 - i0 + m) % m || m
      const fillet = arcAt.get(`${i0}|${i1}`) || null
      // ⭐ EVERY span carries an owning run, fillet or not. A fillet arc is a
      // corner only where a corner actually bid; where none did (a name transition,
      // a through-continuation) the road runs straight past and the arc belongs to
      // the run the stamp gives it. A span with no owner at all would be an arc
      // nobody paints — the very hole this ticket is about.
      // [A10-③ · the keyhole ruling] A vertex whose stamp is `null` has NO OWNER
      // (the keyhole splice minted it inside the bulb disc). Tally only OWNED
      // vertices, and if a span has none, DROP it — "an arc with no owner is
      // simply never walked". ⛔ Never let an unowned majority elect an owner:
      // that would paint minted ground with a neighbour's identity, which is the
      // proximity recovery this ticket exists to avoid.
      const tally = new Map()
      for (let t = 0; t < len; t++) {
        const src = lab[(i0 + t) % m]
        if (src == null) continue
        const w = owner[src]
        if (w === undefined) continue
        tally.set(w, (tally.get(w) || 0) + 1)
      }
      if (!tally.size) continue                    // unowned arc — not painted, not guessed
      let o = null, bestN = -1
      for (const [w, c] of tally) if (c > bestN) { bestN = c; o = w }
      out.push({ r, i0, i1, len, owner: o, fillet })
    }
  }
  return out
}

// THE ARC'S OWN SLICE OF THE BAND. A quad strip swept inward off the arc, joined
// at every interior vertex, and closed at each END on the ring's own inward
// BISECTOR — which both neighbouring spans compute identically, so their claims
// share that cut exactly: no gap to fall into land use, no overlap to double-paint.
// ⛔ Not a buffer of a polyline: the geometry is the arc of the FROZEN curb, so a
// claim cannot end anywhere the ownership does not.
export function spanClaimPoly(A, i0, len, m, D, sgn) {
  const nrm = (i, j) => { const dx = A[j][0] - A[i][0], dy = A[j][1] - A[i][1]; const L = Math.hypot(dx, dy); if (L < 1e-12) return null; return [-dy / L * sgn, dx / L * sgn] }
  const bis = (k) => {
    const a = nrm((k - 1 + m) % m, k), b = nrm(k, (k + 1) % m)
    if (!a) return b; if (!b) return a
    const x = a[0] + b[0], y = a[1] + b[1], L = Math.hypot(x, y)
    return L < 1e-9 ? b : [x / L, y / L]
  }
  const at = (p, d) => [p[0] + d[0] * D, p[1] + d[1] * D]
  const i1 = (i0 + len) % m
  const parts = []
  for (let t = 0; t < len; t++) {
    const i = (i0 + t) % m, j = (i0 + t + 1) % m
    const n = nrm(i, j)
    if (!n) continue                                   // a zero-length ring edge sweeps nothing
    const di = t === 0 ? (bis(i0) || n) : n
    const dj = t === len - 1 ? (bis(i1) || n) : n
    parts.push([A[i], A[j], at(A[j], dj), at(A[i], di)])
    // the join: fan the turn between the two edge normals so a bend cannot open a
    // wedge inside the span (the ends are handled by the shared bisector above).
    if (t < len - 1) {
      const n2 = nrm(j, (i0 + t + 2) % m)
      if (n2) {
        let da = Math.atan2(n2[1], n2[0]) - Math.atan2(n[1], n[0])
        while (da > Math.PI) da -= 2 * Math.PI
        while (da < -Math.PI) da += 2 * Math.PI
        if (Math.abs(da) > 1e-4) {
          const steps = Math.max(1, Math.round(Math.abs(da) / (Math.PI / 24)))
          const a0 = Math.atan2(n[1], n[0])
          const fanPts = [A[j]]
          for (let q = 0; q <= steps; q++) { const a = a0 + da * (q / steps); fanPts.push(at(A[j], [Math.cos(a), Math.sin(a)])) }
          parts.push(fanPts)
        }
      }
    }
  }
  return parts.length ? unionRings(parts) : []
}

// ── THE WALL · sectionPass ─────────────────────────────────────────────────
// The FILL side of the wall: the interior authored ped strips (treelawn/sidewalk
// leg strips, the ADA all-SW corner pad, the LU flood) stroked off the FROZEN
// per-tile shape. Its parameters carry ONLY the artifact (shapeTiles) + design
// params (cw, stripMat) — there is NO lexical handle on the chain graph
// (streets / streetsOrig / measures / centerlineData / ribbons), so it CANNOT
// reach back. That impossibility is the wall: Section's shape input changes only
// when the shape pass re-runs. Every helper below is module-level + pure.
// Per-tile FILL contribution — pure in (the frozen tile, cw, stripMat, its own
// blockCustoms slice). Extracted from sectionPass's loop body so block-local
// Section (BlockGeometryV2Debug) recomputes ONE tile on a drag and reuses the
// rest from cache. No cross-tile reads — corners/through-nodes are detected from
// this tile's own runs — so the per-tile isolation is exact. Returns this tile's
// { Wacc, tlByLu, luByLu } rings (the same arrays the old whole-map loop pushed
// into). (Body is one indent deep from the old for-loop; logic is unchanged.)
// ── CORNER_DUMP=1 · the corner debug channel (README "Corners" row) ──────────
// DEBUG EMIT ONLY. Off unless the env flag is set; when off, nothing below it is
// evaluated and construction is byte-identical. It answers ONE question the
// geometry cannot be asked from outside: for every corner that BID (an entry
// landed in `cornerT`, so `legTrim` already pulled the legs back), was the pad
// built — and if not, WHICH gate declined it? An unhonoured takeover is a
// MISLABEL, not a hole (SECTION §7): the released band falls to `luRemainder`
// and renders as land use, so it is invisible to any area/coverage measure.
// Drain `cornerDump.rows` after each sectionPassTile call; the caller owns the
// tile identity (sectionPassTile has none).
export const cornerDump = { on: (typeof process !== 'undefined' && process.env?.CORNER_DUMP === '1'), rows: [] }
// ── SECTION_DUMP=1 · ③'s per-edge resolution, for a check that READS the source ──────────────
// ⛔ INERT: nothing in the paint reads it and the geometry is byte-identical armed or disarmed.
// It exists because every probe that wanted to know "what cross-section did this edge resolve
// to" had to RESTATE the resolution, and two instruments with one blind spot are one instrument
// (`c9a0d783`). Same pattern and same discipline as `cornerDump` above.
export const sectionDump = { on: (typeof process !== 'undefined' && process.env?.SECTION_DUMP === '1'), rows: [], ramp: [] }

export function sectionPassTile(st, cw, stripMat, blockCustoms = null) {
  // PROTOTYPE C (env-gated, off in the browser): slope the SW↔(TL|SW) corner
  // treelawn band. Keys on the RESOLVED outer material (e.mat.outer) so a flipped
  // strip moves the taper too; the FILL re-strokes on blockCustoms change.
  let Wacc = []; const tlByLu = {}, luByLu = {}   // Wacc: `let` — the cap-slope post-pass carves it
  // Per-edge OVERRIDE read (SECTION.md §3.2/§3.3): blockCustoms[skelId][side][segOrd]
  // keyed by the FROZEN run identity — design intent, NOT chain geometry, so the
  // wall holds. Carries the depth override (.treelawn/.sidewalk → resolvePedDepths)
  // and the material override (.materials over the §3.1 ordering default).
  const runCustom = (run) => blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd] || null
  {
    const { ring, iA, vertR, tl, sw, lu, roundTips, bluntTips, runs } = st
    const fillets = st.fillets || []   // achieved curb arcs → the bent-corner sectors
    // [DEAD-END MOUTH WRAP] Per-mouth discs frozen by the shape pass (the bounded-local
    // splice — see the freeze block). At each, the through-road's wide leg-sector must
    // be trimmed back from the mouth so it no longer COVERS the spur's corner wedge,
    // freeing bandRem for the two bent sectors to build. The spur's own run-ends were
    // already snapped to the two distinct fillet apexes (distinct cornerT keys). Bounded
    // to the disc → cross-tile-safe; multi-spur tiles carry one disc per mouth.
    const mouths = st.mouths || []
    // Tolerate the serialized artifact: roundTipKeys is a Set in-memory, an array
    // when loaded from shape.json (Phase D). Either way → a Set for `.has`.
    const roundTipKeys = st.roundTipKeys instanceof Set ? st.roundTipKeys : new Set(st.roundTipKeys)
    const roundTipByKey = new Map(roundTips.map(t => [tipKey(t.p), t]))
    // [CAP FLIP] Round dead-end tips flipped in Measure (readCapCustom → capFlip,
    // HANDOFF-dead-end-cap-flip §1-3). A flip SWAPS the cap wrap's two strips
    // (grass↔walk) within the tip disk, so it ALWAYS reads as a change regardless
    // of the default arrangement and toggles cleanly (the "always flippable" rule).
    // ROUND-ONLY — a blunt dead-end (set in Survey) is ineligible: it has no round
    // wrap disk. Default (no flip) leaves the tip OUT of this map → byte-identical.
    // capCouplers holds EVERY identified round cap (axis = tip→body, down the
    // finger) with whether it is flipped; capFlip is the flipped-only view the
    // strip SWAP consults. The coupler needs the unflipped ones too — a cap whose
    // two legs differ still has a joint to reconcile at one shoulder.
    const capCouplers = new Map()
    const capFlip = new Map()   // tipKey → { p, hw, axis }
    for (const t of roundTips) {
      if (!t.skelId || !t.capEnd) continue
      const flipped = !!readCapCustom(blockCustoms, t.skelId, t.capEnd)?.capFlip
      // The finger axis (tip→body) from an owning run — the cap is a SEMICIRCLE on
      // the FAR side of the tip (away from the body), NOT a full disk. The swap is
      // clipped to that half so it stops cleanly at the diameter (the shoulders),
      // never bleeding white-outer down the legs (Jacob: "it's only a semicircle").
      // AVERAGED over both owning legs, not taken from the first one: the legs
      // leave the tip almost parallel but diverge toward the mouth, so one leg's
      // direction puts that leg exactly ON the axis (zero perpendicular offset)
      // and the shoulder classification below has no sign to read. The mean
      // direction sits between them, giving each leg a clean ± offset.
      let axis = null
      let ax = 0, az = 0, nAx = 0
      for (const run of runs) {
        const nP = run.poly.length
        for (const ix of [0, nP - 1]) {
          if (Math.hypot(run.poly[ix][0] - t.p[0], run.poly[ix][1] - t.p[1]) >= 1.5) continue
          const b = run.poly[ix === 0 ? 1 : nP - 2]
          if (!b) continue
          const l = Math.hypot(b[0] - t.p[0], b[1] - t.p[1]) || 1
          ax += (b[0] - t.p[0]) / l; az += (b[1] - t.p[1]) / l; nAx++
          break
        }
      }
      if (nAx) { const l = Math.hypot(ax, az) || 1; axis = [ax / l, az / l] }
      const info = { p: t.p, c: capCentre(t), hw: t.hw, total: (t.tl || 0) + (t.sw || 0), axis, flipped }
      capCouplers.set(tipKey(t.p), info)
      if (flipped) capFlip.set(tipKey(t.p), info)
    }
    // Semicircle mask per flipped cap (the SSoT the swap consults): the tip disk ∩
    // the FAR half-plane (away from the body) — so the swap stops cleanly at the
    // diameter, never bleeding down the legs. Plus, at each shoulder, a tapering
    // RAMP triangle that extends the swap a short way down the leg — that diagonal
    // IS the ADA dip-in (§6.1), so no separate slide is needed. (Jacob: "it's only
    // a semicircle.")
    const capSemi = (cap) => {
      const R = cap.hw + cw + SECTOR_D
      const C = cap.c                                  // the bulb's centre, not the chain node
      if (!cap.axis) return [circlePoly(C[0], C[1], R)]
      const a = cap.axis, n = [-a[1], a[0]], B = R + 2
      const half = [
        [C[0] + n[0] * B, C[1] + n[1] * B],
        [C[0] - n[0] * B, C[1] - n[1] * B],
        [C[0] - n[0] * B - a[0] * B, C[1] - n[1] * B - a[1] * B],
        [C[0] + n[0] * B - a[0] * B, C[1] + n[1] * B - a[1] * B],
      ]
      return intersectRings([circlePoly(C[0], C[1], R)], [half])
    }
    // Blunt dead-end tips: like round tips, they are NOT junction corners — the
    // curb caps flat at the tip node, so the leg must run TO the tip (no e.a+R
    // junction pullback) and bid NO corner pad. Without this the band squares off
    // ~e.a short of the cap ("the corner slides down the arm"). G8 (below) then
    // abuts LU to the flat end.
    const bluntTipKeys = new Set((bluntTips || []).map(t => tipKey(t.p)))
    // Band join frozen by the shape pass: 'round' at dead-end / loop / thin tiles
    // so the ped strips cap cleanly instead of needling at the cap's ~180°
    // reversal; 'miter' on normal cornered tiles keeps authored R=0 squares sharp.
    const bandJoin = st.bandJoin || 'miter'
    // Capacity guard (RIBBONS §3.9a item 5): the shape pass froze cap = 90% of this
    // tile's inscribed reach. Clamp each offset depth to it so a thin tile (loop
    // interior, narrow median, sliver) can't drive the inward offsets past the
    // medial axis into thorns — it degrades to a clean truncated ribbon. On the
    // offset W, never the fillet radius.
    const cap = Number.isFinite(st.cap) ? st.cap : (cw + (tl || 0) + (sw || 0))
    // Median tile: the shape pass froze ped at zero (tl = sw = 0) — no per-edge
    // resolution can re-grow strips into the median.
    // ⛔⛔ `tl`/`sw` ARE A REFUSABLE PAIR — read the tile's own `refused` block, never the raw
    // field. ①'s tile refuses them with a reason ("a DEFAULT depth, not a frozen one —
    // `resolvePedDepths` gleans it live off `runs[].baseMeasure`"), and an absent field must not
    // read the same as a present one. Untested, `undefined + undefined` is NaN and `NaN <= 1e-6`
    // is FALSE, so a refusing tile silently read as "not a median" — right answer, wrong reason,
    // and the same NaN then poisoned the mono-width seed below. ⭐ ZERO is a VALUE here and it is
    // the median signal (`a sentinel is not a value`), so it may only be read where it was
    // actually frozen. A tile that refuses the pair carries NO median signal — that is ③'s
    // already-disclosed gap ("there is no `median` land-use class"), not something to invent one for.
    const pedFrozen = Number.isFinite(tl) && Number.isFinite(sw)
    const pedOff = pedFrozen && (tl + sw) <= 1e-6
    // ── §3.3 step 1 · per-edge resolution ──
    // One resolved depth pair per qualifying run (the one-depth-truth wire —
    // resolvePedDepths, shared with the handle placement), plus the §3.1 strip
    // ORDERING (two strips always): treelawn-Y reads TL→SW→LU off the curb;
    // treelawn-N reads SW→TL→LU (the walk hugs the curb; the TL slot is 0-deep
    // until authored). Materials default by that ordering through stripMat
    // ({outer:'LU', inner:'SW'} = TL-position LU / SW-position SW), then the
    // per-edge .materials override (§3.2) flips slots; both-LU = open field.
    const rr = []
    for (const [ri, run] of runs.entries()) {
      const aBase = edgeDepth(run.baseMeasure, run.side, cw, 'A')   // base asphalt edge (grout)
      // No asphalt on this edge: the ring reached the edge of the DRAWING (the
      // neighborhood disc clipped the tile) or a median face. ARCHITECTURE §"The
      // compound shape" — the circle is the OUTER CONTOUR of one closed shape,
      // never an absence, so this edge is not missing, it just owes no sidewalk of
      // its own. It still must not BREAK the ring for its neighbours ⇒ it stays in
      // the partition and OWNS ITS ARC at zero ped depth, exactly as a median tile
      // does one line up (pedOff). Dropping the run was A10's NO-PED arrival.
      const noPed = aBase <= 1e-6
      const c = runCustom(run)
      const ped = (pedOff || noPed) ? { tl: 0, sw: 0, hasTL: false } : resolvePedDepths(run.baseMeasure, run.side, c)
      const o = ped.hasTL ? ped.tl : ped.sw                         // outer (curb-side) strip depth
      const inn = ped.hasTL ? ped.sw : ped.tl                       // inner strip depth
      const defMat = ped.hasTL
        ? { outer: stripMat.outer, inner: stripMat.inner }          // TL→SW (Y ordering)
        : { outer: stripMat.inner, inner: stripMat.outer }          // SW→TL (N ordering)
      const cm = c?.materials
      const mat = cm
        ? { outer: cm.outer === 'SW' ? 'SW' : 'LU', inner: cm.inner === 'LU' ? 'LU' : 'SW' }
        : defMat
      const a = edgeDepth(run.measure, run.side, cw, 'A')   // per-fe asphalt edge, frozen (trim follows it)
      rr.push({ ri, run, aBase, a, noPed, hasTL: ped.hasTL, tlD: ped.tl, swD: ped.sw, o, inn, total: o + inn, mat })
    }
    // Peel treelawn-Y runs first: where two legs' slabs graze near a corner the
    // treelawn claims the overlap (matching the old zone-union semantics — the
    // grass ends at its tangent, the walk yields).
    rr.sort((x, y) => (y.hasTL ? 1 : 0) - (x.hasTL ? 1 : 0))
    // THROUGH-NODE detection (the continuous side of a T must not split). The
    // [THRU] station split breaks one street's frontage into two runs that meet
    // at the node; both being trimmed back by e.a+R opens a gap in the band and
    // each bids a spurious corner. A vertex where two run-ENDS of the SAME
    // skelId+SIDE meet is exactly that continuation (a real corner joins
    // DIFFERENT streets; an authored bend stays one run; a dead-end tip is
    // same-skelId but DIFFERENT side, handled by `tipped`) — there, bid no
    // corner and don't trim.
    const endSkelCount = new Map()   // tipKey(end) → Map(skelId|side → #run-ends)
    for (const e of rr) {
      const last = e.run.poly[e.run.poly.length - 1]
      for (const p of [e.run.poly[0], last]) {
        const k = tipKey(p), key = `${e.run.skelId}|${e.run.side}`
        let m = endSkelCount.get(k); if (!m) { m = new Map(); endSkelCount.set(k, m) }
        m.set(key, (m.get(key) || 0) + 1)
      }
    }
    const isThrough = (p, run) => (endSkelCount.get(tipKey(p))?.get(`${run.skelId}|${run.side}`) || 0) >= 2
    // [THRU-T ped] a genuine deg-3 T splits the through-street's frontage across
    // two tiles, so isThrough (2 same-skelId ends in ONE tile) can't fire — this
    // frozen set (shape pass) marks that ONE run-end as a through-continuation, so
    // the through-street runs straight past the mouth and the stem owns the corner.
    const thruNodeEndSet = st.thruNodeEnds instanceof Set ? st.thruNodeEnds : new Set(st.thruNodeEnds || [])
    const isThruNode = (p, run) => thruNodeEndSet.has(`${tipKey(p)}|${run.skelId}|${run.side}`)
    // [name-aware ADA gate] A run-end meeting a DIFFERENT-skelId run of the SAME
    // canonical road (continuesAs, frozen `roadId`) is a name-transition CONTINUATION
    // — the road flows straight through under a new name (SKELETON §5a, "the road is
    // the line, the name a label"). Suppress the corner bid + leg trim there: no
    // corner exists, so no phantom ADA ramp chops the continuous treelawn→sidewalk→LU
    // band on 18th/Dolman. Distinct from isThrough (the same-skelId [THRU] split) —
    // together they cover both continuations. [HANDOFF-curve-primitive-skeleton.md]
    const endRoad = new Map()        // tipKey(end) → [{ roadId, skelId }]
    for (const e of rr) {
      const last = e.run.poly[e.run.poly.length - 1]
      for (const p of [e.run.poly[0], last]) {
        const k = tipKey(p); let a = endRoad.get(k); if (!a) { a = []; endRoad.set(k, a) }
        a.push({ roadId: e.run.roadId, skelId: e.run.skelId })
      }
    }
    const isNameTransition = (p, run) => {
      if (run.roadId == null) return false
      const a = endRoad.get(tipKey(p)); if (!a) return false
      return a.some(o => o.roadId === run.roadId && o.skelId !== run.skelId)
    }
    // ── §3.3 step 2 · THE MONO-WIDTH BAND (sacrosanct — RIBBONS §3.9a) ──
    // ONE uniform outer depth per tile: WB = cw + max(TL) + max(SW) over the
    // tile's edges, floored at the frozen tile depths so an unauthored tile
    // reproduces the frozen geometry exactly. All per-edge variation below is
    // SLICING inside this band — the uniform offsets are never re-architected.
    // ⛔⛔ THE SEED IS A FLOOR, AND A REFUSED FIELD IS NOT A FLOOR OF NaN. Seeding from `tl`/`sw`
    // keeps an unauthored frozen tile byte-identical (that is what the floor is FOR), but on a
    // tile that REFUSES the pair the seed was `undefined` — and `e.tlD > undefined` is false for
    // every run, so the per-edge depths could never lift it. `iW = ringAt(NaN)` then offset the
    // band by NaN and the whole ribbon collapsed. ⭐ MEASURED on ①'s artifact: sidewalk
    // 7,731 → 68,505 m² and treelawn 7,620 → 60,774 m² from this line alone, and an authored
    // treelawn doubling went from Δ 0 m² to Δ +850 m² — i.e. THIS is what made the FILL look
    // unauthorable. No floor is invented where none was frozen: the runs supply every depth.
    let TLmax = pedFrozen ? tl : 0, SWmax = pedFrozen ? sw : 0
    for (const e of rr) { if (e.tlD > TLmax) TLmax = e.tlD; if (e.swD > SWmax) SWmax = e.swD }
    // Concentric ring at ped depth d off the frozen iA (cap-clamped, shared
    // join) — cached per distinct depth, so the default tile costs the same
    // three offsets as ever and an authored depth adds one. EVERY depth bound
    // below is one of these rings: the divider stays concentric to the frozen
    // curb (a slice of the band), never a centerline-datum slab edge.
    const offCache = new Map()
    const ringAt = (d) => {
      const key = Math.min(cw + d, cap)
      let r = offCache.get(key)
      if (!r) { r = offsetRings(iA, -key, bandJoin); offCache.set(key, r) }
      return r
    }
    const iC = ringAt(0)                  // curb inner (R+cw)
    const iW = ringAt(TLmax + SWmax)      // band inner (R+WB)
    const fullBand = differenceRings(iC, iW)   // the whole ribbon, cw → WB
    const SECTOR_D = TLmax + SWmax + 2    // sector slabs always out-reach the band
    // Single closed run (a loop interior): the strips are whole concentric
    // annuli at that one edge's depths — no corners, no slicing.
    const single = (runs.length === 1 && rr.length) ? rr[0] : null
    // G5 — ADA corner ramp (structural; live home SECTION §6, archeology _archive/RIBBONS-history §6.9): the corner IS the curb
    // ramp → an all-SW slice of the SAME fullBand from tangent to tangent;
    // treelawn lives only on the straight legs and ends at the tangents. Each
    // run is pulled back from its corner ends by (asphalt-hw + that corner's
    // resolved R) so its slabs end at the tangent; the uncovered corner wedge
    // becomes the bent pad below.
    const pieces = []        // leg strips: { mat, rings }
    // tipKey → the rr entry whose arrangement + width the BULB takes (the end
    // coupler's own cross-section). Populated only where a finger's two legs
    // disagree; the cap↔leg reconciliation below reads it.
    const capOwner = new Map()
    const luExtra = []       // authored-shallower band residual along legs → LU
    const cornerT = new Map()   // corner vertex → { p, T: max-adjacent ped total, trim }
    let bandRem = fullBand
    // [A10-③] THE PARTITION, IF THIS TILE CARRIES THE STAMP. The spans hand each
    // run its own arcs of the band and each corner its own; together they consume
    // the ring, so there is nothing left over to fall into land use.
    // A tile whose stamp is absent, or whose partition cannot be established, keeps
    // the old polyline-stroked construction — byte-identical, and still reported by
    // the A10 invariant, so a refusal can never read as a cure.
    const spansRaw = (!single && st.iaEdge && Array.isArray(st.iaEdge))
      ? (() => { const own = ringRunOwners(st); return own ? bandSpans(st, own) : null })()
      : null
    const partitioned = !!spansRaw?.length
    // The sweep must out-reach the band EVERYWHERE, including the miter the band's
    // own inner ring throws at a reflex vertex — which `offsetRings` bounds at
    // `miterLimit 2` × the offset depth (`:63`). So the reach is that same limit,
    // read off the same construction, not a number chosen to make a case pass.
    const spanD = 2 * Math.min(cw + TLmax + SWmax, cap) + 1
    const spanSgn = iA.map(r => signedArea(r) > 0 ? 1 : -1)
    const spanPoly = (s) => spanClaimPoly(iA[s.r], s.i0, s.len, iA[s.r].length, spanD, spanSgn[s.r])
    const runSpans = new Map()     // run index → its arcs' claims (filled after the bids)
    const cornerSpans = new Map()  // fillet → its arc's claim
    if (single) {
      const iMid = ringAt(single.o)
      const iWrun = ringAt(single.total)
      pieces.push({ mat: single.mat.outer, rings: differenceRings(iC, iMid) })
      pieces.push({ mat: single.mat.inner, rings: differenceRings(iMid, iWrun) })
      bandRem = differenceRings(iWrun, iW)   // authored-shallower residual → LU
    } else {
      // ── [DEAD-END PENDANT · per-side claim] ────────────────────────────────
      // The ribbon follows the chain up one side of a dead-end finger and back
      // down the other, so BOTH legs of a cul-de-sac are the SAME centerline,
      // differing only in `side`. Their claim sectors (strokeOpen, symmetric)
      // therefore cover the WHOLE finger each, and whichever group peels first
      // takes both sides — a flip authored on ONE leg repainted the entire
      // finger, cap included. Give each pendant leg a claim clipped to its OWN
      // side, ENDING AT THE SHOULDER: the bulb is not two halves, it is one
      // continuous semicircle carrying ONE arrangement — the cap's, as the end
      // COUPLER between the two legs (Jacob, 2026-07-22). So the bulb goes whole
      // to the cap owner below, and the coupler reconciles each leg at its
      // shoulder. Applied ONLY when the pair actually resolves differently: an
      // identical pair peels exactly as before → uniform caps byte-identical.
      const gkOf = (e) => `${e.o.toFixed(4)}|${e.total.toFixed(4)}|${e.mat.outer}|${e.mat.inner}`
      // The two legs of a finger meet AT THE TIP; away from it they diverge (each
      // runs to its own side of the mouth), so "shares the dead-end tip, same
      // chain, opposite side" is the pendant pair — not "shares both ends".
      const tipEndOf = (run) => {
        const last = run.poly[run.poly.length - 1]
        for (const p of [run.poly[0], last]) {
          const k = tipKey(p)
          if (roundTipKeys.has(k) || bluntTipKeys.has(k)) return k
        }
        return null
      }
      const sideClip = new Map()    // rr entry → its own-side claim, ending at the shoulder
      for (let i = 0; i < rr.length; i++) {
        for (let j = i + 1; j < rr.length; j++) {
          const a = rr[i], b = rr[j]
          if (a.run.side === b.run.side) continue
          if (!a.run.skelId || a.run.skelId !== b.run.skelId) continue
          const ta = tipEndOf(a.run)
          if (!ta || ta !== tipEndOf(b.run)) continue          // not the two legs of one finger
          if (gkOf(a) === gkOf(b)) continue                    // identical → old peel, byte-identical
          // Interior side: for a ring with positive signed area the face lies to
          // the LEFT of travel. The two legs traverse the ring in opposite
          // directions, so "left" resolves to opposite physical sides — which is
          // exactly the split we want.
          // Node-pair direction, not ring winding. `side` and traversal are ONE
          // fact (groupRuns takes poly in ring order; the frozen builder sets
          // forward = side==='right'), so a leg's frontage is always RIGHT of its
          // own poly travel — for 'right' because poly runs chain-forward, for
          // 'left' because poly runs reversed. The directed pair makes it a
          // constant; the winding flag was a coin-flip (measured 8 correct / 8
          // mirrored across LS's dead-ends).
          for (const e of [a, b]) sideClip.set(e, oneSideClaim(e.run.poly, e.aBase + cw + SECTOR_D, false))
          // The bulb takes ONE arrangement. With the two legs disagreeing, the
          // cap must inherit ONE of them: take the 'left' leg, the canonical
          // storage side the cap's own slot already uses (makeCapFe) — a stable,
          // stated choice rather than peel order. The operator overrides it by
          // flipping the cap, and the coupler slopes at whichever shoulder differs.
          capOwner.set(ta, a.run.side === 'left' ? a : b.run.side === 'left' ? b : a)
        }
      }
      // Group legs by identical (depths, materials) and peel ONCE per group —
      // a default tile has 1-2 groups (Y, N), so the live re-stroke costs what
      // the old uniform construction did; an authored depth adds one group.
      const groups = new Map()
      for (const e of rr) {
        const { run } = e
        const last = run.poly[run.poly.length - 1]
        const ends = [[run.poly[0], tipKey(run.poly[0])], [last, tipKey(last)]]
        // round OR blunt — both are dead-end tips, not junction corners (no
        // corner bid, no junction trim); the round-cap circle below stays
        // round-only (guarded by roundTipByKey.get).
        const tipped = ends.map(([, k]) => roundTipKeys.has(k) || bluntTipKeys.has(k))
        // §3.3 step 3 — corner depth = cw + MAX-ADJACENT: each non-tip run end
        // bids its own ped total at its corner vertex; the bent pad takes the
        // deeper of the two adjacent legs (SW↔SW corner → sidewalk-deep).
        const through = ends.map(([p]) => isThrough(p, run))
        // Per-leg corner input: the treelawn-OUTER depth (0 if the outer strip is
        // SW), used as the slide distance on a set-back leg. Reads the RESOLVED
        // material so per-edge strip flips carry through.
        const tloThis = e.mat.outer === 'LU' ? e.o : 0
        const nP = run.poly.length
        const legDirAt = (i) => { const a = i === 0 ? run.poly[0] : run.poly[nP - 1]; const b = i === 0 ? run.poly[1] : run.poly[nP - 2]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L] }
        // EXACT trim — the along-leg distance from the node to where the curb
        // fillet's TANGENT begins, so the leg strips end PRECISELY at the corner
        // arc (no cream step / green sliver). dot(tangent − node, legDir) reads the
        // frozen fillet directly; falls back to the e.a+R approximation only when
        // no fillet rounds this corner. Tips / through-continuations → 0.
        const tangentTrim = (p, dir) => {
          let best = null, bestD = Infinity
          for (const f of fillets) { const d = Math.hypot(f.apex[0] - p[0], f.apex[1] - p[1]); if (d < bestD) { bestD = d; best = f } }
          if (!best || bestD > best.r + e.a + 4) return e.a + nearestVertR(p, ring, vertR)
          const proj = (t) => (t[0] - p[0]) * dir[0] + (t[1] - p[1]) * dir[1]
          return Math.max(0, Math.max(proj(best.tA), proj(best.tB)))
        }
        // A run with NO asphalt owns its arc but bids NO corner: there is no curb
        // ramp where there is no curb, and a zero-depth leg entering the corner would
        // drag Idea A's cMin to 0 and paint the whole pad LU. It DOES still trim at
        // its ends like any other leg, so the corner ribbon takes over there exactly
        // as §6.9.4 intends and the neighbouring corner keeps its pad — the rim's
        // slab must not reach into an arc that is not its own.
        const legTrim = ends.map(([p], i) => (tipped[i] || through[i] || isNameTransition(p, run) || isThruNode(p, run)) ? 0 : tangentTrim(p, legDirAt(i)))
        ends.forEach(([p, k], i) => {
          const suppressed = e.noPed || tipped[i] || through[i] || isNameTransition(p, run) || isThruNode(p, run)
          // conD = how deep the ramp CONCRETE runs before LU on this leg: a
          // set-back sidewalk (mat.inner === 'SW', a treelawn-Y leg) → the full
          // total; a curb-side sidewalk (SW leg) → its one strip width.
          const conD = e.mat.inner === 'SW' ? e.total : e.o
          const leg = { dir: legDirAt(i), tlo: tloThis, conD }
          // ⭐⭐ [A7] ONE FLAG WAS DOING TWO JOBS. These five predicates legitimately
          // stop an end from MINTING a corner — that is A2's cure for the FALSE
          // corner a through-run bids against a stem. They were also stopping the
          // end from being a LEG of a corner some OTHER run minted, which was never
          // intended and is the defect: the corner then has `legs.length === 1`, so
          // the whole Idea A block below is skipped — no concentric arc at `cMin`,
          // and no RAMP sliding the deeper leg's walk to the curb. The missing ramp
          // IS the hard step the operator sees, and only on the suppressed side.
          // Measured at Jacob's marked corner (Dolman × Carroll, 2026-08-11):
          // `dolman-street-1|left|3` and `|4` both suppressed by `through`, both with
          // `pavementHW 5.49` — a leg dropped where the curb is perfectly good, while
          // the same corner on the neighbouring tile kept both legs and looked right.
          // ⛔ `noPed` stays excluded and is a different case: that is the RIM (A15,
          // skelId null, 34/34 set-identical with the no-asphalt set), where there
          // genuinely is no curb, so there is no ramp to build against.
          if (suppressed) return
          const prev = cornerT.get(k)
          if (!prev) cornerT.set(k, { p, T: e.total, trim: legTrim[i], legs: [leg] })
          else { if (e.total > prev.T) prev.T = e.total; if (legTrim[i] > prev.trim) prev.trim = legTrim[i]; prev.legs.push(leg) }
          // CORNER_DUMP: remember WHICH runs met here. Inert — nothing below reads it.
          if (cornerDump.on) { const c = cornerT.get(k); (c.dbg || (c.dbg = [])).push(`${run.skelId}|${run.side}|${run.segOrd}`) }
        })
        // [A10-③] On a partitioned tile the claim is not built here: it is each
        // run's own ARCS of the frozen curb, assembled after this loop (the corner
        // spans need the bids above to know which fillets are corners at all).
        if (partitioned) continue
        let t0 = legTrim[0]
        let t1 = legTrim[1]
        // [DEAD-END MOUTH WRAP] Trim the THROUGH-road run back from a dead-end mouth
        // by the mouth disc radius, so its wide leg-sector stops short of the spur's
        // corner wedge (freeing bandRem). Only the through road (NOT the spur whose
        // skelId owns the mouth); only the end that sits at the mouth node; bounded by
        // the per-mouth disc R so it stays local. The spur's own corner pad then fills
        // the freed wedge at each of its two (now distinct) fillet apexes.
        if (mouths.length) {
          for (const ix of [0, 1]) {
            const end = ix === 0 ? run.poly[0] : run.poly[run.poly.length - 1]
            const m = mouths.find(mm => mm.spurSkel !== run.skelId && Math.hypot(end[0] - mm.mid[0], end[1] - mm.mid[1]) < 1)
            if (m) { if (ix === 0) t0 = Math.max(t0, m.R); else t1 = Math.max(t1, m.R) }
          }
        }
        const poly = trimPolyline(run.poly, t0, t1)
        if (!poly || poly.length < 2) continue
        // This leg's claim SECTOR: a constant-depth slab (butt-capped at the
        // tangents, same construction as the asphalt strokes) that out-reaches
        // the band. The depth split inside the claim uses the CONCENTRIC rings
        // (ringAt) — the divider is a slice of the band at cw + this edge's
        // outer depth, the §3.3 per-edge divider inside the mono-width.
        let sector = strokeOpen(poly, e.aBase + cw + SECTOR_D)
        // [DEAD-END PENDANT] Clip this leg's claim to its own side of the finger,
        // ending at the shoulder (see the pairing above). Absent for every
        // non-pendant leg → unchanged. Done BEFORE the cap disk is added, because
        // the disk is the BULB and the bulb is not clipped by side.
        const clip = sideClip.get(e)
        if (clip) {
          sector = intersectRings(sector, clip)
          if (!sector.length) continue
        }
        // A ROUND dead-end cap is NOT an ADA corner: the ped wraps the cap (iA
        // is the cap disk there, so the concentric rings follow it). The disk
        // just extends this leg's claim around the cap; the depths stay rings.
        // When the two legs disagree the bulb is NOT split between them — it goes
        // WHOLE to the cap owner, one continuous semicircle with one arrangement.
        ends.forEach(([p, k], i) => {
          if (!tipped[i]) return
          const t = roundTipByKey.get(k)
          if (!t) return
          const owner = capOwner.get(k)
          if (owner && owner !== e) return          // the bulb belongs to the other leg's arrangement
          { const C = capCentre(t); sector.push(circlePoly(C[0], C[1], t.hw + cw + SECTOR_D)) }
        })
        if (!sector.length) continue
        const gk = gkOf(e)
        let g = groups.get(gk)
        if (!g) { g = { o: e.o, inn: e.inn, total: e.total, mat: e.mat, hasTL: e.hasTL, sectors: [] }; groups.set(gk, g) }
        g.sectors.push(...sector)
      }
      // ── [A10-③] THE PARTITION PATH · assemble the claims from the ARCS ────────
      // Each span painted by its own owner. A fillet arc is a CORNER only where a
      // corner actually bid (the same pairing the corner pass makes below); at a
      // name-transition or a through-continuation no corner exists, so the arc
      // belongs to the run the stamp gives it and the band flows straight through
      // — which is what the doctrine says happens there.
      if (partitioned) {
        const byIdx = new Map(rr.map(e => [e.ri, e]))
        // The SAME pairing the corner pass makes below — each corner takes its
        // nearest fillet — so a fillet cannot be a corner here and a leg there.
        const cornerFillet = new Map()
        for (const [, c] of cornerT) {
          let bf = null, bd = Infinity
          for (const f of fillets) { const d = Math.hypot(f.apex[0] - c.p[0], f.apex[1] - c.p[1]); if (d < bd) { bd = d; bf = f } }
          if (bf && bd <= bf.r + c.trim + 1) cornerFillet.set(bf, c)
        }
        for (const s of spansRaw) {
          const corner = s.fillet ? cornerFillet.get(s.fillet) : null
          const poly = spanPoly(s)
          if (!poly.length) continue
          if (corner) { cornerSpans.set(s.fillet, poly); continue }
          const e = byIdx.get(s.owner)
          if (!e) continue                       // an owner index with no resolved run: refuse the arc rather than guess an owner — the invariant still reports it
          const a = runSpans.get(s.owner) || []
          a.push(...poly)
          runSpans.set(s.owner, a)
        }
        // [THE BULB HAS NO HALVES] The stamp splits a cul-de-sac's cap arc between
        // the two legs that produced it. Where the pair resolves DIFFERENTLY the
        // bulb goes WHOLE to the cap owner (SECTION §6.3, Jacob 2026-07-22) — the
        // other leg hands its half over inside the frozen cap's own curb radius.
        // Every uniform cap leaves `capOwner` empty, so nothing happens here.
        for (const [k, ownerE] of capOwner) {
          const t = roundTipByKey.get(k)
          if (!t) continue
          const disk = [circlePoly(capCentre(t)[0], capCentre(t)[1], t.hw + cw)]
          for (const e of rr) {
            if (e === ownerE || e.run.skelId !== ownerE.run.skelId) continue
            const mine = runSpans.get(e.ri)
            if (!mine?.length) continue
            const handed = intersectRings(mine, disk)
            runSpans.set(e.ri, differenceRings(mine, disk))
            if (handed.length) runSpans.set(ownerE.ri, unionRings([...(runSpans.get(ownerE.ri) || []), ...handed]))
          }
        }
        for (const e of rr) {
          const sector = runSpans.get(e.ri)
          if (!sector?.length) continue
          const gk = gkOf(e)
          let g = groups.get(gk)
          if (!g) { g = { o: e.o, inn: e.inn, total: e.total, mat: e.mat, hasTL: e.hasTL, sectors: [] }; groups.set(gk, g) }
          g.sectors.push(...sector)
        }
      }
      // Peel treelawn-Y groups first (rr is Y-sorted, but make it explicit):
      // where two legs' sectors graze near a corner the treelawn claims the
      // overlap — the grass ends at its tangent, the walk yields.
      const ordered = [...groups.values()].sort((x, y) => (y.hasTL ? 1 : 0) - (x.hasTL ? 1 : 0) || y.total - x.total)
      for (const g of ordered) {
        const claim = intersectRings(bandRem, g.sectors)
        bandRem = differenceRings(bandRem, g.sectors)
        if (!claim.length) continue
        const oRing = ringAt(g.o)        // divider at this group's outer depth
        const wRing = ringAt(g.total)    // this group's band inner
        const outerStrip = g.o > 1e-6 ? differenceRings(claim, oRing) : []
        const innerStrip = g.inn > 1e-6 ? differenceRings(intersectRings(claim, oRing), wRing) : []
        // [CAP FLIP] Within a flipped cap's disk, SWAP this strip's material to the
        // OTHER strip's (grass↔walk) — same rings, only the label swaps, so the flip
        // ALWAYS reads as a change (no dependence on the default arrangement) and
        // conserves area. An unflipped tile (empty capFlip → fast path) is
        // byte-identical. flipMat = the other strip's material for the swap.
        const emitStrip = (strip, legMat, flipMat) => {
          if (!strip.length) return
          if (!capFlip.size) { pieces.push({ mat: legMat, rings: strip }); return }
          let rest = strip
          for (const cap of capFlip.values()) {
            const inDisk = intersectRings(rest, capSemi(cap))   // SEMICIRCLE, not full disk
            if (inDisk.length) { pieces.push({ mat: flipMat, rings: inDisk }); rest = differenceRings(rest, inDisk) }
            if (!rest.length) break
          }
          if (rest.length) pieces.push({ mat: legMat, rings: rest })
        }
        emitStrip(outerStrip, g.mat.outer, g.mat.inner)
        emitStrip(innerStrip, g.mat.inner, g.mat.outer)
        // deeper-than-this-group's-total band within the claim → LU (the §3.1
        // remainder flows to the block center; no hard property line)
        if (g.total < TLmax + SWmax - 1e-9) luExtra.push(...intersectRings(claim, wRing))
      }
    }
    // [DEAD-END MOUTH WRAP — corner INTEGRATION] At a normal corner two legs meet
    // and the deeper (set-back) leg's walk SLIDES to the curb over a ramp on its own
    // leg (Idea A, below). At a dead-end mouth the spur's two snapped run-ends each
    // form a one-leg cornerT (the through road is suppressed as a through-node, line
    // ~1057), so legs.length===1 and the slide never fires — the spur's set-back walk
    // butts the corner pad with a step. FIX: give each mouth corner its SECOND leg —
    // the through road's straight leg on that corner's side — so the SAME Idea-A slide
    // builds. The through leg is curb-side here (its dir points up the straight road,
    // away from the corner); conD/tlo come from its resolved rr entry. FILL-only: no
    // face/curb change. Gated implicitly by mouths (opts.deadEndMouthWrap).
    for (const m of mouths) {
      if (!m.dir || (!m.apexA && !m.apexB)) continue   // 1-apex mouths carry apexB=null (Piece 1)
      const sideOf = (p) => { const cx = p[0] - m.mid[0], cy = p[1] - m.mid[1]; return (m.dir[0] * cy - m.dir[1] * cx) >= 0 ? 'left' : 'right' }
      for (const apex of [m.apexA, m.apexB].filter(Boolean)) {
        const k = tipKey(apex)
        const c = cornerT.get(k)
        if (!c || (c.legs && c.legs.length >= 2)) continue   // only the snapped 1-leg mouth corner
        const apexSide = sideOf(apex)
        // find the through run-end at the mouth node M, on this apex's side
        let best = null, bestD = Infinity
        for (const e of rr) {
          const { run } = e
          if (run.skelId === m.spurSkel) continue
          for (const ix of [0, run.poly.length - 1]) {
            const end = run.poly[ix]
            if (Math.hypot(end[0] - m.mid[0], end[1] - m.mid[1]) >= 1) continue
            const nb = run.poly[ix === 0 ? 1 : run.poly.length - 2]
            if (!nb) continue
            if (sideOf(nb) !== apexSide) continue   // the through segment continuing on this corner's side
            const dx = nb[0] - m.mid[0], dy = nb[1] - m.mid[1], L = Math.hypot(dx, dy) || 1
            // conD/tlo as in the cornerT bid (line ~1061): set-back SW → total, curb-side SW → outer strip
            const conD = e.mat.inner === 'SW' ? e.total : e.o
            const tlo = e.mat.outer === 'LU' ? e.o : 0
            const d = Math.hypot(end[0] - apex[0], end[1] - apex[1])
            if (d < bestD) { bestD = d; best = { dir: [dx / L, dy / L], tlo, conD } }
          }
        }
        if (best) c.legs.push(best)
      }
    }
    // ── §3.3 steps 3+4 · the bent corner = a SLICE of the fullBand ──
    // Never a constructed primitive: the pad is the un-zoned band, bent around
    // the curb arc as an annular SECTOR (RIBBONS §3.9a step 10) — outer edge the
    // curb arc, inner edge its concentric offset, sides the two tangent radii —
    // bounded inward at the deeper adjacent leg's total (cw + c.T), so an SW↔SW
    // corner comes out sidewalk-deep and a TL-adjacent corner full-depth. The
    // arc comes from the FROZEN fillet the curb actually rounded here; a corner
    // with no fillet (R=0 / sharp) has no arc to bend — the legs meet at a miter.
    // ⛔⛔ [A7] THE DRAIN IS REVERTED — 2026-08-11, on Jacob's eye: "that only ruined
    // the opposite corner." It poured the suppressed legs into `cornerT.get(k)`, and
    // ⭐ `cornerT` IS KEYED BY NODE COORDINATE, not by corner. A tile's ring can visit
    // one node SEVERAL TIMES — LS tile 10 visits Dolman × Carroll at ring indices 6, 8
    // AND 10 — so three geometrically distinct corners collapse into ONE entry, and
    // with `legs` capped at 2 a leg from one quadrant takes the slot that shapes
    // another. The fix made that pre-existing collapse VISIBLE by feeding it more legs.
    // ⭐⭐ THE REAL DEFECT IS THE KEY: a corner is a RING POSITION, and keying it by the
    // coordinate two runs happen to share is node-thinking — `A15`'s stink, one level
    // in. Re-land this only on a per-corner-instance key. *(The `cMin` half below is
    // independent of all this and STAYS — it is what took `built-empty-concrete` 6 → 0.)*
    const sectorDepth = cw + TLmax + SWmax + 2   // the sector inner clears the band bottom (iW)
    let cornerPad = []
    const cornerTreelawn = []   // corner LU strips (SW↔SW inner) + ramp wedges → tlByLu[lu]
    const swCarve = []          // Idea A — LU wedges to carve from the deep leg's SW strip
    // CORNER_DUMP: the TILE-level gate. Every corner that bid here declines together.
    if (cornerDump.on && cornerT.size && !(bandRem.length && fillets.length)) {
      const why = [!bandRem.length && 'bandRem-empty', !fillets.length && 'no-fillets'].filter(Boolean).join('+')
      for (const [ck, c] of cornerT) cornerDump.rows.push({ k: ck, p: c.p, T: c.T, skel: c.dbg || [], legs: c.legs?.length ?? 0, reason: `tile-gate:${why}` })
    }
    if (bandRem.length && cornerT.size && fillets.length) {
      const shallowByT = new Map()   // distinct depth → band region above it (one offset per depth)
      for (const [ck, c] of cornerT) {
        const dump = (reason, extra) => { if (cornerDump.on) cornerDump.rows.push({ k: ck, p: c.p, T: c.T, skel: c.dbg || [], legs: c.legs?.length ?? 0, reason, ...extra }) }
        if (c.T <= 1e-6) { dump('zero-depth'); continue }
        // Pair this corner with the arc the curb rounded here (nearest fillet
        // apex → the sharp node). No nearby fillet ⇒ a sharp R=0 corner: skip,
        // the legs already meet at the miter with no wedge to slice.
        let best = null, bestD = Infinity
        for (const f of fillets) { const d = Math.hypot(f.apex[0] - c.p[0], f.apex[1] - c.p[1]); if (d < bestD) { bestD = d; best = f } }
        if (!best || bestD > best.r + c.trim + 1) { dump('no-fillet-in-range', { bestD: best ? +bestD.toFixed(3) : null, tol: best ? +(best.r + c.trim + 1).toFixed(3) : null }); continue }
        // [A10-③] On a partitioned tile the corner OWNS ITS ARC, so the takeover is
        // not a bid: the legs already stopped at this arc's two tangents and nothing
        // else can claim it. Step over and step back are the same cut.
        const ownArc = partitioned ? cornerSpans.get(best) : null
        let shallow = shallowByT.get(c.T)
        if (!shallow) {
          shallow = (c.T >= TLmax + SWmax - 1e-9)
            ? bandRem
            : differenceRings(bandRem, ringAt(c.T))
          shallowByT.set(c.T, shallow)
        }
        // margin = c.trim (asphalt-hw + R) extends the sector up each leg to the
        // leg slab's pulled-back end, closing the leg↔corner seam (the LU notch).
        const sector = ownArc || [arcSectorPoly(best.C, best.r, best.tA, best.tB, sectorDepth, c.trim)]
        const pad = intersectRings(shallow, sector)
        // The corner's own band DEEPER than its max-adjacent total is the same
        // authored-shallower residual a leg routes to LU (`luExtra`) — on the
        // partition path the corner owns that ground, so it must route it too or
        // it reads as this ticket's defect. Genuine default: c.T is the envelope,
        // so this is empty.
        if (ownArc && c.T < TLmax + SWmax - 1e-9) luExtra.push(...intersectRings(intersectRings(sector, bandRem), ringAt(c.T)))
        // A FOURTH decline the brief's three gates do not name: the sector met the
        // band but their intersection is empty (the band above c.T is already fully
        // claimed by the leg strips here, or the sector missed bandRem entirely).
        if (!pad.length) { dump('empty-pad'); continue }
        // ── Idea A: CONCENTRIC arc at the shallow (ADA) depth; ramp the deep leg ──
        // The corner arc is a clean concentric ring at cMin = min(both legs'
        // concrete depths). The DEEPER leg's set-back sidewalk SLIDES to the curb
        // over a short ramp on its own straight leg (the treelawn tapering out, the
        // walk's deep tail becoming parcel) — so the arc reads concentric and the
        // transition lives on the leg, where a real curb ramp puts it.
        let concrete = pad, luInner = []
        if (c.legs?.length === 2) {
          const ap = best.apex
          const dot = (u, v) => u[0] * v[0] + u[1] * v[1]
          const aFirst = dot(c.legs[0].dir, [best.tA[0] - ap[0], best.tA[1] - ap[1]]) >= dot(c.legs[1].dir, [best.tA[0] - ap[0], best.tA[1] - ap[1]])
          const legA = aFirst ? c.legs[0] : c.legs[1]      // the tA leg
          const legB = aFirst ? c.legs[1] : c.legs[0]      // the tB leg
          // ⭐⭐ [A7 · JACOB'S RULE, 2026-08-11] "We can build the corner there; ALL LU
          // only happens if there are no sidewalks from either side." So the depth
          // vote is taken over the legs that actually CARRY concrete: a leg with no
          // sidewalk does not drag `cMin` to 0 and paint the whole pad LU — it simply
          // does not vote. Only when NEITHER leg carries concrete is the pad all-LU.
          // ⛔ This is a MATERIAL state, never an absence: the mono-width ribbon is
          // still there at full width on that leg (`SECTION §3.3`, two strips always,
          // EQUAL width — swap, not collapse). Modelling it as zero depth would encode
          // an authoring state as missing geometry — `project_a_sentinel_is_not_a_value`.
          const conc = [legA.conD, legB.conD].filter(d => d > 1e-6)
          const cMin = conc.length ? Math.min(...conc) : 0
          // concentric ring at cMin → the arc is a constant-offset band
          if (cMin < c.T - 1e-6) {
            const ring = ringAt(cMin)
            concrete = differenceRings(pad, ring)
            luInner = intersectRings(pad, ring)
          }
          // slide the deeper leg's walk to the curb over a ramp on that leg
          const deep = legA.conD >= legB.conD ? legA : legB
          const T = legA.conD >= legB.conD ? best.tA : best.tB
          if (deep.conD > cMin + 1e-6) {
            const perp = (() => { const dx = best.C[0] - T[0], dy = best.C[1] - T[1]; const L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L] })()
            const dir = deep.dir
            const tloD = deep.tlo                           // treelawn width on the deep leg (the slide distance)
            const conMax = deep.conD
            const rampLen = Math.max(2, (conMax - cMin) * 2)
            const pt = (s, d) => [T[0] + dir[0] * s + perp[0] * (cw + d), T[1] + dir[1] * s + perp[1] * (cw + d)]
            // the slid walk: [0,cMin] at the tangent → [tloD,conMax] up the leg (concrete, covers the tapering treelawn)
            const slidQuad = [pt(0, 0), pt(rampLen, tloD), pt(rampLen, conMax), pt(0, cMin)]
            cornerPad.push(...intersectRings(fullBand, [slidQuad]))
            // the walk's deep tail near the tangent → LU (carved from the SW strip below)
            const luWedge = [pt(0, cMin), pt(0, conMax), pt(rampLen, conMax)]
            const w = intersectRings(fullBand, [luWedge])
            if (w.length) { cornerTreelawn.push(...w); swCarve.push(...w) }
          }
        }
        cornerPad.push(...concrete)
        if (luInner.length) cornerTreelawn.push(...luInner)   // inner LU → parcel-matched (tlByLu[lu])
        // BUILT — but `concrete` can still be empty (the whole pad went to luInner),
        // which is a takeover honoured in name only. Kept as its own row, never
        // folded into BUILT.
        dump(concrete.length ? 'BUILT' : 'built-empty-concrete', { rings: concrete.length })
      }
    }
    // Whatever the legs + pads didn't claim flows to LU — the remainder runs
    // curb → block-center (§3.3: no hard property line; both-strips-LU = open
    // field falls out for free).
    // ⚠️ The corner TREELAWN (cornerTreelawn — luInner + the slid-walk's luWedge)
    // is pad-derived and pushed to tlByLu, but it is NOT peeled from bandRem the
    // way the leg strips are (only the leg sectors and cornerPad leave bandRem).
    // So it must be subtracted here too, else that ground is owned by BOTH the
    // treelawn AND this remainder — the tl∩lu corner co-claim (1091 m² map-wide,
    // 78% of the total; measured scratch/coclaim-by-pair.mjs). This completes the
    // comment's own contract: "whatever the legs + pads didn't claim". [Seal 2026-07-23]
    const cornerClaimed = cornerTreelawn.length ? unionRings([...cornerPad, ...cornerTreelawn]) : cornerPad
    let luRemainder = unionRings([...iW, ...luExtra, ...differenceRings(bandRem, cornerClaimed)])
    // G8 — at a blunt/none dead-end the street just ends FLAT. The side
    // treelawn/sidewalk run TO the end (the concentric rings already follow the
    // blunt cap in iA), and the band caps flat across the end. The earlier
    // full-width tip-DISK subtraction was wrong (Jacob 2026-06-11): it scooped a
    // circular bite out of the SIDE bands, leaving them pointy + short of the end.
    // Nothing to subtract — the bands run to the end by construction.
    // G8 round-tip cleanup — a cul-de-sac cap is road + ped wrap, NEVER land use.
    // The zero-width pendant spur leaves a thin LU sliver up the stub centerline
    // that pokes into the cap; reclaim it. But reclaim ONLY the sliver INSIDE the
    // ped band (within iC), NOT the LU beyond the band — the old cap-radius reclaim
    // (hw+cw+tl+sw+1) swept the legitimate beyond-band LU into the sidewalk too,
    // ballooning the bulb into a fat all-sidewalk pad (Jacob 2026-06-11). Clipping
    // the reclaim to fullBand keeps the wrap at the regular treelawn+sidewalk width.
    // [Piece 2 — STRIP-AWARE G8 reclaim] The reclaimed cap sliver is ped WRAP, not
    // land use — but its MATERIAL should honor the cap-owning run's outer strip the
    // same as normal frontage: a treelawn-Y dead-end (outer === 'LU') wraps its cap
    // in GRASS/LU, a treelawn-N one (outer === 'SW') in concrete/SW. Done per-tip so
    // an ASYMMETRIC cap (one side LU, one side SW — e.g. henrietta/south-13th) splits
    // the sliver by the cap axis, routing each half to its own side's material. An
    // all-SW cap routes the whole sliver to cornerPad EXACTLY as before → the 27
    // all-concrete caps stay byte-identical; only the 20 treelawn-Y caps change.
    if (roundTips.length) {
      for (const t of roundTips) {
        const cap0 = circlePoly(capCentre(t)[0], capCentre(t)[1], t.hw + cw + t.tl + t.sw + 1)
        const stray = intersectRings(intersectRings(luRemainder, [cap0]), fullBand)
        if (!stray.length) continue
        luRemainder = differenceRings(luRemainder, stray)
        // [CAP FLIP] A flipped round cap SWAPS grass↔walk; the reclaimed sliver
        // inverts with the strips so the wrap stays one consistent material.
        const capFlipped = capFlip.has(tipKey(t.p))
        const inv = (m) => capFlipped ? (m === 'LU' ? 'SW' : 'LU') : m
        const routeMat = (rings, mat) => { if (!rings.length) return; if (inv(mat) === 'LU') pushLu(tlByLu, lu, rings); else cornerPad = unionRings([...cornerPad, ...rings]) }
        // cap-owning runs (a side-run whose poly end sits at the tip) + their outer
        // strip material + into-tile axis (body→tip). hasTL ⇒ outer is LU (grass).
        // The two side-runs run PARALLEL up the stub to the tip, so their body→tip
        // vectors are ~identical (the cap AXIS). They differ by which SIDE of that
        // axis their curb line sits — classify each owner by the perpendicular
        // offset of its body point from the axis line through the tip.
        let axis = null
        const owners = []
        for (const run of runs) {
          const nP = run.poly.length
          for (const ix of [0, nP - 1]) {
            if (Math.hypot(run.poly[ix][0] - t.p[0], run.poly[ix][1] - t.p[1]) >= 1.5) continue
            const ped = resolvePedDepths(run.baseMeasure, run.side, runCustom(run))
            const outer = ped.hasTL ? stripMat.outer : stripMat.inner   // 'LU' (grass) / 'SW'
            const body = run.poly[ix === 0 ? 1 : nP - 2]
            if (body && !axis) { const dx = t.p[0] - body[0], dy = t.p[1] - body[1], L = Math.hypot(dx, dy) || 1; axis = [dx / L, dy / L] }
            owners.push({ outer, body })
          }
        }
        const anyLU = owners.some(o => o.outer === 'LU')
        const anySW = owners.some(o => o.outer === 'SW')
        if (!anyLU) {
          // all concrete (or no resolvable owner) → the sliver is SW (inverted → grass if flipped).
          routeMat(stray, 'SW')
        } else if (!anySW) {
          // all treelawn-Y → the whole cap wrap is grass (inverted → SW if flipped).
          routeMat(stray, 'LU')
        } else if (axis) {
          // ASYMMETRIC cap → split the sliver by the cap axis (a half-plane through
          // the tip). The LEFT half is the side where cross(axis, p−tip) >= 0; route
          // each half to the material of the owner whose body sits on that side.
          const perp = [-axis[1], axis[0]]   // points toward the LEFT half
          const BIG = 1e4
          const halfLeft = [
            [t.p[0] + axis[0] * BIG, t.p[1] + axis[1] * BIG],
            [t.p[0] - axis[0] * BIG, t.p[1] - axis[1] * BIG],
            [t.p[0] - axis[0] * BIG + perp[0] * BIG, t.p[1] - axis[1] * BIG + perp[1] * BIG],
            [t.p[0] + axis[0] * BIG + perp[0] * BIG, t.p[1] + axis[1] * BIG + perp[1] * BIG],
          ]
          const sideOf = (o) => { if (!o.body) return null; const cx = o.body[0] - t.p[0], cy = o.body[1] - t.p[1]; return (axis[0] * cy - axis[1] * cx) >= 0 ? 'left' : 'right' }
          const leftOwner = owners.find(o => sideOf(o) === 'left')
          const rightOwner = owners.find(o => sideOf(o) === 'right')
          const leftStray = intersectRings(stray, [halfLeft])
          const rightStray = differenceRings(stray, [halfLeft])
          const leftMat = leftOwner ? leftOwner.outer : (rightOwner ? (rightOwner.outer === 'LU' ? 'SW' : 'LU') : 'SW')
          const rightMat = rightOwner ? rightOwner.outer : (leftMat === 'LU' ? 'SW' : 'LU')
          routeMat(leftStray, leftMat)
          routeMat(rightStray, rightMat)
        } else {
          // mixed but no axis (degenerate) → fall back to grass (treelawn present).
          routeMat(stray, 'LU')
        }
      }
    }
    // Route the leg strips by their per-edge materials ('LU' → the tile's
    // land-use colour, 'SW' → the sidewalk material); the corner pad is always
    // SW (the ADA ramp — structural, regardless of leg ordering/overrides).
    for (const pc of pieces) {
      if (!pc.rings.length) continue
      if (pc.mat === 'SW' && swCarve.length) pc.rings = differenceRings(pc.rings, swCarve)   // Idea A — the deep walk's tail slid to LU
      if (!pc.rings.length) continue
      if (pc.mat === 'SW') Wacc.push(...pc.rings)
      // SECTION §6.1 s2/s3: the leg TREELAWN ends at its true tangent — the corner
      // concrete pad's leg-ward side IS the tangent radius (C→tA ⊥ the leg), so
      // clipping the treelawn against cornerPad trims it to exactly there. This is
      // tangentTrim's own contract ("no cream step / green sliver") completed for
      // the deeper strip. The ADA pad stays WHOLE (street-edge always concrete);
      // treelawn YIELDS, never wraps the curb — the reverted §6.2 "wrap" (route
      // concrete → cornerTreelawn) is NOT taken. [Seal 2026-07-23]
      else pushLu(tlByLu, lu, cornerPad.length ? differenceRings(pc.rings, cornerPad) : pc.rings)
    }
    Wacc.push(...cornerPad)
    if (cornerTreelawn.length) pushLu(tlByLu, lu, cornerTreelawn)   // PROTOTYPE C — tapered corner treelawn
    // ── [THE END COUPLER — the cap reconciles its two legs] ───────────────────
    // The cap is one continuous semicircle carrying ONE cross-section, and it
    // COUPLES two legs that may differ in BOTH ways: which strip the walk sits in
    // (SW↔TL parity) and how WIDE the band is. Its job is to make that meet — so
    // at each shoulder, if the cap's cross-section differs from that leg's, the
    // bands BEND across a short transition down the leg. The SIDEWALK must stay
    // CONTIGUOUS through it (it is the ADA walk path, it cannot break): the walk
    // is one unbroken band easing from its slot on the cap into its slot on the
    // leg, the treelawn fills the complement, and the band's total depth tapers
    // alongside. No mitre, no hard step. Fires ONLY on a real difference — a cap
    // that inherits its leg has none, so uniform caps stay byte-identical.
    if (fullBand.length) {
      for (const cap of capCouplers.values()) {
        if (!cap.axis) continue
        // ⛔ TWO DIFFERENT POINTS, and conflating them breaks the leg match:
        // `tip` is the bulb's CENTRE (the geometric frame — both shoulders sit
        // `hw` from it), `node` is the chain's tip vertex (what a run's polyline
        // endpoint actually equals). On an asymmetric cap they are up to
        // |left − right| / 2 apart — 2.10 m at nicholson-place.
        const tip = cap.c, node = cap.p, hw = cap.hw, a = cap.axis
        // EACH SHOULDER IS SERVED BY ITS OWN LEG. An asymmetric cap builds
        // differently on its two sides, so one owner run cannot describe both —
        // reading a single owner was what made the asymmetric case unbuildable.
        // The legs leave the tip almost parallel but diverge toward the mouth, so
        // classify each by the sign of its body's offset across the cap axis.
        // ⚠️ MEASURED 2026-08-12 AND STILL TRUE OF THIS CLASSIFIER: on a pendant
        // the two legs ARE one centreline, so `poly[1]` and `poly[nP-2]` return
        // the SAME node, both offsets are equal, and the tie-break below hands
        // the same leg to both shoulders — 11 of LS's 39 caps. Left standing
        // deliberately: with the bulb correctly centred both shoulders are
        // equidistant, so measure whether this still decides anything before
        // rewriting it. `scratch/tessel-coupler-trace.mjs` is the instrument.
        const perp0 = [-a[1], a[0]]
        const bodyOf = (run) => {
          const nP = run.poly.length
          if (Math.hypot(run.poly[0][0] - node[0], run.poly[0][1] - node[1]) < 1.5) return run.poly[1]
          if (Math.hypot(run.poly[nP - 1][0] - node[0], run.poly[nP - 1][1] - node[1]) < 1.5) return run.poly[nP - 2]
          return null
        }
        const owners = []
        for (const e of rr) {
          const b = bodyOf(e.run)
          if (b) owners.push({ e, off: (b[0] - node[0]) * perp0[0] + (b[1] - node[1]) * perp0[1] })
        }
        if (!owners.length) continue
        for (const sign of [1, -1]) {
          const p = [sign * -a[1], sign * a[0]]   // toward this shoulder's leg + its band
          let pick = null
          for (const o of owners) { const s = o.off * sign; if (!pick || s > pick.s) pick = { e: o.e, s } }
          const e = pick.e
          // The CAP's own cross-section: the leg it inherits (itself, when the two
          // legs agree), swapped if the cap is flipped. This is the coupler's end
          // of the joint; `e` is the leg's end.
          const capE = capOwner.get(tipKey(tip)) || e
          const capWalkOuter = (capE.mat.outer === 'SW') !== cap.flipped
          const legWalkOuter = e.mat.outer === 'SW'
          const legTotal = e.total, capTotal = capE.total
          if (legTotal <= 1e-6 || capTotal <= 1e-6) continue
          // ⛔⛔ EVERY SHOULDER GETS A RAMP — the SAME regime as the corner, and Jacob says so:
          // "This same regime applies to end caps." *(2026-09-07, immediately after ruling "every
          // corner gets a joiner/ramp… sometimes that means it's subsumed.")*
          // ⭐ Equal parity AND equal width ⇒ the walk's two slots coincide and the depth taper has
          // zero travel ⇒ the transition is ZERO-LENGTH and draws nothing. It is SUBSUMED, exactly
          // as SW↔SW is at a corner — an OUTCOME, not a branch.
          // ⛔ WHAT THIS LINE USED TO BE: "fires ONLY on a real difference" (`SECTION §6.3`), which
          // is the identical guard shape struck at the corner in `47694f7e` — a transition made
          // CONDITIONAL on the thing it exists for.
          // ⚠️ KEPT AS A CHEAP SKIP AND DOCUMENTED AS NOT A DECISION. Removing it entirely was
          // measured a geometric NO-OP (uniform caps stay byte-identical, which is what "subsumed"
          // predicts); it stays only to avoid the work, and the construction is correct without it.
          if (legWalkOuter === capWalkOuter && Math.abs(legTotal - capTotal) < 1e-6) continue
          // Where the WALK sits at each end. The walk must stay CONTIGUOUS across
          // the joint (the ADA path can't break), so it is one unbroken band from
          // its slot on the cap to its slot on the leg. Which slot that is depends
          // on each end's RESOLVED arrangement — hard-coding one of the two cases
          // (outer-at-cap → inner-at-leg) is what notched every walk-at-curb
          // cul-de-sac: the quad was painted backwards, disagreeing with the bulb
          // at s=0 AND with the leg at s=T. Treelawn fills the complement.
          const legLo = legWalkOuter ? 0 : e.o, legHi = legWalkOuter ? e.o : legTotal
          const capLo = capWalkOuter ? 0 : capE.o, capHi = capWalkOuter ? capE.o : capTotal
          // A single-strip end (walk nowhere, or walk everywhere) leaves no band to
          // cross WITH. There is no bend to build — the material simply changes at
          // the shoulder. Skip THIS shoulder only; the other still gets its dip-in.
          // (This used to bail the whole cap, so one sidewalk-only leg suppressed
          // both shoulders and no transition was built anywhere on that cap.)
          if (capHi - capLo < 1e-6 || legHi - legLo < 1e-6) continue
          const T = Math.max(legTotal, capTotal)   // transition length ≈ band width — a gentle bend
          const P = (s, d) => [tip[0] + a[0] * s + p[0] * (hw + cw + d), tip[1] + a[1] * s + p[1] * (hw + cw + d)]
          // The crossing rides a SMOOTHSTEP, not a straight diagonal — the walk
          // eases out of the cap and into the leg instead of turning a hard corner
          // mid-band (SECTION §6.2, "a smooth S vs straight transition"). The
          // band's TOTAL depth eases along with it, so a coupler whose two ends
          // are different WIDTHS tapers between them instead of stepping.
          const ease = (u) => u * u * (3 - 2 * u)
          const lo = [], hi = [], outer = [], inner = []
          for (let i = 0; i <= XSTEPS; i++) {
            const u = i / XSTEPS, s = T * u, w = ease(u)
            lo.push(P(s, capLo + (legLo - capLo) * w))
            hi.push(P(s, capHi + (legHi - capHi) * w))
            outer.push(P(s, 0))
            inner.push(P(s, capTotal + (legTotal - capTotal) * w))
          }
          const zone = intersectRings(fullBand, [[...outer, ...inner.reverse()]])
          if (!zone.length) continue
          const white = intersectRings(zone, [[...lo, ...hi.reverse()]])
          const green = differenceRings(zone, white)
          Wacc = differenceRings(Wacc, zone)
          for (const k of Object.keys(tlByLu)) tlByLu[k] = differenceRings(tlByLu[k], zone)
          if (white.length) Wacc.push(...white)
          if (green.length) pushLu(tlByLu, lu, green)
        }
      }
    }
    // E2 — the constructed median paints positively: route this tile's frozen
    // median region (med, clipped at the shape pass) to the 'median' class and
    // keep it out of the parcel-LU remainder. Covers both the true median tile
    // (whole interior → bare median ground) and a block face that absorbed
    // median area through a one-sided junction (it stops mis-painting as the
    // block's parcel LU — the Truman drop-off/pill class).
    if (st.isMedian) {
      // [universal-median] DIVIDED median — the open-field flooded remainder IS the
      // grass (SECTION §3; both ped strips are zeroed at the shape pass, so
      // luRemainder floods curb→center). Route the whole flood to 'median'. No clip,
      // no constructed ring — the walked face is the median.
      if (luRemainder.length) { pushLu(luByLu, 'median', luRemainder); luRemainder = [] }
    } else if (st.med?.length) {
      // LOOP-body median (Benton / Park Place) — clip the remainder to the frozen ring.
      const medGround = intersectRings(luRemainder, st.med)
      if (medGround.length) {
        luRemainder = differenceRings(luRemainder, st.med)
        pushLu(luByLu, 'median', medGround)
      }
    }
    pushLu(luByLu, lu, luRemainder)                 // land-use remainder (per class)
  }
  return { Wacc, tlByLu, luByLu }
}

// Whole-map FILL — accumulate every tile's sectionPassTile contribution, in tile
// order (so the unions downstream are bit-identical to the old single loop). The
// block-local Section path (sectionOpen, below, with a per-tile cache) bypasses
// this; it stays for the full-pass callers (a cold bake / the :2713 path).
// ══ THE STAMP INQUIRY · ③'s FILL, struck LIVE past the wall ══════════════════
// ⭐⭐⭐ RULED (Jacob, 2026-09-06): "Because we don't do a WALK anymore, we might need to do a
// STAMP INQUIRY step." · "There should be no MID-LEG anything. There are no nodes there now,
// because we are fully polygonized."
//
// ⛔ THAT SECOND SENTENCE IS THE WHOLE DESIGN. `sectionPassTile` asks "where does this frontage
// START and STOP" — it groups runs, strokes each polyline into an area, trims it back from a
// corner, and hands the leftover wedge to a corner pad that may DECLINE. Every one of those is a
// question about a LEG, and on a contour there are no legs: no ends, no nodes, no corners as
// separate objects, nothing between two of anything. There is a closed curve and, at each point
// of it, a stamp. ⇒ The only question ③ can ask is "WHAT DEPTH HERE", per point.
//
// ⭐ SO THIS IS NOT A NEW CONSTRUCTION. It is ③'s own band strike (the `parts` / `ins` / `band`
// ladder in `buildTileGround`), moved to the consumer side and re-resolved against live
// `blockCustoms` — which is the entire content of `SECTION §4`'s keystone: freeze the SILHOUETTE,
// author the FILL live. The producer keeps striking nothing; it now freezes the STAMP instead of
// the BANDS. `RIBBONS §1`: "a walk needs boundaries; an offset needs only a value per point."
//
// ⭐ AND IT IS WHY A SEAM IS UNCONSTRUCTIBLE HERE rather than merely unlikely: every boundary
// below is a whole-contour offset of the SAME curve. There are no pieces, so there is nothing to
// join, so there is no join to open.
//
// THE WALL HOLDS, and by the same signature rule as `sectionPass`: the parameters are the frozen
// tile + design scalars + `blockCustoms` (design intent keyed by frozen identity). No streets, no
// chains, no measures, no centerlines. `run.baseMeasure` is surveyed DATA frozen across the wall,
// not chain geometry — the ruled distinction (`SURVEY §5`).

// One stamp's resolved cross-section: the frozen base measure + the operator's override.
// ⛔ THE SHIPPED RESOLVER, NOT THE RAW FIELD — `measure.treelawn` is the authored override ONLY
// (median 0 across the map); the depth actually painted comes from `resolvePedDepths`. Reading
// the raw field is a real, repeated error here: it once left three quarters of the map with no
// ped band, and it manufactured a phantom 3.00 m envelope gap during this ticket.
function stampMeasure(run, blockCustoms, curbWidth) {
  if (!run) return null
  const c = blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd] || null
  const mz = run.baseMeasure
  const base = mz?.[run.side]?.pavementHW
  const hw = (c && Number.isFinite(c.pavementHW)) ? Math.max(0, c.pavementHW) : base
  const d = resolvePedDepths(mz, run.side, c)
  return {
    pavementHW: Number.isFinite(hw) ? hw : null,
    curb: curbWidth,
    treelawn: d.tl, sidewalk: d.sw, hasTL: !!d.hasTL,
    // The §3.1 default ARRANGEMENT (treelawn-Y reads grass→walk, N reads walk→lawn), then the
    // per-edge `.materials` override. Both strips to 'LU' is the OPEN FIELD — a material state.
    matOuter: c?.materials?.outer ?? (d.hasTL ? 'LU' : 'SW'),
    matInner: c?.materials?.inner ?? (d.hasTL ? 'SW' : 'LU'),
  }
}

// ⭐⭐⭐ THE STRIP LADDER — ONE FUNCTION, BOTH PAINTERS. Depths are measured PAST THE CURB; each
// caller adds `cw` itself, and `lim = WB − cw` is the mono-width envelope past the curb.
// ⛔⛔ IT EXISTS BECAUSE THERE WERE TWO COPIES AND THEY DISAGREED. `sectionPassProtoTile` (what
// Section renders) carried `298e9a60`'s symmetric form; `buildTileGround`'s ③ emit still read
// `lawnTo = outWalk ? … : lim`, so on a treelawn-Y edge the lawn ran the WHOLE envelope while the
// walk ran `dOut → lim` — the lawn CONTAINED the walk, and draw order hid it. That is `cfef5216`'s
// defect, fixed at one site and not the other, twice: `67e8b944` corrected `walkTo` in one copy,
// `17ebb477` the other, and `lawnTo` was corrected in neither.
// ⭐ `SECTION §3.1`: "every edge has TWO strips, outer and inner, plus the LU remainder." The walk
// is one of them; the lawn is the OTHER one. Never both, never overlapping. Written as spans that
// is not four conditionals that have to agree — it is one sentence each:
//     the lawn STARTS where an outer walk ENDS      ·  `lawnFrom = outWalk ? dOut : 0`
//     the lawn ENDS where an inner walk BEGINS      ·  `lawnTo   = inWalk  ? dOut : lim`
// ⇒ the two strips PARTITION the band, so a seam between them is not constructible — `RIBBONS`
// Slice 2 invariant 1 applied to the divider rather than to the envelope. Both strips SW is the
// walk taking the whole envelope; both LU is the OPEN FIELD. Neither is a case, and neither
// collapses: two strips ALWAYS, they SWAP (`SECTION §3.1`/`§3.3`).
// ⛔ NO CONSTANTS. Every distance here is `cw`, the envelope, or the authored divider.
// *(The extraction is `ribbon-monowidth-overlap`'s, stranded at `984b932c`; the correction it
// carries is `cfef5216`/`502037ca`'s. Not re-derived.)*
export function stripLadder(m, lim) {
  const outWalk = m.matOuter === 'SW', inWalk = m.matInner === 'SW'
  const tl = Math.min(m.treelawn || 0, lim), sw = Math.min(m.sidewalk || 0, lim)
  const dOut = Math.min(outWalk ? sw : tl, lim)
  return {
    outWalk, inWalk, dOut,
    // ⭐ `conD` — HOW DEEP CONCRETE RUNS ON THIS LEG (`SECTION §6.1` step 4). A set-back walk
    // (inner SW) is concrete to the FULL total; a curb-side walk is concrete for its one strip.
    conD: inWalk ? lim : dOut,
    walkFrom: outWalk ? 0 : (inWalk ? dOut : 0),
    walkTo:   outWalk ? (inWalk ? lim : dOut) : (inWalk ? lim : 0),
    lawnFrom: outWalk ? dOut : 0,
    lawnTo:   inWalk ? dOut : lim,
  }
}

// Does this tile carry the per-point stamp? ⛔ Detected from the tile's own shape, never a flag,
// so a mixed artifact cannot silently take one path for tiles that wanted the other.
export const hasStampInquiry = (st) => Array.isArray(st?.iaStamp) && Array.isArray(st?.iaFull)
  && st.iaStamp.length === st.iaFull.length && !!st.runs

// ⛔⛔ A FILLET TANGENT IS MATCHED TO A RING VERTEX ACROSS A BOOLEAN, SO IT MAY NOT BE THE SAME
// FLOAT. The key here used to be `KP`, an exact 6-decimal STRING. Clipper is an INTEGER grid
// (`SCALE = 1000`, i.e. 1 mm — `RIBBONS §1` names that floor as ε's one real constraint), so a
// point that survives a union comes back moved by up to half a grid step. The string then differs,
// the lookup misses, and the call site throws the corner's EXTENT away in silence: `if (a == null
// || b == null) continue`. Layer 0 q2 inside the corner constructor.
// ⭐ THE JOIN IS THE BUG, NOT THE TOLERANCE. Two points closer than the grid quantum ARE the same
// point to the library that produced them, so this resolves at the grid's own resolution: hash the
// ring into 1 mm buckets, then take the NEAREST vertex within one quantum, checking the 3×3
// neighbourhood because a point can round across a bucket edge. Ties resolve to the lower index so
// the result is identical run to run (the exact-string map it replaces kept the first occurrence).
// ⛔ There is no knob here — `GRID_M` is Clipper's `SCALE`, not a threshold, and widening it would
// be the tolerance this deliberately is not (Jacob, 2026-09-07: "no sizes or distances can be
// hardwired" — this is the resolution of the arithmetic underneath the map, not a size in it).
// ⛔ AND IT DOES NOT ADDRESS THE FAR CLASS. A tangent 10 cm off the contour is NOT on it, and that
// is a different defect with its own cause, unestablished. Those still miss, and they must —
// ▶ node scratch/claims-every-corner-is-configured.mjs splits the two populations by name.
// *(Recovered from `787bcbde` on `corner-r0-and-slide`, which fixed this at the two call sites the
// painter had then; the leg cut has since become identity-based and only the extent lookup is
// left. ⛔ Not re-derived — the construction and the reasoning are that commit's.)*
const GRID_M = 0.001
const QK = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`
function ringVertexIndex(ring) {
  const m = new Map()
  for (let q = 0; q < ring.length; q++) {
    const k = QK(ring[q][0], ring[q][1])
    const a = m.get(k); if (a) a.push(q); else m.set(k, [q])
  }
  return m
}
// The ring vertex within ONE grid quantum of P, or null.
function findRingVertex(ix, ring, P) {
  const cx = Math.round(P[0] * 1000), cy = Math.round(P[1] * 1000)
  let best = null, bd = Infinity
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const a = ix.get(`${cx + dx},${cy + dy}`); if (!a) continue
    for (const q of a) {
      const d = Math.hypot(ring[q][0] - P[0], ring[q][1] - P[1])
      if (d < bd - 1e-12 || (Math.abs(d - bd) <= 1e-12 && best != null && q < best)) { bd = d; best = q }
    }
  }
  return bd <= GRID_M ? best : null
}
export function sectionPassProtoTile(st, cw, stripMat, blockCustoms = null) {
  // ⭐ TWO CONTOURS, TWO QUESTIONS. `iaFull` + `iaStamp` answer "what depth HERE" — uncut, so the
  // per-point correspondence is intact. The cut `iA` answers "where is the block" after the disc
  // was stamped. Strike off the first, CUT with the second: a rim band is a clean cut through a
  // finished band, never a band that turned a corner to follow the rim.
  const iA = st.iaFull || [], stamps = st.iaStamp || [], runs = st.runs || []
  const empty = { Wacc: [], tlByLu: {}, luByLu: {}, curb: [] }
  if (!iA.length) return empty
  const inBlock = (rings) => (st.iA?.length && rings.length) ? intersectRings(rings, st.iA) : rings
  const key = st.lu || 'unknown'
  // ⛔ `si` — THE INDEX INTO `iA`/`iaStamp`, kept separately from `ri`, the index into `parts`.
  // Filtering short rings re-indexes, so using one for the other silently reads another ring's
  // stamps the moment any ring is dropped. It cost the leg map exactly that, caught by two of this
  // file's own counters disagreeing (0 legs spanning >1 frontage, 95 legs with >1 arrangement).
  const parts = iA.map((ring, si) => ({ ring, si })).filter(o => o.ring?.length >= 3)
    .map((o, n) => ({ ring: o.ring, si: o.si, ri: n, hole: signedArea(o.ring) < 0 }))
  if (!parts.length) return empty
  // ══ THE LEG IS THE FRONTAGE, AND THE CORNER IS WHERE IT CHANGES ══════════════════════════════
  // ⭐⭐⭐ *"A run is a LEG; a run seam (street changes) is a CORNER. `cornerAt(a,b)` = real corner
  // iff `a !== b`."*  ⇒ The leg boundary is not DETECTED, it is READ. `iaStamp` already names the
  // run that owns every contour edge, so a leg is a maximal span of one run and a corner is where
  // that changes. Nothing to threshold, nothing to match, nothing to tune.
  //
  // ⛔⛔ WHAT THIS REPLACES, AND IT WAS MINE TO UNBREAK. Until now the cut was a per-vertex TURN
  // TEST (≥ `FILLET_TURN_TOL`) plus frozen fillet TANGENTS matched by an exact string key. Three
  // separate defects in one construction:
  //   · it asks GEOMETRY what the polygon already carries as IDENTITY — `RIBBONS §1`'s Derivation
  //     doctrine: "the polygon is BOTH the geometry source AND the identity source";
  //   · a ≥18° turn fires on a street that merely BENDS mid-block, minting the seam Jacob's rule
  //     disqualifies outright — *"the leg is either or and never both"*;
  //   · the tangent key could not match ~24% of fillets across Clipper's 1 mm grid, so a quarter of
  //     the real corners were invisible to it.
  // ⭐ AND THE TIE-BREAK GOES WITH IT. The old cut could put two frontages inside one leg, so it
  // needed a longest-contributor vote with an authoring override on top. A leg IS a run now, so
  // that state is UNCONSTRUCTIBLE and the vote has nothing left to decide. ⛔ This is not "resolving
  // per point" (`SECTION §4` rule 1) — the ruled unit is the leg, and the leg is the run.
  // ⛔⛔ AND THE SAFETY OF THE RULE IS GATED HERE, NOT ASSERTED IN THIS COMMENT. The rule is only
  // safe while a single frontage cannot come back as TWO adjacent runs — if ① ever splits one, this
  // mints a corner MID-FRONTAGE, which is the exact seam it exists to abolish. Measured 0 on LS and
  // 0 on HPDM today by two sessions independently, but that is a fact about two towns, not a
  // property of the construction. ⇒ It is COUNTED every pass and says so out loud, once.
  // *(The gate is the CORNERS session's ask: "the difference between 'we measured it once' and
  // 'it cannot regress'." It is three lines and it was right to insist.)*
  // ⚠️ ⛔ DO NOT CONFLATE THIS WITH ①'s PER-EDGE LABELS, which DO split within one frontage —
  // `south-18th-street-6|right|0` holds ① labels 246 · 245 · 244. Different array, different
  // granularity: ① labels are per-EDGE, ② runs are per-FRONTAGE. Reading one as the other is what
  // produced the retracted "89 owners per block".
  const legArr = new Map()      // `${ri}|${edge}` → the FRONTAGE's ONE resolved measure
  const seamAt = new Set()      // `${ri}|${q}` → a FRONTAGE change, i.e. a corner
  // ⛔ THE RESIDUE THE LONGEST-ARC ABSORPTION USED TO HIDE, COUNTED INSTEAD OF ABSORBED. `feArcs`
  // = contiguous `(road, side)` stretches on this tile; `feRepeat` = stretches belonging to an
  // owner that already had one. Under rule B a repeat is LEGITIMATE (a loop or a dogleg touches
  // one block twice) — so this is a population to read, never a failure to assert. A check tells
  // the two apart by geometry; the painter's job is only to stop pretending they are impossible.
  let feArcs = 0, feRepeat = 0
  {
    // ⛔⛔ THE UNIT IS THE FRONTAGE — one address, one side — NOT THE RUN. A run is cut wherever
    // `segOrd` changes, and `segOrd` subdivides a single frontage: ONE stretch of this block's edge
    // can carry several of them (`assignSegOrdsToFes` gives 136 of LS's 1022 frontages more than
    // one). Reading a `segOrd` change as a corner draws a corner treatment in the MIDDLE OF A
    // STRAIGHT BLOCK EDGE, where the polygon does not turn and the arrangement does not change —
    // the exact artifact Jacob spent the day trying to eliminate, and I put it back.
    // ▶ MEASURED: of the run seams, LS 94 of 1195 (7.9%) and HPDM 644 of 7016 (9.2%) are
    //   `segOrd`-only — same street, same side, no corner. Every one drew a pad.
    // ⭐ Same conclusion the CORNERS session reached independently in `eb0611cc`, from the other
    // end: it moved RESOLUTION to the frontage after seeing one block side disagree with itself.
    // ⇒ The frontage owns the resolution AND the corner. One unit, not two.
    // ⛔⛔ THE ADDRESS IS (ROAD, SIDE). THE ORDINAL IS NOT PART OF AN ADDRESS.
    // A `skelId` carries a trailing ordinal from where the line was cut, and a T-JUNCTION ON THE
    // FAR KERB cuts it — so `south-18th-street-6` meets `south-18th-street-10` on a STRAIGHT,
    // UNINTERRUPTED block face where nothing turns and no street meets this side. Keying the
    // frontage on `skelId` mints a CORNER there and draws a corner treatment mid-block.
    // *(Jacob, 2026-09-07, on the render: "there should not be a seam in the sidewalk, period…
    // ABSOLUTELY DO NOT APPLY IT HERE because it's not a corner!")*
    // ⭐ A CORNER IS WHERE THE ROAD OR THE SIDE CHANGES. Nothing else is a corner.
    // ⛔ AND THE TWO SPANS STILL RESOLVE SEPARATELY — `SECTION §4` rule 4: a road's spans genuinely
    // carry different authored cross-sections and THAT VARIATION IS THE SURVEY. Merging them was
    // built and excised the same day. They keep their own arrangements; what changes is that the
    // boundary between them is not a corner, so it gets THE RAMP (§6.1 step 5 with
    // no arc), not a pad.
    const roadOf = (id) => String(id ?? '').replace(/-\d+$/, '')
    const feKey = (r) => r == null ? null : `${roadOf(runs[r].skelId)}|${runs[r].side}`
    // ⛔⛔ AND RESOLUTION IS THE BLOCK FACE TOO — THE SAME UNIT. *(Jacob, 2026-09-07, flipping a
    // strip on a straight face: "I flipped the inner sidewalk and you see it stopped at the seam
    // again, which isn't even supposed to be possible.")*
    // A far-kerb T cuts the line, so ONE block face carries two spans under two `skelId`s. The
    // authoring write fans across a chain's `segOrd`s (`feSegOrds`) and CANNOT cross into the other
    // chain — so the operator's flip reached half the face and stopped dead at the cut. Resolving
    // per span made that state paintable; it must not be.
    // ⭐ `SECTION §4` rule 4 IS PRESERVED, and this is the distinction that matters: a road's
    // cross-section genuinely varies ALONG THE STREET — South 18th carries twelve treelawn values
    // on one side — but it varies BETWEEN BLOCKS, and a block boundary is a corner. WITHIN one
    // block face there is exactly one arrangement. This painter is per-tile, so `road|side` here
    // means "this face", and the street's variation across other tiles is untouched.
    // ⇒ "There should be no seams in runs, ever, period" — a run IS a block face, and a face now
    // cannot hold two arrangements, so the seam is unconstructible rather than merely absent.
    const resKey = feKey
    for (const p of parts) {
      const ri = p.ri, ring = p.ring, stp = stamps[p.si] || [], n = ring.length
      const corner = st.iaCorner?.[p.si] || null
      // ⛔⛔ THE UNIT IS A MAXIMAL CONTIGUOUS STRETCH OF ONE `(road, side)` — RULED B, 2026-09-07.
      // *(Jacob, asked which counts as one piece when a road's chunks sit end-to-end along one
      // block face: "B, obviously" — one UNBROKEN stretch, so a street touching the same block
      // TWICE (a loop, a dogleg) stays two frontages, correctly resolved apart.)*
      // ⭐ IT IS THE INTERSECTION OF TWO THINGS ALREADY RULED, not a third rule. The IDENTITY is
      // `(road, side)` — a far-kerb T cuts the line, so one face carries two `skelId`s and keying
      // on the chain mints a seam mid-face ("ABSOLUTELY DO NOT APPLY IT HERE because it's not a
      // corner!"). The UNIT is CONTIGUITY — `eb0611cc`'s rule, which keyed on `skelId`. Take the
      // road-level key and the contiguous unit and both of his rulings hold at once.
      // ⛔⛔ AND THIS RETIRES THE LONGEST-ARC ABSORPTION THAT STOOD HERE (`ecec7e11`). Its stated
      // reason was *"a frontage that genuinely appears twice on one ring cannot exist — the polygon
      // would have to cross itself."* ⭐ THAT IS FALSE AND IT IS THE CLAIM B OVERTURNS: a loop or a
      // dogleg touches one block twice without the polygon crossing itself, and absorbing the
      // second arc into a neighbour paints the operator's OTHER frontage with a stranger's
      // arrangement. Its second reason — *"every extra arc mints a corner where the block has
      // none"* — was already answered by `271b6d98`: corners come from `st.iaCorner`, stamped
      // PRE-EASING off ①'s own vertices, and no longer from these owner-change cuts at all.
      // ⚠️ WHAT THE ABSORPTION WAS REALLY COVERING IS STILL THERE AND IS NOT MINE TO HIDE: the
      // owner FLICKERS for a metre or two mid-frontage (`ecec7e11` measured 7–8% of arcs under
      // 2 m), and each flicker is now its own short stretch with its own resolution. That residue
      // belongs to `carryEdgeLabels` — an ATTRIBUTION defect, disclosed as one rather than absorbed
      // where it cannot be seen. ⛔ It is COUNTED on the return value (`feArcs`/`feRepeat`) so a
      // check reads it off the painter instead of restating the rule.
      const cuts = []
      for (let q = 0; q < n; q++) {
        const a = resKey(stp[(q - 1 + n) % n])
        const b = resKey(stp[q])
        if (a !== b) cuts.push(q)                                    // resolve per SPAN (rule 4)
        // ⭐⭐⭐ THE CORNER IS READ, NOT DERIVED. `st.iaCorner` is stamped at the MINT, PRE-EASING,
        // from ①'s own vertices: an owner change on the sharp polygon, with contiguity enforced
        // there. ⛔ Deriving it here would be asking ②'s eased contour a question about ①'s shape —
        // ② rounds a 90° corner into ~12 vertices of 7.5°, so the answer is always "no corner".
        // ▶ the field now reads 5.7% of LS contour points, median 4 corners per ring; it read 81%
        //   and was true on EVERY point of 43 rings when it was built from owner LABELS.
        if (corner?.[q]) seamAt.add(`${ri}|${q}`)
      }
      const spans = cuts.length ? cuts.map((c, x) => [c, ((cuts[(x + 1) % cuts.length] - c + n) % n) || n]) : [[0, n]]
      const seenOwner = new Set()
      for (const [s0, len] of spans) {
        // ⛔ ONE resolution for the frontage. A frontage may own SEVERAL `segOrd`s — `assignSegOrdsToFes`
        // gives 136 of LS's 1022 fes more than one — so the slots can disagree inside one stretch.
        // AUTHORING WINS; among un-authored slots the LONGEST contributor wins. ⛔ An override that
        // lost a length vote would be the operator's gesture silently doing nothing (Layer 0 q3).
        const byRun = new Map()
        for (let k = 0; k < len; k++) { const q = (s0 + k) % n, r = stp[q]; if (r == null) continue
          const a = ring[q], b = ring[(q + 1) % n]
          byRun.set(r, (byRun.get(r) || 0) + Math.hypot(b[0] - a[0], b[1] - a[1])) }
        if (!byRun.size) { for (let k = 0; k < len; k++) legArr.set(`${ri}|${(s0 + k) % n}`, null); continue }
        const authored = (r) => !!blockCustoms?.[runs[r].skelId]?.[runs[r].side]?.[runs[r].segOrd]
        let win = null, best = -1, winAuth = false
        for (const [r, L] of byRun) { const au = authored(r)
          if ((au && !winAuth) || (au === winAuth && L > best)) { best = L; win = r; winAuth = au } }
        const mm = stampMeasure(runs[win], blockCustoms, cw)
        for (let k = 0; k < len; k++) legArr.set(`${ri}|${(s0 + k) % n}`, mm)
        const ok = resKey(stp[s0]); feArcs++
        if (ok != null) { if (seenOwner.has(ok)) feRepeat++; else seenOwner.add(ok) }
      }
    }
  }
  // ⭐ EVERY per-point read goes through the LEG's single resolution (`SECTION §3.3` step 1).
  const M = (ri, i) => legArr.get(`${ri}|${i}`) ?? null

  // ── THE MONO-WIDTH ENVELOPE — one number for the whole block, over every point it has.
  // `RIBBONS §1` invariant 4, and it is SACROSANCT: the outer depth is uniform per block (that is
  // what gives the clean concentric corner); only the DIVIDER and the MATERIALS vary per point.
  // ⭐ Resolved LIVE, so authoring an edge deeper grows the whole block's band — the behaviour
  // `SECTION §7` lists under "preserve, all already working".
  let WBnom = 0
  for (const p of parts) for (let i = 0; i < p.ring.length; i++) {
    const m = M(p.ri, i); if (m) WBnom = Math.max(WBnom, cw + (m.treelawn || 0) + (m.sidewalk || 0))
  }

  // ⛔ NO STAMP IN THESE CALLS. `offsetRingVariable` GATES ITS UNION ON THE STAMP — with one it
  // runs `unionRingLabelled`, without it `unionRings` — so asking for labels CHANGES THE
  // GEOMETRY. Same call shape as the producer's `ins`, deliberately, so the two agree.
  const ins = (pick) => {
    const o = [], h = []
    for (const p of parts) {
      const rs = offsetRingVariable(p.ring, pick(p), () => true, () => null, false, null, false, p.hole)
      ;(p.hole ? h : o).push(...rs)
    }
    return (o.length && h.length) ? differenceRings(o, h) : o
  }
  const insAt = (d) => ins(() => () => d)

  // ── THE TOPOLOGICAL CAPACITY GUARD — not the forbidden clamp (`§6.9`.5). A depth past the
  // block's medial axis INVERTS the offset and `differenceRings` returns the COMPLEMENT, flooding
  // the interior: a sign error wearing the shape of a band. Bisect to the reach that still exists.
  // ⭐ Recomputed live because WBnom is authorable — freezing it would clamp the operator's own
  // deeper treelawn to the capacity of the UN-authored envelope, silently.
  let WB = WBnom, capped = false
  if (WBnom > 1e-6 && !insAt(WBnom / 0.9).length) {
    let lo = 0, hi = WBnom / 0.9
    for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (insAt(mid).length) lo = mid; else hi = mid }
    WB = lo * 0.9; capped = true
  }
  const curbOuter = parts.some(p => p.hole)
    ? differenceRings(parts.filter(p => !p.hole).map(p => p.ring), parts.filter(p => p.hole).map(p => p.ring))
    : parts.filter(p => !p.hole).map(p => p.ring)
  const band = (a, b) => (a.length && b.length) ? differenceRings(a, b) : []

  // ⛔⛔ A BLOCK TOO NARROW FOR EVEN THE CURB IS THE OPEN-FIELD LIMIT — all LU to centre. Not a
  // clamp (forcing WB = cw re-inverts the offset) and not an absence (`ARCHITECTURE §"The compound
  // shape"`: the drawing has no holes). A MATERIAL state, never a missing one.
  if (WB < cw) return { Wacc: [], tlByLu: {}, luByLu: { [key]: inBlock(insAt(0)) }, curb: [], capped, openField: true, feArcs, feRepeat }

  // ── THE ARRANGEMENT, PER POINT. Two strips always — they SWAP, they never collapse (`§3.1`) —
  // so the inner one takes the rest of the envelope. ⛔ The depth belongs to the STRIP, not to the
  // material's name. Identical ladder to the producer's, so the two can be gated against each other.
  const lim = Math.max(0, WB - cw)
  const arrOf = (m) => stripLadder(m, lim)

  // ══ THE CORNER — `SECTION §6.1`'s FIVE STEPS, drawn by this painter's own ladder ══════════════
  // ⛔⛔ NOT A SECOND CONSTRUCTION. The rule and every constant are §6.1's, the ones that landed
  // 2026-06-10 in `sectionPassTile`'s "Idea A" block — `conD`, `cMin`, `conMax`, the slid quad,
  // `rampLen = max(2, 2·(conMax − cMin))`. What differs is only HOW the band is drawn: the walk
  // painter strokes per RUN and slices the corner out of `fullBand` with `arcSectorPoly`; this one
  // offsets per CONTOUR EDGE, so steps 3 + 4 are a STAMP — at the arc's edges the cross-section
  // says concrete-to-`cMin`, and the same four offsets draw it. ⛔ No sector, no bid, no decline
  // (`RIBBONS §1` invariant 1, "never a separately-constructed primitive"; invariant 3, "a
  // band-slice, works square OR round"). The walk painter's four decline gates dropped 60% of its
  // bids; a stamp cannot decline, so the pad cannot be missing.
  // ⛔ A re-implementation stood here on 2026-09-07 and was wrong twice over — `cMin` with no
  // slide, so the band came apart at every mixed corner, and TREELAWN beyond `cMin`, a FOURTH
  // configuration. It was excised, not flagged (`162b8645`). There are THREE, and they fall out of
  // ONE rule with no case split: concrete runs to `cMin = min(both legs' conD)`, deeper is PARCEL.
  //   TL↔TL  both set back → conD = lim on both  ⇒ all concrete to the full depth
  //   SW↔SW  both at curb  → conD = the SW width ⇒ concrete one width, then parcel
  //   SW↔TL  mixed         → a concentric arc at the SW depth + the deep leg SLIDES in (step 5)
  // ⛔ Step 3 is absolute: THE STREET EDGE IS ALWAYS CONCRETE — the ADA ramp. Treelawn ends at the
  // TANGENTS. The band beyond `cMin` goes to `tlByLu[lu]`, which is §6.1 step 4's own routing and
  // is PARCEL-matched (this tile's own land use), not a grass strip bent around the arc.
  // ⛔ WHY THIS IS NOT COSMETIC. Without it the two legs keep their own arrangements, so a set-back
  // walk `[cw+tl, cw+WB]` meets a curb-side walk `[cw, cw+sw]` — two depth ranges that DO NOT
  // OVERLAP, and the sidewalk simply stops. ▶ MEASURED on LS: 231 of 681 corners (33.9%) have
  // disagreeing arrangements. That is the operator's "the sidewalk breaks" and "the ADA pads are
  // missing" — one defect, one cure. ▶ `node scratch/claims-sidewalk-is-one-band.mjs`
  // ⭐ THE CORNER IS ①'s AND IT IS READ OFF THE FROZEN FILLET, never off the drawn contour: ②
  // eases 90° into ~12 vertices of 7.5°, so a turn test finds ZERO corners on a rectangle.
  // `st.fillets[] = {apex, C, r, tA, tB}` is the arc the curb actually rounded, with its two
  // TANGENT points — the same arc the leg cut above already reads.
  // ⛔ OPEN, and it is §6.1 step 5's other half: the `luWedge` that carves the deep tail out of the
  // slid walk is NOT built here. It is a CUT, and a cut through a band that is then re-joined along
  // the same edge leaves Clipper with two touching polygon records — the band reads broken at
  // unchanged area. Re-run the acceptance before re-landing it; when it was tried it cost 3 blocks
  // on LS and 6 on HPDM, and the honest home for it is a per-vertex ramp, which needs vertices
  // inserted along the leg that the frozen contour does not have.
  const fullBand = band(insAt(cw), insAt(WB))

  // ══ THE ADA PAD — LOCATED BY THE OWNER CHANGING, ARC ONLY FOR ITS EXTENT ═════════════════════
  // ⭐⭐⭐ THIS CURE WAS WRITTEN DOWN IN `8753ea91` (2026-09-06 23:36) AND NEVER BUILT. Verbatim:
  //   "I predicated the pad on the FILLET ARC, and `RIBBONS §1` invariant 3 forbids exactly that —
  //    'the ADA corner pad is a band-slice, NOT predicated on the arc, so it works square OR round.'
  //    Of 231 arrangement steps only 60 sit inside a fillet arc, so 171 remain bare. ⇒ THE CURE IS
  //    TO LOCATE THE PAD BY THE OWNER CHANGING — §1's own law — WITH THE ARC SUPPLYING ONLY ITS
  //    EXTENT WHERE ONE EXISTS."
  // ⛔ I re-derived that sentence across four commits today. It was in the commit message the whole
  // time. `CLAUDE.md`: reuse forensics, never re-derive.
  //
  // ⭐ THE PAD IS A STAMP, NOT A CONSTRUCTION — `RIBBONS §1` invariants 1 and 3. At contour points
  // inside the corner the stamp says concrete and the SAME FOUR OFFSETS draw it: no sector, no
  // intersection, no bid, no decline. ⛔ Nothing is glued onto the ends of two legs, which is what
  // `RIBBONS` Slice 2 invariant 2 forbids in those words.
  //
  // ⭐ THE THREE CONFIGS FALL OUT OF ONE RULE — concrete to `cMin = min(both owners' conD)`:
  //   SW↔SW  both at curb   → cMin = the walk width ⇒ the outer band's stripe continues round
  //   TL↔TL  both set back  → cMin = the full depth ⇒ the walk wraps, and the band outboard of it
  //                                                   is the ADA pad reaching the street
  //   SW↔TL  mixed          → cMin = the shallower  ⇒ the walk crosses inside the band
  // ⛔ Step 3 is absolute: the curb side of a corner is concrete ALWAYS. Grass stops at the extent.
  const cornerAt = new Map()             // `${ri}|${edge}` → cMin
  for (const p of parts) {
    const ring = p.ring, n = ring.length
    const ix = ringVertexIndex(ring)
    // where a fillet eased a corner, its two tangents are that corner's EXTENT
    const arcAt = new Map()
    for (const fl of st.fillets || []) {
      const a = findRingVertex(ix, ring, fl.tA), b = findRingVertex(ix, ring, fl.tB)
      if (a == null || b == null) continue
      const fwd = (b - a + n) % n, bwd = (a - b + n) % n
      const [s0, len] = fwd <= bwd ? [a, fwd] : [b, bwd]
      if (len === 0 || len * 2 > n) continue                 // a fillet is the MINOR arc
      // ⛔⛔ `k < len`, NOT `k <= len` — AN ARC FROM VERTEX a TO VERTEX b COVERS THE EDGES BETWEEN
      // THEM, AND THERE ARE `len` OF THOSE, NOT `len + 1`. The extra one is the FIRST EDGE OF THE
      // NEXT LEG, and on ①-derived geometry a straight frontage is ONE EDGE — so the inclusive
      // bound handed each corner an entire block side.
      // ⭐ THE CANARY, measured: tile 110 is a quadrilateral — 4 fillets, `iaCorner` true at exactly
      // 4 vertices, 54 contour vertices of which 50 are the four eased arcs and FOUR are the block's
      // four sides (30.8 · 184.1 · 30.7 · 184.3 m). Each arc stamped its 12 short edges AND the long
      // one after it ⇒ 458 m of 458 m painted as ADA pad, and the treelawn erased off the whole
      // block. That is the "all concrete, no grass" cross-section Jacob circled with the Marker.
      // ⛔ THE CLASS IS THIS FILE'S OWN, FOR THE THIRD TIME: an EDGE quantity indexed as if it were
      // a VERTEX quantity (`592043fe` "an EDGE label read off a VERTEX stamp"; `RIBBONS §1`'s "a
      // quantity carried through a boolean must be carried as the thing it IS"). It is not a
      // threshold, a tolerance or a special case — it is an arity error, and the reason it survived
      // is that on a DENSE contour the extra edge is 1 mm and invisible.
      for (let k = 0; k < len; k++) arcAt.set((s0 + k) % n, [s0, len])
    }
    for (let q = 0; q < n; q++) {
      if (!seamAt.has(`${p.ri}|${q}`)) continue              // ⭐ LOCATED BY THE OWNER CHANGING
      const mA = M(p.ri, (q - 1 + n) % n), mB = M(p.ri, q)
      if (!mA || !mB) continue
      const cMin = Math.min(arrOf(mA).conD, arrOf(mB).conD)
      const arc = arcAt.get(q)
      // ⛔ THE ARC SUPPLIES THE EXTENT, IT DOES NOT LICENSE THE PAD. Square corner ⇒ no arc ⇒ the
      // extent is the one edge the owners meet across, and the pad is drawn there just the same.
      // ⛔ Same arity: `len` EDGES from `s0`. A square corner (no arc) is `len = 0` — and it must
      // then stamp the ONE edge the owners meet across, which is `k <= 0`, i.e. exactly one pass.
      const [s0, len] = arc || [q, 0]
      for (let k = 0; k < Math.max(1, len); k++) {
        const e = (s0 + k) % n
        const prev = cornerAt.get(`${p.ri}|${e}`)
        if (prev == null || cMin < prev) cornerAt.set(`${p.ri}|${e}`, cMin)
      }
    }
  }

  // ══ THE RAMP — a road's two spans meeting where NO CORNER IS ════════════════════════════════
  // ⭐ RECOVERED from `92c4d824` + `e7c5198c` (2026-09-07), built and then stranded on a branch.
  // ⛔ NOT re-derived: the constants, the guards and the two-sided probe are that build's.
  // *(Jacob: "even if we think something changes mid-leg, that's what the angled slope corner
  // joiner is for" — his word that morning, RETIRED the same night: "'joiner' sounds like chains."
  // ⛔ A JOINER JOINS TWO THINGS AND THERE IS ONLY ONE SHAPE. The word would cause the bug: anyone
  // building to it builds something that stitches two pieces together, which is the walk model
  // returning through the vocabulary. It is THE RAMP — the curb ramp, a thing that exists on the
  // ground. And, on the far-kerb T: "ABSOLUTELY DO NOT APPLY IT HERE because it's not a
  // corner!" — so it fires HERE and the corner construction does not.)*
  //
  // ⛔⛔ THE CURE IS NOT TO MERGE THE SPANS. `SECTION §4` rule 4 — a road's spans genuinely carry
  // different authored cross-sections and THAT VARIATION IS THE SURVEY. A road-level merge was
  // built for this exact symptom on 2026-09-07 and excised the same day. The RAMP makes the
  // difference SURVIVABLE: both keep their arrangement along their span, and only a short
  // transition at the joint slopes.
  // ⭐⭐ IT IS `§6.1` STEP 5 WITH NO ARC — `conD`, `cMin`, `conMax`, the slid quad, all step 5's,
  // applied at a joint instead of a tangent. ⛔ ADDITIVE, UNIONED IN, NEVER CUT: cutting a band and
  // re-joining it on the same edge leaves Clipper two touching records — the band reads BROKEN at
  // unchanged area, and that cost the acceptance 79 → 54 once already.
  // ⛔ NO SIZE IS HARDWIRED (Jacob: "no sizes or distances can be hardwired"). `rampLen` is 2× the
  // depth the walk must travel — a SLOPE RATIO, a shape, not a length, and deliberately no floor.
  const slidWalk = []
  if (fullBand.length) {
    const nrm2 = (v) => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L] }
    for (const p of parts) {
      const ring = p.ring, n = ring.length, stp = stamps[p.si] || []
      for (let q = 0; q < n; q++) {
        // ⛔⛔ NO GATE HERE. **EVERY CORNER GETS A RAMP** — Jacob, 2026-09-07:
        // > "every corner gets a joiner/ramp. Sometimes, that means it's subsumed by the SW <> SW.
        // >  but if it's TL <> SW, a slope appears to connect the different depths. TL <> TL the
        // >  ADA ramp appears below, no ramp."
        // ⭐ THE TWO DEPTHS DECIDE THE FORM, NEVER WHETHER. The three configs are three OUTCOMES of
        // one unconditional construction, and each falls out of `conMax − cMin` with no branch:
        //   SW↔SW  both at the kerb, equal    → `rampLen` 0 ⇒ SUBSUMED, nothing drawn
        //   TL↔SW  different                  → a SLOPE connecting the two depths
        //   TL↔TL  both set back, equal       → `rampLen` 0 here; the ADA pad BELOW the walk is the
        //                                       corner stamp's own job (`walkFrom → cw`), not a slope
        // ⛔ WHAT STOOD HERE — `if (seamAt.has(...)) continue`, "a corner owns its own joint" — made
        // the construction fire ONLY where there is no corner, i.e. everywhere except the place the
        // operator was looking at. That is the transition being CONDITIONAL on the thing it exists
        // for. It is also why TL↔SW showed a step: the slope was gated off at every corner on the map.
        const eA = (q - 1 + n) % n, eB = q
        const mA = M(p.ri, eA), mB = M(p.ri, eB)
        if (!mA || !mB || mA === mB) continue
        const A = arrOf(mA), B = arrOf(mB)
        const conc = [A.conD, B.conD].filter(d => d > 1e-6)
        if (!conc.length) continue                       // neither side carries concrete
        const cMin = Math.min(...conc)
        const deepA = A.conD >= B.conD
        const deep = deepA ? A : B
        // ⭐ EQUAL DEPTHS ⇒ `rampLen` 0 ⇒ a degenerate quad ⇒ nothing drawn. That is "subsumed",
        // and it falls out rather than being branched on. ⛔ Kept only as a cheap skip, NOT as a
        // decision: the construction still ran and still produced the right answer without it.
        if (deep.conD <= cMin + 1e-6) continue           // subsumed — zero-length by construction
        // the ramp runs up the DEEPER span, away from the joint
        const J = ring[q], away = deepA ? (q - 1 + n) % n : (q + 1) % n
        const dir = nrm2([ring[away][0] - J[0], ring[away][1] - J[1]])
        const conMax = deep.conD, rampLen = (conMax - cMin) * 2
        const tloD = deep.outWalk ? 0 : deep.dOut        // the treelawn tapering out
        const at = (pv, s2, d) => [J[0] + dir[0] * s2 + pv[0] * (cw + d), J[1] + dir[1] * s2 + pv[1] * (cw + d)]
        const quadFor = (pv) => [at(pv, 0, 0), at(pv, rampLen, tloD), at(pv, rampLen, conMax), at(pv, 0, cMin)]
        // ⭐ THE INWARD NORMAL IS DECIDED BY ASKING THE BAND, not by winding: a hole ring and an
        // outer ring wind opposite ways and `p.hole` is itself read off winding, so a probe is the
        // one answer that cannot be inverted by the thing it is describing.
        let best = null
        for (const pv of [[-dir[1], dir[0]], [dir[1], -dir[0]]]) {
          const got = intersectRings(fullBand, [quadFor(pv)])
          const a = got.reduce((tot, g) => { let x = 0; for (let i = 0; i < g.length; i++) { const j = (i + 1) % g.length; x += g[i][0] * g[j][1] - g[j][0] * g[i][1] } return tot + Math.abs(x / 2) }, 0)
          if (!best || a > best.a) best = { got, a }
        }
        if (best && best.got.length) slidWalk.push(...best.got)
      }
    }
  }

  // ══ THE RAMP NEEDS VERTICES ON THE LEG, SO PUT THEM THERE ════════════════════════════════════
  // ⭐⭐⭐ THE MISSING HALF, BUILT. *(Jacob: "now add the vertices on the leg.")* `SECTION §4`'s RAMP
  // entry and this file's own comment both filed it: "the honest home for it is a per-vertex ramp,
  // which needs vertices inserted along the leg that the frozen contour does not have."
  //
  // ⛔ WHY IT WAS IMPOSSIBLE WITHOUT THIS. Depth is per-EDGE. ~three quarters of ①'s contour
  // vertices sit inside the eased corner arcs, where the depth must be CONSTANT, and the straight
  // leg gets a MEDIAN OF ONE long edge per frontage. One edge is one place to put a value, so the
  // corner's depth change could only ever be a STEP — the 1.5 m jog at every corner on the map.
  // ▶ `SECTION_DUMP=1 node scratch/claims-the-ramp-has-room.mjs`
  //
  // ⭐ THIS DOES NOT TOUCH ① AND IT DOES NOT MOVE A SINGLE POINT. The inserted vertices are
  // COLLINEAR — they lie exactly on the edge they split — so the contour is geometrically
  // identical and only its SAMPLING changes. `SKELETON §0.1` licenses precisely this distinction
  // ("a change of SAMPLING, not of shape"), and it is why nothing upstream needs to know: ①, ②,
  // the stamp, the authoring keys and the frozen artifact are all untouched. It is local to the
  // consumer, per pass.
  // ⛔ AND EVERY NEW EDGE CARRIES ITS SOURCE EDGE'S IDENTITY (`src`), so `M`, `cornerAt` and the
  // authored slot resolve exactly as before — identity CARRIED, never recovered from geometry.
  //
  // ⭐ `rampLen` is twice the depth the walk must travel on that leg — a SLOPE RATIO, the same one
  // `§6.1` step 5 rules and the cap coupler uses. ⛔ No size is hardwired, and there is no floor:
  // a leg with nothing to travel gets no vertex, which is "subsumed" expressed as an absence.
  // ⛔ A leg SHORTER than its own ramp is not split — the ramp would overrun the frontage. That is
  // a real state (a short block face), and it is COUNTED, not silently truncated.
  let rampShort = 0
  for (const p of parts) {
    const ring = p.ring, n = ring.length
    const cA = (i) => cornerAt.get(`${p.ri}|${i}`)
    const out = [], src = [], kS = [], kE = []
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n]
      const inC = cA(i) != null
      const push = (pt, s0, k0, k1) => { out.push(pt); src.push(s0); kS.push(k0); kE.push(k1) }
      if (inC) { push(a, i, 0, 0); continue }                       // inside the corner: depth is flat
      const backC = cA((i - 1 + n) % n) != null, fwdC = cA((i + 1) % n) != null
      const m = M(p.ri, i), l = m ? arrOf(m) : null
      const travel = l ? l.dOut : 0                                  // what the divider must cross
      const rampLen = travel * 2
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      if ((!backC && !fwdC) || !(travel > 1e-6)) { push(a, i, 1, 1); continue }
      const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      if (backC && fwdC) {
        if (L <= 2 * rampLen + 1e-6) { rampShort++; push(a, i, 0, 0); continue }
        push(a, i, 0, 1); push(at(rampLen / L), i, 1, 1); push(at(1 - rampLen / L), i, 1, 0)
      } else if (backC) {
        if (L <= rampLen + 1e-6) { rampShort++; push(a, i, 0, 0); continue }
        push(a, i, 0, 1); push(at(rampLen / L), i, 1, 1)
      } else {
        if (L <= rampLen + 1e-6) { rampShort++; push(a, i, 0, 0); continue }
        push(a, i, 1, 1); push(at(1 - rampLen / L), i, 1, 0)
      }
    }
    p.dring = out; p.dsrc = src; p.dkS = kS; p.dkE = kE
  }
  // ⛔ The VARIABLE-depth offsets run on the densified ring; the CONSTANT-depth ones (`insAt`) do
  // not need it and are left alone — a constant depth over collinear extra vertices is the same
  // curve, so the two cannot disagree at a boolean.
  const insD = (pick) => {
    const o = [], h = []
    for (const p of parts) {
      const rs = offsetRingVariable(p.dring, pick(p), () => true, () => null, false, null, false, p.hole)
      ;(p.hole ? h : o).push(...rs)
    }
    return (o.length && h.length) ? differenceRings(o, h) : o
  }

  const mk = (p) => {
    // ⭐⭐⭐ ONE LADDER, BOTH PAINTERS — `stripLadder`, the same call `buildTileGround`'s ③ emit
    // makes. ⛔ The arrangement is NOT re-expressed here; what is local to this painter is only
    // the datum (`cw`) and the CORNER override below. Two hand-written copies of these four spans
    // produced three half-fixes in one day (`67e8b944`/`45b7aa60`, `17ebb477`, `f7a38ba0`), each
    // landing in whichever copy the author was reading. They cannot drift again.
    // ⛔ AN EDGE WITH NO RESOLVED MEASURE IS THE OPEN FIELD — `stripLadder({})` reads neither
    // strip as SW, i.e. all-LU curb→centre. Byte-identical to what the hand-written copy gave a
    // null, and the ruled answer (`ARCHITECTURE §"The compound shape"`: the drawing has no holes).
    const L = (i) => stripLadder(M(p.ri, i) || {}, lim)
    const cAt = (i) => cornerAt.get(`${p.ri}|${i}`)
    // ⛔⛔ THE PAD MOVES ONE DEPTH, NOT FOUR — AND THAT IS THE WHOLE OF IT.
    // *(Jacob's three configs, in his words, 2026-09-07:)*
    //   SW↔SW → "the corner is just a continuous stripe around the outer band"  ⇒ NOTHING to do:
    //           the walk is already the outer strip and already reaches the curb.
    //   TL↔TL → "the sidewalk wraps around, but there is an added ADA pad to get the pedestrian to
    //           the street"                                                     ⇒ the walk WRAPS at
    //           its own depth and additionally REACHES the curb: `walkFrom → cw`.
    //   SW↔TL → the RAMP                                                        ⇒ the set-back side
    //           reaches the curb at the corner so the two walks meet. The same one depth.
    // ⇒ ONE RULE, NO CASE SPLIT: at a corner the walk REACHES THE STREET and the grass stops.
    // ⛔ `walkTo` and the leg's whole arrangement are UNTOUCHED, and that is load-bearing.
    //
    // ⛔ WHY THE PREVIOUS VERSION WAS A REGRESSION: overriding all four depths let the corner's
    // cross-section REPLACE the leg's, so wherever a pad landed the frontage stopped responding to
    // authoring — 58.8% of LS contour edges sit inside a corner extent and 33.7% of frontage
    // stretches are ENTIRELY inside one. Jacob: "The swap regime doesn't work on adjacent blocks
    // anymore." ▶ measure it with the BOTH-ARRANGEMENTS method, never by writing a literal:
    //   `node scratch/claims-swap-reaches-the-paint.mjs` writes `{outer:'SW', inner:'LU'}`, which
    //   IS the default on a treelawn-N edge, so it scores a no-op as a dead gesture and overstates
    //   the class ~3× (1088 slots/75.6% against 1195 slots/27.5% painted both ways).
    // ⭐ AND THE GRASS STOPPING IS THE LAWN'S OUTER EDGE, NOT A FOURTH DEPTH: where the lawn is
    // the OUTER strip its start is pushed to the envelope, which inverts its span to nothing.
    // ⭐ `j` indexes the DENSIFIED ring; `src[j]` is the ① edge it came from, so the leg's resolved
    // measure and its authored slot are unchanged. `k` is the divider's taper: 1 on the open leg,
    // 0 inside the corner, and RAMPING across the edges the densifier just made room on. A pair is
    // returned only where the two ends differ, so every unchanged edge stays a scalar and the
    // common path is byte-identical.
    const kS = p.dkS, kE = p.dkE, src = p.dsrc
    const span = (j, f) => {
      const l = L(src[j]), a = f(l, kS[j]), b = f(l, kE[j])
      return a === b ? cw + a : [cw + a, cw + b]
    }
    return {
      // ⛔ THE TAPER SCALES THE OUTER STRIP'S WIDTH, so it only bites where the walk is SET BACK.
      // A kerb-side walk is already at the street and the corner changes nothing about it — which
      // is why SW↔SW is "subsumed" and why it must stay untouched here.
      walkFromD: (j) => span(j, (l, k) => l.outWalk ? 0 : (l.inWalk ? l.dOut * k : 0)),
      walkToD:   (j) => span(j, (l) => l.outWalk ? (l.inWalk ? lim : l.dOut) : (l.inWalk ? lim : 0)),
      lawnFromD: (j) => span(j, (l) => l.outWalk ? l.dOut : 0),
      lawnToD:   (j) => span(j, (l, k) => l.inWalk ? l.dOut * k : lim),
      walkFrom: (i) => cAt(i) != null ? cw : cw + L(i).walkFrom,
      walkTo:   (i) => cw + L(i).walkTo,
      lawnFrom: (i) => { const l = L(i); return cw + (cAt(i) != null && !l.outWalk && l.inWalk ? lim : l.lawnFrom) },
      lawnTo:   (i) => cw + L(i).lawnTo,
    }
  }
  if (sectionDump.on) for (const p of parts) for (let i = 0; i < p.ring.length; i++) {
    const m = M(p.ri, i), l = stripLadder(m || {}, lim), r = (stamps[p.si] || [])[i]
    sectionDump.rows.push({ ri: p.ri, i, lu: key, cw, lim, corner: cornerAt.get(`${p.ri}|${i}`) ?? null,
      owner: r == null ? null : `${runs[r].skelId}|${runs[r].side}|${runs[r].segOrd}`,
      resolved: m ? `${m.matOuter}/${m.matInner}` : null, tl: m?.treelawn ?? null, sw: m?.sidewalk ?? null,
      hasTL: m?.hasTL ?? null, outWalk: l.outWalk, inWalk: l.inWalk, dOut: l.dOut,
      walk: [l.walkFrom, l.walkTo], lawn: [l.lawnFrom, l.lawnTo] })
  }
  const F = new Map(parts.map(p => [p, mk(p)]))
  // ⛔ THE RAMP LIVES ON THE DENSIFIED RING, so a check reading the ORIGINAL edges cannot see it and
  // would report the very step it was built to remove. Disclose the densified spans — the depths the
  // offset is actually handed — so the gate measures continuity where continuity is decided.
  if (sectionDump.on) for (const p of parts) {
    const g = F.get(p), S = (v) => Array.isArray(v) ? v[0] : v, E = (v) => Array.isArray(v) ? v[1] : v
    for (let j = 0; j < p.dring.length; j++) {
      const a = p.dring[j], b = p.dring[(j + 1) % p.dring.length]
      const w = g.walkFromD(j)
      sectionDump.ramp.push({ ri: p.ri, j, src: p.dsrc[j], kS: p.dkS[j], kE: p.dkE[j],
        walkFrom: [S(w) - cw, E(w) - cw], len: Math.hypot(b[0] - a[0], b[1] - a[1]) })
    }
  }
  const pedOuter = insAt(cw)
  // ⛔⛔ THE SLIDE IS UNIONED IN — NEVER CUT AND ADDED BACK ALONG THE SAME EDGE. Clipper is
  // integer-space (1 mm); a difference followed by a union on the same boundary leaves the two
  // halves as separate polygon records that merely touch, so the band reads as broken while its
  // area is unchanged. Measured: cutting the corner out and painting it back cost the acceptance
  // 79 → 54 on geometry that was a strict SUPERSET of the original. The stamp above needs no cut
  // at all — the arc is drawn by the same four offsets as the legs — and this is the one piece
  // that is genuinely additional.
  const W = band(insD(p => F.get(p).walkFromD), insD(p => F.get(p).walkToD))
  return {
    Wacc:   inBlock(slidWalk.length ? unionRings([...W, ...slidWalk]) : W),
    tlByLu: { [key]: inBlock(slidWalk.length ? differenceRings(band(insD(p => F.get(p).lawnFromD), insD(p => F.get(p).lawnToD)), slidWalk) : band(insD(p => F.get(p).lawnFromD), insD(p => F.get(p).lawnToD))) },
    luByLu: { [key]: inBlock(insAt(WB)) },
    curb:   inBlock(band(curbOuter, pedOuter)),
    capped,
    feArcs, feRepeat,
  }
}

export function sectionPass(shapeTiles, cw, stripMat, blockCustoms = null) {
  const Wacc = [], tlByLu = {}, luByLu = {}
  for (const st of shapeTiles) {
    const t = sectionPassTile(st, cw, stripMat, blockCustoms)
    Wacc.push(...t.Wacc)
    for (const k in t.tlByLu) (tlByLu[k] || (tlByLu[k] = [])).push(...t.tlByLu[k])
    for (const k in t.luByLu) (luByLu[k] || (luByLu[k] = [])).push(...t.luByLu[k])
  }
  return { Wacc, tlByLu, luByLu }
}

// The blockCustoms slice that affects ONE tile's FILL: the override entries its
// runs reference (keyed skelId→side→segOrd). Identical slice → identical FILL, so
// the per-tile memo (sectionOpen's cache) can skip the recompute. Cheap — a few
// runs per tile, only actually-present overrides serialized.
function tileSliceKey(st, blockCustoms) {
  if (!blockCustoms) return ''
  let s = ''
  for (const run of st.runs || []) {
    const c = blockCustoms[run.skelId]?.[run.side]?.[run.segOrd]
    if (c) s += run.skelId + '|' + run.side + '|' + run.segOrd + '=' + JSON.stringify(c) + ';'
  }
  // [CAP FLIP] Cap customs key on the reserved cap-segOrd (not a run segOrd), so
  // they'd be invisible to the run loop above — the per-tile cache would then miss
  // a cap flip. Fold each round-tip's cap custom in so a flip invalidates the tile.
  for (const t of st.roundTips || []) {
    if (!t.skelId || !t.capEnd) continue
    const cc = readCapCustom(blockCustoms, t.skelId, t.capEnd)
    if (cc) s += 'cap|' + t.skelId + '|' + t.capEnd + '=' + JSON.stringify(cc) + ';'
  }
  return s
}

// ── THE WALL · Phase D · sectionOpen ───────────────────────────────────────
// Section OPENS the frozen artifact: compose the whole Section ground render
// off shapeTiles ALONE — block silhouette (the frozen iA), curb stroke
// (iA − iC), asphalt silhouette (ring − iA), and the ped FILL via sectionPass.
// Same chain-free contract as sectionPass: parameters carry only the artifact
// + design params (cw, stripMat, an optional boundary stencil polygon) — there
// is NO handle on streets / chains / measures / ribbons, so a Section surface
// rendering through here physically cannot re-derive the shape. The per-tile
// compositions mirror the shape loop's emit lines (Aacc / Cacc / blockRaw in
// buildTileGround) but read ONLY frozen fields — buildTileGround never runs.
// Accepts shapeTiles built in-memory OR loaded from shape.json (sectionPass
// already tolerates the serialized roundTipKeys array).
let _staleBandsWarned = false
export function sectionOpen(shapeTiles, cw, stripMat = { outer: 'LU', inner: 'SW' }, stencil = null, blockCustoms = null, cache = null, selectedTileSet = null) {
  // Block-local memo. Each tile's FILL + asphalt/curb/block depends ONLY on its
  // own frozen fields, cw, stripMat, and its own blockCustoms slice — so a
  // Section drag (which writes a fresh blockCustoms object every frame but
  // touches one tile's slice) only needs to recompute the edited tile. With a
  // caller-owned `cache` (Map keyed by tile index) the rest reuse cached rings;
  // cache=null is the stateless whole-map path (a cold bake). The global merge
  // still runs every call — cheap (one union per layer vs the per-run offset
  // storm) — and it keeps the output bit-identical to the un-cached pass.
  const tileGeo = (st, i) => {
    const key = cw + '|' + stripMat.outer + stripMat.inner + '|' + tileSliceKey(st, blockCustoms)
    if (cache) { const hit = cache.get(i); if (hit && hit.key === key) return hit }
    // ⚠️⚠️ A STALE ARTIFACT PATH — AND IT IS LOUD, BECAUSE A QUIET ONE IS THE WORST CASE HERE.
    // ⛔ The producer no longer emits `bands`; ③'s FILL is struck LIVE off the stamp. So a tile
    // arriving with bands is a `shape.json` frozen BEFORE that flip, and consuming it means the
    // operator is looking at a FILL THAT AUTHORING CANNOT MOVE — a plausible-looking map whose
    // handles do nothing. That is exactly Layer 0 q2, and it would present as "my treelawn edit
    // isn't working" rather than as an error. ⭐ The branch stays because a stale artifact is a
    // REAL state and refusing to draw it would make a re-pour a prerequisite for opening the tool;
    // the DEFECT WAS NEVER THE DRAW, it is the silence — so it says so, once per pass.
    // ▶ The cure is a re-pour. `PIPELINE §5`: the browser writes `shape.json` on Survey-exit.
    if (st.bands) {
      if (!_staleBandsWarned) {
        _staleBandsWarned = true
        console.warn('[tileGround][SECTION] ⛔ this artifact carries FROZEN `bands` — it was poured before ③\'s FILL went live. It will DRAW, but the ped FILL cannot respond to authoring: a treelawn or material edit will move 0 m². RE-POUR to author the fill.')
      }
      const b = st.bands
      const bundle = {
        key,
        W: b.sidewalk || [],
        // ⭐ KEYED BY THE TILE'S OWN LAND USE, not a placeholder. Jacob: "LU is a gettable/knowable
        // datapoint… stamp the LU into the initial ground map." The tile carries `lu`, so the bands
        // bucket by it exactly as the chain path's per-class buckets do — every colour knob and
        // visibility toggle rides these keys, and a private key costs the operator control silently
        // (`bake-ground.js`'s PAINT_ORDER comment: a key no entry consumes "drops silently from the
        // slab — that is exactly how the divided median vanished").
        // ⛔ `unknown` is a REAL CLASS here, not a fallback: `luForRing` returns it when the data
        // cannot say, and painting that as a distinct thing is what makes an unclassified block
        // visible rather than plausible.
        tlByLu: { [st.lu || 'unknown']: b.treelawn || [] },
        luByLu: { [st.lu || 'unknown']: b.lu || [] },
        A: differenceRings([st.ring], st.iA || []),   // asphalt is still tile − curb
        C: b.curb || [],
        block: st.iA || [],
      }
      if (cache) cache.set(i, bundle)
      return bundle
    }
    // ⭐⭐⭐ THE STAMP INQUIRY — a tile carrying a per-POINT stamp is offset, not walked.
    // ⛔ `sectionPassTile` is the per-RUN painter: it asks where a frontage starts and stops,
    // trims legs back from corners and lets a corner pad DECLINE. On a fully polygonized contour
    // none of those questions exists — there are no legs and no nodes, only "what depth HERE".
    // Handing a contour tile to the walk painter is what cost ~a third of the ped fill even after
    // the NaN was closed: its `runs` are grouped off `iA`, so they neither partition the ring nor
    // cover it (88.5% on LS, and 29 tiles OVER-cover), and curb with no run got no band at all.
    // ⛔ Chosen by the tile's own shape, never a flag — a mixed artifact cannot silently take the
    // wrong path for half its tiles.
    const r = hasStampInquiry(st) ? sectionPassProtoTile(st, cw, stripMat, blockCustoms)
                                  : sectionPassTile(st, cw, stripMat, blockCustoms)
    const iA = st.iA || []
    const bandJoin = st.bandJoin || 'miter'
    const cap = Number.isFinite(st.cap) ? st.cap : (cw + (st.tl || 0) + (st.sw || 0))
    const bundle = {
      key,
      W: r.Wacc, tlByLu: r.tlByLu, luByLu: r.luByLu,
      A: differenceRings([st.ring], iA),                                       // asphalt = tile − rounded inner
      // ⭐ THE CURB IS PART OF THE SAME LADDER when the stamp inquiry built it: `iA − ins(cw)`,
      // a per-point VARIABLE offset. The concentric fallback below is the walk painter's, and it
      // is not the same shape — using it on a stamped tile put 1,820 m² of curb where ③ had none.
      C: r.curb || differenceRings(iA, offsetRings(iA, -Math.min(cw, cap), bandJoin)),
      block: iA,                                                               // block silhouette = the frozen curb ring
    }
    if (cache) cache.set(i, bundle)
    return bundle
  }
  // Partition into REST (opaque) and SELECTED-corridor (translucent) buckets so
  // Section can render the selected block + neighbours translucent (the aerial
  // reads through) while the rest stays opaque. selectedTileSet = the tile
  // indices in the corridor; null/empty → everything is REST (prior behavior,
  // bit-identical). The per-tile bundles are shared (cache), so this only forks
  // the cheap final unions.
  const mkAcc = () => ({ A: [], C: [], W: [], block: [], tl: {}, lu: {} })
  const rest = mkAcc()
  const sel = (selectedTileSet && selectedTileSet.size) ? mkAcc() : null
  for (let i = 0; i < shapeTiles.length; i++) {
    const b = tileGeo(shapeTiles[i], i)
    const acc = (sel && selectedTileSet.has(i)) ? sel : rest
    acc.A.push(...b.A); acc.C.push(...b.C); acc.W.push(...b.W); acc.block.push(...b.block)
    for (const k in b.tlByLu) (acc.tl[k] || (acc.tl[k] = [])).push(...b.tlByLu[k])
    for (const k in b.luByLu) (acc.lu[k] || (acc.lu[k] = [])).push(...b.luByLu[k])
  }
  const clip = (rings) => (stencil && stencil.length >= 3) ? intersectRings(rings, [stencil]) : rings
  const finish = (acc) => {
    const treelawnByLu = {}, luByClass = {}
    for (const k of Object.keys(acc.tl)) treelawnByLu[k] = clip(unionRings(acc.tl[k]))
    for (const k of Object.keys(acc.lu)) luByClass[k]   = clip(unionRings(acc.lu[k]))
    return {
      asphalt:  clip(unionRings(acc.A)),
      curb:     clip(unionRings(acc.C)),
      sidewalk: clip(unionRings(acc.W)),
      treelawnByLu, luByClass,
      block:    clip(acc.block),
    }
  }
  const out = finish(rest)
  out.selected = sel ? finish(sel) : null
  return out
}

/**
 * [A07] Curb-producer disclosure — the prose for the FAILURE gate.
 *
 * The gate itself is `createVocabularyGate` (cartograph/osm-vocabulary.mjs), the
 * kit's established "name what this town brought that we handled quietly" idiom.
 * Only the wording differs: "N OSM feature(s) … did NOT vote" is false about a
 * curb, so the module takes the nouns as a parameter and this is A07's set.
 * ⛔ If a fourth customer appears, parameterize further — do not fork the module.
 */
const CURB_PRODUCER_PROSE = {
  noun: 'tile',
  classNoun: 'failure mode',
  unit: 'm²',
  body: [
    '   These tiles QUALIFIED for the D6a parallel offset and the offset came back',
    '   UNUSABLE, so they fell to the legacy carve. ⛔ This is NOT the median/sliver',
    '   class — those are correct carves and are counted separately. Worst first:',
  ],
}

/**
 * [A07] Curb-producer disclosure — the LEGITIMATE class.
 *
 * An account, not an alarm. A median or a sliver taking the carve is the RIGHT
 * answer; the defect was only ever that nobody could tell. So this counts and
 * reports, and never warns — 41 warnings a pour is a new silence, because nobody
 * reads it. It also keeps the raw sets, because `reason` applies a precedence
 * (median before small) and 19 of LS's 101 tiles are genuinely both.
 */
function makeCurbProducerCensus() {
  const byReason = new Map()
  let offset = 0, carve = 0
  const sets = { median: 0, small: 0, both: 0 }
  return {
    count(producer, reason, f) {
      if (producer === 'offset') offset++
      else carve++
      if (reason) byReason.set(reason, (byReason.get(reason) || 0) + 1)
      if (f.isMedianTile) sets.median++
      if (f.small) sets.small++
      if (f.isMedianTile && f.small) sets.both++
    },
    summary() {
      const total = offset + carve
      return {
        total, offset, carve,
        byReason: Object.fromEntries([...byReason.entries()].sort((a, b) => b[1] - a[1])),
        sets,
        /** One line for a log or a status bar. Never a warning. */
        line: total
          ? `curb producers: ${offset}/${total} offset · ${carve} carve` +
            (byReason.size ? ` (${[...byReason.entries()].map(([k, v]) => `${v} ${k}`).join(' · ')})` : '')
          : 'curb producers: no tiles',
      }
    },
  }
}

export function buildTileGround(ribbons, opts = {}) {
  // ── [A07] THE PRODUCER DISCLOSURE ─────────────────────────────────────────
  // Two objects, deliberately, because the two things must not be conflated:
  //
  //   curbProducerCensus — the LEGITIMATE class. Medians, slivers, opt-outs are
  //     correct as carves; they are not warnings. This is an ACCOUNT, surfaced
  //     in the tool and printed once by the bake, never a per-tile alarm.
  //   curbProducerGate   — the FAILURE. An offset that passed the gate and came
  //     back unusable. Loud, and reported SEPARATELY so it can never be buried
  //     among ~41 routine structural lines.
  //
  // The gate is the same idiom as the ingest vocabulary gate one stage upstream
  // (cartograph/osm-vocabulary.mjs) — same invariant: a silent choice is not a
  // disclosed one. Reused rather than reimplemented (ROADMAP A07, BRIEF §4).
  const curbProducerCensus = makeCurbProducerCensus()
  const curbProducerGate = createVocabularyGate('curb-producer',
    'A tile qualified for the D6a parallel offset and the offset came back unusable. ' +
    'This is NOT the median/sliver class — those are correct carves. Investigate the ' +
    'ring: offsetRingVariable returned nothing, collapsed below 5% of the tile, or ' +
    'overflowed past it. POLYGON-FIRST §3 / ROADMAP A07.',
    CURB_PRODUCER_PROSE)
  const curbWidth = Number.isFinite(opts.curbWidth) ? opts.curbWidth : CURB_WIDTH
  const stencil = opts.stencil && opts.stencil.length >= 3 ? opts.stencil : null
  // Smooth centerlines BEFORE face extraction so the grout (shared tile edges)
  // → tiles → strips all come out smooth — loops/curves round. smoothChain is
  // INTERPOLATING (passes through every authored vertex), so intersection
  // nodes survive exactly and the graph stays noded for the face walk. Default
  // 0.5 matches the figure-ground path + the store default (WYSIWYG).
  const smooth = Number.isFinite(opts.smooth) ? opts.smooth : 0
  let streets = (ribbons?.streets || []).filter(s => s?.points?.length >= 2 && !s.gradeSeparated)
  // Grade-separated roads (freeway corridor + ramps; OSM bridge/tunnel/layer, flagged
  // on the frame at 6854122) are EXCLUDED from the face graph: they cross other
  // streets in 2D with no real junction, which bowties the DCEL face walk into the
  // degenerate interchange polygons. They're stroked as flat asphalt strips after the
  // union below (like alleys), so the highway/ramps still render. §HANDOFF-onframe-faces.
  const gradeSep = (ribbons?.streets || []).filter(s => s?.points?.length >= 2 && s.gradeSeparated)
  // Pre-smooth originals (same index order — smoothing maps in place). The
  // per-fe segment ordinals are defined on the ORIGINAL centerline (IX nodes
  // survive interpolating smoothing exactly), so per-block width resolution
  // reads segOrd off these, matching the authoring key.
  const streetsOrig = streets
  // Junction nodes = coords shared by ≥2 streets. The smoother must keep these
  // HARD (not round the centerline through an intersection) or the inward ped
  // band notches on the far side — the "thorn opposite a T" / complex-IX corner.
  // Built over ALL ribbon streets so a shared node is seen even if one incident
  // street is grade-separated; matched by jKey (0.01 m).
  // SSoT: the SAME junction-key set the navy-centerline draw uses (the one
  // smooth knob — smoothCenterline.js), so both pin junctions identically.
  const junctionKeys = junctionKeysOf(ribbons?.streets || [])
  if (smooth > 0) {
    streets = streets.map(s => {
      const sm = smoothChain(s.points, smooth, undefined, junctionKeys)
      return sm ? { ...s, points: sm } : s
    })
  }

  // Per-street effective measure (median-facing sides pre-zeroed), indexed by
  // the street index the DCEL tags each edge with.
  const measures = streets.map(s => effectiveMeasure(s, streets))
  // Surface the ambiguous treelawn run-sides for the operator (bake only —
  // gated on opts.reportGlean, never the browser path). opts.surveyStreets is
  // the raw survey.json `streets` map (carries the per-street `source` tag).
  if (opts.reportGlean) {
    if (opts.surveyStreets) globalThis.__cartographSurvey = opts.surveyStreets
    reportGlean(measures, streets)
  }
  const cw = curbWidth
  // Per-fe (per-block) asphalt-width overrides. blockCustoms is keyed
  // (skelId → side → segOrd) — the SAME identity the Survey/Measure drag writes.
  // Resolved per tile RUN: asphalt is stroked per run (strokeOpen below), so a
  // per-block pavementHW steps the asphalt edge for that segment; the curb +
  // concentric ped bands (offsets of the asphalt-inner) follow. segOrd is
  // computed on the original chain so it matches the authoring key.
  const blockCustoms = (opts.blockCustoms && typeof opts.blockCustoms === 'object') ? opts.blockCustoms : null
  const ixIdxsByStreet = blockCustoms
    ? (() => {
        const seg = resolveChainSegmentation(streetsOrig)
        return streetsOrig.map(s => {
          const n = s?.points?.length || 0
          return [...(seg.get(s) || [])].filter(i => i > 0 && i < n - 1).sort((a, b) => a - b)
        })
      })()
    : null
  // segOrd of a run = number of interior-IX vertices at/before the run's lower
  // original-index boundary. (A run spanning a single natural segment — the
  // common case — resolves exactly; on a through-junction's far side a run can
  // span two segments and takes the lower one's width.)
  const runSegOrd = (run) => {
    const op = streetsOrig[run.streetIdx]?.points
    const ixIdxs = ixIdxsByStreet?.[run.streetIdx]
    if (!op || !ixIdxs?.length) return 0
    const idxOf = (pt) => {
      let bi = 0, bd = Infinity
      for (let i = 0; i < op.length; i++) { const dx = op[i][0] - pt[0], dy = op[i][1] - pt[1]; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i } }
      return bi
    }
    const a = Math.min(idxOf(run.poly[0]), idxOf(run.poly[run.poly.length - 1]))
    let segOrd = 0
    for (const i of ixIdxs) if (i <= a) segOrd++
    return segOrd
  }
  // A run's effective side measure: per-fe pavementHW (if authored) over the
  // per-chain default. Only pavementHW is per-fe here (the asphalt silhouette is
  // Survey's concern); ped band depths stay the tile's representative value.
  const runMeasure = (run) => {
    const base = measures[run.streetIdx]
    if (!blockCustoms) return base
    const so = streetsOrig[run.streetIdx]
    const sk = (so && (so.skelId || so.name)) || null
    if (!sk) return base
    const c = blockCustoms[sk]?.[run.side]?.[runSegOrd(run)]
    if (!c || !Number.isFinite(c.pavementHW)) return base
    const baseSide = base?.[run.side] || {}
    return { ...base, [run.side]: { ...baseSide, pavementHW: c.pavementHW } }
  }
  // Per-fe width at a (chain, side, segOrd) — mirrors runMeasure (blockCustoms
  // pavementHW over the effective per-chain base). Shared by the E3.2 window
  // construction and the through-node construction below.
  const feWidthAt = (idx, side, segOrd) => {
    const base = Math.max(0, measures[idx]?.[side]?.pavementHW || 0)
    if (!blockCustoms) return base
    const so = streetsOrig[idx]
    const sk = (so && (so.skelId || so.name)) || null
    const c = sk ? blockCustoms[sk]?.[side]?.[segOrd] : null
    return (c && Number.isFinite(c.pavementHW)) ? Math.max(0, c.pavementHW) : base
  }
  const segOrdAtEnd = (idx, end) => end === 'start' ? 0 : (ixIdxsByStreet?.[idx] || []).length
  const segOrdAtVertex = (idx, lower) => { let so = 0; for (const i of (ixIdxsByStreet?.[idx] || [])) if (i <= lower) so++; return so }
  // A2 / F3 — corner R reads the authored controls: base 4.5 m (AASHTO
  // residential baseline, R_CLASS_DEFAULT) × the global Corners slider
  // (cornerRadiusScale), with per-corner / per-IX overrides resolved per tile
  // vertex (the gold-dot authoring). Each tile vertex IS a centerline node = an
  // IX point; its two bounding tile edges are the corner's two legs.
  const baseR = Number.isFinite(opts.cornerR) ? opts.cornerR : 4.5
  const scale = Number.isFinite(opts.cornerRadiusScale) ? opts.cornerRadiusScale : 1
  const R = Math.max(0, baseR * scale)   // uniform fallback (perimeter pass)
  const ixOverrides = (opts.cornerRadiusOverrides && typeof opts.cornerRadiusOverrides === 'object') ? opts.cornerRadiusOverrides : null
  const cornerOverrides = (opts.cornerCornerRadiusOverrides && typeof opts.cornerCornerRadiusOverrides === 'object') ? opts.cornerCornerRadiusOverrides : null
  // Override-key helpers — MUST match CornerEditHandles / buildBlockGeometryV2
  // exactly (ixKey = 3-dp point; legKey = `${skelId}:${f|b}`; per-corner key =
  // ixKey|sorted(legA,legB); per-corner wins over per-IX; both pre-scale).
  const ixKeyOf = (p) => `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`
  const skelOf = (si) => { const s = streets[si]; return (s && (s.skelId || s.name)) || '?' }
  // The corner key for tile vertex i = (IX point, the two bounding tile edges as
  // legs) — MUST match CornerEditHandles exactly. The leg along the OUTGOING edge
  // runs +index iff that edge is forward → 'f'; the INCOMING leg runs +index iff
  // that edge is NOT forward → 'f'. Used for both override lookup AND tagging the
  // achieved fillet so the handle can find it.
  const cornerKeyAt = (V, edges, i) => {
    const n = edges.length
    const eOut = edges[i], eIn = edges[(i - 1 + n) % n]
    const legOut = `${skelOf(eOut.streetIdx)}:${eOut.forward ? 'f' : 'b'}`
    const legIn  = `${skelOf(eIn.streetIdx)}:${eIn.forward ? 'b' : 'f'}`
    const [a, b] = legOut <= legIn ? [legOut, legIn] : [legIn, legOut]
    return `${ixKeyOf(V)}|${a}|${b}`
  }
  const resolveVertR = (V, edges, i) => {
    const ixk = ixKeyOf(V)
    if (cornerOverrides) {
      const v = cornerOverrides[cornerKeyAt(V, edges, i)]
      if (Number.isFinite(+v)) return Math.max(0, +v)
    }
    if (ixOverrides && Number.isFinite(+ixOverrides[ixk])) return Math.max(0, +ixOverrides[ixk])
    return baseR
  }
  // (nearestVertexIndex / nearestCornerVertexIndex / nearestVertR are module-level
  // now — shared with the chain-free sectionPass.)
  // The ACHIEVED fillet per corner key — what the construction actually rounded
  // each corner to (after the geometric inset clamp). The authoring handle reads
  // this so its magenta arc IS the curb, never a re-derived approximation.
  const cornerFillets = {}
  // T3 — the authoritative, INJECTIVE corner set the Survey corner-handle rides
  // (one corner truth). One entry per SHARP tile-ring corner, keyed identically
  // to `cornerKeyAt` (= the write-path key `resolveVertR` reads overrides off),
  // each carrying its resolved radius + the fSink arc that rounds THIS corner
  // (or null when R=0 / unfilleted). Sourced here, not off `ribbons.intersections`
  // (the legacy raw-OSM list the render no longer matches) — so every drawn
  // corner gets a handle. See HANDOFF-tile-T3-corner-handles.md.
  const cornerSet = []
  // M3 — overridable ped-strip materials. Default {outer:'LU', inner:'SW'}
  // (V1.5 model). T3 makes this per-fe (the ctrl-click LU↔SW swap); for now a
  // single model proves the data path. 'LU' → land-use colour, 'SW' → sidewalk.
  const stripMat = {
    outer: opts.stripMaterials?.outer === 'SW' ? 'SW' : 'LU',
    inner: opts.stripMaterials?.inner === 'LU' ? 'LU' : 'SW',
  }

  // G8 — dead-end caps. A degree-1 street endpoint (caps.degree===1) is a real
  // dead-end tip. Cap = authored capEnds ?? the geometric caps.cap ?? round.
  //   round       → round the asphalt at the tip + the ped wraps it (cul-de-sac)
  //   blunt/none  → flat asphalt, NO ped wrap (the street just ends, LU abuts)
  // (tipKey is module-level now — shared with sectionPass.)
  // Dead-end DEGREE is computed GEOMETRICALLY (count segments incident to each
  // node), not from `caps.degree` — toy ribbons carry no `caps` field, so
  // gating on it skipped every toy dead-end. A street endpoint whose node has
  // exactly one incident segment is a real tip. The cap TYPE comes from the
  // authored capEnds / capStart|End (the Survey end-cap assigner mirrors its
  // capStart/capEnd into capEnds via mergeLiveRibbons) → caps.cap → round.
  const nodeDeg = new Map()
  for (const s of streets) {
    const pts = s.points
    if (!pts) continue
    for (let i = 0; i < pts.length; i++) {
      const inc = (i === 0 || i === pts.length - 1) ? 1 : 2
      const k = tipKey(pts[i])
      nodeDeg.set(k, (nodeDeg.get(k) || 0) + inc)
    }
  }
  const deadEndTips = new Map()
  // [DEAD-END MOUTH WRAP] skelIds that own a genuine deg-1 dead-end tip. A loop
  // street (Benton / Waverly / Saint Vincent — closed bodies, "don't kill Benton")
  // has NO deg-1 endpoint (both ends are junctions), so it is EXCLUDED here — the
  // mouth-wrap below fires only for true dead-end streets, never a loop segment that
  // happens to present the same-skelId-opposite-side coincident-end signature.
  const deadEndSkels = new Set()
  for (const s of streets) {
    const caps = s.caps, ce = s.capEnds, pts = s.points
    if (!pts) continue
    for (const [k, idx] of [['start', 0], ['end', pts.length - 1]]) {
      if (nodeDeg.get(tipKey(pts[idx])) !== 1) continue   // not a real dead-end tip
      deadEndSkels.add(s.skelId || s.name)
      const authored = ce?.[k] || (k === 'start' ? s.capStart : s.capEnd)
      // 'none' / unspecified → the documented default 'round' cul-de-sac. (An
      // explicit 'none' was being treated as blunt → the blunt ped→LU reclaim
      // left a stray LU notch up the pendant centerline while the fillet still
      // rounded the end — a broken-looking cap. Only an explicit 'blunt' is blunt.)
      const cap = (authored && authored !== 'none') ? authored : (caps?.[k]?.cap || 'round')
      const m = s.measure
      // ⭐ THE BULB IS A SYMMETRIC CIRCLE ON THE ROAD'S REAL CENTERLINE (Jacob,
      // 2026-08-12). ⛔ THE CHAIN IS NOT THAT CENTERLINE — an asymmetric
      // pavementHW is exactly what "the traced line is off-centre" looks like.
      // So the cul-de-sac keeps ONE radius, the MEAN half-width, and its CENTRE
      // is the chain displaced toward the wider side by half the difference.
      // Both legs' asphalt edges are then exactly `hw` from that centre, so the
      // bulb is tangent to both and neither shoulder steps.
      // ⛔ NOT max: max DISCARDED one of the two authored widths — the
      // operator's decision (Layer 0 q3) — and made the narrower leg meet the
      // cap at a step of |left − right|, on 25 of LS's 50 caps (worst
      // nicholson-place, 4.20 m). ⛔ Not min, not a clamp: same objection.
      // ✅ left === right ⇒ hw === the old max AND the displacement is exactly
      // 0, so every symmetric cap stays byte-identical.
      // ⭐ There is no left branch and no right branch: one radius, one centre.
      const hwL = Math.max(0, Number.isFinite(m?.left?.pavementHW) ? m.left.pavementHW : 0)
      const hwR = Math.max(0, Number.isFinite(m?.right?.pavementHW) ? m.right.pavementHW : 0)
      const hw = (hwL + hwR) / 2
      // The chain's tangent at this tip in POINT ORDER — the measure convention
      // (right-perp = (-dz, dx) of the point order; the same one computePerps
      // and the E3.2 sidePerp use), so a positive (right − left) displaces
      // toward `right`. Walk off any duplicated vertex before taking it.
      const tipP = pts[idx]
      let nb = null
      for (let q = 1; q < pts.length; q++) {
        const cand = pts[idx === 0 ? q : idx - q]
        if (!cand) break
        if (Math.hypot(cand[0] - tipP[0], cand[1] - tipP[1]) > 1e-9) { nb = cand; break }
      }
      const tdx = nb ? (idx === 0 ? nb[0] - tipP[0] : tipP[0] - nb[0]) : 1
      const tdz = nb ? (idx === 0 ? nb[1] - tipP[1] : tipP[1] - nb[1]) : 0
      const tLen = Math.hypot(tdx, tdz) || 1
      const disp = (hwR - hwL) / 2
      const capCx = tipP[0] + (-tdz / tLen) * disp
      const capCy = tipP[1] + (tdx / tLen) * disp
      // Best-effort fill (SECTION.md §3.1): the dead-end tip's ped wrap uses the
      // STANDARD model too (treelawn Y/N × ADA), so the cap wrap (sectionPass)
      // matches the straight-section bands. (The round-cap FILL bug — ② — is the
      // wrap geometry, separate from these depths.)
      const tlw = (gleanTreelawn(m, 'left') || gleanTreelawn(m, 'right')) ? STD_TREELAWN : 0
      const sww = ADA_SIDEWALK
      // `px,py` and the KEY stay the chain's tip NODE — every lookup, cap-flip
      // slot and ring-vertex match is keyed off it. `c` is the bulb's CENTRE and
      // is the only thing the circle primitives may use.
      deadEndTips.set(tipKey(pts[idx]), { cap, hw, tl: tlw, sw: sww, px: pts[idx][0], py: pts[idx][1], c: [capCx, capCy] })
    }
  }

  // [D2] Consume the FROZEN tile topology (prebake artifact) instead of
  // re-walking the chain graph per build; extractFaces stays as the fallback
  // for artifacts that carry no tiles (toy / pre-D2). SMOOTHING WRINKLE
  // (PREBAKE-POLYGONIZATION-PLAN §1, decided): the frozen topology is
  // UNSMOOTHED. Render-time smoothing is retired (smooth=0 everywhere since
  // 2026-06-04 — see streetSmooth above); if the dormant smooth>0 knob is
  // ever revived, smoothed geometry belongs at reshape over the frozen
  // rings' edge runs (the D5 reshape) — until then a smooth>0 call falls
  // back to the live walk over the smoothed streets, so the dormant knob's
  // semantics stay bit-for-bit what they were (rings AND strokes smoothed
  // together, never mixed).
  let tiles = smooth > 0 ? null : tilesFromFrozen(ribbons?.tiles, streets)

  // ══ [SLICE 2 — TEMPORARY] THE SUBSTRATE WALK AS A THIRD TILE SOURCE ═══════
  // ⛔⛔ THIS BLOCK IS SCAFFOLDING AND MUST NOT HARDEN. It exists to get the
  // walk's TOPOLOGY in front of the operator's eye once. It elects a source
  // PER TILE, which is a seam the finished model does not have.
  //
  // Why a hybrid at all: the walk emits no perimeter faces, and it may not.
  // RIBBONS §1, retracted and re-ruled 2026-08-12 — "the rim BOUNDS, it does
  // not own": no coupler, no baseMeasure, no band. ⛔ A rim coupler would make
  // the rim a side-chain, which that retraction forbids. So the rim comes from
  // the frozen artifact until "what closes a face against the stencil?" is
  // RULED. That ruling is the thing that deletes this block.
  //
  // ⛔ DEFAULT OFF, STRUCTURALLY: nothing passes `opts.substrateTiles` and the
  // env var is unset, so with the flag off `tiles` is the frozen artifact,
  // byte-for-byte, and this block cannot touch it.
  // ⛔ NEVER SILENT. A quiet mix of two producers is a fallback wearing a
  // feature's clothes. The split is printed every run and the election is
  // asserted disjoint-and-total against the frozen list — a mismatch THROWS.
  const substrateTiles = opts.substrateTiles ?? (typeof process !== 'undefined' && process.env?.SUBSTRATE_TILES === '1')
  if (substrateTiles && tiles && ribbons?.junctionMap?.nodes?.length) {
    // ⭐ The width feed is the PRODUCER'S OWN, not a second one: `feWidthAt` +
    // `segOrdAtVertex` are the same closures the shape pass resolves runs with,
    // and a custom resolves per RUN, so the arc's lower index is the segOrd key.
    const idxBySkel = new Map()
    streetsOrig.forEach((s, i) => { const k = s?.skelId || s?.name; if (k != null && !idxBySkel.has(k)) idxBySkel.set(k, i) })
    const walkWidthAt = (skelId, side, vertexIdx, arc) => {
      const idx = idxBySkel.get(skelId)
      if (idx === undefined) return NaN
      return feWidthAt(idx, side, segOrdAtVertex(idx, arc ? arc.i0 : vertexIdx))
    }
    tiles = electSubstrateTiles({ frozenTiles: tiles, ribbons, streets: streetsOrig, widthAt: walkWidthAt })
  }

  if (!tiles) {
    // Live fallback (toy / pre-D2, no frozen artifact): derive dead-end cap
    // identity HERE — the only place it can come from when nothing is frozen.
    // The FROZEN path reads caps stamped ONCE at prebake (derive.js); it never
    // re-derives (that's the "freeze, don't derive live" decision, 2026-07-17).
    const capEndpointKeys = chainEndpointKeys(streets)
    tiles = extractFaces(streets).map(f => {
      const caps = detectTileCaps(f.ring, f.edges, capEndpointKeys, (e) => streets[e?.streetIdx]?.skelId || streets[e?.streetIdx]?.name)
      return caps.length ? { ...f, caps } : f
    })
  }

  // E2 — the CONSTRUCTED medians (prebake artifact: ribbons.medians[]; the
  // divided pair's inter-chain lens partitioned into kind:'median' segments +
  // kind:'merge' asphalt patches — transition tapers and crossing windows,
  // DIVIDED-CORRIDOR-PLAN §4.2/§4.4). Both are positive identity-carrying
  // objects, not leftover faces: merge patches fill as asphalt in WHATEVER
  // tile they land (the taper needle, the divided×divided crossing box — the
  // pill class — die here); median segments paint as median ground via
  // sectionPass, even in a block face that absorbed median area through a
  // one-sided junction (TRUMAN-FORENSICS addendum). bbox-prefiltered per tile.
  const ringBBox = (r) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1] }
    return [x0, y0, x1, y1]
  }
  // [E3.2] When the junction map is consumed, a median fragment ABSORBED by a
  // node's apron (m.absorbedBy — the 69 m² S-18th nose piece) stops painting
  // as median: its ring rides the apron as junction asphalt instead (the trim
  // E3.1 specified). Without a junctionMap (toy / old data) nothing changes.
  const consumeJM = !!(ribbons?.junctionMap?.nodes?.length)
  const collectKind = (kind, excludeAbsorbed) => {
    const polys = (ribbons?.medians || [])
      .filter(m => m?.kind === kind && !(excludeAbsorbed && m.absorbedBy) && Array.isArray(m.ring) && m.ring.length >= 3)
      .map(m => m.ring)
    const boxes = polys.map(ringBBox)
    return (tileRing) => {
      if (!polys.length) return []
      const tb = ringBBox(tileRing)
      const cand = polys.filter((_, i) => {
        const mb = boxes[i]
        return mb[0] <= tb[2] && mb[2] >= tb[0] && mb[1] <= tb[3] && mb[3] >= tb[1]
      })
      return cand.length ? intersectRings(cand, [tileRing]) : []
    }
  }
  const medianClipFor = collectKind('median', consumeJM)
  const mergeClipFor = collectKind('merge', false)

  // ── [E3.2] THE JUNCTION CONSTRUCTION — consume ribbons.junctionMap by
  // identity (the E2 pattern; JUNCTION-CURE-PLAN §3/§6, SKELETON.md §5e).
  // The junction silhouette was never constructed: independent constant-width
  // butt-capped run strokes meet at the node, so every width discontinuity
  // manufactures spurious geometry (step / dip / scoop / tooth / spur). Per
  // CONTINUITY PAIR the prebake stamped, the curb is ONE physical curb through
  // the node; here the shape pass constructs it:
  //   1. The stroked run polyline is TRIMMED back by a window W from the node
  //      (the E3.1 de-taper nose for a tapering carriageway end — the straight
  //      body ends there; a short blend window for un-tapered joins).
  //   2. A WINDOW POLYGON replaces the emergent coverage in the window: chain
  //      seam (window-start → node) → node → X → the constructed curb back to
  //      the window-start curb point. X is the pair's SHARED curb point at the
  //      node, so the two halves weld — no step, the width transitions
  //      monotonically across the window (correct datums degenerate it to a
  //      straight line; datum repair itself is E3.4).
  //   3. ONE APRON per node (the junctionMap's apron spec): a fan of the legs'
  //      curb points around the node, positively asphalt — kills the deg-6
  //      inter-pair slivers and the zero-width chain-retrace spurs. A median
  //      fragment the apron absorbed (absorbsMedians) rides it as asphalt
  //      (the S-18th 69 m² trim).
  // Everything lands in aFill via the same bbox-filtered per-tile clip the E2
  // merge patches use. No junctionMap (toy / old data) → no-op by construction.
  const k3 = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)
  const jPolys = []           // window polys + aprons + absorbed median rings
  const jTrims = new Map()    // `${skelId}|${side}|${k3(runEndpoint)}` → trim distance
  // The PERIMETER variant: streets outside the tile network are filled by the
  // G9 perimeter pass (max-side widths, whole-chain butt-capped strokes) — the
  // same emergent-junction defect at a second construction site (the north
  // Lafayette curb, mark #2, lives there). Same windows, but the constructed
  // curb uses the perimeter's width datum (max side): additive window polys +
  // per-chain keep-out cuts (a whole-chain stroke can't be run-trimmed). The
  // perimeter clip keeps these out of tile territory and vice versa.
  const jPerimPolys = []      // perimeter-datum window polys
  const jPerimCuts = new Map()// skelId → keep-out quads (cut from that chain's perimeter stroke only)
  // ── [E3.3] THE CORNER IDENTITIES — consume ribbons.junctionMap corners
  // (SKELETON.md §5e: the corner-builder cornered the WRONG LEGS — a
  // carriageway STUB rounded against the cross street instead of the
  // corridor's clean outer-edge legs). Per stamped stub with an identified
  // outer side, the corner is CONSTRUCTED from the identified curb LINES
  // (the as-built E3.2 window curb where one exists, else the de-tapered
  // body ⊕ per-fe width — the same probe the E3.2 windows use): the
  // keep-out quadrant beyond BOTH lines at their intersection P (the true
  // corner) is asserted BLOCK before the constructed coverage unions in, so
  // the stub's diagonal curl stroke can never invade the corner again (the
  // false-corner class). filletRing then rounds the corner that falls out
  // at P — both legs ARE the identified outer legs, so the fillet corners
  // the right legs by construction. A pairing whose P lies outside a line's
  // physically-valid span is a PHANTOM (the leg doesn't reach that
  // quadrant) and is skipped — those corners stay emergent, exactly as
  // today. Nodes without junctionMap stamps are untouched.
  const jCornerCuts = []
  if (consumeJM) {
    const jm = ribbons.junctionMap
    const idxBySkel = new Map(streets.map((s, i) => [(s.skelId || s.name), i]))
    const nrm = (x, z) => { const L = Math.hypot(x, z) || 1; return [x / L, z / L] }
    const sidePerp = (t, side) => side === 'right' ? [-t[1], t[0]] : [t[1], -t[0]]   // measure convention: right = (-dz,dx) of point order
    const chainLen = (p) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L }
    // Walk `dist` inward from the chain's `end` endpoint. Returns the seam
    // (endpoint → window-start, the chain's own vertices), the window-start
    // point ws, the inward unit tangent tIn there, and the achieved distance
    // (clamped early at an interior junction — a window never crosses another
    // intersection — or at the chain's far end).
    const walkIn = (pts, end, dist) => {
      const n = pts.length
      const at = (i) => end === 'start' ? pts[i] : pts[n - 1 - i]
      const seam = [[at(0)[0], at(0)[1]]]
      let acc = 0, t = null
      for (let i = 1; i < n; i++) {
        const a = at(i - 1), b = at(i)
        const L = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (L < 1e-9) continue
        t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]
        if (acc + L >= dist) {
          const f = (dist - acc) / L
          const ws = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
          seam.push(ws)
          return { seam, ws, tIn: t, d: dist }
        }
        acc += L
        seam.push([b[0], b[1]])
        if (i < n - 1 && nodeDeg.get(tipKey(b)) >= 3) return { seam, ws: seam[seam.length - 1], tIn: t, d: acc }
      }
      return { seam, ws: seam[seam.length - 1], tIn: t || [1, 0], d: acc }
    }
    const viAt = (pts, at) => { for (let i = 1; i < pts.length - 1; i++) if (Math.abs(pts[i][0] - at[0]) < 5e-3 && Math.abs(pts[i][1] - at[1]) < 5e-3) return i; return -1 }
    const pushPoly = (ring) => { if (ring.length >= 3) jPolys.push(signedArea(ring) >= 0 ? ring : ring.slice().reverse()) }
    // Non-absorbed median rings (for the defensive apron subtract) with bboxes.
    const medRings = (ribbons?.medians || []).filter(m => m?.kind === 'median' && !m.absorbedBy && Array.isArray(m.ring) && m.ring.length >= 3).map(m => m.ring)
    const medBoxes = medRings.map(ringBBox)
    let nPairs = 0, nWindows = 0, nAprons = 0, nAbsorbed = 0, nTipSkip = 0, nSkip = 0, nCorners = 0
    for (const nd of jm.nodes) {
      const legByChain = new Map(nd.legs.map(l => [l.chain, l]))
      const noseOf = (chain, end) => { for (const w of (nd.deTaper || [])) if (w.chain === chain && w.end === end) return w.nose; return 0 }
      // Apron-fan anchors: each constructed pair contributes its X (ON the
      // constructed curb, pulled a hair inboard); leg-sides a constructed
      // pair covers are excluded from the width-based fan below (a w-based
      // vertex can poke through a miter-tightened curb — the needle class).
      const fanAnchors = []
      const pairedSides = new Set()
      const nodeCurbs = new Map()   // `${chain}|${side}` → the window's as-built curb (cp→X) for E3.3's corners
      // ── continuity pairs → window polys + stroke trims ──
      for (const pr of (nd.continuity || [])) {
        if (pr.source === 'tip-wrap') { nTipSkip++; continue }   // pendant tips stay G8's (round-cap canon)
        // Resolve both halves: geometry probe + curb extrapolation at the node.
        const halves = []
        let bad = false
        for (const half of [pr.a, pr.b]) {
          const leg = legByChain.get(half.chain)
          const idx = idxBySkel.get(half.chain)
          const s = idx != null ? streets[idx] : null
          if (!leg || !s || !s.points || s.points.length < 2) { bad = true; break }
          const pts = s.points, len = chainLen(pts)
          const wP = Math.max(0, measures[idx]?.left?.pavementHW || 0, measures[idx]?.right?.pavementHW || 0)
          if (leg.end === 'through') {
            const vi = viAt(pts, nd.at)
            if (vi < 0) { bad = true; break }
            const tPO = nrm(pts[vi + 1][0] - pts[vi - 1][0], pts[vi + 1][1] - pts[vi - 1][1])
            const nh = sidePerp(tPO, half.side)
            halves.push({ half, leg, idx, pts, len, through: true, vi, tPO, nh, w: 0, wP, axisAtNode: [nd.at[0], nd.at[1]], tDir: tPO })
          } else {
            // The E2 nose is where the MEDIAN starts; the taper RUN — the
            // chain segment angling into the node — ends at the first chain
            // VERTEX at/past the nose (SKELETON §5e: follow the straight
            // section, not the taper; chains carry sparse authored vertices,
            // so the node-side segment IS the taper). The window snaps there.
            const nose = noseOf(half.chain, leg.end)
            let W0 = 0
            if (nose > 0) {
              const n = pts.length
              const at = (i) => leg.end === 'start' ? pts[i] : pts[n - 1 - i]
              let acc = 0
              for (let i = 1; i < n - 1; i++) {
                acc += Math.hypot(at(i)[0] - at(i - 1)[0], at(i)[1] - at(i - 1)[1])
                if (acc >= nose) { W0 = acc; break }
              }
              if (!W0) W0 = nose
              W0 = Math.min(W0, 0.45 * len)
            }
            // Probe the BODY tangent just past the window (past the taper).
            const probe = walkIn(pts, leg.end, W0 > 0 ? W0 + 1.5 : Math.min(8, 0.4 * len))
            const tPO = leg.end === 'start' ? probe.tIn : [-probe.tIn[0], -probe.tIn[1]]
            const nh = sidePerp(tPO, half.side)
            const w = feWidthAt(idx, half.side, segOrdAtEnd(idx, leg.end))
            if (!(w > 0.01)) { bad = true; break }
            // Extrapolate the de-tapered straight-body curb to the node's
            // longitudinal station: E = (node projected onto the body axis) + w·n̂.
            const toNode = [-probe.tIn[0], -probe.tIn[1]]
            const Lp = (nd.at[0] - probe.ws[0]) * toNode[0] + (nd.at[1] - probe.ws[1]) * toNode[1]
            const axisAtNode = [probe.ws[0] + toNode[0] * Lp, probe.ws[1] + toNode[1] * Lp]
            const E = [axisAtNode[0] + nh[0] * w, axisAtNode[1] + nh[1] * w]
            // Alternate candidate: extrapolate along the nose-station tangent
            // (the chain's own node-side segment). When the first authored
            // vertex is FAR and the chain genuinely bends there, the snap
            // extrapolation can miss the mate's curb by meters — the
            // self-check below keeps whichever lands on the continuity.
            let alt = null
            if (nose > 0 && W0 > nose + 1) {
              const pl = walkIn(pts, leg.end, nose + 0.05)
              const tPOl = leg.end === 'start' ? pl.tIn : [-pl.tIn[0], -pl.tIn[1]]
              const nhl = sidePerp(tPOl, half.side)
              const toN = [-pl.tIn[0], -pl.tIn[1]]
              const Lpl = (nd.at[0] - pl.ws[0]) * toN[0] + (nd.at[1] - pl.ws[1]) * toN[1]
              const axl = [pl.ws[0] + toN[0] * Lpl, pl.ws[1] + toN[1] * Lpl]
              alt = { W0: Math.min(Math.max(nose, 2), 0.45 * len), nh: nhl, E: [axl[0] + nhl[0] * w, axl[1] + nhl[1] * w], axisAtNode: axl, tDir: pl.tIn }
            }
            halves.push({ half, leg, idx, pts, len, through: false, nh, w, wP, E, nose, W0, axisAtNode, tDir: probe.tIn, alt })
          }
        }
        if (bad) { nSkip++; continue }
        // Per-fe width for a through mate: the segment the curb continues onto
        // (the half beyond the node along the ender's axis).
        for (const h of halves) {
          if (!h.through) continue
          const mate = halves.find(o => o !== h)
          // The curb continues onto the through chain's segment AWAY from the
          // ender's body (tIn points node→body, so away = −tIn).
          let fwd = true
          if (mate && !mate.through) {
            const mProbe = walkIn(mate.pts, mate.leg.end, Math.min(8, 0.4 * mate.len))
            const away = [-mProbe.tIn[0], -mProbe.tIn[1]]
            fwd = (h.tPO[0] * away[0] + h.tPO[1] * away[1]) > 0
          }
          h.w = feWidthAt(h.idx, h.half.side, segOrdAtVertex(h.idx, fwd ? h.vi : h.vi - 1))
          if (!(h.w > 0.01)) { bad = true; break }
          // The blend lands on the CONTINUING segment's curb, not the chord
          // tangent — a bend at the through vertex would otherwise leave a
          // small jog where the blend tops out off the as-stroked curb.
          const tSeg = fwd
            ? nrm(h.pts[h.vi + 1][0] - h.pts[h.vi][0], h.pts[h.vi + 1][1] - h.pts[h.vi][1])
            : nrm(h.pts[h.vi][0] - h.pts[h.vi - 1][0], h.pts[h.vi][1] - h.pts[h.vi - 1][1])
          h.tDir = tSeg
          h.nh = sidePerp(tSeg, h.half.side)
          h.E = [nd.at[0] + h.nh[0] * h.w, nd.at[1] + h.nh[1] * h.w]
        }
        if (bad || halves.every(h => h.through)) { nSkip++; continue }
        // Extrapolation self-check: keep the candidate that lands nearer the
        // mate's curb (the continuity identity is the arbiter; 0.3 m
        // hysteresis keeps the snap default on ties).
        for (const h of halves) {
          if (!h.alt) continue
          const o = halves.find(x => x !== h)
          if (!o?.E) continue
          if (Math.hypot(h.alt.E[0] - o.E[0], h.alt.E[1] - o.E[1]) + 0.3 < Math.hypot(h.E[0] - o.E[0], h.E[1] - o.E[1])) Object.assign(h, h.alt)
        }
        // Sanity: the two halves' curbs must sit on the same world side.
        const [A, B] = halves
        if ((A.nh[0] * B.nh[0] + A.nh[1] * B.nh[1]) < 0.1) { nSkip++; continue }
        const dlt = Math.hypot(A.E[0] - B.E[0], A.E[1] - B.E[1])
        // Window length per ending half: the de-taper nose where the prebake
        // stamped one (the taper region IS the window), else a short blend
        // window scaled to the curb mismatch (nothing to do when it vanishes).
        for (const h of halves) {
          if (h.through) { h.W = 0; continue }
          h.W = h.W0 > 0 ? h.W0 : (dlt < 0.05 ? 0 : Math.min(8, Math.max(2, 2.5 * dlt)))
          h.W = Math.min(h.W, 0.45 * h.len)
        }
        const winHalves = halves.filter(h => h.W > 0.01)
        if (!winHalves.length) continue   // datums already perfect, no taper — nothing to construct
        // Final window-start geometry per windowed half. The curb point cp uses
        // the tangent just BODY-ward of ws (the trimmed stroke's butt cap is ⊥
        // to that segment — a window snapped to a vertex must not read the
        // taper segment's tangent).
        for (const h of winHalves) {
          const fin = walkIn(h.pts, h.leg.end, h.W)
          h.W = fin.d
          const tBody = walkIn(h.pts, h.leg.end, h.W + 0.05).tIn
          const tPO = h.leg.end === 'start' ? tBody : [-tBody[0], -tBody[1]]
          h.nhWs = sidePerp(tPO, h.half.side)
          // The poly seam runs ~0.6 m PAST the window start, into the trimmed
          // stroke: the closing edge (cp → seam end) then lies interior to the
          // stroke instead of edge-kissing its butt cap — an exact-coincident
          // seam leaves hairline retrace needles in the union boundary.
          h.seam = walkIn(h.pts, h.leg.end, h.W + 0.6).seam
          h.ws = fin.ws
          h.cp = [fin.ws[0] + h.nhWs[0] * h.w, fin.ws[1] + h.nhWs[1] * h.w]
        }
        // X — the pair's shared curb point at the node (per width datum: the
        // tile side resolves per-fe widths; the perimeter side max-side).
        // When the two legs genuinely CROSS (an angled join — the Papin stub
        // class), the shared curb point is the MITER intersection of the two
        // body curb lines; near-parallel legs (the common transition) fall
        // back to the through-curb / window-weighted blend point.
        const thr = halves.find(h => h.through)
        const other = halves.find(h => !h.through && h.W <= 0.01)
        for (const h of halves) h.EP = [h.axisAtNode[0] + h.nh[0] * h.wP, h.axisAtNode[1] + h.nh[1] * h.wP]
        for (const h of winHalves) h.cpP = [h.ws[0] + h.nhWs[0] * h.wP, h.ws[1] + h.nhWs[1] * h.wP]
        const [hA, hB] = halves
        const miter = (Ea, Eb) => {
          const det = hA.tDir[0] * hB.tDir[1] - hA.tDir[1] * hB.tDir[0]
          if (Math.abs(det) < 0.14) return null   // < ~8° — near-collinear legs, no stable miter
          const t = ((Eb[0] - Ea[0]) * hB.tDir[1] - (Eb[1] - Ea[1]) * hB.tDir[0]) / det
          const P = [Ea[0] + hA.tDir[0] * t, Ea[1] + hA.tDir[1] * t]
          const lim = 2.5 * Math.max(hA.w || hA.wP, hB.w || hB.wP) + 2
          return Math.hypot(P[0] - nd.at[0], P[1] - nd.at[1]) <= lim ? P : null
        }
        let X = miter(hA.E, hB.E), XP = miter(hA.EP, hB.EP)
        if (!X || !XP) {
          let fb, fbP
          if (thr) { fb = thr.E; fbP = thr.EP }
          else if (other) { fb = other.E; fbP = other.EP }
          else {
            const t = winHalves[0].W / (winHalves[0].W + winHalves[1].W)
            fb = [winHalves[0].cp[0] + (winHalves[1].cp[0] - winHalves[0].cp[0]) * t,
                  winHalves[0].cp[1] + (winHalves[1].cp[1] - winHalves[0].cp[1]) * t]
            fbP = [winHalves[0].cpP[0] + (winHalves[1].cpP[0] - winHalves[0].cpP[0]) * t,
                   winHalves[0].cpP[1] + (winHalves[1].cpP[1] - winHalves[0].cpP[1]) * t]
          }
          if (!X) X = fb
          if (!XP) XP = fbP
        }
        for (const h of winHalves) {
          // [node…ws] seam reversed → ws…node, then node→X→cp closes the window.
          const ring = h.seam.slice().reverse()
          ring.push([X[0], X[1]], [h.cp[0], h.cp[1]])
          pushPoly(ring)
          const sk = (streetsOrig[h.idx] && (streetsOrig[h.idx].skelId || streetsOrig[h.idx].name)) || h.half.chain
          jTrims.set(`${sk}|${h.half.side}|${k3(h.seam[0])}`, h.W)
          // [E3.3] the as-built constructed curb (cp→X) — the ONE curb truth
          // the corner pass must corner against (a straight-datum line would
          // disagree with the blend by |wA−wB| and tooth the boundary). The
          // line stays valid past cp along the trimmed stroke until the
          // chain's next bend — extend farPt there so a corner falling just
          // body-ward of a short window still constructs.
          {
            const dx = X[0] - h.cp[0], dz = X[1] - h.cp[1]
            const L = Math.hypot(dx, dz)
            if (L > 0.5) {
              let ext = 0
              {
                const pn = h.pts.length
                const at = (i) => h.leg.end === 'start' ? h.pts[i] : h.pts[pn - 1 - i]
                let acc = 0
                for (let i = 1; i < pn; i++) {
                  acc += Math.hypot(at(i)[0] - at(i - 1)[0], at(i)[1] - at(i - 1)[1])
                  if (acc > h.W + 0.05) { ext = Math.min(acc - h.W, 20); break }
                }
              }
              nodeCurbs.set(`${h.half.chain}|${h.half.side}`, { p0: [h.cp[0], h.cp[1]], u: [dx / L, dz / L], nb: [h.nhWs[0], h.nhWs[1]], w: h.w, farPt: [h.cp[0] - dx / L * ext, h.cp[1] - dz / L * ext] })
            }
          }
          // Perimeter variant: same window, the perimeter's width datum. The
          // keep-out quad (constructed curb → outward) cuts the chain's OWN
          // perimeter stroke so the wider butt cap can't tooth past the curb.
          const ringP = h.seam.slice().reverse()
          ringP.push([XP[0], XP[1]], [h.cpP[0], h.cpP[1]])
          if (ringP.length >= 3) jPerimPolys.push(signedArea(ringP) >= 0 ? ringP : ringP.slice().reverse())
          const K = h.wP + 4
          const cut = [
            [h.cpP[0], h.cpP[1]], [XP[0], XP[1]],
            [XP[0] + h.nhWs[0] * K, XP[1] + h.nhWs[1] * K],
            [h.cpP[0] + h.nhWs[0] * K, h.cpP[1] + h.nhWs[1] * K],
          ]
          if (!jPerimCuts.has(sk)) jPerimCuts.set(sk, [])
          jPerimCuts.get(sk).push(signedArea(cut) >= 0 ? cut : cut.slice().reverse())
          nWindows++
        }
        {
          const dX = Math.hypot(X[0] - nd.at[0], X[1] - nd.at[1]) || 1
          const s = Math.max(0, 1 - 0.25 / dX)
          fanAnchors.push([nd.at[0] + (X[0] - nd.at[0]) * s, nd.at[1] + (X[1] - nd.at[1]) * s])
        }
        for (const h of halves) pairedSides.add(`${h.half.chain}|${h.half.side}`)
        nPairs++
      }
      // ── the node apron ──
      if (nd.apron) {
        const fan = [...fanAnchors]
        for (const leg of nd.legs) {
          const idx = idxBySkel.get(leg.chain)
          const s = idx != null ? streets[idx] : null
          if (!s?.points || s.points.length < 2) continue
          const pts = s.points, len = chainLen(pts)
          let tPO = null, segL = 0, segR = 0
          if (leg.end === 'through') {
            const vi = viAt(pts, nd.at)
            if (vi < 0) continue
            tPO = nrm(pts[vi + 1][0] - pts[vi - 1][0], pts[vi + 1][1] - pts[vi - 1][1])
            segL = segR = segOrdAtVertex(idx, vi)
          } else {
            const probe = walkIn(pts, leg.end, Math.min(6, 0.4 * len))
            tPO = leg.end === 'start' ? probe.tIn : [-probe.tIn[0], -probe.tIn[1]]
            segL = segR = segOrdAtEnd(idx, leg.end)
          }
          for (const side of ['left', 'right']) {
            if (pairedSides.has(`${leg.chain}|${side}`)) continue   // covered by a constructed pair's X anchor
            const w = feWidthAt(idx, side, side === 'left' ? segL : segR)
            if (!(w > 0.01)) continue
            const nh = sidePerp(tPO, side)
            // A hair inboard of the curb — a fan vertex exactly ON the curb
            // makes a degenerate Clipper touch point (the spur-hygiene class).
            const r = Math.max(0.3, Math.min(w, 15) - 0.25)
            fan.push([nd.at[0] + nh[0] * r, nd.at[1] + nh[1] * r])
          }
        }
        if (fan.length >= 3) {
          fan.sort((p, q) => Math.atan2(p[1] - nd.at[1], p[0] - nd.at[0]) - Math.atan2(q[1] - nd.at[1], q[0] - nd.at[0]))
          // Defensive: never let the apron eat a real (non-absorbed) median tip.
          const fb = ringBBox(fan)
          const near = medRings.filter((_, i) => { const mb = medBoxes[i]; return mb[0] <= fb[2] && mb[2] >= fb[0] && mb[1] <= fb[3] && mb[3] >= fb[1] })
          for (const r of (near.length ? differenceRings([fan], near) : [fan])) pushPoly(r)
          nAprons++
        }
        for (const mi of (nd.apron.absorbsMedians || [])) {
          const m = (ribbons?.medians || [])[mi]
          if (m?.ring?.length >= 3) { pushPoly(m.ring.map(p => [p[0], p[1]])); nAbsorbed++ }
        }
      }
      // ── [E3.3] corner identities → the constructed corner (§5e at last).
      // Only nodes with stamped STUBS fire — a stub is the one leg that must
      // never corner; every corner here is built from identified curb lines.
      // Scope: DIVIDED-TRANSITION nodes (the 24-node sweep class, incl. the
      // park corners). Terminus/continuation/join stubs sit on the E3.4
      // datum-repair rows (Truman↔Lafayette w=2 scramble, Chouteau 6.70 m) —
      // constructing a corner from a scrambled width reshapes one artifact
      // into another; they pick this construction up once the datums hold.
      const stubRecs = nd.kinds?.includes('divided-transition') ? (nd.corners?.stub || []) : []
      if (stubRecs.length) {
        const stubChains = new Set(stubRecs.map(c => c.chain))
        // An identified curb LINE at this node: the leg's de-tapered body
        // tangent (the same window-snapped probe the E3.2 halves use) offset
        // by the per-fe width on the stamped side. nb = unit normal toward
        // the BLOCK side of the curb.
        const lineCache = new Map()
        const lineFor = (chain, side, halfDir) => {
          const ck0 = `${chain}|${side}`
          const ck = `${ck0}|${halfDir ? halfDir.map(v => v.toFixed(2)) : ''}`
          if (lineCache.has(ck)) return lineCache.get(ck)
          let out = null
          const leg = legByChain.get(chain)
          const idx = idxBySkel.get(chain)
          const s = idx != null ? streets[idx] : null
          if (leg && s?.points && s.points.length >= 2) {
            const pts = s.points, len = chainLen(pts)
            if (leg.end === 'through') {
              const vi = viAt(pts, nd.at)
              if (vi >= 0) {
                // The half of the through chain facing the corner — the one
                // pointing toward the stub's BLOCK side (halfDir = A.nb).
                // Segment tangent + per-fe segOrd resolved on that half
                // (point-order-forward keyed, the E3.2 convention).
                const fdir = nrm(pts[vi + 1][0] - pts[vi][0], pts[vi + 1][1] - pts[vi][1])
                const fwd = !halfDir || (fdir[0] * halfDir[0] + fdir[1] * halfDir[1]) >= 0
                const t = fwd ? fdir : nrm(pts[vi][0] - pts[vi - 1][0], pts[vi][1] - pts[vi - 1][1])
                const w = feWidthAt(idx, side, segOrdAtVertex(idx, fwd ? vi : vi - 1))
                if (w > 0.01) {
                  const nh = sidePerp(t, side)
                  // the straight-line model holds only to the half's far
                  // vertex — the chain may bend there
                  const fv = fwd ? pts[vi + 1] : pts[vi - 1]
                  out = { chain, side, u: t, nb: nh, p0: [nd.at[0] + nh[0] * w, nd.at[1] + nh[1] * w], w, farPt: [fv[0] + nh[0] * w, fv[1] + nh[1] * w] }
                }
              }
            } else if (nodeCurbs.has(ck0)) {
              // This curb was CONSTRUCTED by an E3.2 window — corner against
              // the as-built cp→X line (one curb truth; a fresh straight-
              // datum line would tooth against the blend).
              out = { ...nodeCurbs.get(ck0), chain, side, fromWindow: true }
            } else {
              const nose = noseOf(chain, leg.end)
              let W0 = 0
              if (nose > 0) {
                const np = pts.length
                const at = (i) => leg.end === 'start' ? pts[i] : pts[np - 1 - i]
                let acc = 0
                for (let i = 1; i < np - 1; i++) {
                  acc += Math.hypot(at(i)[0] - at(i - 1)[0], at(i)[1] - at(i - 1)[1])
                  if (acc >= nose) { W0 = acc; break }
                }
                if (!W0) W0 = nose
                W0 = Math.min(W0, 0.45 * len)
              }
              const probe = walkIn(pts, leg.end, W0 > 0 ? W0 + 1.5 : Math.min(8, 0.4 * len))
              const w = feWidthAt(idx, side, segOrdAtEnd(idx, leg.end))
              if (w > 0.01) {
                const tPO = leg.end === 'start' ? probe.tIn : [-probe.tIn[0], -probe.tIn[1]]
                const nh = sidePerp(tPO, side)
                // body line projected to the node's longitudinal station
                const toNode = [-probe.tIn[0], -probe.tIn[1]]
                const Lp = (nd.at[0] - probe.ws[0]) * toNode[0] + (nd.at[1] - probe.ws[1]) * toNode[1]
                const ax = [probe.ws[0] + toNode[0] * Lp, probe.ws[1] + toNode[1] * Lp]
                // curl magnitude — how far the pinned endpoint sits off the
                // body axis. ≈0 → the stub IS its body, nothing to construct.
                const latOff = Math.hypot(nd.at[0] - ax[0], nd.at[1] - ax[1])
                out = { chain, side, u: tPO, nb: nh, p0: [ax[0] + nh[0] * w, ax[1] + nh[1] * w], w, latOff, farPt: [probe.ws[0] + nh[0] * w, probe.ws[1] + nh[1] * w] }
              }
            }
          }
          lineCache.set(ck, out)
          return out
        }
        // Chains transitively linked by the node's continuity stamps are ONE
        // corridor — its curbs continue through the node and never corner
        // each other (a pure transition node constructs no corners at all).
        const grp = new Map()
        const find = (x) => { let r = x; while (grp.get(r) !== r) r = grp.get(r); grp.set(x, r); return r }
        for (const pr of (nd.continuity || [])) {
          for (const c of [pr.a.chain, pr.b.chain]) if (!grp.has(c)) grp.set(c, c)
          grp.set(find(pr.a.chain), find(pr.b.chain))
        }
        const grpOf = (c) => grp.has(c) ? find(c) : c
        // Continuity-linked sides are ONE physical curb — a corner pairs
        // against it ONCE (two stamped lines of one curb differ by the blend
        // kink at X and would stair-step the cut).
        const sameCurb = new Set()
        for (const pr of (nd.continuity || [])) {
          sameCurb.add(`${pr.a.chain}|${pr.a.side}~${pr.b.chain}|${pr.b.side}`)
          sameCurb.add(`${pr.b.chain}|${pr.b.side}~${pr.a.chain}|${pr.a.side}`)
        }
        const seenP = new Set()
        // The cut's two critical edges sit 1 cm BLOCK-ward of the exact curb
        // lines: where the emergent stroke edge already equals the line (the
        // no-op zones beyond the curl) an exact-coincident cut edge would
        // leave zero-width retrace needles in the difference boundary (the
        // spur-hygiene class) — the nudge keeps the stroke edge the boundary
        // there, invisibly.
        const NUDGE = 0.01
        const cornerAt = (A, B) => {
          const det = A.u[0] * B.u[1] - A.u[1] * B.u[0]
          if (Math.abs(det) < 0.34) return                  // near-parallel (<~20°): same curb, not a corner
          const pA = [A.p0[0] + A.nb[0] * NUDGE, A.p0[1] + A.nb[1] * NUDGE]
          const pB = [B.p0[0] + B.nb[0] * NUDGE, B.p0[1] + B.nb[1] * NUDGE]
          const t = ((pB[0] - pA[0]) * B.u[1] - (pB[1] - pA[1]) * B.u[0]) / det
          const P = [pA[0] + A.u[0] * t, pA[1] + A.u[1] * t]
          const lim = 2.5 * Math.max(A.w, B.w) + 4
          if (Math.hypot(P[0] - nd.at[0], P[1] - nd.at[1]) > lim) return
          const pk = Math.round(P[0] * 2) + ',' + Math.round(P[1] * 2)
          if (seenP.has(pk)) return
          seenP.add(pk)
          // e1 = along A toward the block side of B; e2 = along B toward the
          // block side of A → the quadrant beyond BOTH curbs from P = block.
          // Each extent is bounded by its line's REACH (where the chain may
          // bend, the straight-line model — and so the cut — must stop).
          const e1 = (A.u[0] * B.nb[0] + A.u[1] * B.nb[1]) > 0 ? A.u : [-A.u[0], -A.u[1]]
          const e2 = (B.u[0] * A.nb[0] + B.u[1] * A.nb[1]) > 0 ? B.u : [-B.u[0], -B.u[1]]
          // distance from P to the line's far valid point — past it the chain
          // may bend and the straight-line cut would bite the real curb. A
          // corner with no usable span (P at/beyond the far point) isn't one
          // this construction can build — skip, never emit a micro-cut.
          const spanTo = (L, e) => L.farPt ? (L.farPt[0] - P[0]) * e[0] + (L.farPt[1] - P[1]) * e[1] + 1 : lim + 8
          const S1 = Math.min(lim + 8, spanTo(A, e1))
          const S2 = Math.min(lim + 8, spanTo(B, e2))
          if (S1 < 3 || S2 < 3) return
          let cut = [
            [P[0], P[1]],
            [P[0] + e1[0] * S1, P[1] + e1[1] * S1],
            [P[0] + e1[0] * S1 + e2[0] * S2, P[1] + e1[1] * S1 + e2[1] * S2],
            [P[0] + e2[0] * S2, P[1] + e2[1] * S2],
          ]
          if (signedArea(cut) < 0) cut = cut.slice().reverse()
          jCornerCuts.push(cut)
          nCorners++
        }
        for (const oc of (nd.corners?.outer || [])) {
          if (!stubChains.has(oc.chain)) continue
          const A = lineFor(oc.chain, oc.side)
          // negligible curl → the stub IS its straight body; the emergent
          // corner already rides the identified legs (any residual is datum,
          // E3.4's) and a construction here would only manufacture
          // coincident-edge needles. Window-built curbs always corner.
          if (!A || (!A.fromWindow && (A.latOff || 0) < 0.4)) continue
          // partners: the node's other identified outer curbs OUTSIDE the
          // stub's own corridor group + the cross legs.
          const gA = grpOf(oc.chain)
          const cands = []
          for (const o2 of (nd.corners?.outer || [])) {
            if (o2.chain === oc.chain && o2.side === oc.side) continue
            if (grpOf(o2.chain) === gA) continue
            cands.push(o2)
          }
          for (const leg of nd.legs) if (leg.role === 'cross') for (const side of ['left', 'right']) cands.push({ chain: leg.chain, side })
          // resolve lines; sameCurb-linked cands collapse to ONE (prefer the
          // as-built window line over a straight-datum one)
          const lines = []
          for (const c2 of cands) {
            const B = lineFor(c2.chain, c2.side, A.nb)   // through partners: the half facing the stub's block side
            if (B) lines.push({ c2, B })
          }
          const drop = new Set()
          for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
            if (drop.has(i) || drop.has(j)) continue
            const a = lines[i], b = lines[j]
            if (!sameCurb.has(`${a.c2.chain}|${a.c2.side}~${b.c2.chain}|${b.c2.side}`)) continue
            drop.add(!a.B.fromWindow && b.B.fromWindow ? i : j)
          }
          lines.forEach(({ B }, i) => { if (!drop.has(i)) cornerAt(A, B) })
        }
        // branch apexes (the Grattan class): the stamped pair IS the corner
        for (const ap of (nd.corners?.apex || [])) {
          if (!stubChains.has(ap.legA.chain)) continue
          const A = lineFor(ap.legA.chain, ap.legA.side)
          if (!A || (!A.fromWindow && (A.latOff || 0) < 0.4)) continue
          const B = lineFor(ap.legB.chain, ap.legB.side, A.nb)
          if (B) cornerAt(A, B)
        }
      }
    }
    if (nPairs || nAprons) console.log(`    [E3.2] junction construction: ${nPairs} pairs (${nWindows} windows), ${nAprons} aprons, ${nAbsorbed} absorbed median ring(s)${nTipSkip ? `, ${nTipSkip} tip-wraps left to G8` : ''}${nSkip ? `, ${nSkip} pairs skipped (unresolvable)` : ''}`)
    if (nCorners) console.log(`    [E3.3] corner identities: ${nCorners} corners constructed`)
  }
  const jBoxes = jPolys.map(ringBBox)
  const junctionClipFor = (tileRing) => {
    if (!jPolys.length) return []
    const tb = ringBBox(tileRing)
    const cand = jPolys.filter((_, i) => { const mb = jBoxes[i]; return mb[0] <= tb[2] && mb[2] >= tb[0] && mb[1] <= tb[3] && mb[3] >= tb[1] })
    return cand.length ? intersectRings(cand, [tileRing]) : []
  }
  // [E3.3] per-tile corner-identity pieces. Cuts subtract from aFill (which
  // is already tile-clipped).
  const jcBoxes = jCornerCuts.map(ringBBox)
  const cornerCutFor = (tileRing) => {
    if (!jCornerCuts.length) return []
    const tb = ringBBox(tileRing)
    return jCornerCuts.filter((_, i) => { const mb = jcBoxes[i]; return mb[0] <= tb[2] && mb[2] >= tb[0] && mb[1] <= tb[3] && mb[3] >= tb[1] })
  }
  // Window-trimmed stroke source for a run: each run end sitting at a
  // constructed node pulls back by its window (the window poly supplies the
  // constructed coverage there). Null → the run is entirely inside windows.
  const jTrimmed = (run) => {
    if (!jTrims.size) return run.poly
    const so = streetsOrig[run.streetIdx]
    const sk = (so && (so.skelId || so.name)) || null
    if (!sk) return run.poly
    const p = run.poly
    const t0 = jTrims.get(`${sk}|${run.side}|${k3(p[0])}`) || 0
    const t1 = jTrims.get(`${sk}|${run.side}|${k3(p[p.length - 1])}`) || 0
    if (!t0 && !t1) return p
    return trimPolyline(p, t0, t1)
  }

  // ── THE THROUGH-NODE CONSTRUCTION — intersections at EVERY node ──────────
  // The osm2streets generalization (OSM2STREETS-GROUNDING §4.2 item 2 /
  // HANDOFF-intersection-everywhere): a Road runs between exactly two
  // intersections and is trimmed back at each; our chains run THROUGH
  // junction nodes, so a tile run can span several fe's — and it took ONE
  // width for the whole run ("takes the lower one's width", runSegOrd above):
  // the curb drew off the authored handle for every fe past the first, and the
  // discontinuity surfaced wherever the run ended. Likewise a centerline
  // dogleg at a through node (junction-protected RDP keeps the off-chord
  // OSM vertex, SKELETON §5a) kinked the stroked curb where the physical curb
  // runs straight. Both are DRAWING defects — the data (handles, node
  // positions) is right (Jacob, 2026-06-06).
  // Per junction node (degree ≥ 3), per chain THROUGH it, per side, this pass
  //   1. SPLITS the run at the node (the fe boundary) so each span strokes at
  //      its own per-fe width — the standard's road granularity, recovered;
  //   2. TRIMS each span back W from the node (trim_start/trim_end — the
  //      edge-collision trim, sized to the discontinuity + the cross width);
  //   3. CONSTRUCTS the window: seam along the chain, curb = the straight
  //      blend cpA→cpB (monotonic wA→wB; equal datums + straight chain
  //      degenerate to today's geometry — the construction self-gates).
  // W keeps the blend under the fillet turn-tol (atan(Δw/2W) < 18°), so no
  // spurious corner can be minted at a blend kink — corners only where real
  // legs meet. Toy data (no customs, straight chains) → zero stations → no-op.
  //
  // [THRU-T] A genuine deg-3 T (one through-street + one side street that ENDS
  // at the node) is NOT "nothing to construct" even when straight + uniform
  // width: the side-street mouth always splits the through-frontage across two
  // block faces (THRUNODE-GATE-FINDINGS), so the through band fragments there
  // unless a window is built. To SIZE that window to span the mouth, we need the
  // stem's half-width — the mouth interrupts the frontage over ~2×stemHW. Map
  // each deg-3 node → the max half-width among the legs that TERMINATE there.
  // node key → { hw, dir } for the leg that TERMINATES there (the T's stem): hw
  // sizes the window to span the mouth; dir (unit, node→stem) picks which SIDE of
  // the through-street the mouth is on, so the window/marker builds only there
  // (the far side has no cross street — building it would notch a clean frontage).
  const nodeStem = new Map()
  for (let si = 0; si < streets.length; si++) {
    const pts = streets[si]?.points
    if (!pts || pts.length < 2) continue
    for (const [end, ei] of [['start', 0], ['end', pts.length - 1]]) {
      const k = tipKey(pts[ei])
      if ((nodeDeg.get(k) || 0) < 3) continue
      const nb = ei === 0 ? pts[1] : pts[pts.length - 2]
      if (!nb) continue
      const so = segOrdAtEnd(si, end)
      const hw = Math.max(feWidthAt(si, 'left', so), feWidthAt(si, 'right', so))
      const dx = nb[0] - pts[ei][0], dy = nb[1] - pts[ei][1], L = Math.hypot(dx, dy) || 1
      const prev = nodeStem.get(k)
      if (!prev || hw > prev.hw) nodeStem.set(k, { hw, dir: [dx / L, dy / L] })
    }
  }
  const thruWins = []                    // window polys (positive asphalt)
  const thruSplits = new Map()           // `${streetIdx}|${side}` → [{ vi, W }]
  // [THRU-T ped] `${tipKey(node)}|${skelId}|${side}` for each genuine deg-3 T's
  // through-street frontage end. The mouth splits that frontage across two tiles,
  // so the tile-local isThrough (2 same-skelId run-ends) can never fire there —
  // this FROZEN set lets sectionPass recognise the through-continuation from ONE
  // run-end and suppress the false corner bid (the stem, not the through-street,
  // owns the corner). Sized/paired with the asphalt window above.
  const thruNodeSet = new Set()
  {
    const sidePerpT = (t, side) => side === 'right' ? [-t[1], t[0]] : [t[1], -t[0]]
    // Already-CONSTRUCTED nodes are the E3 machinery's domain (continuity
    // pairs, noses, aprons) — constructing here too would double-build with a
    // different curb model. The through-pass owns the rest. NOTE: since the
    // intersection-everywhere stamps, EVERY junction node has a junctionMap
    // record — the gate is whether the node carries E3 CONSTRUCTION, not
    // whether it is mapped ('plain' identity-only records stay ours).
    const jmNodeKeys = new Set(consumeJM
      ? ribbons.junctionMap.nodes.filter(n => (n.continuity?.length || n.deTaper?.length || n.apron)).map(n => tipKey(n.at))
      : [])
    for (let idx = 0; idx < streets.length; idx++) {
      const s = streets[idx]
      const pts = s?.points
      if (!pts || pts.length < 3) continue
      // Divided carriageways are the E2/E3 construction's domain end-to-end
      // (inner-edge anchored, median constructed at prebake, junctions
      // stamped) — a chord window on their snaking bodies reshapes the median.
      const role = streetsOrig[idx]?.phase?.role || s.phase?.role || ''
      if (s.anchor === 'inner-edge' || /^carriageway/.test(role)) continue
      // arc positions + junction stations on this chain
      const cum = [0]
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
      const stations = []
      for (let vi = 1; vi < pts.length - 1; vi++) {
        const k = tipKey(pts[vi])
        if ((nodeDeg.get(k) || 0) >= 3 && !jmNodeKeys.has(k)) stations.push(vi)
      }
      if (!stations.length) continue
      // point + unit tangent at arc position sPos
      const at = (sPos) => {
        let i = 1
        while (i < cum.length - 1 && cum[i] < sPos) i++
        const a = pts[i - 1], b = pts[i]
        const L = cum[i] - cum[i - 1] || 1
        const f = Math.min(1, Math.max(0, (sPos - cum[i - 1]) / L))
        return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] }
      }
      for (let si = 0; si < stations.length; si++) {
        const vi = stations[si]
        // off-chord kink of the node vertex against its chain neighbors
        const a = pts[vi - 1], v = pts[vi], b = pts[vi + 1]
        const cdx = b[0] - a[0], cdz = b[1] - a[1]
        const cL = Math.hypot(cdx, cdz) || 1
        const kink = Math.abs(((v[0] - a[0]) * cdz - (v[1] - a[1]) * cdx) / cL)
        // room to the neighboring stations / chain ends
        const sPrev = si > 0 ? cum[stations[si - 1]] : 0
        const sNext = si < stations.length - 1 ? cum[stations[si + 1]] : cum[cum.length - 1]
        const roomA = 0.45 * (cum[vi] - sPrev)
        const roomB = 0.45 * (sNext - cum[vi])
        // [THRU-T] Is this a genuine deg-3 T? deg-3 ∧ we're at an interior vertex
        // (in `stations` ⇒ this chain passes through) ⇒ EXACTLY one through-street
        // (a second through-leg would need deg-4). The node is already known
        // NOT-E3-constructed (jmNodeKeys excluded it at station selection). Such a
        // node's mouth ALWAYS breaks the frontage → build unconditionally, sized
        // to span the mouth (stem half-width as the window floor).
        const nk = tipKey(v)
        // ⚠️ SHELVED 2026-07-16 (default OFF): the thruTNode through-node marker
        // FAILED eye-gate (keyed the wrong run; proxy-only verified) AND its
        // isThruNode suppressor eats real corners' ADA pads (green wraps the corner
        // instead of a concrete pad). The real T-artifact was the flip/arrangement
        // orphan (fixed: expandCustomsAcrossFeSegOrds). Opt-in with thruTNode===true
        // only. This whole through-node organ is re-filed under junction-construction.
        const stem = (opts.thruTNode === true && (nodeDeg.get(nk) || 0) === 3) ? nodeStem.get(nk) : null
        // which side of the through-street the stem attaches to (sidePerpT 'right'
        // = [-t[1], t[0]]) — the mouth is there; the far side runs straight.
        const stemSide = stem ? ((stem.dir[0] * (-cdz / cL) + stem.dir[1] * (cdx / cL) > 0) ? 'right' : 'left') : null
        for (const side of ['left', 'right']) {
          const wA = feWidthAt(idx, side, segOrdAtVertex(idx, vi - 1))
          const wB = feWidthAt(idx, side, segOrdAtVertex(idx, vi))
          const dw = Math.abs(wA - wB)
          const buildForT = !!stem && side === stemSide   // genuine T, mouth on THIS side
          if (dw < 0.02 && kink < 0.3 && !buildForT) continue   // straight+uniform AND no T mouth here → nothing to construct
          if (!(Math.min(wA, wB) > 0.01)) continue         // a zero side (inner-edge carriageway) carries no curb
          const Wn = Math.min(8, Math.max(2, 1.7 * dw, 2.5 * kink, buildForT ? stem.hw : 0))
          const WA = Math.min(Wn, roomA), WB = Math.min(Wn, roomB)
          if (WA < 0.5 || WB < 0.5) continue               // no room — leave emergent
          const A = at(cum[vi] - WA), B = at(cum[vi] + WB)
          const nhA = sidePerpT(A.t, side), nhB = sidePerpT(B.t, side)
          const cpA = [A.p[0] + nhA[0] * wA, A.p[1] + nhA[1] * wA]
          const cpB = [B.p[0] + nhB[0] * wB, B.p[1] + nhB[1] * wB]
          // seam: 0.6 m past each window start, into the trimmed strokes (the
          // E3.2 hygiene — an exact-coincident seam leaves retrace needles)
          const s0 = Math.max(0, cum[vi] - WA - 0.6), s1 = Math.min(cum[cum.length - 1], cum[vi] + WB + 0.6)
          const seam = [at(s0).p]
          for (let i = 0; i < pts.length; i++) if (cum[i] > s0 && cum[i] < s1) seam.push(pts[i])
          seam.push(at(s1).p)
          let ring = [...seam, [cpB[0], cpB[1]], [cpA[0], cpA[1]]]
          if (ring.length >= 3) {
            if (signedArea(ring) < 0) ring = ring.slice().reverse()
            thruWins.push(ring)
          }
          const key = `${idx}|${side}`
          if (!thruSplits.has(key)) thruSplits.set(key, [])
          // Store the station COORDINATE (= the junction node, preserved exactly
          // by interpolating smoothing) so the run-poly match below is index-free
          // — when smooth>0, `vi` is a smoothed-space index that doesn't address
          // streetsOrig. See splitRunAtStations.
          thruSplits.get(key).push({ vi, at: [v[0], v[1]], W: { A: WA, B: WB } })
          // [THRU-T ped] mark this frontage end as a through-continuation so the
          // FILL pass suppresses the false corner (only the genuine deg-3 T's stem
          // side — the dw/kink windows already split within a tile so isThrough
          // fires there, and the far side runs straight with no corner to suppress).
          if (buildForT) { const sk = (streetsOrig[idx] && (streetsOrig[idx].skelId || streetsOrig[idx].name)) || idx; thruNodeSet.add(`${nk}|${sk}|${side}`) }
        }
      }
    }
    if (thruWins.length) console.log(`    [THRU] through-node construction: ${thruWins.length} windows at ${new Set([...thruSplits.keys()].map(k => k.split('|')[0])).size} chains`)
  }
  const thruBoxes = thruWins.map(ringBBox)
  const thruClipFor = (tileRing) => {
    if (!thruWins.length) return []
    const tb = ringBBox(tileRing)
    const cand = thruWins.filter((_, i) => { const mb = thruBoxes[i]; return mb[0] <= tb[2] && mb[2] >= tb[0] && mb[1] <= tb[3] && mb[3] >= tb[1] })
    return cand.length ? intersectRings(cand, [tileRing]) : []
  }
  // Split a tile run at its through-construction stations; each span strokes
  // at its own per-fe width (runSegOrd resolves per span) and is trimmed back
  // by the station's window so the window poly supplies the node coverage.
  const splitRunAtStations = (run) => {
    const stations = thruSplits.get(`${run.streetIdx}|${run.side}`)
    if (!stations?.length) return [run]
    const op = streetsOrig[run.streetIdx]?.points
    if (!op) return [run]
    const p = run.poly
    // indices of run-poly interior vertices that are stations of this chain
    const cuts = []
    for (let k = 1; k < p.length - 1; k++) {
      for (const st of stations) {
        const q = st.at || op[st.vi]   // coordinate match (smooth-safe; vi is smoothed-space when smooth>0)
        if (!q) continue
        if (Math.abs(p[k][0] - q[0]) < 5e-3 && Math.abs(p[k][1] - q[1]) < 5e-3) { cuts.push({ k, st }); break }
      }
    }
    if (!cuts.length) return [run]
    // run direction vs chain order: does the run walk the chain forward?
    const idxOf = (pt) => { let bi = 0, bd = Infinity; for (let i = 0; i < op.length; i++) { const dx = op[i][0] - pt[0], dy = op[i][1] - pt[1]; const d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i } } return bi }
    const fwd = idxOf(p[0]) <= idxOf(p[p.length - 1])
    const out = []
    let lo = 0, tPrev = 0
    for (const { k, st } of cuts) {
      // trim at the cut: chain-side A is BEFORE the node in chain order — in
      // run order that's the incoming side iff the run walks forward
      const tCut = fwd ? st.W.A : st.W.B
      out.push({ ...run, poly: p.slice(lo, k + 1), _thruT0: tPrev, _thruT1: tCut })
      tPrev = fwd ? st.W.B : st.W.A
      lo = k
    }
    out.push({ ...run, poly: p.slice(lo), _thruT0: tPrev, _thruT1: 0 })
    return out.filter(r => r.poly.length >= 2)
  }

  // Per tile (CONCENTRIC corners):
  //  1. Asphalt = the union of per-street-side run stadiums (PER-EDGE widths,
  //     butt caps → sharp miter corners, no cap-at-depth bulge), clipped to
  //     the tile. The road between two tiles is each tile's half meeting at the
  //     shared grout; asymmetric widths + divided medians fall out.
  //  2. Round the asphalt-inner region's sharp corners ONCE at the authored
  //     curb R → the curb line wraps every block corner at radius R.
  //  3. The ped bands are CONCENTRIC inward offsets of that rounded region:
  //     curb (R→R+cw), treelawn (→+tl), sidewalk (→+sw). Eroding a radius-R
  //     corner by d gives radius R+d — the nested-arc wrap Jacob's eye wants.
  //     (Curb width is global so it's exact; treelawn/sidewalk are now the
  //     STANDARD best-effort depths — SECTION.md §3.1 — replacing the old per-tile
  //     averaged measure. Per-edge ASPHALT width, the dominant asymmetry, is kept.)

  // M1 — each tile's land-use class. Reuse the figure-ground resolution:
  // blockLandUse override (by bbox blockKey) → the OSM parcel (face.use) the
  // tile's interior lands in → the deterministic hash palette. So a tile reads
  // its real class (commercial / park / institutional / …), not all-residential.
  const faceList = (ribbons?.faces || []).filter(f => f?.ring?.length >= 3 && f.use)
  const blockLandUse = (opts.blockLandUse && typeof opts.blockLandUse === 'object') ? opts.blockLandUse : null
  const luForRing = (ring) => {
    if (blockLandUse) { const bk = blockKeyFromRing(ring); if (blockLandUse[bk]) return blockLandUse[bk] }
    const [px, py] = ringInteriorPoint(ring)
    let best = null, bestArea = Infinity
    for (const f of faceList) {
      if (pointInRing(px, py, f.ring)) {
        const a = Math.abs(signedArea(f.ring))
        if (a < bestArea) { best = f.use; bestArea = a }   // smallest containing face wins (donut-safe)
      }
    }
    return best || pickLuFromHash(hashKey(blockKeyFromRing(ring)))
  }

  // Asphalt/curb/sidewalk are single-material (merged). Treelawn (M2) + the LU
  // remainder (M1) are grouped by the tile's class so they paint that class's
  // per-Look colour.
  const Aacc = [], Cacc = []   // shape strokes (asphalt, curb); ped accumulators come from sectionPass
  // ── THE WALL · Phase B · SHAPE pass (this loop) ────────────────────
  // The shape loop produces, per tile: the curb-line ring iA + cornerFillets
  // (the hardscape), emits the asphalt + curb strokes, and FREEZES everything a
  // later sectionPass needs into shapeTiles[] — the ring, iA, per-corner radii
  // (vertR), the representative ped depths (tl/sw), the land-use class, the
  // dead-end tips, and per-run { poly, side, measure } where `measure` is the
  // per-fe-resolved side measure (it carries segOrd's effect — the sole chain
  // reach-back, computed here where the chain is legitimately available). The
  // section pass then strokes the ped strips off ONLY this frozen data.
  // perTileMeta (= each tile's runMeta) is the freeze-receipt returned as
  // `_perRunMeta`. perTileMeta[i] / shapeTiles[i] align 1:1 with tiles[i].
  const perTileMeta = []
  // [CULDESAC] Turning-circle loop streets: a closed chain fitting a tight, small
  // circle (R 3–12 m, mean radial dev < 0.3 m). SV/Park qualify (res ≈0.02);
  // Benton/Waverly's faceted teardrop/couplet bodies don't (res ≫ 0.3) — they keep
  // their emergent face ("don't kill Benton"). A tile bounded by such a loop is a
  // cul-de-sac block → its curb is carved from the morphologically-closed road
  // (boolean keyhole) rather than the centerline offset that notched the stem↔bulb.
  const culDeSacLoops = new Map()   // streetIdx → { C:[x,y], R }
  for (let si = 0; si < streetsOrig.length; si++) {
    const pts = streetsOrig[si]?.points
    if (!pts || pts.length < 8) continue
    if (Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) > 1.0) continue
    const f = fitLoopCircle(pts)
    if (f && f.res < 0.3 && f.R >= 3 && f.R <= 12) culDeSacLoops.set(si, { C: [f.cx, f.cy], R: f.R })
  }
  const shapeTiles = []
  // ⛔ `_mouthProbe` EXCISED 2026-09-06 — labelled "TEMP probe" by its own author, gated on
  // `opts.deadEndMouthProbe`, which nothing passes. A temporary thing that outlives its occasion is
  // the debt pattern; git holds it if the investigation reopens.
  for (const tile of tiles) {
    // [THRU] runs split at through-construction stations → per-fe spans
    const runs = thruSplits.size ? groupRuns(tile).flatMap(splitRunAtStations) : groupRuns(tile)
    const runMeta = runs.map(run => {
      const so = streetsOrig[run.streetIdx]
      return {
        poly: run.poly,
        side: run.side,
        skelId: (so && (so.skelId || so.name)) || null,
        roadId: (so && (so.roadId || so.skelId || so.name)) || null,   // canonical through-road id — Section reads it post-Wall (name-transition ADA gate)
        // [BRIEF-terminal-node-sweep] the frozen IDENTITY (same-name+shared-vertex,
        // spans a spine↔carriageway divided transition that roadId does not). The
        // SHAPE cornerAt keys on it; the FILL corner/ADA bid reads it post-Wall.
        throughId: (so && (so.throughId || so.roadId || so.skelId || so.name)) || null,
        // [BRIEF-terminal-node-sweep · FILL] per run-END: is it THROUGH (true) or
        // TERMINAL (false)? A run follows the centerline, so its poly-ends are chain
        // vertices. A poly-end AT the chain's own endpoint reads the frozen `through`
        // stamp (degree-1 tip = terminal); a MID-CHAIN poly-end (a tile-split of a
        // continuous frontage — Kennett×S18) is always THROUGH. The FILL corner bid
        // reads this so a through-frontage split across tiles stops bidding a FALSE
        // ADA corner, while the terminal stem keeps its real one.
        thruEnds: (() => {
          if (!so || !so.points || so.points.length < 2) return [true, true]
          const cs = so.points[0], ce = so.points[so.points.length - 1]
          const nearC = (p, c) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 0.6
          const at = (p) => nearC(p, cs) ? (so.through ? so.through.start : true)
                          : nearC(p, ce) ? (so.through ? so.through.end : true)
                          : true   // mid-chain tile-split → through
          return [at(run.poly[0]), at(run.poly[run.poly.length - 1])]
        })(),
        segOrd: runSegOrd(run),
        anchor: (so && so.anchor) || null,
        measure: runMeasure(run),               // per-fe-resolved side measure (override pavementHW) — for the asphalt edge `a`
        baseMeasure: measures[run.streetIdx],   // per-street base measure — for the treelawn slab depth `td` (uses base pavementHW)
      }
    })
    perTileMeta.push(runMeta)
    // G8 — dead-end tips on this tile (a run boundary vertex that is a degree-1
    // node). Round-capped tips get a round asphalt disk so the cul-de-sac rounds
    // (the butt-capped runs alone end flat); blunt/none tips stay flat and later
    // suppress the ped wrap so LU abuts the street's flat end.
    const roundTips = [], bluntTips = []
    const seenTip = new Set()
    // Cap IDENTITY per tip (frozen tile.caps → skelId/capEnd), attached to the
    // matching tip so the flippable cap wrap can read its custom (readCapCustom)
    // in sectionPass. Keyed by the tip node.
    const capIdByTip = new Map()
    for (const c of (tile.caps || [])) {
      const v = tile.ring?.[c.vertexIdx]
      if (v) capIdByTip.set(tipKey(v), { skelId: c.skelId, capEnd: c.capEnd })
    }
    if (runs.length > 1) {
      for (const run of runs) {
        for (const p of [run.poly[0], run.poly[run.poly.length - 1]]) {   // tip may sit at EITHER run end
          const tk = tipKey(p)
          if (seenTip.has(tk)) continue
          const t = deadEndTips.get(tk)
          if (t) { seenTip.add(tk); const cid = capIdByTip.get(tk); (t.cap === 'round' ? roundTips : bluntTips).push({ p, c: t.c, hw: t.hw, tl: t.tl, sw: t.sw, ...(cid || {}) }) }
        }
      }
    }
    const roundTipKeys = new Set(roundTips.map(t => tipKey(t.p)))
    const aStads = []
    // [A06] Parallel to `aStads`: the owning run's `tile.ring` VERTEX INDEX, so the
    // asphalt carries provenance into the boolean instead of being recovered after
    // it. `run.poly[0]` is a reference INTO `ring` (`groupRuns` pushes ring elements,
    // never copies), so `indexOf` is exact identity — not a coordinate compare.
    // A stad with no resolvable owner stays `null`; null is refused, never guessed.
    const aStadLabs = []
    const _labelStads = (from, lab) => { for (let k = from; k < aStads.length; k++) aStadLabs[k] = lab }
    for (const run of runs) {
      const d = edgeDepth(runMeasure(run), run.side, cw, 'A')   // per-fe asphalt half-width
      if (d > 1e-6) {
        // [E3.2] a run end at a constructed junction node strokes only its
        // body — the window poly supplies the constructed coverage beyond.
        // [THRU] span ends at a through-construction station likewise.
        let sp = jTrimmed(run)
        if (sp && (run._thruT0 || run._thruT1)) sp = trimPolyline(sp, run._thruT0 || 0, run._thruT1 || 0)
        if (sp) { const _f = aStads.length; aStads.push(...strokeOpen(sp, d)); const _li = tile.ring.indexOf(run.poly[0]); _labelStads(_f, _li >= 0 ? _li : null) }
      }
    }
    for (const t of roundTips) if (t.hw > 1e-6) { const c = capCentre(t); aStads.push(circlePoly(c[0], c[1], t.hw)); aStadLabs[aStads.length - 1] = null }
    let aFill = aStads.length ? intersectRings(unionRings(aStads), [tile.ring]) : []
    // [A06] The SAME two operations, run labelled, alongside the originals. Geometry
    // is taken from the ORIGINAL calls — this pair only carries provenance, so a bug
    // here can change what is STAMPED but never what is DRAWN. `_aFillLabs` is nulled
    // by any later unlabelled reshape of `aFill` (below): a label that stopped being
    // true is refused, not carried forward.
    let _aFillLabs = null, _aFillBase = null
    if (aStads.length) {
      const _u = booleanLabelled(clipperLib.ClipType.ctUnion, aStads, aStadLabs)
      if (_u.labels) {
        const _ix = booleanLabelled(clipperLib.ClipType.ctIntersection, _u.rings, _u.labels, [tile.ring], [tile.ring.map((_, i) => i)])
        if (_ix.labels && _ix.rings.length === aFill.length) _aFillLabs = _ix.labels
      if (_aFillLabs) _aFillBase = aFill.map(r => r.slice())
      }
    }
    // E2 — constructed-median consumption (replaces the G3a >40%-median-facing
    // heuristic). merge patches (transition tapers, crossing windows) are
    // corridor asphalt in whatever tile they land; a tile mostly covered by a
    // median segment IS the median tile — all ped zeroed so no treelawn/
    // sidewalk sliver leaks into the median. The median region itself paints
    // via sectionPass (med, frozen below). Authored inboard pavement ("eat
    // into the median") still wins — the per-run strokes union over it.
    const mergeClip = mergeClipFor(tile.ring)
    if (mergeClip.length) aFill = aFill.length ? unionRings([...aFill, ...mergeClip]) : mergeClip
    // [E3.3] corner identities — FIRST the corner quadrant beyond the two
    // identified curb lines is asserted BLOCK on the emergent strokes (the
    // stub's curl stroke can never corner); the constructed coverage below
    // (windows / aprons) then unions OVER the cut, so a window's wA→wB blend
    // curb survives where it legitimately tops the straight line.
    const cCut = cornerCutFor(tile.ring)
    if (cCut.length && aFill.length) aFill = differenceRings(aFill, cCut)
    // [E3.2] junction construction — window polys + node aprons land as
    // positive asphalt in whatever tile they fall, same as the merge patches.
    const jClip = junctionClipFor(tile.ring)
    if (jClip.length) aFill = aFill.length ? unionRings([...aFill, ...jClip]) : jClip
    // [THRU] through-node windows — the constructed blend coverage at every
    // split station (same positive-asphalt landing as the E3.2 windows).
    const tClip = thruClipFor(tile.ring)
    if (tClip.length) aFill = aFill.length ? unionRings([...aFill, ...tClip]) : tClip
    // [A06] Any of the four constructed reshapes above (merge nose, corner cut,
    // junction window, through-station) adds geometry belonging to NO single run, so
    // the carried labels stop being true. ⛔ REFUSE them rather than carry one that
    // has quietly become a guess — the stamp's entire value is that it never guesses.
    // [A06] CARRY the labels through the four constructed reshapes; do NOT drop the
    // class. They add geometry owned by no street — the intersection interior is not
    // a street (`SKELETON §5d`) — but they reshape the ASPHALT, while a label's
    // meaning is about the RING, which `groupRuns` partitions completely, at a
    // junction as much as anywhere. Their vertices land as crossings and inherit
    // forward. ⭐ MEASURED: dropping the class cost 27 LS tiles and 37 on altadena
    // for nothing. The refusal belongs PER TILE (at the freeze), never up front.
    if (_aFillLabs && _aFillBase) {
      let R = _aFillBase, L = _aFillLabs
      const step = (ct, clip) => { if (!L || !clip.length) return
        const r = booleanLabelled(ct, R, L, clip); if (!r.labels) { L = null; return } R = r.rings; L = r.labels }
      if (mergeClip.length) step(clipperLib.ClipType.ctUnion, mergeClip)
      if (cCut.length) step(clipperLib.ClipType.ctDifference, cCut)
      if (jClip.length) step(clipperLib.ClipType.ctUnion, jClip)
      if (tClip.length) step(clipperLib.ClipType.ctUnion, tClip)
      _aFillLabs = (L && R.length === aFill.length) ? L : null
    } else _aFillLabs = null
    const medClip = medianClipFor(tile.ring)   // loop-body median rings only (divided no longer stamps rings)
    let medArea = 0
    for (const r of medClip) medArea += Math.abs(signedArea(r))
    // [universal-median 2026-06-15 — RIBBONS §1 update] Face-read DIVIDED median
    // identity. The median is the walked face BETWEEN the two carriageways of a
    // divided pair — NOT a constructed ring. Detect it off the polygon (the
    // doctrine: identity descends from the face): the ONLY tile bounded by BOTH
    // members of one divided pair is the median between them. Its grass is then the
    // open-field flooded remainder (SECTION §3), routed to the 'median' class in
    // sectionPass via the frozen `isMedian` flag. ⛔ No left/right side test — the
    // measure side is point-order-relative PER CHAIN, so a pair's two carriageways
    // disagree on which side faces the median (Lafayette: A side==inboard, B side!=;
    // inboardSideOf is unreliable for this). "Bordered by both members" is the
    // convention-free signal; the pairKey match rules out cross-pair junction tiles.
    const medPairs = new Map()   // pairKey → Set(carriageway skelId bounding this tile)
    for (const run of runs) {
      const so = streetsOrig[run.streetIdx]
      if (!/^carriageway/.test(so?.phase?.role || '')) continue
      const pk = so.phase.pairKey
      if (!pk) continue
      if (!medPairs.has(pk)) medPairs.set(pk, new Set())
      medPairs.get(pk).add(so.skelId)
    }
    const isDividedMedian = [...medPairs.values()].some(set => set.size >= 2)
    // A single-run tile bounded by ONE street-side is a loop interior (LOOP-STREETS
    // §2); a loop-body median ring (still stamped) covering it IS the §2 interior.
    // Loop medians ride the frozen `med` ring; divided medians ride `isMedian`.
    const isLoopInterior = runs.length === 1
    const isMedianTile = isDividedMedian || (isLoopInterior && medArea > 0.5)
    // Best-effort fill (SECTION.md §3.1): per-tile band depths are STANDARD, not
    // the old per-edge averaged measures. The treelawn band is present iff any of
    // the tile's runs gleans treelawn-Y; the sidewalk band is always ADA.
    const tileHasTreelawn = runs.some(run => gleanTreelawn(measures[run.streetIdx], run.side))
    const tl = isMedianTile ? 0 : (tileHasTreelawn ? STD_TREELAWN : 0)
    const sw = isMedianTile ? 0 : ADA_SIDEWALK
    // Per-corner fillet of the curb line. Each tile vertex resolves to its
    // authored radius (per-corner → per-IX → default 4.5) × the global scale —
    // NO clamp: the operator's R is the dial, and filletRing's own 45%-of-gap
    // inset bound handles overlap geometrically (doctrine: no corner-R clamps in
    // emit). The fillet operates on the inboard curb ring, so map each curb
    // corner back to its nearest centerline node for the radius.
    const vertR = tile.ring.map((V, i) => resolveVertR(V, tile.edges, i) * scale)
    // Round dead-end cap: the asphalt cap is ALREADY a clean round disk (circlePoly,
    // :849). Letting filletRing round the disk↔stadium seam corners there turns the
    // smooth cap into multi-lobe scallops (trace: a simple stub goes aFill 20 → iA 33
    // with 2 cap fillets; complex caps hit 5). Zero R at each round-tip node so the
    // cap stays the disk arc — the curb/ped offsets then wrap it cleanly, no lobes.
    for (const t of roundTips) { const ti = nearestVertexIndex(t.p, tile.ring); if (ti >= 0) vertR[ti] = 0 }
    const cornerRfn = (pt) => nearestVertR(pt, tile.ring, vertR)
    const fSink = []
    // [E3.2] drop degenerate (≈zero-area) rings before filleting: a coincident
    // fill seam can leave a zero-width needle ring in the difference, which
    // filletRing turns into an unbounded arc (θ→0 ⇒ inset→∞) and which poisons
    // the band ClipperOffsets downstream (erode returns empty → the whole
    // block paints as curb). No legitimate block fragment is < 0.5 m².
    // [D6a · POLYGON-FIRST §3 / SKELETON §5f] DEFAULT: iA = the per-edge parallel
    // OFFSET polygon (offsetRingVariable) — chain ⊕ pavementHW, corners as
    // offset-intersections — rounded at the authored radius by filletRing/vertR.
    // NOT carved from the junction-swelled asphalt (that bows the curb where the
    // windows pile in). Per-edge depth = the run covering that ring edge.
    // opts.iaCarveLegacy = today's swelled carve, kept for A/B on Jacob's eye.
    // [A03] The chain-stroke that used to live inline here is now the two-part
    // producer at the top of this file: freezeCurbEdgeFacts (chain-derived, one
    // fact per ring edge) → buildCurbRings (chain-FREE). The frozen facts carry
    // the FRAME; the authored width is applied inside the builder, so the facts
    // stay look-agnostic and the curb still honours the operator (Layer 0 q3).
    const curbFacts = tile.curbFacts || freezeCurbEdgeFacts({
      ring: tile.ring, runs, streetsOrig, measures, segOrdOf: runSegOrd, curbWidth: cw, isMedianTile,
    })
    // The ONLY authoring channel into the curb. Mirrors runMeasure's resolution
    // (blockCustoms pavementHW over the per-chain base) but takes scalars, so the
    // builder never sees a measure object or the chain behind it.
    const authoredHW = (skelId, side, segOrd) => {
      if (!blockCustoms || !skelId) return null
      const c = blockCustoms[skelId]?.[side]?.[segOrd]
      return (c && Number.isFinite(c.pavementHW)) ? c.pavementHW : null
    }
    const nRing = tile.ring.length
    // [curve-primitive Phase 2] This tile has a bezier'd (curved) run → enable the
    // robust offset cleanup (fold-spur strip + depth-scaled island floor) that was
    // gated on the retired STREET_SMOOTH knob. The curve now lives in the dense
    // tessellated points, so the inward offset of a tight bend can still overshoot
    // into a near-180° needle (POLYGON-FIRST §3, the iA-source pinch). `clean` mode
    // = non-clean + dropFoldSpurs (identity on a straight ring), so STRAIGHT tiles
    // stay byte-identical — only curved tiles get the strip. (HANDOFF-curve-primitive.)
    const tileIsCurved = runs.some(run => { const so = streetsOrig[run.streetIdx]; return so?.segments?.some(g => g.type === 'bezier') })
    // [A03] depthAt / cornerAt now live INSIDE buildCurbRings, resolved from the
    // frozen per-edge facts — see the producer split at the top of this file.
    // opts.iaOffset = the per-edge parallel-offset curb (D6a). It owns the "street
    // simple" tiles (§5d); the "intersection variable" tiles keep the legacy carve
    // that already handles them: MEDIAN tiles (offsetting both inner edges collapses
    // the thin gap) and tiny/sliver tiles (the offset of a sub-block fragment blows
    // up past the tile). The d-tile is a large clean block → it takes the offset.
    //
    // ⭐⭐ [A07] THERE ARE TWO PRODUCERS AND THE CHOICE IS NOW RECORDED. Every tile
    // is stamped `producer: 'offset' | 'carve'` + the `reason`, into _shapeArtifact.
    // ⛔ The old comment here read "Falling back to legacy is never a regression."
    // That sentence was the defect stated aloud, and it conflated two different
    // things which this code must keep apart (ROADMAP A07):
    //
    //   • STRUCTURAL carve (median / small / opt-out) — CORRECT for its class.
    //     These tiles genuinely are not edge-offsets. Not a defect, not a warning;
    //     it must be DISCLOSED, per tile, because the docs promise one producer.
    //   • DEGENERATE (below) — an offset PASSED the gate and came back unusable.
    //     Something was expected to work and didn't. That IS a failure and it is
    //     now LOUD. It must never be counted among the structural class, or the
    //     real signal drowns in ~41 routine lines a pour and nobody reads it.
    // [CULDESAC KEYHOLE] Jacob's boolean keyhole, LOCALIZED. The cul-de-sac road
    // (aFill) is already union(corridor, bulb-disk); morphologically CLOSE it so the
    // reflex mouth corners round into tangent curb-returns, carve the curb from it —
    // but splice that ONLY inside a disk around each turning-circle (below), so a
    // bulb that shares a megatile with the grid leaves the grid SHAPE untouched.
    let _cdKeyhole = false
    const _cdDisks = []
    // [A10-③ · THE DISC KNOWS WHOSE IT IS] Each disc is created BY a run — it exists
    // because `culDeSacLoops` has an entry for THAT run's street. So ground the splice
    // mints inside it is not ownerless: it belongs to the run that produced the disc.
    // ⭐ That is PROVENANCE, not proximity — the forbidden recovery is asking "which
    // chain is nearest this point"; this asks "which run caused this circle to exist",
    // which the construction already knows. Canon agrees the bulb is undivided: "THE
    // BULB HAS NO HALVES — it is one continuous semicircle carrying ONE cross-section"
    // (SECTION §6.3, Jacob 2026-07-22). Carried as a `tile.ring` VERTEX INDEX because
    // that is what `_iaLabels` speaks; `poly[0]` is a reference INTO `ring`
    // (`groupRuns` pushes ring elements, never copies), so `indexOf` is exact identity,
    // not a coordinate compare.
    const _cdOwner = []
    if (opts.culDeSacKeyhole !== false && aFill.length && !isMedianTile) {
      for (const run of runs) {
        const lc = culDeSacLoops.get(run.streetIdx)
        if (lc) {
          _cdKeyhole = true
          const disk = circlePoly(lc.C[0], lc.C[1], lc.R + 9, 64)
          _cdDisks.push(disk)
          const ringIdx = tile.ring.indexOf(run.poly[0])
          if (ringIdx >= 0) _cdOwner.push({ disk, ringIdx })
        }
      }
    }
    // [A06] The carve, labelled. Geometry is the ORIGINAL expression, unchanged; the
    // labelled run alongside it only carries provenance, and is adopted only when it
    // reproduces the same ring count — so a provenance bug can never move a vertex.
    let _legacyLabs = null
    const legacyBlock = () => {
      const geo = differenceRings([tile.ring], aFill).filter(r => Math.abs(signedArea(r)) > 0.5)
      _legacyLabs = null
      if (_aFillLabs) {
        const r = booleanLabelled(clipperLib.ClipType.ctDifference, [tile.ring], [tile.ring.map((_, i) => i)], aFill, _aFillLabs)
        if (r.labels) {
          const keep = r.rings.map((rr, k) => k).filter(k => Math.abs(signedArea(r.rings[k])) > 0.5)
          if (keep.length === geo.length) _legacyLabs = keep.map(k => r.labels[k])
        }
      }
      return geo
    }
    const ringArea = Math.abs(signedArea(tile.ring))
    let blockRings
    // [A07] The disclosure. `reason` uses a stated precedence because a tile can be
    // several at once (19 of LS's 101 are BOTH median and small): opt-out > median
    // > small — most-specific structural statement first. The overlap is not lost:
    // the census below counts the raw sets too.
    let _producer = 'offset', _reason = null
    // [A10-③ STAMP] `_iaLabels` = per-iA-ring arrays of source ring-VERTEX indices
    // (see the header above offsetRingVariable). `_iaNo` = the named reason there
    // is no stamp. ⛔ Exactly one of the two is ever set; an absent stamp always
    // says why, and an empty array is never emitted to mean "no owners".
    let _iaLabels = null, _iaNo = null, _iaSpliced = false
    if (opts.iaOffset === false) _reason = 'opt-out'
    else if (isMedianTile) _reason = isDividedMedian ? 'median-divided' : 'median-loop'
    else if (ringArea <= 1500) _reason = 'small'
    if (opts.iaOffset !== false && !isMedianTile && ringArea > 1500) {
      // Dead-end caps are built INTO the offset polygon (capArc), tangent to the
      // legs — no graft, so a tile that's both a d-block and a cul-de-sac (tile 11)
      // keeps its d AND gets a clean cap. Map each round/blunt tip to its ring
      // vertex so offsetRingVariable emits the semicircle / flat butt there.
      const capByVertex = new Map()
      for (const t of roundTips) { const vi = nearestVertexIndex(t.p, tile.ring); if (vi >= 0) capByVertex.set(vi, 'round') }
      for (const t of bluntTips) { const vi = nearestVertexIndex(t.p, tile.ring); if (vi >= 0) capByVertex.set(vi, 'blunt') }
      // [A03] THE PRODUCER — chain-free. Everything it reads is a frozen fact, a
      // scalar, or the authored override; there is no chain, street or measure in
      // its scope. (POLYGON-FIRST Check C.)
      const _offStamp = {}
      const off = buildCurbRings({
        ring: tile.ring,
        facts: curbFacts,
        authoredHW,
        capAtVertex: (i) => capByVertex.get(i) || null,
        curved: smooth > 0 || tileIsCurved,
        stamp: _offStamp,
      })
      if (_offStamp.labels) _iaLabels = _offStamp.labels
      else _iaNo = `offset:${_offStamp.refused || 'no-labels'}`
      const offArea = off.reduce((s, r) => s + Math.abs(signedArea(r)), 0)
      // [A07] THE FAILURE BRANCH. This tile qualified for the offset and the offset
      // came back unusable — it is not a shape class, it is a defect. Name WHICH
      // way it failed; 'degenerate' alone cannot be acted on.
      const degen = !off.length ? 'degenerate:empty'
        : offArea <= 0.05 * ringArea ? 'degenerate:collapsed'
        : offArea > 1.01 * ringArea ? 'degenerate:overflow'
        : null
      if (degen) {
        _producer = 'carve'; _reason = degen
        curbProducerGate.record(degen, tile.ring, { ringArea, offArea, rings: off.length })
        blockRings = legacyBlock()
        _iaLabels = null; _iaNo = `carve:${degen}`     // the offset's labels died with its rings
      } else {
        blockRings = off
      }
    } else {
      _producer = 'carve'
      blockRings = legacyBlock()
      // [A06] THE CARVE IS NOW STAMPED WHERE THE ASPHALT CARRIED PROVENANCE.
      // ⚠️ The refusal that stood here — "its output vertices are minted by the
      // boolean … there is no source index to carry. Recovering one would be a
      // proximity guess" — was true of a LOOKUP AFTER THE FACT and false of the
      // boolean itself. Measured on LS's 42 carve tiles: of 529 output vertices,
      // 10.2% sit on `tile.ring`, 39.7% on a labelled stad, and 50.1% on NEITHER —
      // Clipper's own crossing points, which no post-hoc map could ever reach. So
      // the label rides THROUGH the difference on the Z channel instead, inheriting
      // forward around the ring at a crossing. Provenance, not proximity.
      // ⛔ Still refused, and named, where it cannot be earned: a stad with no
      // resolvable owner, or an `aFill` reshaped by the constructed junction/median
      // pieces (which belong to no single run).
      if (_legacyLabs) _iaLabels = _legacyLabs
      else _iaNo = `carve:${_reason || 'unclassified'}`
    }
    curbProducerCensus.count(_producer, _reason, { isMedianTile, isDividedMedian, small: ringArea <= 1500 })
    // [CULDESAC KEYHOLE — the bounded splice] keep the offset curb as the base
    // (grid shape untouched) and replace it with the morphologically-closed keyhole
    // ONLY inside the bulb disk(s): blockRings = (base − disks) ∪ (keyhole ∩ disks).
    if (_cdKeyhole && _cdDisks.length) {
      const RR = 3.0
      const closed = cleanRings(offsetRings(offsetRings(aFill, RR, 'round'), -RR, 'round'), 0.15)
      // clean the carved keyhole BEFORE clipping to the disk: smooths the mouth seam
      // stutter; the disk arc itself comes from circlePoly (both sides), so it welds.
      const keyhole = cleanRings(differenceRings([tile.ring], closed).filter(r => Math.abs(signedArea(r)) > 0.5), 0.15)
      const spliced = unionRings([...differenceRings(blockRings, _cdDisks), ...intersectRings(keyhole, _cdDisks)])
      if (spliced.length) {
        // [A10-③ · RULED 2026-08-11, Jacob] CARRY THE STAMP THROUGH THE SPLICE,
        // PER VERTEX. This nulled the WHOLE tile's labels — `_iaLabels = null;
        // _iaNo = 'keyhole-splice'` — on the true-but-local premise that the
        // splice mints vertices with no ring-edge source. It does: INSIDE the
        // discs. Everything else on the ring keeps its owner, and dropping those
        // too costs the tile its entire perimeter. On LS that is 44 arcs and 10
        // runs, including a Carroll frontage 130 m from the circle, which then
        // paints as `luRemainder` — the operator sees the sidewalk stop.
        // ⭐ THE RULING: the cure consumes ARCS, so there is nothing to spell for
        // "unowned" — an arc with no owner is simply never walked (`bandSpans`).
        // ⛔ No sentinel in the field where answers live (`project_a_sentinel_is_not_a_value`).
        // ⛔ EXACT coordinate match, never a tolerance: a disc-boundary proximity
        // test to rescue near-misses is the forbidden recovery. Measured
        // (`claims-keyhole-splice-survival`): 0 pre-splice vertices outside the
        // discs are destroyed, and the unmatched-but-outside ones sit 0.04–0.61 mm
        // from a boundary — genuine minted welds that MUST refuse.
        if (_iaLabels) {
          const srcByKey = new Map()
          for (let k = 0; k < blockRings.length; k++) {
            const lab = _iaLabels[k]
            if (!Array.isArray(lab)) continue
            const ring = blockRings[k]
            for (let j = 0; j < ring.length; j++) {
              const kk = `${ring[j][0]},${ring[j][1]}`
              if (!srcByKey.has(kk)) srcByKey.set(kk, lab[j])
            }
          }
          _iaLabels = spliced.map(r => r.map(p => {
            const v = srcByKey.get(`${p[0]},${p[1]}`)
            if (Number.isInteger(v)) return v
            // MINTED BY THE SPLICE. Measured 2026-08-11 (`claims-label-loss-bisect`):
            // 86 of 102 such vertices lie INSIDE a keyhole mask, and refusing them
            // cost 137 m of curb on LS that no owner ever paints — the band falls to
            // `luRemainder` and the operator sees the walk cut to the curb by grass.
            // The mask was created BY a run, so this ground has an owner: give it that
            // run's ring index. ⛔ Still no proximity: containment in the mask that
            // caused this geometry to exist, not distance to the nearest anything.
            for (const o of _cdOwner) if (pointInRing(p[0], p[1], o.disk)) return o.ringIdx
            return null      // outside every mask — resolved by ring adjacency below
          }))
          // [THE CLIP SEAM] What is left is the handful of vertices the boolean put
          // ON the mask circle, where the spliced ring crosses from the untouched ring
          // to the keyhole. Measured: 0.05 mm – 19 mm off the circle, so a containment
          // test cannot decide them. ⛔ AND MUST NOT BE MADE TO — "a mask-boundary
          // proximity test to rescue near-misses is the forbidden recovery"; a tolerance
          // here is the tuned distance this whole campaign exists to remove.
          // ⭐ Resolve it in the RING instead of in space. A label is a per-EDGE fact:
          // it says which source edge the arc arriving at this vertex belongs to. A seam
          // vertex is the far end of an edge whose near end is owned, so it takes its
          // ring PREDECESSOR's label — the arc runs under one owner up to the seam, and
          // the next vertex (inside the mask) opens the mask owner's arc. One clean
          // ownership change at the seam, which is what the geometry actually does.
          // ⛔ Adjacency in the ring, never distance: walking back is exact and stops at
          // the first owned vertex. A ring with NO owned vertex at all stays null — an
          // arc with no owner is still never walked (the A10-③ ruling stands).
          for (const lab of _iaLabels) {
            const m = lab.length
            if (!lab.some(Number.isInteger)) continue
            for (let j = 0; j < m; j++) {
              if (Number.isInteger(lab[j])) continue
              for (let b = 1; b < m; b++) {
                const v = lab[(j - b + m) % m]
                if (Number.isInteger(v)) { lab[j] = v; break }
              }
            }
          }
          _iaSpliced = true
        }
        blockRings = spliced
      }
    }
    // The offset path is fold-stripped inside offsetRingVariable (identity at
    // smooth=0). The MEDIAN carve is not: on a smoothed dense ring the inner-edge
    // carve folds into thin spikes that filletRing rounds into coincident-point arcs
    // → curb-band slivers. Strip them — but SELF-VALIDATING, so a blunt removal can
    // never make a tile worse: adopt the de-spurred ring ONLY if it reduces THAT
    // tile's own band-sliver count (a genuine fold needle → fewer; a legit thin
    // median arm whose tip the spur-test would cut → same or more, so kept intact).
    // [Brief B mech #2, 2026-06-16 / §10] GENERALIZED past the median+smooth case:
    // a tight-bend offset fold (offsetRingVariable folding past the medial axis at
    // ANY tile) leaves the same near-reversal spur → filletRing rounds it into a
    // curb-band sliver / the perpendicular-join needle (e.g. plain [-422,-172]).
    // Gate on a cheap has-spur pre-scan (>165° in/out turn, mirroring dropFoldSpurs'
    // SPUR_COS) so the no-spur grid skips the work and stays byte-identical; the
    // self-validation makes adoption strictly sliver-reducing, so it can never
    // regress a clean tile. [D6a robust-offset, POLYGON-FIRST §3]
    const ringHasSpur = (r) => {
      if (!r || r.length < 4) return false
      const n = r.length
      for (let i = 0; i < n; i++) {
        const a = r[(i - 1 + n) % n], v = r[i], b = r[(i + 1) % n]
        const ix = v[0] - a[0], iy = v[1] - a[1], ox = b[0] - v[0], oy = b[1] - v[1]
        const li = Math.hypot(ix, iy) || 1, lo = Math.hypot(ox, oy) || 1
        if ((ix / li) * (ox / lo) + (iy / li) * (oy / lo) < SPUR_COS) return true
      }
      return false
    }
    if (blockRings.some(ringHasSpur)) {
      const tracked = blockRings.map(r => dropFoldSpursTracked(r))
      const cleaned = tracked.map(t => t.ring).filter(r => r.length >= 3)
      if (cleaned.length && bandSliverCount(filletRings(cleaned, cornerRfn, []), cw) < bandSliverCount(filletRings(blockRings, cornerRfn, []), cw)) {
        if (_iaLabels) _iaLabels = tracked.map((t, k) => t.src.map(j => _iaLabels[k][j])).filter((_, k) => tracked[k].ring.length >= 3)
        blockRings = cleaned
      }
    }
    const _fLabs = _iaLabels ? [] : null
    let iA = filletRings(blockRings, cornerRfn, fSink, _iaLabels, _fLabs)   // rounded asphalt-inner (curb line)
    if (_fLabs) _iaLabels = _fLabs
    // [Brief B mech #4, 2026-06-16 / §10] filletRing can rejoin a clamped arc into a
    // near-180° degenerate NEEDLE — a sub-0.15 m reversal spike (the "coincident-point
    // arc" the median note above describes) born in the fillet, NOT in blockRings, so
    // the pre-fillet strip can't see it. It propagates into the frozen curb + asphalt
    // silhouette (e.g. [-421,-172] 176°, [657,-691] 140°). Strip it POST-fillet, but
    // self-validating on the SAME band-sliver metric → adopt only when it strictly
    // lowers slivers, so a clean curb is byte-identical and a real thin arm is kept.
    // Invisible to the eye (<0.15 m) but keeps the frozen curb clean for Section's
    // inward offset + drops the iA self-int the needle would otherwise mint.
    // Gate: adopt only when it (a) removes ≥1 near-reversal vertex AND (b) preserves
    // area within 0.5 m² — a direct needle test, NOT bandSliverCount (which skips
    // sub-1 m legs, so it can't see these sub-0.15 m needles). Area-preservation
    // guarantees a real thin feature is never amputated; a clean curb is untouched.
    if (iA.some(ringHasSpur)) {
      const spurCount = (rings) => rings.reduce((c, r) => c + (r.length >= 4 ? (() => { const n = r.length; let k = 0; for (let i = 0; i < n; i++) { const a = r[(i-1+n)%n], v = r[i], b = r[(i+1)%n]; const ix=v[0]-a[0],iy=v[1]-a[1],ox=b[0]-v[0],oy=b[1]-v[1]; const li=Math.hypot(ix,iy)||1,lo=Math.hypot(ox,oy)||1; if ((ix/li)*(ox/lo)+(iy/li)*(oy/lo) < SPUR_COS) k++ } return k })() : 0), 0)
      const areaOf = (rings) => rings.reduce((s, r) => s + Math.abs(signedArea(r)), 0)
      const tracked = iA.map(r => dropFoldSpursTracked(r))
      const cleaned = tracked.map(t => t.ring).filter(r => r.length >= 3)
      if (cleaned.length && spurCount(cleaned) < spurCount(iA) && Math.abs(areaOf(cleaned) - areaOf(iA)) < 0.5) {
        if (_iaLabels) _iaLabels = tracked.map((t, k) => t.src.map(j => _iaLabels[k][j])).filter((_, k) => tracked[k].ring.length >= 3)
        iA = cleaned
      }
    }
    // Tag each achieved fillet with its corner key (the centerline NODE it
    // rounded + that node's two tile-edge legs) so the authoring handle can read
    // the true curb arc — one corner truth, no drift. CORNER-DRIVEN injective
    // claim (was fillet-driven `nearestCornerVertexIndex`, which collided 93× and
    // orphaned 77× — Caliper's bucket-B; subsumed here): every SHARP tile-ring
    // corner is the unit of identity, and each claims at most ONE fSink arc by
    // nearest apex→corner distance, globally greedy so the matching doesn't depend
    // on corner order. The apex sits inboard of the node (the fillet rounds the
    // curb ring, inset from the centerline), so the apex→corner gap ≈ the inset.
    const cornerIdxs = sharpCornerIndices(tile.ring)
    const pairs = []
    for (let ci = 0; ci < cornerIdxs.length; ci++) {
      const V = tile.ring[cornerIdxs[ci]]
      for (let k = 0; k < fSink.length; k++) {
        const f = fSink[k]
        pairs.push({ ci, k, d: Math.hypot(f.apex[0] - V[0], f.apex[1] - V[1]) })
      }
    }
    pairs.sort((a, b) => a.d - b.d)
    const filletForCorner = new Array(cornerIdxs.length).fill(-1)
    const filletClaimed = new Array(fSink.length).fill(false)
    for (const p of pairs) {
      if (filletForCorner[p.ci] >= 0 || filletClaimed[p.k]) continue
      filletForCorner[p.ci] = p.k
      filletClaimed[p.k] = true
    }
    for (let ci = 0; ci < cornerIdxs.length; ci++) {
      const vi = cornerIdxs[ci]
      const V = tile.ring[vi]
      const key = cornerKeyAt(V, tile.edges, vi)
      // Split the key's two legs for the write path (legOut/legIn at this corner)
      // — same derivation as cornerKeyAt, so setCornerCornerRadius(V, legA, legB)
      // round-trips to exactly this key.
      const ne = tile.edges.length
      const eOut = tile.edges[vi], eIn = tile.edges[(vi - 1 + ne) % ne]
      const legA = `${skelOf(eOut.streetIdx)}:${eOut.forward ? 'f' : 'b'}`
      const legB = `${skelOf(eIn.streetIdx)}:${eIn.forward ? 'b' : 'f'}`
      const k = filletForCorner[ci]
      let fillet = null
      if (k >= 0) {
        const f = fSink[k]
        fillet = { C: f.C, r: f.r, tA: f.tA, tB: f.tB, apex: f.apex }
        cornerFillets[key] = fillet
      }
      cornerSet.push({ key, V, legA, legB, vertR: vertR[vi], fillet })
    }
    const lu = luForRing(tile.ring)
    // Dead-end caps + loop reversals make iA turn ~180°; a jtMiter inward offset
    // SELF-INTERSECTS there → needle spikes in the ped strips (the asphalt cap
    // rounds clean, the strips spike). Round the band join on JUST those tiles —
    // a dead-end tip, a single-run loop, or one too thin to inset without the
    // offsets colliding — so the strips get a clean round cap like the asphalt.
    // Keep jtMiter on normal cornered tiles (authored R=0 squares stay sharp — NOT
    // a global revert). Curb (here) + ped bands (sectionPass) MUST share this
    // frozen join or their common iA-inset edge diverges, so it rides on the tile.
    let bandArea = 0, bandPerim = 0
    for (const r of iA) {
      bandArea += Math.abs(signedArea(r))
      for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; bandPerim += Math.hypot(r[j][0] - r[i][0], r[j][1] - r[i][1]) }
    }
    const thinTile = bandPerim > 1e-6 && (2 * bandArea / bandPerim) < (cw + tl + sw)   // mean width < deepest inset → bands collide
    const bandJoin = (roundTips.length || bluntTips.length || runs.length === 1 || thinTile) ? 'round' : 'miter'
    // Capacity guard (RIBBONS §3.9a item 5, ported from emitOneBlockRingBands): when a
    // tile's interior pinches below the band depth WB=cw+tl+sw, the inward offsets
    // collapse past the medial axis and filletRing rounds the degenerate geometry into
    // thorns (thin loops, narrow medians, slivers, tight wraps — ~the whole class).
    // Bisect iA's largest non-empty inward offset (its inscribed reach), freeze
    // cap = 90% of it; sectionPass + the curb clamp every depth to cap. Over-capacity
    // tiles degrade to a clean truncated ribbon; in-spec tiles (reach ≫ WB) keep WB
    // untouched. On the offset W, NOT the fillet radius [[feedback_no_corner_radius_clamps_in_emit]]
    // — that degeneracy Clipper handles natively; W-past-medial-axis it does not.
    const WBnom = cw + tl + sw
    let cap = WBnom
    if (WBnom > 1e-6 && !offsetRings(iA, -(WBnom / 0.9), bandJoin).length) {
      let lo = 0, hi = WBnom / 0.9
      for (let it = 0; it < 16; it++) { const mid = (lo + hi) / 2; if (offsetRings(iA, -mid, bandJoin).length) lo = mid; else hi = mid }
      cap = lo * 0.9
    }
    Aacc.push(...differenceRings([tile.ring], iA))   // asphalt = tile − rounded inner (the shape silhouette)
    Cacc.push(...differenceRings(iA, offsetRings(iA, -Math.min(cw, cap), bandJoin)))   // curb stroke = iA − iC (clamped, shares join)
    // [DEAD-END MOUTH WRAP] A dead-end street T'ing into a through street collapses
    // to a ZERO-WIDTH spur in the face: extractFaces walks the dead-end out-and-back
    // so its two sides' runs (same skelId, opposite side) terminate at ONE coincident
    // mouth vertex sitting on the through-road centerline. The curb iA already rounds
    // two mouth fillets there, but the FILL butt-caps: (1) the through-road's wide
    // leg-sector COVERS the corner wedge (bandRem empty → the bent pad can't build),
    // and (2) both spur run-ends share ONE cornerT key → only one fillet can pair.
    // FIX — a BOUNDED LOCAL splice, mirroring the cul-de-sac keyhole (per-mouth disc,
    // independent on multi-spur tiles): (a) SNAP each spur run-end at the mouth to its
    // side's mouth fillet apex → two DISTINCT cornerT keys (one per corner); (b) freeze
    // a per-mouth disc {mid, R} centered on the fillet-MIDPOINT (the asymmetric pavement
    // center) so the FILL trims the through-road sector back from the mouth inside that
    // disc only → the wedge (bandRem) is freed and each bent sector builds. Crucially
    // this leaves iA BYTE-IDENTICAL (the curb already carries the two mouth fillets —
    // we never reshape the face ring): it sidesteps the DEAD-END-MOUTH-FORENSIC
    // "iA-byte-identity-unachievable" blocker, which assumed the only path was widening
    // the face ring. The wedge is freed by trimming the through SECTOR (a FILL slab),
    // not by moving the curb. Only the spur run-poly ends + per-mouth FILL change;
    // everything outside each disc — and all of iA — is untouched. Gated on
    // opts.deadEndMouthWrap (default-on). The far cul-de-sac/blunt TIP is excluded.
    let _mouths = null
    if (opts.deadEndMouthWrap !== false && runMeta.length > 2 && fSink.length >= 2) {
      const tipSet = new Set([...roundTips, ...bluntTips].map(t => tipKey(t.p)))
      // group same-skelId opposite-side run-ends by coincident vertex (the spur signature)
      const coincide = new Map()   // tipKey(end) → Map(skelId → Set(side))
      for (const rm of runMeta) {
        for (const p of [rm.poly[0], rm.poly[rm.poly.length - 1]]) {
          const k = tipKey(p)
          let m = coincide.get(k); if (!m) { m = new Map(); coincide.set(k, m) }
          let s = m.get(rm.skelId); if (!s) { s = new Set(); m.set(rm.skelId, s) }
          s.add(rm.side)
        }
      }
      for (const [k, m] of coincide) {
        if (tipSet.has(k)) continue   // the dead-end's far cul-de-sac/blunt TIP — not the mouth
        // a mouth: some skelId has BOTH sides ending here AND a DIFFERENT skelId also
        // ends here (the through road passes through the same node)
        const spurSkel = [...m.entries()].find(([, sides]) => sides.size >= 2)?.[0]
        if (!spurSkel) continue
        if (!deadEndSkels.has(spurSkel)) continue   // a LOOP body (Benton/Waverly/SV), not a dead-end → leave it
        const hasThrough = [...m.keys()].some(sk => sk !== spurSkel)
        if (!hasThrough) continue
        const M = k.split(',').map(v => +v / 1000)
        // the two mouth fillet apexes nearest the mouth node (the two corners)
        const near = fSink.map(f => ({ f, d: Math.hypot(f.apex[0] - M[0], f.apex[1] - M[1]) }))
          .filter(o => o.d < 30).sort((a, b) => a.d - b.d).slice(0, 2)
        // FALLBACK — a SINGLE-FILLET mouth (Piece 1). ⛔ The probe that established this
        // (`deadEndMouthProbe`) was EXCISED 2026-09-06; the FINDING it produced is kept here
        // because it is the reason this branch exists, and a dead pointer is worse than a
        // finding without its instrument. It confirmed the only genuinely-skipped mouths are south-13th (tile 12) and
        // henrietta (tile 25): at each, the through/cross road extends to just ONE
        // side of the node, so the curb forms exactly ONE real corner (one fillet) —
        // the other side is collinear (no corner to round). We wrap the ONE corner
        // that exists rather than butt-capping: snap that side's run-end to the lone
        // apex, free its wedge, let the FILL slide fire on it (apexB stays null so the
        // collinear side is untouched). With 2 fillets the original 2-corner path runs
        // verbatim → the 39 working mouths stay byte-identical.
        if (near.length < 1) continue
        const apexA = near[0].f.apex, apexB = near.length >= 2 ? near[1].f.apex : null
        const mid = apexB ? [(apexA[0] + apexB[0]) / 2, (apexA[1] + apexB[1]) / 2] : apexA.slice()   // asymmetric pavement center (2-apex) / the lone apex (1-apex)
        // (a) SNAP each spur run-end at the mouth to the apex on ITS OWN SIDE, so the
        // two opposite sides get DISTINCT cornerT keys (the collapse mapped both to one).
        // Classify the two apexes left/right of the spur's mouth direction (cross
        // product), then snap the left-side run-end → left apex, right-side → right apex.
        // The spur centerline runs FROM the mouth INTO the body; take any spur run's
        // mouth-end → body-point as that direction.
        let dir = null
        for (const rm of runMeta) {
          if (rm.skelId !== spurSkel) continue
          for (const ix of [0, rm.poly.length - 1]) {
            if (Math.hypot(rm.poly[ix][0] - M[0], rm.poly[ix][1] - M[1]) >= 1) continue
            const body = rm.poly[ix === 0 ? 1 : rm.poly.length - 2]
            const dx = body[0] - M[0], dy = body[1] - M[1], L = Math.hypot(dx, dy) || 1
            dir = [dx / L, dy / L]
          }
          if (dir) break
        }
        // cross(dir, apex−M) > 0 ⇒ apex is to the LEFT of the into-body direction.
        const sideOf = (apex) => { const cx = apex[0] - M[0], cy = apex[1] - M[1]; return (dir[0] * cy - dir[1] * cx) >= 0 ? 'left' : 'right' }
        // map curb-side → its apex. 1-apex: only the lone apex's side is keyed, so
        // ONLY that side's run-end snaps (the collinear side never matches → untouched).
        const apexBySide = dir ? (apexB ? { [sideOf(apexA)]: apexA, [sideOf(apexB)]: apexB } : { [sideOf(apexA)]: apexA }) : null
        for (const rm of runMeta) {
          if (rm.skelId !== spurSkel) continue
          rm.poly = rm.poly.map(p => p.slice())
          for (const ix of [0, rm.poly.length - 1]) {
            if (Math.hypot(rm.poly[ix][0] - M[0], rm.poly[ix][1] - M[1]) >= 1) continue
            // the run's `side` is the curb side; snap to the apex classified to the
            // SAME side. Fall back to the nearer apex if the side classify degenerated
            // (2-apex only — with one apex a non-matching side has NO corner, leave it).
            const tgt = (apexBySide && apexBySide[rm.side]) || (apexB
              ? (Math.hypot(apexA[0] - rm.poly[ix === 0 ? 1 : rm.poly.length - 2][0], apexA[1] - rm.poly[ix === 0 ? 1 : rm.poly.length - 2][1]) <=
                 Math.hypot(apexB[0] - rm.poly[ix === 0 ? 1 : rm.poly.length - 2][0], apexB[1] - rm.poly[ix === 0 ? 1 : rm.poly.length - 2][1]) ? apexA : apexB)
              : null)
            if (tgt) rm.poly[ix] = tgt.slice()
          }
        }
        // (b) freeze the per-mouth disc: radius reaches just past the mouth so the
        // FILL trims the through sector clear of the wedge, but no further (local).
        const R = (apexB
          ? Math.max(Math.hypot(apexA[0] - M[0], apexA[1] - M[1]), Math.hypot(apexB[0] - M[0], apexB[1] - M[1]))
          : Math.hypot(apexA[0] - M[0], apexA[1] - M[1])) + 2
        // Freeze the two corner apexes + the spur into-body direction so the FILL
        // can give each mouth-corner cornerT its SECOND leg (the through road's
        // straight leg) — that's what lets the Idea-A deep-leg SLIDE fire at the
        // mouth, the same as at a normal corner (SECTION §6.1 step 5).
        ;(_mouths || (_mouths = [])).push({ mid: M, ctr: mid, R, spurSkel, apexA, apexB, dir })
      }
    }
    // [THRU-T ped] This tile's run-ends that are genuine-deg-3-T through-street
    // continuations (from the frozen thruNodeSet). sectionPass reads them to
    // suppress the false corner where the mouth split the frontage across tiles.
    let _thruNodeEnds = null
    if (thruNodeSet.size) {
      for (const rm of runMeta) {
        for (const p of [rm.poly[0], rm.poly[rm.poly.length - 1]]) {
          const k = `${tipKey(p)}|${rm.skelId}|${rm.side}`
          if (thruNodeSet.has(k)) (_thruNodeEnds || (_thruNodeEnds = [])).push(k)
        }
      }
    }
    // [A10-③] LAST GATE BEFORE THE FREEZE: the stamp must be shape-exact against
    // the iA it claims to describe — same ring count, same vertex count per ring,
    // every index inside tile.ring. A stamp that merely LOOKS present is worse than
    // none, so a mismatch refuses loudly by name instead of shipping a wrong map.
    let _iaShape = false
    // [A06] THE REFUSAL LANDS AT THE FREEZE, ON THE FINAL LABELS.
    // ⚠️ Measured: testing the carve OUTPUT let centrum tile 234 through, because
    // `filletRings` and the fold-spur strip run AFTER it and can re-order the
    // sequence. A stamp is only true if it is true of what actually gets frozen.
    // ⛔ Carve-produced labels only — the offset path keeps its own looser
    // SIMPLE/REPAIRED assertion, because a self-crossing offset splits an arc
    // legitimately and strict contiguity would refuse tiles that are correct.
    // ⭐ On LS the two tiles this refuses are tiles 30 and 33 — the ONLY two notched
    // tiles on the map. A source edge owning two separated arcs IS the notch, seen
    // from the label side. Stamping them would launder a real geometry defect into
    // an authoritative label, which `WALL §1` calls odious.
    if (_producer === 'carve' && _iaLabels && !_labsContiguous(_iaLabels)) { _iaLabels = null; _iaNo = 'carve:noncontiguous-arcs' }
    if (_iaLabels) {
      const nR = tile.ring.length
      // [A10-③] `null` = THIS VERTEX HAS NO OWNER, and it is legal ONLY on a tile
      // that took the keyhole splice (which mints vertices inside the bulb disc).
      // Anywhere else an absent owner means the carry broke, and that must still
      // refuse loudly — a stamp that merely LOOKS present is worse than none.
      const okLabel = (v) => (Number.isInteger(v) && v >= 0 && v < nR) || (_iaSpliced && v === null)
      _iaShape = _iaLabels.length === iA.length
        && iA.every((r, k) => Array.isArray(_iaLabels[k]) && _iaLabels[k].length === r.length
          && _iaLabels[k].every(okLabel))
      if (!_iaShape) { _iaNo = 'shape-mismatch'; _iaLabels = null }
      // ⛔ NO NEW ARTIFACT KEY FOR "how much came through unowned". It is
      // derivable by counting `null`s in `iaEdge` itself, and a stored
      // restatement of its own source goes stale — `CLAUDE.md §PRUNE`. Keeping
      // the frozen shape at exactly two stamp keys is also what lets the
      // identity gate stay strict (`claims-ia-source-stamp` §6).
    }
    // Freeze everything the section pass needs off this tile's shape.
    // Freeze the achieved fillet arcs (the curb corners) so sectionPass can bend
    // the ped band around each one as an annular SECTOR (RIBBONS §3.9a step 10),
    // not mask it with a disk. Each = { apex, C, r, tA, tB } from filletRing.
    shapeTiles.push({ ring: tile.ring, iA, vertR, tl, sw, lu, roundTips, bluntTips, roundTipKeys, runs: runMeta, bandJoin, cap, fillets: fSink,
      // [A07] WHICH PRODUCER BUILT THIS CURB, and why. The docs promise a single
      // concentric offset; on LS 41 of 101 tiles are not one. Recorded so an
      // operator on a town nobody has inspected can tell, and so A06 has a test.
      // [A10-③ THE SOURCE-EDGE STAMP] `iaEdge[r][k]` = the index of the tile.ring
      // VERTEX whose emission produced iA[r][k] — equivalently the ring EDGE that
      // starts there (see the header above offsetRingVariable). Street identity is
      // NOT here and must not be put here: it stays on `tile.edges[i]`, which this
      // index addresses. When there is no stamp, `iaEdgeReason` says why, always.
      ...(_iaShape ? { iaEdge: _iaLabels } : { iaEdgeReason: _iaNo || 'unstamped' }),
      producer: _producer, ...(_reason ? { producerReason: _reason } : {}), ...(_mouths ? { mouths: _mouths } : {}), ...(_thruNodeEnds ? { thruNodeEnds: _thruNodeEnds } : {}), ...(isDividedMedian ? { isMedian: true } : (medClip.length ? { med: medClip } : {})) })
  }

  // ── THE WALL · Phase C · the cut ───────────────────────────────────
  // The interior authored ped comes from the module-level sectionPass, handed
  // ONLY the frozen shapeTiles + design params. It has no handle on the chain,
  // so it physically cannot reach back — Section's shape input changes only when
  // this shape pass re-runs. (The perimeter G9 below stays here on the shape
  // side, where reading the chain is legitimate — Jacob's Option 1.)
  const { Wacc, tlByLu, luByLu } = sectionPass(shapeTiles, cw, stripMat, blockCustoms)

  // Grade-separated roads paint as flat strips — excluded from faces above, stroked
  // here off their own centerline at the frame's pavementHW half-width. One flat level
  // (no z-separation yet); stencil-clipped with the rest below. HIGHWAY-class ones
  // route to their OWN `highway` output (its own layer toggle + material, matching the
  // figure-ground `highway` group) so the freeway can be toggled/shaded apart from
  // local streets; local grade-sep bridges stay asphalt.
  const HIGHWAY_CLASSES = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])
  const Hacc = []
  for (const s of gradeSep) {
    // Tight arc-length sampling (1.5 m vs the ~6 m default): the highway stroke is
    // wide (W≈17 m), so coarse arcs facet and the offset gaps on tight ramp bends
    // (RIBBONS §3.3). The 3rd arg is now a spacing override (meters), not a sample
    // count — see smoothChain. 1.5 m keeps ramp bends kink-free post-RDP.
    const WIDE_SPACING = 1.5
    // [G1 quality] ALWAYS resample the grade-sep centerline smooth at WIDE_SPACING,
    // independent of the global STREET_SMOOTH knob (pinned to 0 for local streets
    // because smoothing FEEDS the fragile concentric curb offset — POLYGON-FIRST §3).
    // Highways/ramps stroke FLAT (no concentric ped offset), so they carry none of
    // that fold-spike risk; smoothing them only removes facets. The smoothed curve
    // is what the freeze/bake captures → frozen views + slab show clean ramps, no
    // facets (the brief's "freeze the tessellated curve" bar). The `t` seed (1.5)
    // is moot here — WIDE_SPACING overrides it as the resample spacing (smoothChain).
    const sm = smoothChain(s.points, 1.5, WIDE_SPACING, junctionKeys) || s.points
    const hw = Math.max(s.measure?.left?.pavementHW || 0, s.measure?.right?.pavementHW || 0)
    if (hw <= 1e-6) continue
    ;(HIGHWAY_CLASSES.has(s.highway) ? Hacc : Aacc).push(...strokeOpen(sm, hw))
  }
  // ── [GROUT] ⛔⛔ READ THIS FIRST: WHAT THIS BUILDS IS THE **CURB**, NOT THE PROTOPOLYGON.
  // Corrected 2026-09-05 after Jacob caught the conflation ("so the chains offset
  // polygonization *was* the solution?" — yes, and that was the drift).
  //
  // HIS MODEL IS **TWO OBJECTS**, not one object at two moments:
  //   "I am talking about a new polygon: a protopolygon. The humunculus. It is not a real
  //    width; let's say it's .00001 symmetrical between nodes, and the corners join and
  //    round at that scale, and the end caps are also drawn at that proto scale. That is
  //    SEPARATE from the polygons of the curbs. This is equivalent to … 'Expand
  //    appearance' and then 'Pathfinder > JOIN' … but the stroke on the line segments is
  //    .00001, just for geometry purposes."
  //   ① the PROTOPOLYGON — width-free, permanent, one closed compound path. Where the
  //      topology lives: corners join and caps close AT PROTO SCALE.
  //   ② the CURB polygons — SEPARATE, offset FROM ①.
  //
  // ⛔ THIS CODE HAS NO ①. It strokes each chain directly at `feWidthAt`'s AUTHORED
  // half-width and unions the result — offset-then-polygonize, the old order, with better
  // bookkeeping. It is a correct curb and it measures well on the legs (Gate B: median
  // 0.000 m over 216k vertices, and the D6a fold class does not reproduce). It is NOT the
  // ruling, and the corners prove it: they come out sharp and want a fillet pass, which
  // under the real model does not exist, because ① already holds the corner.
  // ⇒ THE BUILD THAT IS OWED: construct ①, then offset it ONCE with per-edge deltas
  // through `offsetRingVariable` (which already takes a per-edge `depthAt` with a
  // `[start,end]` ramp and is winding-aware) — a change of SUBJECT, not new code.
  //
  // ⛔ AND WHEN ① IS BUILT: **NOTHING ON IT MAY BE ROUNDED. CORNERS STAY SHARP.**
  // RULED by Jacob 2026-09-05: "Sharp, with curvature calculated for ADA like everything
  // already is, attached to override handles, also like everything already is."
  // ⭐ The reason is a STAGE ASSIGNMENT, not a geometric argument — "the skeleton is
  // SMOOTH but the corners are rounded by the SURVEY." The smoothing is already in the
  // chain's points before ① is built; the rounding is authored after ② is offset. ① sits
  // between the two stages and does NEITHER. Nothing about the protopolygon has to be
  // argued from its geometry at all.
  // ⇒ The offset does NOT round "naturally": an arc of radius = the offset distance
  // (Illustrator behaviour) would be a THIRD, unauthored place to round — the same
  // don't-round-twice this section already retires. R=0 stays reachable, the dial is
  // unchanged, and NOTHING NEW IS BUILT for corners.
  // ⚠️ `scratch/gate-a-grout-holes.mjs` strokes with jtRound + etOpenRound — harmless as a
  // topology count, but it is the call anyone would copy forward to build ①, and it bakes
  // in exactly that. A warning sits at that line.
  //
  // ⛔ IDENTITY DOES NOT SURVIVE THE UNION BELOW. `unionRings` returns anonymous rings.
  // ⚠️ `unionRingLabelled` is NOT the fix — it takes ONE ring (`:429`) and self-unions it.
  // The usable primitive is `booleanLabelled` (`:364`), which takes N subject rings EACH
  // with its own label array, so labels can ride Clipper's Z channel across every chain
  // rectangle here. Unbuilt. This is the blocker on polygonize-and-name BEFORE Survey.
  //
  // Per chain, walk its OWN vertices — no resampling — and read the per-fe authored
  // half-width per side through `feWidthAt`/`segOrdAtVertex`, the SAME resolvers the
  // curb reads. ⛔ NEVER a second width lookup here: two hydration paths drift, and the
  // whole point of this construction is that it removes machinery rather than adding a
  // parallel copy of it. A width STEP therefore falls out as extra vertices where
  // `segOrd` changes — it is not a construction (measured at Benton's loop joint:
  // eight vertices, `node scratch/benton-grout-joint.mjs`).
  // The ruled bulb (bbf4adf6 — radius (hwL+hwR)/2, centre displaced (hwR−hwL)/2,
  // because the chain is NOT the road's centreline) closes a round-capped degree-1 tip.
  //
  // ⛔ OVERLAY ONLY today (`opts.grout`): this DRAWS, it does not produce. Making it the
  // producer is a change of CONSUMER, not of this construction — and it is owed, along
  // with the retirement it licenses (`filletRing`, `bandJoin`, the miterLimit-2 clamp,
  // `roundTips`/`bluntTips`, `offsetRingVariable`'s `cornerAt`/`capAt`). Jacob,
  // 2026-09-04: "it will eventually need to be wired and the detritus must be removed."
  let protoShapeTiles = null
  let protoBoundaryRing = null   // ⭐ the circle, carried out so EVERY consumer can stamp with it
  let protoSource = null, protoLabels = null, protoRefused = null, protoOwners = null, protoCurb = null, protoCurbGs = null, protoBands = null, protoStackCollapse = null, protoAuthoring = null
  // ⭐ ②'s ACHIEVED corner arcs — the handle's ONE truth. Hoisted beside the other proto outputs
  // because the producer swap at the end of the build reads it (`SURVEY §4`: one corner truth).
  const protoCornerSet = []
  const protoArcsByBlock = {}        // BLOCK index → its achieved arcs, in the frozen `fillets` shape
  const protoCapByBlock = {}         // BLOCK index → the mono-width envelope the guard allowed
  // ── [PROTO] ① THE PROTOPOLYGON — the homunculus. RIBBONS §1, Jacob 2026-09-05 ──────
  //   "I am talking about a new polygon: a protopolygon… It is not a real width; let's
  //    say it's .00001 symmetrical between nodes, and the corners join and the end caps
  //    are also drawn at that proto scale. That is SEPARATE from the polygons of the
  //    curbs. This is equivalent to … 'Expand appearance' and then 'Pathfinder > JOIN'."
  //
  // ONE closed compound path, width-free, permanent. It carries the TOPOLOGY — which
  // corners exist, which caps close, which faces are holes — and nothing else. The curb
  // (② below) is a SEPARATE polygon offset from it.
  //
  // ⛔ CORNERS STAY SHARP: `jtMiter`, and `etOpenButt` at the ends. No rounding anywhere.
  // The reason is a STAGE ASSIGNMENT, not geometry — "the skeleton is SMOOTH but the
  // corners are rounded by the SURVEY": the smoothing is already in the chain's points
  // before ① is built, the rounding is authored after ② is offset, and ① sits between
  // the two stages doing NEITHER. ⇒ R=0 stays reachable and nothing new is built for
  // corners.
  //
  // ⛔ ε IS NOT A REAL WIDTH — it is not real at all (Jacob). Its value carries no
  // information, only its non-zero-ness. MEASURED, not asserted: the topology is
  // byte-stable across ε = 0.002 … 0.5 m, a 250x range — 87 rings, 85 holes, every time.
  // `opts.protoHW` exists so that stays demonstrable.
  // ⚠️ The one constraint: ε must clear the integer floor of the stage that HOLDS it.
  // Clipper is integer-space and `toClipper` rounds — SCALE=1000 here (1 mm), SCALE=100
  // at prebake (1 cm). Below the floor the object silently ceases to exist.
  const PROTO_HW = Number.isFinite(opts.protoHW) ? opts.protoHW : 0.005
  let proto = null
  if (opts.grout === 'proto') {
    // ⛔⛔ NOT `ClipperOffset` ANY MORE, and the reason is step ②, not taste. An offset MINTS
    // every output vertex, so the only label it can carry is one scalar for the whole chain —
    // an edge then knows WHICH chain but not WHICH SIDE of it, and `feWidthAt(idx, side,
    // segOrd)` needs all three. Building each chain's outline explicitly — left boundary
    // forward, right boundary back — makes every vertex a SOURCE vertex whose index says
    // both the side and the station along the chain.
    // ⭐ It also removes the density trap: expanding a path SEGMENT-BY-SEGMENT makes the
    // result depend on how finely the path is sampled (two consecutive rectangles overlap by
    // ε·tan(θ/2), which on a dense polyline falls under the 1 mm integer grid and the ink
    // rounds into a DOTTED line). One polygon per chain has no such term.
    // ⛔ NOTHING IS ROUNDED: no join style is chosen anywhere, because the union does the
    // joining and the ends are flat. Smoothing is SKELETON, rounding is SURVEY; ① is neither.
    // ⭐⭐⭐ CONSUME THE FROZEN ① — this is the wall doing its positive job. `derive.js` mints
    // the protopolygon once, at prebake, from the frozen frame, and hands down a RIGID OUTER
    // FRAME. ⛔ Chains die not because nothing may touch them but because there is nothing
    // left to ask: the contour and its per-edge identity are already decided.
    //
    // ⛔⛔ NO SILENT FALLBACK, AND NO REFUSAL TO DRAW EITHER. Both halves are ruled.
    // A scene that has not been re-poured yet is a LEGITIMATE state — refusing to render would
    // make onboarding town #2 impossible — so the live mint still runs and the map still
    // draws. ⭐ But it is LABELLED: `protoSource` carries a REASON STRING, never a boolean, so
    // "this scene was never poured with ①" and "the artifact is at a different ε" read
    // differently to whoever is looking. **The defect was always the silence, not the draw**
    // (`PIPELINE.md` §5 (the Wall), `ROADMAP A02` — the same shape as `shapeFreezeMissing`, deliberately).
    //
    // ⚠️ ε IS PART OF THE IDENTITY OF THE OBJECT, not a tuning knob applied after. A caller
    // that asks for a different ε than the artifact was frozen at is asking for a DIFFERENT
    // PROTOPOLYGON, and silently handing back the frozen one would be a substitution — so that
    // case mints live and says which two values disagree. (`RIBBONS §1`: ε's value carries no
    // information, but its non-zero-ness is a declaration — and two declarations are two
    // objects.)
    const frozenProto = ribbons?.protopolygon
    let MP
    if (frozenProto?.rings?.length && frozenProto?.owners?.length &&
        Math.abs((frozenProto.eps ?? -1) - PROTO_HW) < 1e-9) {
      MP = { rings: frozenProto.rings, labels: frozenProto.labels, owners: frozenProto.owners,
             refused: frozenProto.refused || false, chainRings: null, crossings: frozenProto.crossings || null,
             // ⭐ `blocks` = boundary − stroked roads, frozen alongside ①. See the block loop below.
             blocks: frozenProto.blocks || null, blockLabels: frozenProto.blockLabels || null,
             // ⭐ the COMPOUND face — a block's holes travel with it, or it is offset as if solid
             blockHoles: frozenProto.blockHoles || null, blockHoleLabels: frozenProto.blockHoleLabels || null,
             // ⭐ the corner nodes, frozen — so ② never reaches for a chain to key the authored R
             nodes: frozenProto.nodes || null,
             boundaryRing: frozenProto.boundaryRing || null }
      protoSource = 'frozen'
    } else {
      const why = !frozenProto ? 'this scene carries no frozen protopolygon — it has not been poured since ① landed'
        : !(frozenProto.rings?.length && frozenProto.owners?.length) ? 'the frozen protopolygon is present but EMPTY'
        : `ε mismatch — the artifact was frozen at ${frozenProto.eps} m, this build asked for ${PROTO_HW} m (a different object, not a tolerance)`
      // ⭐ ONE CONSTRUCTION, TWO CALLERS — the live path calls the SAME function prebake does,
      // so a live re-derivation is the same object, not a second implementation of it.
      MP = mintProtopolygon({ streets: streetsOrig, gradeSep, eps: PROTO_HW })
      protoSource = `live: ${why}`
      console.warn(`[tileGround][①] ⛔ NOT the frozen protopolygon — re-derived live. ${why}.`)
    }
    protoOwners = MP.owners
    const R = { rings: MP.rings, labels: MP.labels, refused: MP.refused, crossings: MP.crossings }
    protoBoundaryRing = MP.boundaryRing || null
    console.log(`[tileGround][①] source: ${protoSource} — ${MP.rings.length} ring(s), ${MP.owners.length} identity stamps, ε=${PROTO_HW} m (network: ${streetsOrig.length} streets + ${gradeSep.length} gradeSeparated)`)
    // ⛔⛔ DISCLOSE THE AUTHORING STATE — the SILENCE is the defect, never the draw.
    // ②③ below read `blockCustoms` twice (the `pavementHW` override at `bcOf`, and the ped
    // depths + strip materials through `resolvePedDepths(mz, side, c)`). A caller that passes
    // none gets the to-code default and NO indication of it — `ROADMAP A05`'s exact shape
    // (`litmus-curb-parallel.mjs:77` runs `blockCustoms: null` and scores the operator's own
    // authored widths as a bow). ⭐ It fails WORST on the most heavily authored town and looks
    // CLEANEST on a fresh pour, which is why it survived: measured on ①②③, dropping LS's 22
    // authored streets moves the treelawn 3.3% and the curb 21,142 m², while HPDM's 6 streets
    // move 0.002% — blind exactly where the map is most worked-on.
    // ⛔ NOT a refusal: an unauthored scene is a LEGITIMATE state (a fresh pour of town #2 has
    // no `blockCustoms` at all) and refusing to build would make onboarding impossible — the
    // same call `A02`/`shapeFreezeMissing` makes at the wall. So it DRAWS, and it is LABELLED.
    // ▶ node scratch/claims-proto-stack-reads-authoring.mjs
    protoAuthoring = blockCustoms
      ? `${Object.keys(blockCustoms).length} authored street(s)`
      : 'ABSENT — no blockCustoms passed; ②③ are the to-code default, not this town'
    if (!blockCustoms) console.warn(`[tileGround][①] ⛔ AUTHORING ABSENT — ②③ below are built at the to-code default width and depth. If this is a measurement, it is measuring the wrong map (Layer 0 q3).`)
    else console.log(`[tileGround][①] authoring: ${protoAuthoring}`)

    // ⭐⭐ THE AUTHORED HALF — build-time, keyed off the frozen IDENTITY. ⛔ It cannot live in
    // the mint: `resolvePedDepths` and the `pavementHW` override both read `blockCustoms`, and
    // prebake is blind to `design.json` (`POLYGON-FIRST §3`). Resolving there would freeze the
    // to-code default into the artifact — Layer 0 q3, the exact shape that made D6b's literal
    // wording impossible. ⭐ Splitting it here is what lets ① freeze while the operator's
    // override still reaches the geometry: identity is permanent, the value is live.
    const protoBase = new Map()          // skelId → the pre-authoring base measure
    streetsOrig.forEach((st, i) => { const k = st?.skelId ?? st?.name; if (k != null && !protoBase.has(k)) protoBase.set(k, measures[i]) })
    for (const st of gradeSep) { const k = st?.skelId ?? st?.name; if (k != null && !protoBase.has(k)) protoBase.set(k, st?.measure) }
    // ⭐⭐⭐ THE UNIT IS THE LEG — `SECTION §3.3` step 1, "resolve a SINGLE per-edge depth… use
    // this ONE resolution everywhere", and §5, "Section edits are ALWAYS per-fe".
    // ⛔ A ROAD-LEVEL MERGE LIVED HERE ON 2026-09-07 AND IT WAS WRONG TWICE OVER. It averaged the
    // ped cross-section across a road's chains, which (a) is not the ruled unit and (b) AVERAGES
    // AWAY THE SURVEY — measured, 26 of 67 multi-chain roads carry genuinely different treelawn per
    // chain, South 18th Street twelve distinct values on one side. That variation is the product
    // (`SURVEY §4`, Layer 0 q3: "a single block may change width several times across its span —
    // this is what the authoring tools are FOR"), and flattening it is the signature error the gate
    // names. ⛔ It was built to stop the ribbon swapping mid-leg, which is the right symptom and
    // the wrong cure: *(Jacob)* "a treelawn swap NEVER happens mid-leg, period. That's what the
    // corners are for — they are designed to accommodate shifts/swaps."
    // ⇒ The chain keeps its own measure; the CONSUMER resolves once per leg (`sectionPassProtoTile`).
    const bcOf = (skelId, side, segOrd) => blockCustoms?.[skelId]?.[side]?.[segOrd] || null
    // ⛔⛔ THE SHIPPED RESOLVER, NOT THE RAW FIELD. `measure.treelawn` is only the AUTHORED
    // OVERRIDE; the depth the map actually paints comes from `resolvePedDepths`, whose default
    // ladder (`gleanTreelawn`) supplies a value where nothing is authored. Reading the raw
    // field made a second, poorer lookup — 19,094 stamps but only 4,601 with a treelawn, both
    // with a median of 0.00: three quarters of the map had no ped band and LU flooded to the
    // curb. Jacob, on the drawing: "what are we even looking at here?"
    const protoMeasureCache = []
    const protoMeasureOf = (label) => {
      let m = protoMeasureCache[label]
      if (m) return m
      const o = protoOwners[label]
      if (!o) return null
      const mz = protoBase.get(o.skelId)             // the frozen BASE, by skelId
      const c = bcOf(o.skelId, o.side, o.segOrd)     // the operator's OVERRIDE, street-keyed
      const base = mz?.[o.side]?.pavementHW
      const hw = (c && Number.isFinite(c.pavementHW)) ? Math.max(0, c.pavementHW) : base
      const d = resolvePedDepths(mz, o.side, c)
      m = protoMeasureCache[label] = {
        pavementHW: Number.isFinite(hw) ? hw : null,
        curb: curbWidth,
        treelawn: d?.tl ?? 0, sidewalk: d?.sw ?? 0, hasTL: !!d?.hasTL, terminal: d?.terminal ?? null,
        // ⭐⭐ THE STRIPS ARE SWAPPABLE, AND THE SWAP IS THE OPERATOR'S (Jacob: "adjustable and
        // swappable monowidth"). The gleaned `hasTL` supplies only the DEFAULT arrangement
        // (`SECTION §3.1`: `{outer: Y?'LU':'SW', inner: Y?'SW':'LU'}` — treelawn-Y reads
        // grass→walk, treelawn-N reads walk→lawn); `blockCustoms[…].materials` is the ctrl-click
        // override on top (`§3.2`). ⛔ Reading only the glean made the swap gesture INERT here —
        // the operator flips a strip and nothing moves, which is the authoring surface silently
        // not working. ⭐ Both strips to 'LU' is the OPEN FIELD — a material state, never an
        // absence, and it falls out of the arrangement rather than being a case.
        matOuter: c?.materials?.outer ?? (d?.hasTL ? 'LU' : 'SW'),
        matInner: c?.materials?.inner ?? (d?.hasTL ? 'SW' : 'LU'),
      }
      return m
    }
    { const M = protoOwners.map((_, l) => protoMeasureOf(l) || {})
      const n=protoOwners.length, hw=M.filter(o=>o.pavementHW>0).length,
        tl=M.filter(o=>o.treelawn>0).length, sw=M.filter(o=>o.sidewalk>0).length
      const med=(f)=>{const a=M.map(f).filter(v=>Number.isFinite(v)).sort((x,y)=>x-y);return a.length?a[a.length>>1]:NaN}
      console.log(`[tileGround][STAMP] ${n} stamps — pavementHW>0 ${hw} (med ${med(o=>o.pavementHW)?.toFixed(2)}) · treelawn>0 ${tl} (med ${med(o=>o.treelawn)?.toFixed(2)}) · sidewalk>0 ${sw} (med ${med(o=>o.sidewalk)?.toFixed(2)})`) }
    proto = R.rings
    protoLabels = R.labels
    protoRefused = R.refused
    if (R.refused) console.warn(`[tileGround][PROTO] identity REFUSED: ${R.refused} — the proto exists but carries no chain identity. Do not build on it.`)
    // ── ② OFFSET ① ONCE, PER EDGE, AT THE AUTHORED WIDTH ────────────────────────────
    // The blocks are ①'s HOLES; a hole's boundary at ε becomes the CURB by eroding it to the
    // authored `pavementHW`. ⭐ A CHANGE OF SUBJECT, NOT A NEW CONSTRUCTION:
    // `offsetRingVariable` already takes per-edge depth (and a [start,end] ramp), is
    // winding-aware, and takes a stamp — today it is simply called on the tile ring instead.
    // ⛔ `cornerAt` is forced TRUE and `capAt` NULL: on a contour there is nothing to decide.
    // A corner is a join in the contour and a cap is where it turns around — neither is
    // constructed, which is the whole point of ①. The authored corner R is NOT applied here;
    // it belongs to the node's handles and those are not built (`RIBBONS §1`).
    // ── THE NODE LOOKUP FOR ②'s EASE — carried identity, never proximity ────────────
    // `resolveVertR` keys the authored corner R as `ixKeyOf(node)|legA|legB`: on the CENTRELINE
    // node, while ①'s contour stands ε off it. The owner stamp carries `srcIdx` (the chain point
    // a boundary vertex was struck from), so the node is reached by walking INDEX SPACE to the
    // nearest IX or chain end. ⛔ Recovering it by nearest-point would be `A15`'s explicitly
    // forbidden third recovery, and both prior attempts at that died of it.
    // ⛔ NOT reusing `ixIdxsByStreet` (`:3120`): it is gated on `blockCustoms`, so it is null on an
    // unauthored scene — the exact gating `mintProtopolygon`'s header records as a defect. Making
    // it unconditional would edit the shipped path from inside a gated experiment, which is `A18`.
    // ⛔ `protoNodeOf` AND ITS FOUR SUPPORTING MAPS ARE EXCISED, NOT ARCHIVED. They were the
    // node resolver for the ease that was removed on 2026-09-06 and were left behind unused —
    // and they were 2 of the 3 chain reads keeping ②③ from being chain-free. Dead code gets
    // excised. The live resolver is `protoRAt` below, off ①'s FROZEN `nodes`.
    // ⭐⭐⭐ THE CORNER, BY CARRIED IDENTITY. `RIBBONS §1`: "every ring edge is owned by one
    // (skelId, side) BY CONSTRUCTION" ⇒ a corner is exactly where the OWNER CHANGES along the ring.
    // ⛔ Not an angle threshold and not a proximity match — both are `A15`'s forbidden recoveries,
    // and the angle one is what `easeRing` was built on. MEASURED on LS's in-disc blocks: 445
    // corners, median turn 90.1°, and the blocks with ZERO are exactly the medians and loop
    // interiors (bounded by one street, so the owner never changes).
    // ⭐ THE NODE ITSELF IS AN EXACT SHARED VERTEX, not the nearest point: the skeleton graph is
    // shared-vertex, so the centreline node of a corner between chains A and B is the vertex they
    // both carry. Keyed at 0.1 mm, the same grid `extractFaces` nodes on.
    // ⭐ FROZEN, not read from a chain: `mintProtopolygon` resolved every corner's centreline node
    // and froze it into ①. The centreline is inert here by construction — there is nothing to reach.
    const protoPairNode = MP.nodes || {}
    // ⭐⭐ THE CAP LADDER — override, then the gleaned fact. `SURVEY §4`: Survey owns cap Start/End
    // (None / Round / Blunt) and writes `overlay.capStart|capEnd`, which `derive` lands as
    // `capEnds`; `caps[end].cap` is what the data itself says. Keyed by frozen identity, so this is
    // design intent crossing the wall, exactly like `blockCustoms` (`SECTION §8`).
    const protoCapTable = new Map()
    for (const st of streetsOrig) {
      const k = st?.skelId ?? st?.name; if (k == null || protoCapTable.has(k)) continue
      protoCapTable.set(k, {
        start: st?.capEnds?.start || (st?.caps?.start?.cap === 'round' ? 'round' : 'blunt'),
        end:   st?.capEnds?.end   || (st?.caps?.end?.cap   === 'round' ? 'round' : 'blunt'),
      })
    }
    let protoCornerN = 0, protoCornerNoNode = 0, protoCornerAuthored = 0, protoCornerBend = 0
    let protoTipRound = 0, protoTipBlunt = 0
    // ⛔⛔ "THE LEGS RUN STRAIGHT THROUGH THE INTERSECTION" — BUILT TWICE, REVERTED TWICE, 2026-09-06.
    // The instruction is right (`SURVEY §6`: the intersection interior is variable, the streets
    // outside it must be simple) and BOTH constructions of it were wrong, in the same way:
    //   · IX = a disc at the node, radius `hypot(hwA,hwB)` (~12 m) → swallowed real curb: block
    //     area +8%, sidewalk +21%. Any radius is a guess, and the guess eats the parallel run.
    //   · IX = "inside another street's roadway" (exact, no radius) → asphalt +24% and curb lines
    //     flying across the map. Jacob: "totally crazy".
    // ⭐⭐ THE SHARED DEFECT IS NOT THE IX TEST, IT IS THE REJOIN: extending the two surviving legs
    // to their LINE INTERSECTION puts the apex arbitrarily far away when the legs are near-parallel
    // — `hw/sin(θ/2)` diverges — which is the identical failure the miter clamp exists to catch
    // (`§3.3`: a 1.4369 m width step across a 3.24° turn puts the intersection 26.15 m out).
    // ⇒ Any next attempt must BOUND the apex, or rejoin the legs some way that is not an unbounded
    // line intersection. ⛔ Do not rebuild either of the two above.
    // the authored R at ② ring vertex `i`. 0 ⇒ BROKEN HANDLES ⇒ the contour turns (`RIBBONS §1`).
    const protoRAt = (labs, i, n, hwHere = 0, turnHere = null) => {
      const a = protoOwners[labs[(i - 1 + n) % n]], b = protoOwners[labs[i]]
      if (!a || !b || a.skelId == null || b.skelId == null) return 0
      // ⭐⭐⭐ A DEAD-END CAP IS TWO ORDINARY CORNER NODES — `RIBBONS §1`, ruled by measurement:
      // "there are 2 apexes… blunt = both apexes at R=0 (zero-length handles) · round = both eased.
      // One dial, no case split." So the cap needs NO cap machinery: it is this same knob, asked at
      // the two tip vertices. ⛔ That is why `roundTips`/`bluntTips` stay empty — not a gap papered
      // over, a mechanism the ruling deletes.
      // ⭐ A cap has NO AUTHORED RADIUS ("an offset is measured from a leg, never from a cap; a cap
      // is what falls out"), so a round tip eases at the HALF-WIDTH — two 90° eases of radius hw
      // meeting in the middle IS the bulb, which is what `bbf4adf6` produces.
      // ⛔⛔ A CAP APEX IS WHERE ONE CHAIN'S TWO SIDES MEET — **SAME `skelId` BOTH SIDES.** The test
      // was `a.tipEnd || b.tipEnd`, i.e. "either edge belongs to a tip", and that is a different
      // claim: where a spur's tip INK meets a DIFFERENT street's ink, the vertex is an ordinary
      // street corner that happens to sit next to a tip. It was taking the cap rule, so a blunt
      // default returned R = 0 and the corner came out SHARP — the operator's "sharp corners which
      // look to be skipped altogether" (marked 2026-09-06: Mississippi × mississippi-alley,
      // Mississippi × Rutger, both mouths, 87°–93° surviving with no arc stamped).
      // ⭐ MEASURED on LS in-disc: 209 vertices took this branch — 145 genuine apexes (same street)
      // and **64 real corners** given the cap rule. The owner test separates them exactly, with no
      // threshold: at a true apex the contour wraps one chain, so one edge is its side and the
      // other is its butt end, and both carry the same `skelId` by construction.
      // ⭐ `RIBBONS §1`: "a dead-end cap is TWO ORDINARY CORNER NODES" — this is that ruling being
      // asked at the right vertices instead of at every vertex adjacent to one.
      const tip = (a.skelId === b.skelId) ? (a.tipEnd || b.tipEnd) : null
      if (tip) {
        const style = protoCapTable.get(a.tipEnd ? a.skelId : b.skelId)?.[tip]
        if (style === 'round') { protoTipRound++; return Math.max(0, hwHere) }
        protoTipBlunt++; return 0
      }
      // ⭐⭐⭐ A CORNER IS "THE OWNER CHANGED **OR** THE NODE HAS BROKEN HANDLES".
      // ⛔ Owner-change alone missed every street that TURNS: a single street bending 90° keeps its
      // owner, so the block outside it turns with no change and the ease never saw it — MEASURED at
      // 558 of 1,196 sharp block-ring vertices, the whole remaining square-corner class.
      // ⭐ The second half is `RIBBONS §1` verbatim — "broken handles TURN, continuous handles EASE".
      // A node between two straight segments is a corner; a node a bezier runs through is already
      // eased by the skeleton and must NOT be filleted (INVARIANT 2 — nothing rounds twice).
      // ⛔ NO TUNED ANGLE ANYWHERE. Both halves are carried identity; a threshold here is what
      // `easeRing` was built on and excised for. The one geometric test below is NOT a tuning
      // parameter — read its derivation before treating it as one.
      //
      // ⭐⭐ `a.hard || b.hard`, NOT `&&`. `hard` is stamped PER CHAIN VERTEX, and `a` is the owner
      // of the PREVIOUS ring vertex while `b` is this one's — so `&&` demanded that the previous
      // node be broken too, and a node flagged on one side only was never a corner. Measured on LS
      // in-disc: 11 non-highway vertices turning >= 60° were refused for exactly that reason.
      //
      // ⭐⭐⭐ AND A TURN THE TESSELLATION CANNOT PRODUCE IS A BROKEN HANDLE, whatever the flag says.
      // ⛔ THIS AMENDS THE "no angle anywhere" RULE ABOVE, deliberately, and here is why it is not
      // the excised threshold: `tessellateAdaptive` subdivides every curve to a 0.10 m ARC
      // TOLERANCE, and a tessellation step of angle θ on radius R satisfies θ = 2·acos(1 − t/R).
      // At θ = 60° that is R = 0.10 / (1 − cos 30°) = 0.75 m. ⇒ **a vertex turning 60° or more
      // cannot be a curve sample of any street** — it would need a sub-metre turning radius. So a
      // 95° turn carrying `hard: false` is not a smooth bezier node; it is the input CONTRADICTING
      // ITSELF, and the geometry is the half that cannot be wrong.
      // ⭐ The number is DERIVED from a tolerance we own, not chosen to make a picture look right —
      // change the tolerance and it moves with it. It decides nothing about how round a corner is;
      // it only refuses to believe `hard: false` where that is geometrically impossible.
      // ⭐ MEASURED on LS in-disc: 27 non-highway vertices turn >= 60° with no corner planned at
      // all — `allen-avenue-0` at 95° (marked), `park-place-2`, `benton-place-1`, `south-21st-street`,
      // `lasalle-lane-0` ×6. Of those, 16 carry `hard: false` on BOTH sides.
      // ⭐⭐⭐ THE SAME ROAD IS THE SAME ROAD, however many chains the kit cut it into.
      // ⛔ This read `a.skelId === b.skelId`, so a CHAIN CUT — same street, continuing straight —
      // fell through to `protoCornerN++` and took the full class-seed radius. That is a rounded
      // corner minted in the middle of a straight street, at a node ① does not have. It is the
      // "continuous side of a T" defect: a T splits the through-street's chain, and ② rounded the
      // curb at the split. ▶ MEASURED on LS: 84 owner changes are same-road-different-chain and 47
      // are same-chain-different-segOrd — 131 nodes in the stamp, 39 of which ② had rounded.
      // ⭐ SEGORD NEVER MATTERED HERE (it is an authoring ordinal, and this predicate reads
      // skelId), but it reaches the FILL through the same owner change, so both now key on the road.
      // ⭐⭐ A GENUINE BEND STILL TURNS: `hardHere` is unchanged, so a street that actually bends
      // 90° is still a corner whether or not the chain was cut there — the two halves of
      // `RIBBONS §1`'s rule, with only the identity half widened from chain to road.
      // ⭐ THE ROAD IS RESOLVED LIVE, so this needs no re-pour: ①'s owners are frozen in
      // `ribbons.json` and carry only `skelId`, and a stamp added to `mintProtopolygon` reaches
      // nothing until prebake runs again. ⛔ This is a LOOKUP BY STREET ID returning an identity —
      // the wall permits exactly that (`SURVEY §5`); no geometry crosses. `roadKey` on the owner
      // is preferred when a re-poured ① carries it.
      // ⭐⭐⭐ A CORNER IS WHERE THE CONTOUR TURNS. NO IDENTITY AT ALL.
      // *(Jacob, 2026-09-07: "why do you need that if you are working from the protopolygon?")* —
      // and the answer is that I did not. This test read `a.skelId === b.skelId`, i.e. it asked a
      // CHAIN question of a contour that has no chains in it, and then needed road unions, a
      // union-find and a `hard` special case to repair the answer. ⛔ ALL OF THAT IS DELETED.
      // ① is a closed path and knows its own shape; a corner is a place it BENDS.
      // ⭐ Two ruled constants, neither invented here:
      //   · `FILLET_TURN_TOL` (18°) — below it a vertex is a CURVE SAMPLE, not a corner. The same
      //     constant `filletRing` has always used; `easeContour` not carrying it is the recorded
      //     defect that drew corners at a quarter of their radius (`RIBBONS §1`).
      //   · `PROTO_HARD_TURN` (60°) — derived from the tessellation's own 0.10 m arc tolerance: a
      //     vertex turning ≥ 60° cannot be a curve sample of any street, so it is a corner whatever
      //     the flag says.
      // ⭐ `hard` survives ONLY in its legitimate role — a node a bezier runs THROUGH is already
      // eased by the skeleton and must not be rounded twice (INVARIANT 2). It can no longer MINT a
      // corner on its own, which is what made a chain endpoint read as one.
      const turnDeg = turnHere == null ? 0 : turnHere
      if (turnDeg < FILLET_TURN_TOL * 180 / Math.PI) return 0
      if (!(a.hard || b.hard) && turnDeg < PROTO_HARD_TURN) return 0
      protoCornerN++
      const key = a.skelId < b.skelId ? `${a.skelId}|${b.skelId}` : `${b.skelId}|${a.skelId}`
      // ⛔ A BEND HAS NO PAIR, AND THAT IS NOT A FAILURE. Where one street turns, both sides of the
      // corner are the SAME chain, so there is no chain-pair node to look up — the corner is real
      // and takes the class seed. Counted separately from a genuinely AMBIGUOUS pair (two chains
      // sharing more than one vertex), which is a failure and must not hide inside the same number.
      const node = a.skelId === b.skelId ? null : protoPairNode[key]
      if (!node) { if (a.skelId === b.skelId) protoCornerBend++; else protoCornerNoNode++; return baseR * scale }
      // ⭐ THE 3-TIER DIAL, IN ②'s OWN KEY SPACE: per-corner → per-IX → the class seed × the
      // operator's scale. The key is `ixKey|skelA|skelB` — the two CHAINS that meet, sorted — and
      // it is the same key `protoCornerSet` stamps, so what the handle writes is what ② reads.
      // ⛔ The legacy key flavours each leg with a tile-edge `f|b` flag a contour vertex cannot
      // carry, so a Look authored against THAT key space does not resolve here. Counted and warned,
      // never silently ignored.
      const ck = a.skelId <= b.skelId ? `${ixKeyOf(node)}|${a.skelId}|${b.skelId}` : `${ixKeyOf(node)}|${b.skelId}|${a.skelId}`
      const co = cornerOverrides ? cornerOverrides[ck] : undefined
      if (co != null && Number.isFinite(+co)) return Math.max(0, +co) * scale
      if (cornerOverrides && Object.keys(cornerOverrides).length) protoCornerAuthored++
      // ⛔⛔ `+null === 0` AND `Number.isFinite(0)` IS TRUE. Written as `ixOverrides && …`, an ABSENT
      // override coerced to a real authored ZERO and every corner that resolved a node came back
      // R = 0 — square. It cost 457 of 685 corners, and it hid behind the 228 that FAILED the node
      // lookup and took the early class-seed return, so the feature looked partly wired rather than
      // broken. ⭐ An ABSENCE and an authored ZERO are different states and R = 0 is authorable
      // (`project_corner_radius_is_design_control`), so they must never coerce into each other.
      const ix = ixOverrides ? ixOverrides[ixKeyOf(node)] : undefined
      if (ix != null && Number.isFinite(+ix)) return Math.max(0, +ix) * scale
      return Math.max(0, baseR) * scale
    }
    const easedByBlock = {}          // BLOCK index → its curb ring(s) + per-vertex ① labels
    // ⛔⛔ ONE INDEX SPACE FOR EVERY CONSUMER. `easedByBlock` is keyed by position in the block
    // list, so every loop that reads it MUST enumerate the same list. When the curb loop was
    // switched to `blocks` and the two downstream loops were left on `R.rings`, the keys silently
    // referred to different objects and 61 blocks lost their tiles — a mismatch that throws no
    // error and only shows up as absent geometry. Hoisted here so the three cannot drift again.
    let protoUseBlocks = false, protoBlockRings = null, protoBlockLabels = null
    let protoBlockHoles = null, protoBlockHoleLabels = null
    // ⛔ The ease's report and its `protoRAt` resolver are EXCISED with it. `protoNodeOf` and the
    // crossing identity SURVIVE and are still frozen — a corner is still known, by construction, as
    // a place two chains crossed. What is gone is the pass that tried to ROUND it afterwards.
    if (!R.refused) {
      protoCurb = []; protoCurbGs = []
      let noWidth = 0, gsSkipped = 0, compoundFaces = 0, compoundUnlabelled = 0
      let protoShortRuns = 0, compoundNoEase = 0, protoNoCurb = 0, protoNoCurbArea = 0
      const labelCarryLost = { lost: 0 }    // ② points whose ① provenance the union re-resolved
      // ⭐⭐⭐ THE BLOCKS COME FROM `boundary − stroked roads`, NOT FROM ①'s HOLES.
      // ⛔ WHY THE HOLES ARE WRONG, measured on LS the day the stencil landed (2026-09-06): once
      // ① is cut by the circle, a block the circle CUTS is bounded partly by ink and partly by
      // the circle — and the circle is a CLIP, not ink — so it is no longer enclosed by ink. It
      // stops being a hole and becomes exterior. 36 blocks vanished, 30 of them in the outer 20%
      // of the radius (90–100% of R: 21 gone against 6 kept). Interior blocks were untouched,
      // which is exactly why every aggregate gate stayed green and only the eye caught it —
      // Jacob, on Park Avenue: chains on both sides of the circle and NO drawing between them.
      // ⭐ A rim block's circle-side edges are owned by `__boundary__`, which resolves to NO
      // measure, so `depthAt` returns 0 there — already the ruled behaviour at the map edge
      // ("edgeDepth → 0, land use floods to the boundary, no curb/sidewalk on the map edge").
      // ⛔ NO FALLBACK: an unbounded pour (no boundary ⇒ no `blocks`) legitimately has no rim, so
      // it walks ①'s holes and SAYS SO. It is never silently substituted.
      protoUseBlocks = !!(MP.blocks?.length && MP.blockLabels?.length)
      protoBlockRings = protoUseBlocks ? MP.blocks : R.rings
      protoBlockLabels = protoUseBlocks ? MP.blockLabels : R.labels
      // ⛔ ①'s HOLES path has no compound faces to carry — a hole of ① IS the block, and it has
      // no holes of its own. Null there, and the loop below reads it as "no holes", not as "none
      // were frozen": an artifact frozen before compound faces landed would otherwise be offset
      // as if every face were solid, silently.
      protoBlockHoles = protoUseBlocks ? (MP.blockHoles || null) : null
      protoBlockHoleLabels = protoUseBlocks ? (MP.blockHoleLabels || null) : null
      if (protoUseBlocks && !protoBlockHoles) console.warn(`[tileGround][①] ⛔ this ① carries BLOCKS but NO blockHoles — it was frozen before compound faces landed. Any face with a hole is offset AS IF SOLID. Re-pour before trusting ②.`)
      console.log(`[tileGround][①] blocks from ${protoUseBlocks ? `boundary − roads: ${protoBlockRings.length} block(s), rim blocks INCLUDED` : `①'s HOLES (no boundary in this pour) — ⛔ any block the boundary would cut is ABSENT`}`)
      for (let k = 0; k < protoBlockRings.length; k++) {
        const ring = protoBlockRings[k], labs = protoBlockLabels[k]
        if (!(ring?.length >= 3)) continue
        // ⛔ The sign test applies ONLY to the holes path. `blocks` are already exactly the
        // blocks, wound as holes by the mint — filtering them by orientation would drop them all.
        if (!protoUseBlocks && signedArea(ring) > 0) continue   // outer contour — holes are the blocks
        // ⭐ ONE DEPTH RULE, READ OFF WHICHEVER RING'S LABELS ARE IN HAND. A face's holes are
        // bounded by the same ink at the same authored widths as its outer, so the rule cannot
        // differ between them — it is the label array that differs, not the law.
        const mkDepth = (L) => (i) => {
          const m = protoMeasureOf(L[i])
          if (!m) return 0
          const hw = m.pavementHW                     // ⛔ resolved off the frozen IDENTITY
          if (!(hw > 0)) { noWidth++; return 0 }
          return Math.max(0, hw - PROTO_HW)         // ① already sits ε off the centreline
        }
        const depthAt = mkDepth(labs)
        // ⭐⭐ THE COMPOUND FACE — outer + its holes, offset as ONE object.
        const holes = protoBlockHoles?.[k] || [], holeLabs = protoBlockHoleLabels?.[k] || []
        // ⛔ Tag each curb ring by whether a GRADE-SEPARATED chain owns most of it. The
        // shipped curb path builds NO highway curb at all (they are drawn as flat strokes
        // through their own accumulator), so a highway-owned ring has no baseline to be
        // compared against and averaging the two populations makes the number meaningless.
        let gsN = 0, allN = 0
        // ⛔ THE WHOLE FACE VOTES, holes included — a face bounded mostly by motorway is not a
        // city block whichever of its rings the motorway happens to bound.
        for (const L of [labs, ...holeLabs]) for (const l of L) { allN++; if (protoOwners[l]?.gradeSeparated) gsN++ }
        const isGs = gsN > allN / 2
        // ⛔⛔ A HOLE IN ① IS NOT NECESSARILY A BLOCK. ① carries the HIGHWAYS as ink — ruled, and
        // right: "the canon pulls them out of the BLOCK GRID, which says nothing about the DRAWING"
        // — so the union also encloses regions bounded by motorways and ramps, and those are not
        // city blocks. LS: 145 holes; excluding grade-separated chains gives 102, against the map's
        // 101 tiles. ⭐ That ~44 is the whole of the "① has more blocks than the map" discrepancy.
        // ⛔ AND IT IS WHY ② DREW LONG THIN RUNS: a highway carries an 8.53 m default half-width, so
        // striking a curb both sides of a 0.6-9 m gap between two ramps collapses it. 48 blocks had
        // their curbs meet; 47 of the 48 carry NO authoring anywhere — this is not the operator's
        // widths showing through (Layer 0 q3 asked first, and answered no).
        // ⭐ The shipped curb path builds NO highway curb at all — they are flat strokes through
        // their own accumulator — so emitting one here invented a curb production never had, and
        // then measured against a baseline that does not exist. This tag already existed and was
        // used only to LABEL the ring; now it excludes it, which is what the tag was for.
        // ⭐⭐⭐ RULED 2026-09-06 (Jacob), and the skip is GONE: "we need to build these blocks the
        // same way we make the others." A region bounded by motorways and ramps IS A BLOCK — real
        // land, with a curb, a sidewalk and a land use — and it was being dropped whole, so ③ had
        // nothing to stroke inward from and the operator saw a HOLE. Measured on LS: 43 in-disc
        // regions, 0.293 km², drawing nothing at all — the marked "no LU surrounding the highways".
        // ⛔ THE DISTINCTION THIS TAG WAS CONFLATING, and it is the whole of the fix: the HIGHWAY'S
        // OWN ROADWAY gets no city curb — it is a flat stroke through its own accumulator, and that
        // stays true. But the BLOCK BETWEEN highways is not the highway's curb; it is a block's
        // curb, struck inward from the block's own boundary like every other block on the map.
        // ⭐ `isGs` survives as what it always was — a LABEL on the ring (`protoCurbGs`), so a
        // consumer can still tell a highway-bounded block from a street one BY IDENTITY.
        // ⚠️ EXPECT the thin-run class here: a highway carries an 8.53 m default half-width, so
        // between two ramps 0.6–9 m apart the two curbs meet and the block goes to ZERO. That is
        // the ruled outcome ("if the curbs touch, there's no block"), it is NOT silent — the
        // no-curb disclosure counts it per pour — and it is not a reason to drop the class whole.
        if (isGs) gsSkipped++
        // ⭐ THE STAMP IS THE CORRESPONDENCE, AND IT ALREADY EXISTS (`A10-③`, `WL`): each ②
        // vertex records which ① ring vertex it was struck from, so the node identity survives
        // the offset without being re-derived from ②'s geometry.
        const st = {}
        // ⭐⭐⭐ THE CORNER IS KNOWN ON ①, NOT ON ②. MEASURED, and this WAS the defect: reading the
        // owner change off the OFFSET ring missed 789 of 1,033 right-angle corners, because
        // `offsetRingVariable` mints the miter apex from ONE contributing vertex — so both edges
        // either side of a ② corner usually carry the SAME owner and the corner is invisible there.
        // ⭐ On ①'s block ring the owner change IS the corner and it reads true: 445 corners at a
        // median turn of 90.1°. So resolve R per ① VERTEX, and carry it across the offset on the
        // stamp (`src`) — the correspondence `offsetRingVariable` already keeps.
        // ⛔ CARRIED, NOT RECOVERED: a ② vertex is a corner iff the ① vertex it was struck FROM is.
        // ⛔⛔ EASE-BEFORE-OFFSET WAS TRIED AND REVERTED, 2026-09-06 — READ THIS BEFORE REBUILDING IT.
        // Easing ① at R + the pavement half-width and then offsetting looks right on paper (the
        // offset of a rounded contour is concentric, INVARIANT 1) and it is WRONG in practice: the
        // ease radius becomes ~12.5 m, its setback ~12.5 m, and on any leg shorter than that the
        // arcs of two neighbouring corners overrun each other and the following offset FOLDS.
        // Jacob, on the render: "whatever you just did messed up a bunch of corners" — crossed
        // spikes at the intersections. ⛔ Do not re-derive it; the setback, not the concept, is what
        // fails, and it fails on exactly the blocks a city has most of.
        // ⭐ the turn at each ① vertex, handed to the corner test so it can catch a `hard: false`
        // that the geometry contradicts (see `protoRAt`). Cheap, and computed on the ring we hold.
        const turnOf = (g, i) => { const m = g.length, P = g[(i - 1 + m) % m], V = g[i], N = g[(i + 1) % m]
          const t = Math.atan2(N[1] - V[1], N[0] - V[0]) - Math.atan2(V[1] - P[1], V[0] - P[0])
          return Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) * 180 / Math.PI }
        const rSrc = ring.map((_, i) => protoRAt(labs, i, ring.length, depthAt(i), turnOf(ring, i)))
        // ⭐⭐⭐ THE EASE IS ASKED FOR HERE AND HAPPENS INSIDE THE OFFSET, before its self-union —
        // that is where the corner correspondence is still exact. `rSrc` is indexed by ① block-ring
        // vertex, and `easeAt` receives exactly that index off the offset's own stamp.
        // ⭐⭐⭐ `clean = true` — RUN THE FOLD-SPUR PASS. ⛔ ② was passing `false`, so
        // `dropFoldSpursTracked` never ran and every place the inward offset overran itself came
        // back as a NEEDLE: the curb doubling back on itself in a hairline spike. That is what the
        // operator's marker circles were actually pointing at, not the corner radius — the same
        // regions read 173°–177° turns, which is a reversal, not a corner.
        // ⭐ MEASURED on LS: needle vertices in ② 40 → 4, in the drawn curb 64 → 12, and ~90° turns
        // 141 → 81 — for a 0.15% change in curb area (24,593 → 24,556 m²). It removes artifacts, not
        // geometry.
        // ⛔ NOT a cleanup fudge of the forbidden kind: the pass drops vertices where the contour
        // REVERSES, which is a self-intersection the offset created, never a shape the operator
        // authored. The legacy path has always had it (`buildCurbRings` passes `curved`).
        const rings2 = offsetRingVariable(ring, depthAt, () => true, () => null, true, st, true, false,
                                          (srcIdx) => (srcIdx != null ? (rSrc[srcIdx] || 0) : 0))
        // ⭐ per-vertex ① OWNER for each offset ring — `st.labels` maps an offset vertex back to
        // the ① ring vertex it was struck from, so this is one hop off the carried stamp.
        let outRings = rings2
        let outLabs = rings2.map((rg, ri) => carryEdgeLabels(rg, st.labels?.[ri], labs, ring.length, labelCarryLost, ring))
        let outR = rings2.map((rg, ri) => { const src = st.labels?.[ri]; return rg.map((_, i) => (src && src[i] != null ? (rSrc[src[i]] || 0) : 0)) })
        if (holes.length) {
          // ⭐⭐⭐ A FACE'S CURB IS ITS OUTER ERODED INWARD **MINUS** EVERY HOLE DILATED INTO IT.
          // ⛔ Offsetting a hole ring with the ordinary call would SHRINK the hole — the normal is
          // winding-aware and points into the ring's own area whichever way it is traversed — so
          // the direction is stated (`outward`), never inferred from the winding.
          // ⛔ The subtraction goes through `booleanLabelled`, not `differenceRings`, because the
          // ① owner has to survive it: `RIBBONS §1`, identity is carried THROUGH the boolean and
          // never recovered from ring geometry afterward.
          const hRings = [], hLabs = []
          for (let hi = 0; hi < holes.length; hi++) {
            const hSt = {}
            const hOff = offsetRingVariable(holes[hi], mkDepth(holeLabs[hi]), () => true, () => null, false, hSt, true, true)
            for (let ri = 0; ri < hOff.length; ri++) {
              const src = hSt.labels?.[ri]
              hRings.push(hOff[ri])
              hLabs.push(carryEdgeLabels(hOff[ri], src, holeLabs[hi], holes[hi].length, labelCarryLost, holes[hi]))
            }
          }
          if (hRings.length) {
            const B = booleanLabelled(clipperLib.ClipType.ctDifference, outRings, outLabs, hRings, hLabs, true)
            // ⛔ THE STAMP DOES NOT SURVIVE THE HOLE SUBTRACTION, so the per-vertex correspondence is
            // lost on a compound face and its corners go through SHARP. Counted, never guessed:
            // easing at a vertex whose provenance we no longer hold would round what is not a corner.
            compoundNoEase++
            // ⛔ NO SILENT DEGRADE. Losing the identity means ③ cannot resolve a per-edge depth on
            // this face; the geometry is still the honest curb, so it is kept and the shortfall is
            // named. Guessing an owner is what mislabelled the shipped bands.
            if (B.refused) compoundUnlabelled++
            outRings = B.rings
            outLabs = B.labels || B.rings.map(rg => rg.map(() => null))
            outR = B.rings.map(rg => rg.map(() => 0))
          }
          compoundFaces++
        }
        for (let ri = 0; ri < outRings.length; ri++) {
          // ⛔ NO SILENT DEGRADE. Without the correspondence the authored R cannot be placed, and
          // easing at a guessed node would be a plausible-looking wrong curb — Layer 0 q2 inside
          // the geometry. So the ring goes through SHARP and the shortfall is counted, loudly.
          // ⭐⭐⭐ THE EASE — the node's handle configuration, realized. `RIBBONS §1`: the authored
          // radius "belongs in the node's bezier handles — a property the contour CARRIES, not a
          // shape built onto it afterwards". Rounding happens ONCE, here, which is INVARIANT 2:
          // ③ then insets this contour, so its bands are concentric with the arc BY CONSTRUCTION —
          // "the corner is the band BENT around the curb arc, never a constructed primitive".
          // ⛔ ① stays sharp and the OFFSET stays sharp; smoothing is Skeleton, rounding is Survey,
          // and this is Survey. R = 0 leaves the contour byte-identical (see `easeContour`).
          // ⭐⭐⭐ THE DETECTOR IS ①'s BLOCK RING, CARRIED ACROSS THE OFFSET ON THE STAMP — and the
          // OPERATOR'S EYE picked it, against my metrics. Reading the owner change off ②'s own ring
          // stamps MORE corners at a better median radius (238 @ 4.50 m vs 206 @ 3.15 m), and I
          // ranked the two that way and chose it. Wrong proxy: on screen the ① detector is the one
          // that rounds the corners a person sees. ⛔ Corner COUNT and MEDIAN RADIUS are not a proxy
          // for "the corners look right" — a corner stamped in the wrong place counts the same as one
          // in the right place. `feedback_proxy_render_is_not_the_operator_eye`.
          // ⚠️ Still short of the ~445 real corners in the disc — about 40% of them read correctly
          // (Jacob's eye). CAUSE NOT ESTABLISHED for the rest; the known lossy step is that
          // `offsetRingVariable` unions its emitted points and the union re-resolves labels, so the
          // miter apex's `src` need not point at the corner it came from.
          // ⛔ EASING ① FIRST (at R + the half-width, then offsetting) folds the offset on any leg
          // shorter than the setback — the crossed spikes at intersections. Built and reverted.
          // ⭐ The ring is ALREADY EASED — `offsetRingVariable` did it before its union. Nothing
          // rounds twice (INVARIANT 2); what is left here is recording the achieved arcs.
          const eL = outLabs[ri], eN = outRings[ri].length
          const arcs = (ri === 0 ? (st.easeArcs || []) : [])
          const eased = { ring: outRings[ri], labs: eL }
          // ⭐⭐ THE CORNER TRUTH, FROM ②. `SURVEY §4`: one corner truth, read by the handle, never
          // re-derived. ⛔ Under ① the legacy `cornerFillets`/`cornerSet` describe arcs that are NOT
          // on screen — they come from the chain shape pass — so the handle would drag a corner the
          // operator cannot see. These replace them (below) when ① is the producer.
          for (const a of arcs) {
            const si = a.src, nB = ring.length
            const o1 = protoOwners[labs[(si - 1 + nB) % nB]], o2 = protoOwners[labs[si]]
            if (!o1 || !o2) continue
            const [la, lb] = o1.skelId <= o2.skelId ? [o1.skelId, o2.skelId] : [o2.skelId, o1.skelId]
            const nodeKey = protoPairNode[`${la}|${lb}`]
            const key = `${ixKeyOf(nodeKey || a.V)}|${la}|${lb}`
            const fil = { apex: a.V, C: a.C, r: a.r, tA: a.tA, tB: a.tB }
            protoCornerSet.push({ key, V: nodeKey || a.V, legA: la, legB: lb, vertR: a.R, fillet: fil })
            // ⭐ FROZEN PER BLOCK — `SECTION §6.1`: the bent corner is `arcSectorPoly` off the frozen
            // `fillets`. Without these Section has no arc to bend the band around.
            ;(protoArcsByBlock[k] ||= []).push(fil)
          }
          protoCurb.push(eased.ring); protoCurbGs.push(isGs)
          // ⭐ the curb, with each vertex's ① label — this is what ③ insets FROM
          ;(easedByBlock[k] ||= []).push({ ring: eased.ring, labs: eased.labs || outLabs[ri] })
        }
      }
      // ⛔ LOUD, not silent: an edge with no resolvable authored width would erode by ZERO and
      // leave the curb sitting on the centreline — a plausible-looking wrong map.
      if (noWidth) console.warn(`[tileGround][PROTO②] ${noWidth} edge(s) had NO resolvable authored width and were offset by 0 — the curb sits on the centreline there.`)
      console.log(`[tileGround][PROTO②] curb from the proto: ${protoCurb.length} ring(s) offset per-edge at the authored pavementHW`)
      console.log(`[tileGround][PROTO②] corner ease: ${protoCornerN} corner(s) found by OWNER CHANGE (carried identity, never an angle), R=${baseR}×${scale} m` +
        (protoTipRound || protoTipBlunt ? ` · dead-end tips: ${protoTipRound} ROUND (eased at the half-width) · ${protoTipBlunt} BLUNT (R=0)` : '') +
        (protoCornerBend ? ` · ${protoCornerBend} are a street BENDING (broken handles, no chain pair — the class seed is correct there)` : '') +
        (protoCornerNoNode ? ` — ⚠️ ${protoCornerNoNode} had an AMBIGUOUS chain pair (two chains sharing more than one vertex) and took the class seed; a per-IX override cannot reach them` : ''))
      if (protoCornerAuthored) console.warn(`[tileGround][PROTO②] ⛔ this Look carries PER-CORNER radius overrides and ② cannot key them yet (the leg f/b flag is a tile-edge fact) — ${protoCornerAuthored} corner(s) took per-IX or the class seed instead. NOT silently applied.`)
      if (labelCarryLost.lost) console.warn(`[tileGround][PROTO②] ⛔ ${labelCarryLost.lost} contour point(s) lie over MORE THAN ONE ① edge — the union minted or collapsed them. Attributed to the LONGEST ① edge they span, which is the FILL's own tie-break, not a guess at a single owner.`)
      if (compoundNoEase) console.warn(`[tileGround][PROTO②] ⛔ ${compoundNoEase} compound face(s) went through SHARP — the vertex correspondence does not survive the hole subtraction, so their corners carry no authored radius.`)
      if (compoundFaces) console.log(`[tileGround][PROTO②] ${compoundFaces} compound face(s) — outer eroded inward, holes dilated into the face, subtracted as one object`)
      if (compoundUnlabelled) console.warn(`[tileGround][PROTO②] ⛔ ${compoundUnlabelled} compound face(s) lost their ① identity across the hole subtraction — ③ cannot resolve a per-edge depth on them.`)
      if (gsSkipped) console.log(`[tileGround][PROTO②] ${gsSkipped} grade-separated region(s) skipped — a hole bounded by motorways is not a city block, and the shipped path builds no highway curb either.`)
      // ⭐ THE EASE IS DISCLOSED PER POUR. A node that could not resolve its centreline node went
      // through SHARP; that is a real shortfall and must be countable, because on town #2 nobody
      // is looking. ⚠️ `overreach` is NOT an error — it is an authored R too big for its leg,
      // rendering as what it is (`§6.9.5`: self-intersection is SIGNAL, not error).
      // ── ③ HAND IT TO `sectionPass` — the FILL, unchanged ────────────────────────────
      // The paint stack (treelawn · sidewalk · materials · ADA · the LU flood) strokes INWARD
      // off a curb and does not care where the curb came from. So the honest test of ① and ②
      // is to build a shape-tile whose `iA` is the PROTO curb and run the shipped painter on
      // it. ⛔ Nothing in `sectionPassTile` is modified; if the stack cannot paint this, the
      // fault is in ①/② and must not be papered over downstream.
      // `runs` is the one field that has to be synthesised, and the labels already carry it:
      // consecutive proto edges with the same owner ARE a run — which is the substrate
      // ruling's "every ring edge is owned by one (skelId, side) by construction", now
      // literally true rather than aspirational.
      // ── ③ THE STACK IS SUCCESSIVE OFFSETS OF THE SAME CONTOUR ──────────────────────
      // ⛔⛔ `sectionPass` CANNOT DO THIS AND IT WAS NEVER GOING TO. It is a CHAIN-WORLD
      // painter: it strokes inward PER RUN, so its output is per-chain strips laid side by
      // side. Handing it a proto-derived curb just feeds chain-shaped runs into a chain-shaped
      // painter — and the tell is visible, not statistical. Jacob, 2026-09-05, on the drawing:
      //   "where those seams in the sidewalks and other stuff indicates it's chains. That
      //    outcome would be literally impossible if it were truly offset from the proto."
      // ⭐ HE IS RIGHT AND IT IS A PROOF, not an impression: ONE ring offset inward has no
      // joins in it. A seam can only exist where two separately-built pieces meet. So a seam
      // is positive evidence of per-chain construction, and no amount of ring-counting would
      // have caught it.
      // ⇒ "Everything offsets from it" means the WHOLE stack: each boundary is the same
      // contour offset a little further, and each band is the difference between two of them.
      // Per-edge depths come from the labels, so a width authored per frontage still varies
      // along the ring — but the ring is never cut, so no seam is constructible.
      // ⭐⭐⭐ ③ THE PED RIBBON — SET BACK FROM THE CURB, MONO-WIDTH, MATERIALS PER EDGE.
      // Three corrections land here together, and they were ONE term:
      //
      // ① THE DATUM. The ped strips are set back from THE CURB. Measurements from the
      //    centreline are immaterial to them (Jacob, 2026-09-06). The old ladder read
      //    `pavementHW + curb + treelawn + sidewalk` PER EDGE, i.e. it measured every rung
      //    from ①, which sits at the centreline. `pavementHW` survives here for exactly one
      //    job — it is WHERE THE CURB IS, the origin of the setback — and it appears nowhere
      //    in the ped ladder itself.
      //
      // ② MONO-WIDTH (`RIBBONS §1` INVARIANT 4, the keystone the 13-month corner saga ended
      //    on). ⛔ `WB = cw + max(TL) + max(SW)` over THIS BLOCK's own edges — ONE uniform
      //    outer depth per block, which is what makes the corners concentric by construction.
      //    Carrying tl/sw per-edge into the OUTER extent is per-leg stitching: the exact
      //    variable-offset balloon that killed Stages 7/8/sub-B. "Ribbon monowidth, strips
      //    variable" — what varies per edge is the DIVIDER and the MATERIALS, never the total.
      //
      // ③ THE BAND NAMES ARE THE SHIPPED ONES. `PAINT_ORDER` (`bake-ground.js:129`) is an
      //    ALLOW-LIST, and its own comment records what happens otherwise: a key no entry
      //    consumes "drops silently from the slab — that is exactly how the divided median
      //    vanished." `curbBand` was not in it. Every colour knob (`layerColors`) and every
      //    visibility toggle (`layerVis`) rides on these names through `BAND_TO_LAYER`, so a
      //    private name costs the operator control over the band, silently.
      //
      // ⭐⭐ MATERIALS WITHOUT A SECTOR PASS. Two strips ALWAYS, EQUAL width — they SWAP, they
      // never collapse (`SECTION §3.1`/`§3.3`): treelawn-Y reads curb→grass→walk, treelawn-N
      // reads curb→walk→lawn. The gleaned `hasTL` drives ONLY the material ordering, never a
      // width. ⇒ each MATERIAL's own two boundaries are per-edge functions, so the sidewalk
      // is one variable-depth annulus and the treelawn is another — no sector slicing, no
      // re-stroking a run's polyline into an area (the round trip `A10` closed).
      //
      // ⛔ THE LU REMAINDER RUNS TO CENTRE. `SECTION §3.3`: the FILL spans curb → block-centre;
      // there is no hard property line. So "both strips LU" is an OPEN FIELD — a MATERIAL
      // state, never an absence — and it falls out for free rather than being a case.
      protoBands = { curb: [], treelawn: [], sidewalk: [], lu: [] }
      // ⭐ BLOCK INDEX → its own bands. The tile artifact needs to know which band belongs to which
      // block; that is known at emit time and must be CARRIED, not recovered by containment later.
      const protoBandsByBlock = {}
      let capped = 0, tooNarrow = 0, severed = 0
      for (const [k, ring] of (protoBlockRings || R.rings).entries()) {
        const labs = (protoBlockLabels || R.labels)[k]
        if (!(ring?.length >= 3)) continue
        if (!protoUseBlocks && signedArea(ring) > 0) continue        // holes-path only; blocks are the HOLES there
        const M = (i) => protoMeasureOf(labs[i])
        // the CURB — per-edge, because a street's width genuinely varies along it and that is
        // the product (`SURVEY §4`, the asphalt-edge drag). ① already sits ε off the centreline.
        const hwAt = (i) => { const m = M(i); return m?.pavementHW > 0 ? Math.max(0, m.pavementHW - PROTO_HW) : 0 }
        const cw = curbWidth
        // ⭐⭐ THE COMPOUND FACE REACHES ③ TOO. A block's holes are part of the same object, so the
        // capacity guard and the open-field LU flood are struck from outer-minus-holes. ⛔ Offsetting
        // the outer alone would let the guard call a ring-shaped block roomy and then flood its hole.
        const bHoles = protoBlockHoles?.[k] || [], bHoleLabs = protoBlockHoleLabels?.[k] || []
        const hwOfLabs = (L) => (i) => { const m = protoMeasureOf(L[i]); return m?.pavementHW > 0 ? Math.max(0, m.pavementHW - PROTO_HW) : 0 }
        // the block region at an extra inward depth `d` past the authored pavement half-width
        const blockAt = (d) => {
          const outs = offsetRingVariable(ring, (i) => hwAt(i) + d, () => true, () => null)
          if (!bHoles.length || !outs.length) return outs
          const hls = []
          for (let hi = 0; hi < bHoles.length; hi++) {
            const hw = hwOfLabs(bHoleLabs[hi])
            hls.push(...offsetRingVariable(bHoles[hi], (i) => hw(i) + d, () => true, () => null, false, null, false, true))
          }
          return hls.length ? differenceRings(outs, hls) : outs
        }
        // the MONO-WIDTH envelope — one number for the whole block, over EVERY edge it has
        let WBnom = 0
        for (const L of [labs, ...bHoleLabs]) for (const l of L) { const m = protoMeasureOf(l); if (m) WBnom = Math.max(WBnom, cw + (m.treelawn || 0) + (m.sidewalk || 0)) }
        // ⭐ THE TOPOLOGICAL CAPACITY GUARD — and it is NOT the forbidden clamp. `§6.9`.5 rules
        // "no cusp guard; self-intersection is SIGNAL, not error" for MEANINGFUL degeneracy —
        // an authored R shrinking the pad to a point is a coherent smaller version of itself,
        // and Clipper's output is the honest answer. This is the OTHER regime: a depth past the
        // block's medial axis INVERTS the offset, `differenceRings` returns the COMPLEMENT, and
        // the band floods the interior. That is not a shape, it is a sign error wearing one.
        // ⛔ It is also why the previous cut's "drop the rung and count it" was wrong twice
        // over: it was a cusp guard by another name, AND it modelled a narrow block as MISSING
        // GEOMETRY when the model already has an answer for one (the ribbon simply reaches
        // centre). The shipped path guards this exact way — `cap = 0.9 × inscribed reach`,
        // bisected — so this is the existing licensed guard, not a new one.
        let WB = WBnom
        if (WBnom > 1e-6 && !blockAt(WBnom / 0.9).length) {
          let lo = 0, hi = WBnom / 0.9
          for (let it = 0; it < 12; it++) {
            const mid = (lo + hi) / 2
            if (blockAt(mid).length) lo = mid; else hi = mid
          }
          WB = lo * 0.9
          capped++
        }
        // ⛔⛔ A BLOCK TOO NARROW FOR THE CURB CARRIES NO STACK AT ALL — and the honest output
        // is LU TO CENTRE, not a clamp and not an absence. When the capacity guard drives WB
        // below `cw`, the LU edge lands OUTSIDE the curb band's inner edge and the two overlap
        // — measured by `claims-proto-stack-disjoint` the moment its membership test was fixed:
        // LS 5 blocks, HPDM 21, some capped to 0.0000 m. ⛔ Forcing `WB = cw` would invert the
        // offset again (the medial-axis case), and emitting nothing would read the block as an
        // ABSENCE, which `ARCHITECTURE §"The compound shape"` forbids: the drawing has no holes.
        // ⭐ `SECTION §3.3` already answers it — the FILL spans curb → block-centre and the LU
        // remainder floods, so a block with no room for a ribbon is the OPEN-FIELD limit: all
        // LU, a MATERIAL state, never a missing one. Counted, because on town #2 nobody looks.
        if (WB < cw) {
          const flood = blockAt(0)
          ;(protoBandsByBlock[k] ||= { curb: [], treelawn: [], sidewalk: [], lu: [] }).lu.push(...flood)
          protoBands.lu.push(...flood); tooNarrow++; continue
        }
        // ⭐⭐⭐ THE SUBJECT IS THE BLOCK'S COMPOUND CURB REGION, NOT ONE RING AT A TIME.
        // ②'s output for a block is a compound path: an outer, plus hole rings wherever the face
        // has holes or the block pinched into an annulus. ⛔ Insetting each ring on its own paints
        // the ribbon INTO the hole — the ring is offset toward its own interior whichever way it
        // is wound, so a hole's "inset" grows a band across a region that is not part of the block
        // at all. The region has to be offset as ONE object: outers eroded, holes DILATED
        // (`outward`), then differenced. Every band boundary below goes through `ins`, so there is
        // one place where that is true.
        // ⭐ The per-edge depth functions are unchanged and still ride each ring's own carried ①
        // labels (`EC.labs`) — what changed is the SUBJECT, not the ladder.
        const parts = (easedByBlock[k] || []).filter(EC => EC.ring?.length >= 3).map(EC => {
          // ⭐⭐⭐ ONE LADDER, BOTH PAINTERS — `stripLadder`. This site and `sectionPassProtoTile`
          // held two hand-written copies of the same four span expressions, and every fix today
          // landed in one of them: `67e8b944`/`45b7aa60` corrected `walkTo` at the other site,
          // `17ebb477` corrected it here, `f7a38ba0` corrected `lawnTo` here — three half-fixes,
          // because correctness had to be reproduced by hand in two places instead of stated once.
          // ⛔ THE ARRANGEMENT IS NOT RE-EXPRESSED HERE. What is local to this site is only the
          // datum (`cw`) and the envelope (`WB`); everything about WHICH strip is where comes from
          // the one function, so the two painters cannot drift again by construction.
          const lim = Math.max(0, WB - cw)
          // ⛔ AN EDGE WITH NO OWNER IS THE OPEN FIELD, NOT AN ABSENCE. `stripLadder({})` reads
          // neither strip as SW, which is all-LU curb→centre — byte-identical to what the two
          // hand-written copies produced for a null measure, and it is the ruled answer
          // (`ARCHITECTURE §"The compound shape"`: the drawing has no holes). It is not a
          // fallback: no material is invented, the absent one simply is not concrete.
          const L = (i) => stripLadder((EC.labs[i] == null ? null : protoMeasureOf(EC.labs[i])) || {}, lim)
          const at = (f) => (i) => cw + L(i)[f]
          return {
            ring: EC.ring,
            // ⛔ A HOLE OF THE CURB REGION, read off its winding — the one thing winding is a
            // reliable record of here, because these rings came straight out of one boolean.
            hole: signedArea(EC.ring) < 0,
            walkFrom: at('walkFrom'), walkTo: at('walkTo'),
            lawnFrom: at('lawnFrom'), lawnTo: at('lawnTo'),
          }
        })
        if (!parts.length) continue
        const outerParts = parts.filter(p => !p.hole), holeParts = parts.filter(p => p.hole)
        // ⛔⛔ NO STAMP IN THESE CALLS. `offsetRingVariable` GATES ITS UNION ON THE STAMP — with one
        // it runs `unionRingLabelled`, without it `unionRings` — so asking for labels CHANGES THE
        // GEOMETRY. That cost 448 phantom `treelawn&sidewalk` overlaps once, from a parameter
        // assumed to be bookkeeping.
        const ins = (pick) => {
          const o = [], h = []
          for (const p of parts) {
            const rs = offsetRingVariable(p.ring, pick(p), () => true, () => null, false, null, false, p.hole)
            ;(p.hole ? h : o).push(...rs)
          }
          return (o.length && h.length) ? differenceRings(o, h) : o
        }
        // ⛔ THE LARGER REGION IS THE SUBJECT — these are eroded inward, so a deeper offset gives a
        // SMALLER region. Passing the smaller first asks for (inner − outer), which is the block's
        // COMPLEMENT: the roadway, flooding every band across the whole street.
        const band = (a, b) => (a.length && b.length) ? differenceRings(a, b) : []
        const curbOuter = holeParts.length
          ? differenceRings(outerParts.map(p => p.ring), holeParts.map(p => p.ring))
          : outerParts.map(p => p.ring)
        // ⭐⭐⭐ WHERE THE CURBS TOUCH, THERE IS NO BLOCK (Jacob, 2026-09-06). A region whose inset by
        // the AUTHORED curb width comes back in more pieces than it started with has been SEVERED —
        // the two curbs met and the block stopped existing there. ⛔ Found by the offset itself,
        // never by a `2 × curbWidth` test: the curb width is AUTHORED, so a constant would be right
        // on one Look and silently wrong on the next.
        const pedOuter = ins(() => () => cw)
        if (pedOuter.length > outerParts.length) severed++
        const luEdge = ins(() => () => WB)
        // ⭐ PROTO_DUMP=1 — the discriminating measurement for the fat-band class, INERT when unset.
        // Two diseases look identical from a thickness histogram and have different cures:
        //   VANISHING PIECE — a block that PINCHES splits under a deeper inset and the sliver falls
        //     below `offsetRingVariable`'s area floor; the deeper set has FEWER pieces, that lobe is
        //     never subtracted, and `differenceRings` returns it WHOLE.
        //   FOLD — the offset crosses itself instead of splitting (`POLYGON-FIRST D6a`). Piece count
        //     HOLDS; the ring carries repeated vertices.
        if (typeof process !== 'undefined' && process.env?.PROTO_DUMP === '1') {
          const _bandDbg = band(curbOuter, pedOuter)
          const rep = (rs) => rs.reduce((n, rg) => { let c = 0; for (let i = 0; i < rg.length; i++) { const [x1,y1]=rg[i],[x2,y2]=rg[(i+1)%rg.length]; if (Math.hypot(x2-x1,y2-y1) < 1e-9) c++ } return n + c }, 0)
          const ar = (rs) => rs.reduce((t, rg) => t + Math.abs(signedArea(rg)), 0)
          ;(globalThis.__PROTO_DUMP ||= []).push({
            block: k, curbArea: ar(curbOuter), WBnom, WB, capped: WB !== WBnom,
            rings: parts.length, holes: holeParts.length,
            // ⛔ the band's SHAPE, not just its size: an annulus is `+-`, but a strip that pinches
            // comes back as several all-positive pieces, and a pooled outer-vs-hole count cannot
            // tell those apart. Reading one as the other manufactured a false root cause.
            bandOut: _bandDbg.length,
            bandSigns: _bandDbg.map(rg => (signedArea(rg) > 0 ? '+' : '-')).join(''),
            stages: [['curb', curbOuter], ['curb+cw', pedOuter], ['curb+WB', luEdge]]
              .map(([name, rs]) => ({ name, pieces: rs.length, area: ar(rs), repeated: rep(rs) })),
          })
        }
        // ⭐⭐ THE BANDS ARE BUCKETED BY BLOCK AT THE SOURCE. The artifact used to recover which
        // band belonged to which tile with a point-in-polygon sample of the global band list —
        // identity recovered from ring geometry afterward, which `RIBBONS §1` forbids, and which a
        // compound face breaks outright (a hole ring "contains" the bands of the faces nested
        // inside it). The block index is known HERE; carry it.
        protoCapByBlock[k] = WB
        const bb = (protoBandsByBlock[k] ||= { curb: [], treelawn: [], sidewalk: [], lu: [] })
        const emit = (key, rings) => { bb[key].push(...rings); protoBands[key].push(...rings) }
        emit('curb', band(curbOuter, pedOuter))
        emit('sidewalk', band(ins(p => p.walkFrom), ins(p => p.walkTo)))
        emit('treelawn', band(ins(p => p.lawnFrom), ins(p => p.lawnTo)))
        emit('lu', luEdge)
      }
      // ⭐⭐⭐ ① AS THE PRODUCER — the frozen artifact, built from ②③ rather than from the chains.
      // ⛔⛔ THIS IS A CHANGE OF CONSUMER, NOT OF CONSTRUCTION, and that distinction is the whole
      // lesson of the revert (`5560cf6a`): "I CHANGED THE SUBSTRATE, NOT THE PRODUCER… I chopped the
      // one compound path into 102 per-tile rings and handed them to the existing chain-based
      // construction, which still offsets from chains, still fillets, still constructs caps."
      // ②③ already changed the SUBJECT — they offset the grout contour. So the producer swap is only
      // this: hand the frozen artifact what ②③ made, instead of what the chain path made.
      // ⛔ AND THE TILE CARRIES ITS BANDS, NOT ITS `runs`. `sectionOpen` → `sectionPassTile` is the
      // per-run chain painter ③ exists to replace; giving it proto tiles would feed chain-shaped runs
      // into a chain-shaped painter and re-introduce the seams that are the whole tell (`RIBBONS §1`:
      // "a seam is positive evidence of per-chain construction").
      // ⛔ OPT-IN (`opts.protoProducer`), so the shipped artifact is byte-identical unless asked.
      if (opts.protoProducer || opts.protoArtifact) {
        protoShapeTiles = []
        for (const [k, ring] of (protoBlockRings || R.rings).entries()) {
          if (!(ring?.length >= 3)) continue
          if (!protoUseBlocks && signedArea(ring) > 0) continue
          const mine = easedByBlock[k] || []
          // ⛔⛔ A BLOCK WHOSE CURB CAME BACK EMPTY IS COUNTED, NEVER SILENTLY SKIPPED.
          // The drop itself is RULED CORRECT — `RIBBONS §1`, "if the curbs touch, there's no
          // block", and self-intersection means the feature goes to ZERO rather than drawing
          // crossed. ⭐ THE SILENCE WAS THE DEFECT, not the drop: this was a bare `continue`,
          // the same shape as `litmus-curb-parallel`'s `if (!tile?.iA?.length) continue` that
          // `POLYGON-FIRST §5` RULE 2 names as a fallback INSIDE an instrument — "a block has no
          // curb" reported as nothing at all. On a town nobody has inspected, a block quietly
          // absent from the artifact is exactly the plausible-looking wrong map Layer 0 forbids.
          if (!mine.length) { protoNoCurb++; protoNoCurbArea += Math.abs(signedArea(ring)); continue }
          // ⛔⛔ THE FILL IS NOT FROZEN — `SECTION §4`, the keystone, verbatim: "the FILL was NEVER
          // meant to be frozen; the DataWall freezes the SILHOUETTE and the FILL is the live
          // consumer-side stroke off it", and "Phase-D's earlier 'freeze the FILL too' over-reach is
          // the thing §3.2/§3.3 unwinds". Shipping ③'s bands in the artifact re-committed exactly
          // that over-reach: MEASURED, editing all 88 authored fe slots moved the legacy artifact
          // 960 m² of treelawn and the banded ① artifact 0 m².
          // ⇒ The tile freezes the SHAPE — `ring · iA · vertR · fillets · runs` (`§4`'s own list) —
          // and `sectionPassTile` strokes the ribbon, the divider, the materials and the bent corner
          // live off it, keyed by frozen identity + `blockCustoms`.
          // ⭐ THE SEAM OBJECTION DOES NOT SURVIVE ②. It applied to a CHAIN-derived `iA`: the band is
          // `differenceRings(iC, iW)` — successive offsets of ONE contour (`SECTION §7`'s design→code
          // table) — so with ②'s eased ring there is no seam constructible. The per-run sectors only
          // TAG that continuous band with materials; they do not build it.
          // ⭐⭐ `runs` — SUPPLIED, and it is IDENTITY not geometry (ruled 2026-09-06).
          // Consecutive ① edges with the same owner ARE a run: `RIBBONS §1`'s "every ring edge is
          // owned by one (skelId, side) BY CONSTRUCTION", now literally true instead of aspirational.
          // ⛔ It carries the IDENTITY QUARTET only — `skelId · side · segOrd · poly`. The chain run's
          // other fields are REFUSED with a reason, not silently dropped:
          //   `measure` `baseMeasure` `anchor` — inputs to a WALK. ③ hands Section the STROKE, so
          //      there is nothing left to stroke with. (`bands` is a change of MODEL, not an addition.)
          //   `roadId` `throughId` `thruEnds` — chain-world through-road identity, which exists to
          //      tell a per-run painter where a name change is NOT a corner. A contour has no runs to
          //      join, so the question does not arise.
          // ⛔ A consumer that needs one of those must say so and be answered, never find `undefined`:
          // on a town nobody has inspected, an absent field and a refused field must not read alike.
          // ⭐⭐⭐ AND THE SAME WALK STAMPS EVERY VERTEX — `iaStamp[r][k] = the run index`.
          // ⛔ THIS IS WHAT REPLACES THE WALK (Jacob, 2026-09-06: "because we don't do a walk
          // anymore, we might need to do a stamp inquiry step"). ③ never cuts the ring, so a
          // consumer never asks "where does this frontage stop" — only "what depth HERE", which
          // is a lookup per contour point. `runs` stays IDENTITY exactly as `RIBBONS §1` ruled;
          // this is the per-POINT index into it, which is the form an offset can consume.
          // ⛔ A `null` entry is an HONEST absence — a vertex ① never labelled, or (after the
          // disc cut below) a vertex on the RIM. The rim is an edge of the DRAWING, not a street
          // frontage; it owes no sidewalk, and `EM(i)` returning null is how that reads.
          // ⭐⭐⭐ THE CORNERS COME FROM ①, NOT FROM ②. *(Jacob, 2026-09-07: "back to the
          // protopolygon and not chains.")* `RIBBONS §1`: "① IS SHARP — smoothing is SKELETON and
          // rounding is SURVEY; ① sits between the two stages and does NEITHER."
          // ⛔ READING THE CORNER OFF ②'s CONTOUR IS READING THE ROUNDING, NOT THE SHAPE, and it
          // silently finds nothing: ② eases a 90° corner into ~12 vertices of 0.57 m turning 7.5°
          // each, so NO vertex clears a corner threshold. Measured on the block the operator
          // circled — a plain rectangle — ②'s contour has max turn 7.5° and ZERO corners, while ①'s
          // own hole has 10 vertices turning 1 0 0 92 7 102 4 3 88 93. Map-wide ① gives a median of
          // 4 corners per block; ② gives none.
          // ⭐ So the corner is stamped from ①'s ring and CARRIED onto ②'s contour by the label
          // every ② vertex already holds — identity carried through the offset, never recovered
          // from the eased geometry afterward.
          // ⭐⭐⭐ THE CORNER IS AN OWNER CHANGE AT AN ① VERTEX — COMPUTED PRE-EASING, THEN CARRIED.
          // *(Jacob, 2026-09-07: "Fix the corner stamp pre-easing, off ①'s vertices.")*
          // ⛔ WHAT THIS REPLACES, AND IT WAS WRONG TWICE OVER:
          //  · it tested the TURN at an ① vertex. A street BENDS mid-block; a bend is not a corner.
          //    `RIBBONS §1319`: a corner is where the OWNER changes, full stop.
          //  · it collected owner LABELS into a set and then marked every ② point holding one of
          //    them — so a frontage with a corner anywhere marked its whole length. Measured: true
          //    on 81% of LS contour points and true EVERYWHERE on 43 of 162 rings. A field that is
          //    true on four fifths of a contour is not marking corners.
          // ⭐ AND CONTIGUITY IS ENFORCED HERE, ON ①, NOT PATCHED ONTO ② LATER. A block is a CLOSED
          // POLYGON: each owner occupies exactly ONE arc of it, so a second appearance is a
          // mis-attribution and every extra arc mints a corner the block does not have. Measured on
          // ① before easing: LS 62 of 276 rings fragmented (157 extra corners), HPDM 297 of 1282
          // (588). ⛔ No threshold — keep each owner's longest arc, absorb the rest into the longer
          // neighbour. A frontage cannot appear twice on one ring; the polygon would self-cross.
          const ownAt = new Map()                 // ① edge index → the owner that edge really has
          // ① edge index q → ① TURNS at the vertex where edge q begins. A fact about ①'s SHAPE.
          const protoTurns = new Set()
          {
            const PR = (protoBlockRings || R.rings)[k], L = (protoBlockLabels || R.labels)?.[k]
            if (PR?.length >= 3 && L) {
              const m2 = PR.length
              const key = (q) => { const o = protoOwners[L[q]]; return o ? `${String(o.skelId ?? '').replace(/-\d+$/, '')}|${o.side}` : null }
              const own = new Array(m2); for (let q = 0; q < m2; q++) own[q] = key(q)
              const eLen = (q) => { const a = PR[q], b = PR[(q + 1) % m2]; return Math.hypot(b[0] - a[0], b[1] - a[1]) }
              // ⛔⛔⛔ AND THE OTHER HALF, WHICH ① OWNS: DOES THE CONTOUR TURN HERE?
              // *(Jacob, 2026-09-07: "Are you POSITIVE you are working from and only from the
              // protopolygon? The protopolygon doesn't have a node/corner there in the first
              // place.")* He is right, and it was measurable on ①'s own sharp ring.
              // `RIBBONS §1`, 2026-09-07: "① HAS NO NODES… a chain cut and a `segOrd` boundary are
              // chain-world bookkeeping — ①'s contour runs straight through them and the only thing
              // that changes is the LABEL." An OWNER is `protoOwners[].skelId` with the ordinal
              // stripped: a CHAIN identity. So "the owner changed" cannot be the corner test — it
              // is the test for WHOSE, not for WHETHER.
              // ⭐ THE SHAPE ANSWERS WHETHER, THE LABEL ANSWERS WHOSE. Both were already computed
              // here; only the label was being read. This is not a new rule, it is `RIBBONS §1`'s
              // two halves used for the two questions they each answer.
              // ⛔ `FILLET_TURN_TOL` is not a new threshold — it is `filletRing`'s existing ruled
              // constant, the same one `easeContour` carries for the same reason ("a near-straight
              // vertex is a CURVE SAMPLE, not a corner"). A third reader, not a third rule.
              // ⭐⭐ WHY BOTH AND NOT TURN ALONE: a street that BENDS mid-block turns without any
              // intersection, and a pad there would be an ADA ramp in the middle of a frontage.
              // The conjunction is a strict NARROWING of what shipped — it can only remove a pad,
              // never invent one, which is what makes it safe to land on a town nobody has seen.
              // ▶ MEASURED on ①'s own ring, both towns: LS 39 of 1283 owner changes (3.0%) and
              //   HPDM 269 of 5527 (4.9%) sit where ① DOES NOT TURN. They are exactly the ones no
              //   fillet rounds — nothing turns, so nothing was rounded — so downstream they fell
              //   to "the extent is the one edge the owners meet across", and on ① a straight
              //   frontage is ONE EDGE: median 32.8 m and up to 223 m on LS, 494 m on HPDM, painted
              //   as a curb ramp. ⭐ Town #2 carries it ~6× harder, the kit's signature.
              const turnsAt = new Array(m2)
              for (let q = 0; q < m2; q++) {
                const P = PR[(q - 1 + m2) % m2], V = PR[q], N = PR[(q + 1) % m2]
                const d1 = [V[0] - P[0], V[1] - P[1]], d2 = [N[0] - V[0], N[1] - V[1]]
                const L1 = Math.hypot(d1[0], d1[1]) || 1, L2 = Math.hypot(d2[0], d2[1]) || 1
                const cr = (d1[0] * d2[1] - d1[1] * d2[0]) / (L1 * L2), dt = (d1[0] * d2[0] + d1[1] * d2[1]) / (L1 * L2)
                turnsAt[q] = Math.atan2(Math.abs(cr), dt) >= FILLET_TURN_TOL
              }
              for (let q = 0; q < m2; q++) if (turnsAt[q]) protoTurns.add(L[q])
              let start = 0; while (start < m2 && own[start] === own[(start - 1 + m2) % m2]) start++
              if (start < m2) {
                const arcs = []
                for (let t = 0, q = start; t < m2; t++, q = (q + 1) % m2) {
                  if (!arcs.length || own[q] !== arcs[arcs.length - 1].o) arcs.push({ o: own[q], qs: [], len: 0 })
                  const a = arcs[arcs.length - 1]; a.qs.push(q); a.len += eLen(q)
                }
                const best = new Map()
                for (const a of arcs) if (a.o != null && (!best.has(a.o) || a.len > best.get(a.o).len)) best.set(a.o, a)
                for (let i2 = 0; i2 < arcs.length; i2++) {
                  const a = arcs[i2]; if (a.o == null || best.get(a.o) === a) continue
                  const pv = arcs[(i2 - 1 + arcs.length) % arcs.length], nx = arcs[(i2 + 1) % arcs.length]
                  const take = (pv.len >= nx.len ? pv : nx).o; if (take == null) continue
                  for (const q of a.qs) own[q] = take
                  a.o = take
                }
              }
              for (let q = 0; q < m2; q++) if (own[q] != null) ownAt.set(L[q], own[q])
            }
          }
          const runs = [], iaStamp = mine.map(EC => new Array(EC.ring.length).fill(null))
          // ⭐ CARRIED, NOT RE-DERIVED. Every ② vertex already holds the ① EDGE it was struck from,
          // so "is this a corner?" is "did the OWNER change between this vertex and the last?" — a
          // question about ①'s identity, asked on ②'s contour without ever measuring ②'s geometry.
          // ⛔ Reading it off ②'s shape is reading the ROUNDING: ② eases a 90° corner into ~12
          // vertices of 7.5°, so a turn test finds ZERO corners on a rectangle.
          const iaCorner = mine.map(EC => {
            const n2 = EC.ring.length
            const o = (i) => (EC.labs?.[i] != null ? (ownAt.get(EC.labs[i]) ?? null) : null)
            // ⛔ TWO QUESTIONS, TWO SOURCES, AND ONLY ONE OF THEM IS THE CHAIN'S. ① must TURN here
            // (its own shape) AND the owner must change (whose cross-sections meet). See the
            // `protoTurns` block above for why the first half was missing and what it cost.
            return EC.ring.map((_, i) => {
              const a = o((i - 1 + n2) % n2), b = o(i)
              return a != null && b != null && a !== b && protoTurns.has(EC.labs[i])
            })
          })
          // per ② contour vertex: is this ①'s corner? ⛔ Emitted as a FACT of the shape, so the
          // consumer never has to ask the eased geometry a question it cannot answer.
          for (let ri = 0; ri < mine.length; ri++) {
            const EC = mine[ri]
            const first = runs.length          // where this ring's runs begin, for the wrap merge
            let cur = null
            for (let i = 0; i < EC.ring.length; i++) {
              const o = EC.labs[i] == null ? null : protoOwners[EC.labs[i]]
              const key = o ? `${o.skelId}|${o.side}|${o.segOrd}` : null
              if (!key) { cur = null; continue }
              // ⭐ `baseMeasure` — the MEASURED cross-section for this street side. `SECTION §3.1`:
              // treelawn Y/N is "gleaned from data", and `resolvePedDepths(baseMeasure, side, custom)`
              // is the one depth truth the FILL and the handle both read. Surveyed DATA keyed by
              // frozen identity, not chain geometry — it crosses the wall by the ruled rule.
              if (!cur || cur.key !== key) { cur = { key, skelId: o.skelId, side: o.side, segOrd: o.segOrd, poly: [],
                // ⭐ ROAD-continuous ped, per-chain everything else. `roadKey` is SUPPLIED (it was
                // refused, and that refusal was the bug): a consumer must be able to ask "is this
                // the same road" without asking the chain graph.
                // ⛔ BOTH UNIONS, as VALUES. `protoRoadKey` holds `{roadId, throughId}`; storing the
                // object here made every comparison a reference compare, so every owner change
                // classed as "different roads" and the node census silently read clean. Caught by
                // the count MOVING THE WRONG WAY (511 → 593 corners) — an invariant that improves
                // when you did not touch it is the tell.
                baseMeasure: protoBase.get(o.skelId) || null }; runs.push(cur) }
              iaStamp[ri][i] = runs.length - 1
              cur.poly.push(EC.ring[i])
              cur.iEnd = i                                   // the last EDGE this run owns
            }
            // ⭐⭐⭐ A RUN OWNS EDGES, SO ITS POLYLINE ENDS AT ITS LAST EDGE'S FAR VERTEX.
            // The loop above pushes the vertex each owned edge LEAVES, so a run's polyline stopped
            // one vertex short of its own arc — and a run owning exactly ONE edge came out as a
            // single point, which the filter below then DROPPED. On a contour whose straight sides
            // are one long edge apiece, that is a whole block face going unpainted: LS 92 such runs.
            // ⭐ Jacob, on the map: "there is no map" under handles that will not respond — the
            // handle is placed off the centreline, the band off the stamp, so where the run was
            // dropped the handle sits over ground nothing owns.
            for (let ru = first; ru < runs.length; ru++) {
              const r2 = runs[ru]
              if (r2.iEnd == null) continue
              r2.poly.push(EC.ring[(r2.iEnd + 1) % EC.ring.length])
            }
            // ⛔⛔ THE RING IS CLOSED, SO THE ARRAY'S SEAM IS NOT A FEATURE OF IT.
            // The loop above starts at index 0 and does not wrap, so a frontage that spans the
            // start of the array comes out as TWO runs — one at the head, one at the tail. The
            // consumer then reads an owner change there and treats it as a CORNER.
            // ⭐ THE OPERATOR NAMED THIS EXACTLY: "every street which encircles a ring has a break
            // in it where the join starts/ends, so every single block is wrong." ONE fabricated
            // join per ring, on EVERY block — and it is a WALK artifact, in a construction whose
            // whole point is that it does not walk.
            // ⭐ `groupRuns` — the legacy walker this replaced — has always handled it ("find a
            // seam: an edge whose predecessor differs… whole ring is one street-side → one closed
            // run"). I did not carry that across, and index 0 is not a place on the map.
            if (runs.length - first >= 2) {
              const a = runs[first], b = runs[runs.length - 1]
              if (a.key === b.key) {
                // ⛔ the tail run already closed on the head run's first vertex, so drop that
                // duplicate rather than emitting a zero-length segment into the joined polyline.
                b.poly.pop()
                b.poly.push(...a.poly)                       // the tail run continues into the head
                const bi = runs.length - 1
                for (let i = 0; i < iaStamp[ri].length; i++) if (iaStamp[ri][i] === first) iaStamp[ri][i] = bi
                runs.splice(first, 1)
                for (let i = 0; i < iaStamp[ri].length; i++) if (iaStamp[ri][i] > first) iaStamp[ri][i]--
                for (const r2 of runs) { /* earlier rings' stamps are already fixed */ }
                for (let rj = 0; rj < ri; rj++) for (let i = 0; i < iaStamp[rj].length; i++)
                  if (iaStamp[rj][i] != null && iaStamp[rj][i] > first) iaStamp[rj][i]--
              }
            }
          }
          // ⛔ A RUN OF ONE VERTEX IS NOT A LEG — `legDirAt` reads `poly[1]`/`poly[n-2]` and a single
          // point has no direction. ⭐ But that is now a REAL degeneracy rather than an accounting
          // one: since a run closes on its last edge's far vertex, a run that owns any edge at all
          // has two points. What can still reach here is a run owning ZERO edges, which is nothing.
          // ⛔ Still dropped and COUNTED — never padded with a fabricated second point.
          const shortRuns = runs.filter(r => r.poly.length < 2).length
          if (shortRuns) protoShortRuns += shortRuns
          const runs2 = runs.filter(r => r.poly.length >= 2)
          // ⛔ THE FILTER RENUMBERS, SO THE STAMP IS REMAPPED — a dropped run must not leave the
          // stamp pointing at its neighbour. A vertex whose run went away stamps `null`: an
          // honest absence, never a silent re-attribution to whoever slid into the index.
          const reIx = new Map(); runs.forEach((r, i) => { const j = runs2.indexOf(r); if (j >= 0) reIx.set(i, j) })
          for (const a of iaStamp) for (let i = 0; i < a.length; i++) a[i] = a[i] == null ? null : (reIx.has(a[i]) ? reIx.get(a[i]) : null)
          for (const r of runs2) { delete r.key; delete r.iEnd }
          protoShapeTiles.push({
            ring, iA: mine.map(EC => EC.ring),
            // ⭐⭐⭐ THE FILL IS NO LONGER FROZEN — `SECTION §4`'s keystone, finally kept: freeze the
            // SILHOUETTE, author the FILL live. `bands` used to sit here and `sectionOpen`
            // short-circuited on it, so an authored treelawn moved this artifact 0 m². The tile now
            // freezes the STAMP (`iaStamp` + `iaFull`) and `sectionPassProtoTile` re-strikes ③'s own
            // ladder past the wall, per contour POINT — no walk, no runs to stroke, no corner to
            // decline. ⭐ Jacob: "we don't do a WALK anymore… there are no nodes there now."
            // ▶ node scratch/claims-proto-fill-is-live.mjs — band within 0.1% of what the frozen
            //   bands drew, on two towns; authoring now moves it +35,819 m² where it moved 0.
            // ⭐ the SHAPE the wall freezes (`SECTION §4`'s own list) — carried NOW, so the flip is
            // one deletion rather than a rebuild.
            fillets: protoArcsByBlock[k] || [],
            vertR: (protoArcsByBlock[k] || []).map(a => a.r),
            cap: protoCapByBlock[k],
            bandJoin: 'miter',      // INVARIANT 2 — jtMiter, never jtRound; nothing rounds twice
            // ⛔⛔ EMPTY, NOT ABSENT, AND IT IS A DISCLOSED GAP — NOT A DEFAULT. ① carries no cap
            // typology yet: `RIBBONS §1` rules a cap is TWO ordinary corner nodes ("blunt = both
            // apexes at R=0, round = both eased"), and that is not built. So a cul-de-sac gets no
            // cap WRAP from Section on this path. Empty arrays are what "this tile has no round
            // tip" honestly looks like; absent fields would crash the painter, and a fabricated
            // tip would be a plausible-looking wrong bulb. Counted per pour below.
            roundTips: [], bluntTips: [], roundTipKeys: [], mouths: [], thruNodeEnds: [],
            // ⭐ `iaFull` — the UNCUT curb contour the stamp indexes. The disc cut simplifies the
            // ring, so `iA` and `iaStamp` stop corresponding after it; the FILL is struck off this
            // one and CUT with `iA`. See the cut block below.
            runs: runs2, iaStamp, iaCorner, iaFull: mine.map(EC => EC.ring),
            // ⭐ `lu` — SUPPLIED. Jacob: "LU is a gettable/knowable datapoint… stamp the LU into the
            // initial ground map and later add overrides." A fact about the world, read off the block
            // itself, not a construction parameter. Overrides are a later layer and not scoped here.
            lu: luForRing(ring),
            producer: 'proto',
            producerReason: 'offset from ①; bands struck from the curb; runs = identity only',
            // ⛔ THE REFUSALS, RECORDED. A consumer hitting a missing field can read WHY here rather
            // than guess whether it was dropped or never applied.
            // ⛔ WHAT IS STILL REFUSED, AND WHY — a consumer hitting a missing field reads the
            // reason here rather than guessing whether it was dropped or never applied.
            // ⭐ `tl`/`sw`/`cap`/`bandJoin`/`vertR`/`fillets` are NO LONGER REFUSED: `SECTION §4`
            // freezes exactly `ring · iA · vertR · fillets · runs` and strokes the FILL live off
            // them. Refusing them was this build freezing the FILL — the named over-reach.
            refused: {
              tl: 'a DEFAULT depth, not a frozen one — `resolvePedDepths` glean it live off `runs[].baseMeasure` (`SECTION §3.1`)',
              sw: 'a DEFAULT depth, not a frozen one — same resolution as `tl`',
              roundTips: 'cap machinery — a contour already IS its caps',
              bluntTips: 'cap machinery — a contour already IS its caps',
              roundTipKeys: 'cap machinery — a contour already IS its caps',
            },
          })
        }
        // ⭐⭐⭐ AND NOW THE CIRCLE IS STAMPED — LAST, ON THE RESULT. Jacob, 2026-09-06: "I thought
        // the decision was to build the whole grid flat and then stamp out the circle last."
        // Everything above ran on WHOLE blocks: ② offset a full block, ③ struck full bands. Only
        // here is the disc applied, and it applies to the OUTPUT — so a rim block's ribbon is a
        // clean CUT through a finished band, never a band that turned a corner to follow the rim.
        // ⛔ Cutting earlier is what produced the wrapped corners at the stencil edge: the circle
        // reached the offset stage disguised as an ordinary block edge, and ③ has no way to tell
        // "edge of a block" from "edge of the drawing".
        // ⛔ NO FALLBACK: no frozen boundary ⇒ NOTHING is stamped and it says so. A silently
        // un-stamped pour draws the whole bb and looks deliberate.
        const stamp = MP.boundaryRing
        if (stamp?.length > 2) {
          const before = protoShapeTiles.length
          const cut = (rings) => { const o = intersectRings(rings || [], [stamp]); return o?.length ? o : [] }
          const kept = []
          for (const t of protoShapeTiles) {
            const ring = cut([t.ring])
            if (!ring.length) continue                     // wholly outside the disc — correctly gone
            // ⛔ The SHAPE is what is cut — the ring and the curb. The FILL is stroked live off
            // them past the wall, so there is nothing else here to clip. ⭐ That sentence was
            // aspirational when it was written and is now true: the bands are gone from the tile.
            // ⭐ A fillet whose arc falls entirely outside the disc goes with it: the corner it
            // describes is not in the drawing, and a fillet with no curb is an arc nobody paints.
            const inDisc = (p) => intersectRings([[[p[0]-0.05,p[1]-0.05],[p[0]+0.05,p[1]-0.05],[p[0]+0.05,p[1]+0.05],[p[0]-0.05,p[1]+0.05]]], [stamp]).length > 0
            // ⛔⛔ THE STAMP CANNOT SURVIVE THIS CUT, AND THE ANSWER IS NOT TO MAKE IT.
            // `intersectRings` SIMPLIFIES: Clipper drops collinear vertices, so an interior ring
            // comes back with 40 points where it had 67 — measured, and it is why re-attaching
            // the stamp by exact key after the cut recovered 2 of 40. ⭐ A tolerance would "fix"
            // that and it is the forbidden shape (`RIBBONS §1`: smoothness by construction, never
            // cleanup) — and matching a stamp by distance is `A15`'s proximity recovery, which
            // killed the walk-ordinal coupler.
            // ⭐⭐ ③ NEVER NEEDED IT TO SURVIVE: it strikes the bands off the UNCUT contour and cuts
            // the BANDS. So the tile carries both, and each is the authority for one question —
            // `iaFull` + `iaStamp` say WHAT DEPTH (per point, uncut, correspondence intact), the
            // cut `iA` says WHERE THE BLOCK IS. The painter strikes off the first and cuts with
            // the second, which is this block's own stated intent: "a rim block's ribbon is a
            // clean CUT through a finished band, never a band that turned a corner to follow the
            // rim." ⇒ `iaFull`/`iaStamp` pass through the cut untouched, by design.
            // ⛔⛔ A BLOCK THE DISC CUTS INTO PIECES BECOMES SEVERAL TILES, AND EACH USED TO
            // INHERIT THE WHOLE BLOCK'S CURB. `cut(t.iA)` clips to the DISC, not to the piece, so
            // every piece carried every other piece's `iA` — and `sectionPassProtoTile` confines
            // its bands with exactly that ring (`inBlock`). ⇒ one block painted its full band set
            // once PER PIECE, on top of itself.
            // ⭐ Measured on LS: 7 of 149 tiles were another tile's twin (#77≈#78≈#79,
            // #92≈#93≈#94≈#95, #136≈#137), and 54 authoring slots appeared to "paint ≥2 m in two
            // distinct blocks" — including `jules-street|right|0`, 207 m in one and 204 m in
            // another on a 218 m two-point chain crossed by nothing. ⛔ I reported that to two
            // other agents as "two ① faces claim the same side of the same street." IT IS NOT:
            // it is ONE face emitted N times, and the 411 m is 218 m counted twice.
            // ⭐ The piece's own curb is `iA ∩ piece` — the piece is already disc-cut, so one
            // intersection does both jobs. ⛔ `iaFull`/`iaStamp` still pass through UNCUT, by the
            // design stated above: they answer "what depth HERE", which the cut must not disturb.
            for (const r of ring) kept.push({ ...t, ring: r, iA: intersectRings(t.iA || [], [r]),
              fillets: (t.fillets || []).filter(f => inDisc(f.apex)) })
          }
          protoShapeTiles = kept
          console.log(`[tileGround][PROTO⊙] stamped the circle LAST, on the finished geometry: ${before} tile(s) → ${kept.length}. Bands are CUT at the rim, never bent to follow it.`)
        } else {
          console.log(`[tileGround][PROTO⊙] ⛔ NO boundary in this pour — the circle was NOT stamped. The artifact is the WHOLE frame; do not read a rim from it.`)
        }
        // ⛔⛔ COUNTED SINCE IT WAS WRITTEN, REPORTED BY NOBODY — and when I first wired this warn I
        // put it in the ② epilogue, which runs BEFORE the runs are built. It printed 0 and I believed
        // it. An instrument that reports a count taken before the count exists is the same defect as
        // no instrument at all, and worse, because it reads as evidence.
        if (protoShortRuns) console.warn(`[tileGround][PROTO②] ⛔ ${protoShortRuns} run(s) of a single vertex were DROPPED — their contour carries NO stamp, so nothing paints there and a handle over it has nothing to drag.`)
        console.log(`[tileGround][PROTO⇢artifact] ${protoShapeTiles.length} tile(s) produced from ①②③ — this is the SHAPE the consumer will freeze`)
        if (protoNoCurb) console.warn(`[tileGround][PROTO②] ⛔ ${protoNoCurb} block(s) yielded NO curb ring and are ABSENT from the artifact (${protoNoCurbArea.toFixed(0)} m² of ① block area). Their curbs meet, so there is no block between them — RULED CORRECT (\`RIBBONS §1\`), but it is a REAL ABSENCE and it is counted here rather than left to be discovered on a map.`)
      }
      // ⭐ The capacity guard is DISCLOSED, per pour. A block whose ribbon could not reach its
      // nominal depth is a real fact about that block, not an error — but it must be countable,
      // because on town #2 nobody is looking.
      protoStackCollapse = { total: capped, tooNarrow, severed, byRung: null, blocks: null }
      console.log(`[tileGround][PROTO③] ped ribbon off the CURB, mono-width per block: curb ${protoBands.curb.length} · treelawn ${protoBands.treelawn.length} · sidewalk ${protoBands.sidewalk.length} · LU ${protoBands.lu.length} ring(s)`)
      if (capped) console.log(`[tileGround][PROTO③] ${capped} block(s) hit the capacity guard — the ribbon reaches centre rather than inverting (NOT a defect; the open-field case).`)
      if (severed) console.log(`[tileGround][PROTO③] ${severed} block(s) SEVERED by their own curbs — the inset came back in pieces, so the two curbs meet and there is no block between them there. Each piece carries the ribbon separately (NOT a defect).`)
      if (tooNarrow) console.log(`[tileGround][PROTO③] ${tooNarrow} block(s) too narrow for even the curb — painted ALL LU to centre (the open-field limit, a MATERIAL state, not an absence).`)

      // ⛔⛔ `sectionPass` IS REMOVED FROM THIS PATH, NOT LEFT BESIDE IT. It strokes inward
      // PER RUN, so its output is per-chain strips laid side by side — and Jacob read that
      // straight off the drawing: "those seams in the sidewalks indicate it's chains. That
      // outcome would be literally impossible if it were truly offset from the proto."
      // ⭐ It is a PROOF, not an impression: one ring offset inward has no joins, so a seam can
      // only exist where two separately-built pieces meet. ⇒ A SEAM IS THE ACCEPTANCE GATE.
      // Keeping the run-painter as a second producer would be the thing this whole change
      // exists to delete, so it goes.
    }
  }

  let grout = null
  if (opts.grout && opts.grout !== 'proto') {
    const gAcc = []
    let gSkipped = 0
    for (let idx = 0; idx < streetsOrig.length; idx++) {
      const s = streetsOrig[idx]
      const pts = s?.points
      if (!(pts?.length >= 2) || s.gradeSeparated) continue
      const Lb = [], Rb = []
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz)
        if (L < 1e-9) continue
        const so = segOrdAtVertex(idx, i)
        const hwL = feWidthAt(idx, 'left', so), hwR = feWidthAt(idx, 'right', so)
        if (!(hwL > 0) && !(hwR > 0)) continue
        const R = [-dz / L, dx / L]                       // measure-RIGHT perp, (-dz,dx)
        Lb.push([a[0] - R[0] * hwL, a[1] - R[1] * hwL], [b[0] - R[0] * hwL, b[1] - R[1] * hwL])
        Rb.push([a[0] + R[0] * hwR, a[1] + R[1] * hwR], [b[0] + R[0] * hwR, b[1] + R[1] * hwR])
      }
      if (Lb.length < 2) { gSkipped++; continue }
      gAcc.push([...Lb, ...Rb.reverse()])
      for (const [k, vi] of [['start', 0], ['end', pts.length - 1]]) {
        if (nodeDeg.get(tipKey(pts[vi])) !== 1) continue
        const authored = s.capEnds?.[k] || (k === 'start' ? s.capStart : s.capEnd)
        const style = (authored && authored !== 'none') ? authored : (s.caps?.[k]?.cap || 'round')
        if (style !== 'round') continue                   // a blunt cap has no bulb — it is the node's handle state
        const so = segOrdAtVertex(idx, vi === 0 ? 0 : pts.length - 2)
        const hwL = feWidthAt(idx, 'left', so), hwR = feWidthAt(idx, 'right', so)
        const rr = (hwL + hwR) / 2
        if (!(rr > 0)) continue
        const nb = pts[vi === 0 ? 1 : pts.length - 2]
        const dx = vi === 0 ? nb[0] - pts[vi][0] : pts[vi][0] - nb[0]
        const dz = vi === 0 ? nb[1] - pts[vi][1] : pts[vi][1] - nb[1]
        const L = Math.hypot(dx, dz) || 1, R = [-dz / L, dx / L]
        const disp = (hwR - hwL) / 2
        gAcc.push(circlePoly(pts[vi][0] + R[0] * disp, pts[vi][1] + R[1] * disp, rr))
      }
    }
    grout = unionRings(gAcc)
    // ── Round the corners with the AUTHORED R — "like all the others" (Jacob).
    // ⛔⛔ AND filletRing MUST BE HANDED THE BLOCK, NOT THE ROAD. It rounds only
    // vertices CONVEX relative to the ring's interior (`:625`, the concave `continue`).
    // A street corner is CONVEX on the block and CONCAVE on the grout — hand it the
    // grout and it skips every corner you want and rounds the ones you don't. The curb
    // is the SHARED boundary, so filleting the block rounds the grout's corners too:
    // same curve, owned by the other polygon. (This is the whole tile path's own move —
    // `filletRings(blockRings, cornerRfn, …)`, `:4463`.)
    // R comes from the same authored kit as everywhere else: the per-tile `vertR` the
    // corner-R controls already wrote (global scale × per-IX × per-corner). ⛔ No new
    // control, no clamp, no default — a vertex with no authored corner near it gets 0
    // and stays sharp, which is what an authored R=0 must look like.
    const gCorners = []
    for (const st of shapeTiles) {
      const vr = st.vertR || []
      for (let i = 0; i < (st.ring || []).length; i++) if (vr[i] > 0) gCorners.push([st.ring[i][0], st.ring[i][1], vr[i]])
    }
    const groutRfn = (V) => {
      let bd = Infinity, bR = 0
      for (let k = 0; k < gCorners.length; k++) {
        const dx = V[0] - gCorners[k][0], dz = V[1] - gCorners[k][1], d = dx * dx + dz * dz
        if (d < bd) { bd = d; bR = gCorners[k][2] }
      }
      return bd <= 25 ? bR : 0            // 5 m — the corner it belongs to, or none
    }
    // `?grout=raw` draws the road contour UNFILLETED — the control, so the fillet's
    // contribution is separable rather than asserted.
    if (opts.grout !== 'raw') {
      const gStencil = stencil ? [stencil] : unionRings(tiles.map(t => t.ring))
      grout = filletRings(differenceRings(gStencil, grout), groutRfn, [])
    }
    // ⛔ Report the skip LOUDLY rather than drawing a grout with holes in it: a chain
    // with no resolvable width is a hole the blocks merge through, and a quietly
    // incomplete grout is the plausible-looking success Layer 0 q2 forbids.
    if (gSkipped) console.warn(`[tileGround][GROUT] ${gSkipped} chain(s) had no resolvable per-side width and are ABSENT from the grout — the contour is incomplete where they run.`)
  }

  let asphalt = unionRings(Aacc)
  let highway = unionRings(Hacc)
  let curb    = unionRings(Cacc)
  let sidewalk = unionRings(Wacc)
  if (stencil) {
    const tileUnion = unionRings(tiles.map(t => t.ring))
    const perimeter = differenceRings([stencil], tileUnion)   // frame: outer(s) + tile-network holes
    // G9 — road the EXTERIOR streets. A street segment whose outer side borders
    // the perimeter (no tile there) was un-roaded → "roads don't reach their
    // dead ends". Stroke every street at the four cumulative depths and clip to
    // the perimeter, so only each street's exterior-facing side fills there;
    // union with the per-tile interior bands gives the full-width road out to
    // the tip. The perimeter is the edge of the map, so the bands use the
    // street's max-side widths and the stroke's own (cap-at-depth) corners
    // rather than the interior concentric construction.
    const perimFill = (level) => {
      const stads = []
      for (let i = 0; i < streets.length; i++) {
        const m = measures[i]
        const a = Math.max(0, m?.left?.pavementHW || 0, m?.right?.pavementHW || 0)
        if (a <= 1e-6) continue
        const tlm = Math.max(0, m?.left?.treelawn || 0, m?.right?.treelawn || 0)
        const swm = Math.max(0, m?.left?.sidewalk || 0, m?.right?.sidewalk || 0)
        const d = level === 'A' ? a : level === 'C' ? a + cw : level === 'T' ? a + cw + tlm : a + cw + tlm + swm
        let pieces = strokeOpen(streets[i].points, d)
        // [E3.2] junction keep-outs cut the chain's OWN stroke back to the
        // constructed curb within a window (the tooth class on the perimeter).
        if (level === 'A' && jPerimCuts.size) {
          const so = streetsOrig[i]
          const cuts = jPerimCuts.get((so && (so.skelId || so.name)) || '')
          if (cuts?.length) pieces = differenceRings(pieces, cuts)
        }
        stads.push(...pieces)
      }
      // [E3.2] perimeter-datum window polys — the constructed junction
      // coverage (dips, wedges, the de-tapered curb) for perimeter joins.
      if (level === 'A' && jPerimPolys.length) stads.push(...jPerimPolys)
      // The perimeter strokes are butt-capped, so an exterior round cul-de-sac
      // would end flat. Add a concentric fill disk at each round tip at this
      // level's depth so the perimeter road rounds AND its ped bands wrap (the
      // level differences give asphalt + curb + treelawn + sidewalk rings).
      for (const [, t] of deadEndTips) {
        if (t.cap !== 'round' || t.hw <= 1e-6) continue
        const d = level === 'A' ? t.hw : level === 'C' ? t.hw + cw : level === 'T' ? t.hw + cw + t.tl : t.hw + cw + t.tl + t.sw
        stads.push(circlePoly(t.c ? t.c[0] : t.px, t.c ? t.c[1] : t.py, d))
      }
      return stads.length && perimeter.length ? intersectRings(unionRings(stads), perimeter) : []
    }
    const pA = perimFill('A')
    // CONCENTRIC perimeter corners that MATCH the interior (Jacob): a corner is
    // a property of the walk, so round it with the same G5 construction on the
    // open perimeter contour. openRound the region beyond the perimeter asphalt
    // at R (rounds the convex block-outer corners where two exterior runs meet);
    // the bands are concentric offsets of that rounded asphalt-inner. To keep
    // the ped on the STREET side (never on the stencil/map edge) WITHOUT
    // re-hardening the corners, clip to a SMOOTH zone (the asphalt dilated by
    // the full ped depth, round join) — not the hard network-buffer union.
    // Representative ped (mean) matches the interior's per-tile representative.
    let tlSum = 0, swSum = 0, nP = 0
    for (const m of measures) {
      if (!m) continue
      tlSum += Math.max(m.left?.treelawn || 0, m.right?.treelawn || 0)
      swSum += Math.max(m.left?.sidewalk || 0, m.right?.sidewalk || 0); nP++
    }
    const tlP = nP ? tlSum / nP : 0, swP = nP ? swSum / nP : 0
    const iAp = openRound(differenceRings(perimeter, pA), R)
    const iCp = offsetRings(iAp, -cw, 'miter')
    const iTp = offsetRings(iAp, -(cw + tlP), 'miter')
    const iWp = offsetRings(iAp, -(cw + tlP + swP), 'miter')
    const pedClip = offsetRings(pA, cw + tlP + swP + R + 3)        // smooth street-side zone
    const pAsphalt = differenceRings(perimeter, iAp)
    const pCurb    = intersectRings(differenceRings(iAp, iCp), pedClip)
    // ADA all-SW corner plug — the SAME slab-trim as the interior (NOT disks,
    // which curve backwards): the treelawn lives only on the straight legs and
    // ends at the tangent. Build the leg zone from each street's treelawn slab,
    // split at junctions (degree ≥ 3) and trimmed back from each junction/end by
    // (asphalt-hw + R). The corner span carries no treelawn → fills as sidewalk.
    const tlSlabsP = []
    streets.forEach((s, i) => {
      const m = measures[i]
      const a = Math.max(0, m?.left?.pavementHW || 0, m?.right?.pavementHW || 0)
      const td = a + cw + tlP
      if (td <= 1e-6 || !s.points) return
      for (const seg of splitAtJunctions(s.points, nodeDeg, tipKey)) {
        let segLen = 0
        for (let k = 0; k < seg.length - 1; k++) segLen += Math.hypot(seg[k + 1][0] - seg[k][0], seg[k + 1][1] - seg[k][1])
        const trim = a + R
        const poly = trimPolyline(seg, trim, trim)
        if (poly && poly.length >= 2) tlSlabsP.push(...strokeOpen(poly, td))
      }
    })
    const zoneP = tlSlabsP.length ? unionRings(tlSlabsP) : []
    const pPedZone = intersectRings(differenceRings(iCp, iWp), pedClip)   // curb-inner → LU, street side
    const pTree = zoneP.length ? intersectRings(intersectRings(differenceRings(iCp, iTp), pedClip), zoneP) : []
    const pSide = differenceRings(pPedZone, pTree)                        // sidewalk incl. the corner plug
    asphalt  = unionRings([...asphalt,  ...pAsphalt])
    curb     = unionRings([...curb,     ...pCurb])
    sidewalk = unionRings([...sidewalk, ...pSide])
    // Perimeter treelawn + the remaining perimeter LU route to one edge-of-map
    // class (probe the largest perimeter outer). Keep the frame's holes so it
    // doesn't paint over the per-class block centres.
    let big = null, bigA = 0
    for (const r of perimeter) { const a = signedArea(r); if (a > bigA) { bigA = a; big = r } }
    const perimClass = big ? luForRing(big) : 'unknown'
    pushLu(tlByLu, perimClass, pTree)
    pushLu(luByLu, perimClass, differenceRings(perimeter, unionRings([...pAsphalt, ...pCurb, ...pTree, ...pSide])))
    asphalt  = intersectRings(asphalt,  [stencil])
    highway  = intersectRings(highway,  [stencil])
    curb     = intersectRings(curb,     [stencil])
    sidewalk = intersectRings(sidewalk, [stencil])
  }
  const treelawnByLu = {}, luByClass = {}
  for (const k of Object.keys(tlByLu)) treelawnByLu[k] = stencil ? intersectRings(unionRings(tlByLu[k]), [stencil]) : unionRings(tlByLu[k])
  for (const k of Object.keys(luByLu)) luByClass[k]   = stencil ? intersectRings(unionRings(luByLu[k]), [stencil]) : unionRings(luByLu[k])

  // The BLOCK contours: each tile's asphalt-inner ring (iA) — the block polygon
  // to the curb edge, exactly the polygon this step bakes into the shape artifact.
  // No ped/LU subdivision (those are scalars here, geometry only in Section).
  // Collected from the per-tile shape (already computed) — no extra Clipper op, so
  // it stays free on the live corner-drag rebuild path. The Survey view shades
  // these to memorialize the block boundaries; the rest of the app ignores it.
  const blockRaw = shapeTiles.flatMap(st => st.iA || [])
  let block = stencil ? intersectRings(blockRaw, [stencil]) : blockRaw

  // ── THE WALL · Phase D · serialize the frozen artifact ─────────────
  // `_shapeArtifact` is the per-tile frozen shape sectionPass consumes — the
  // single source Section reads, no chain. JSON-safe (roundTipKeys Set→array).
  // Built ONLY when the bake asks (emitArtifact) so the live path pays nothing.
  let _shapeArtifact = opts.emitArtifact
    ? shapeTiles.map(st => ({ ...st, roundTipKeys: [...st.roundTipKeys] }))
    : undefined
  // ⭐⭐⭐ ① AS THE PRODUCER OF THE **LIVE** CURB — the one Survey actually draws.
  // ⛔⛔ THIS IS THE PIECE THAT WAS MISSING ALL DAY. Survey NEVER reads the frozen `shape.json`
  // (`sectionFrozen = !surveyActive`), so it live-builds from the chains — which means ①②③, the bake
  // flag and the whole producer swap were invisible in the one view the operator uses. Every "101/101
  // parallel" I reported measured a curb that had never been on his screen. Jacob: "You can not look
  // at this centerline and tell me the curbs are parallel offsets."
  // ⇒ When ① is the producer, `curb` and `block` ARE ②. Nothing downstream changes; the outputs are
  // the same arrays of rings, built from the contour instead of from the chains.
  // ⛔ Gated, and it REFUSES rather than falling back: asking for ① as the producer and silently
  // getting the chain curb is the plausible-looking success Layer 0 forbids.
  if (opts.protoProducer) {
    // ⭐⭐⭐ ① IS THE PRODUCER OF **EVERY LAYER SURVEY DRAWS**, not just the curb.
    // ⛔⛔ Swapping `curb` alone painted one ①-built line on top of a chain-built map, and the two
    // did not agree. MEASURED, vertices within 5 cm of the boundary arc: ① block faces 0 of 2999
    // — they run PAST the rim, as ruled — while the legacy D2 walk CLOSES ITS FACES AGAINST THE
    // DISC (352 of 1538 on the arc) and `filletRing` then ROUNDS the corner the circle made.
    // ⭐ That is the rim artifact the operator keeps pointing at — "why are the sidewalks trying to
    // bend and create corners at the edge of the stencil?" It is not built by ① and cannot be
    // patched out of ①: it comes from the tile world, so the cure is to stop consuming the tile
    // world. Nothing is built at the map edge; it is simply where the drawing stops.
    // ⭐⭐ THE CONSUMER ALREADY EXISTS AND IS ALREADY SHIPPED. `sectionOpen` consumes a tile that
    // CARRIES ITS BANDS as-is (`if (st.bands)`) and unions them into exactly these layers; ③
    // produces exactly that tile. ⇒ a change of CONSUMER, not of construction — no new producer,
    // no second painter, no per-layer reimplementation here.
    // ⛔ `highway` is deliberately NOT swapped. Grade-separated roads are flat strokes through
    // their own accumulator and were never blocks; ① carries them as INK, not as a curb, and ②
    // builds no highway curb at all. Swapping it would invent a production that never existed.
    // ⛔ REFUSES rather than falling back: asking for ① and silently getting the chain map is the
    // plausible-looking success Layer 0 forbids.
    if (!protoShapeTiles?.length) throw new Error('[tileGround] protoProducer asked for ① as the producer but ①②③ produced NO tiles. Refusing to hand back the chain map under a flag that says otherwise.')
    // ⭐⭐⭐ THE CORNER RADIUS IS FROZEN BY THE DATAWALL (Jacob, 2026-09-06) — and the truth the
    // handle rides has to be the arc that is DRAWN. The legacy `cornerFillets`/`cornerSet` are
    // built by the chain shape pass; under ① they describe corners that are not on screen.
    if (protoCornerSet.length) {
      for (const k of Object.keys(cornerFillets)) delete cornerFillets[k]
      cornerSet.length = 0
      for (const c of protoCornerSet) { cornerFillets[c.key] = c.fillet; cornerSet.push(c) }
      console.log(`[tileGround][①⇢LIVE] corner truth swapped to ②'s achieved arcs: ${protoCornerSet.length} corner(s); the handle rides the curb that is drawn.`)
    } else console.warn(`[tileGround][①⇢LIVE] ⛔ ② produced NO corner arcs — the corner handles would ride the LEGACY fillets, which are not on screen. Not swapping; the dial is untrustworthy in this pour.`)
    const S = sectionOpen(protoShapeTiles, curbWidth, stripMat, stencil, blockCustoms)
    asphalt = S.asphalt; curb = S.curb; sidewalk = S.sidewalk; block = S.block
    // the LU buckets are objects the caller reads by key — replace the CONTENTS, not the binding
    for (const kk of Object.keys(treelawnByLu)) delete treelawnByLu[kk]
    for (const kk of Object.keys(luByClass)) delete luByClass[kk]
    Object.assign(treelawnByLu, S.treelawnByLu)
    Object.assign(luByClass, S.luByClass)
    console.log(`[tileGround][①⇢LIVE] every layer Survey draws is now ①②③ through sectionOpen: ${protoShapeTiles.length} tile(s) — asphalt ${asphalt.length} · curb ${curb.length} · sidewalk ${sidewalk.length} · block ${block.length} ring(s) · LU classes ${Object.keys(luByClass).join(', ') || 'none'}. Highway stays a flat stroke.`)
    // ⛔⛔ THE MEDIAN CLASS CANNOT APPEAR, AND THAT MUST BE SAID OUT LOUD. ③ carries no median or
    // loop concept (`LOOP-STREETS §2/§4`); the legacy carve exists largely FOR those. So a town
    // whose chain path produced a `median` land use produces none here — LS: 20,362 m² → 0.
    // ⭐ A land-use key no entry consumes "drops silently from the slab — that is exactly how the
    // divided median vanished" (`bake-ground.js` PAINT_ORDER). It is not going to vanish silently
    // twice: this is a KNOWN GAP in ③, disclosed per pour, not a fallback and not a fix.
    if (!luByClass.median) console.warn(`[tileGround][①⇢LIVE] ⛔ NO 'median' land use in this pour — ③ carries no median or loop concept. If this town has divided roads, their medians are classed as something else. KNOWN GAP, not a silent success.`)
  }
  // ⭐⭐⭐ `protoArtifact` SWAPS THE FROZEN ARTIFACT ONLY — separate from `protoProducer`, which
  // swaps what SURVEY DRAWS. They were one flag and that conflation cost the day's last hour:
  // enabling ① for Section also replaced Survey's `curb`, which Survey FILLS, and one 1.77 km²
  // ring (the face the grade-separated chains enclose) turned the authoring surface solid.
  // ⛔ AND SECTION'S ARTIFACT COMES FROM HERE, NOT FROM `bake-ground`: the client autosaves
  // `_shapeArtifact` to `POST /<scene>/shape` on Survey-exit (`serve.js:1113`), which lands
  // exactly where Section fetches it — so every CLI `--proto` bake was overwritten by the
  // browser's own legacy artifact within seconds of Jacob leaving Survey. Section could never
  // show ① no matter what the bake produced.
  if (opts.protoArtifact) {
    if (!protoShapeTiles?.length) throw new Error('[tileGround] protoArtifact asked for ①②③ as the frozen shape but it produced NO tiles. Refusing to freeze the chain artifact under a flag that says otherwise.')
    _shapeArtifact = protoShapeTiles
    console.log(`[tileGround][①⇢FREEZE] the artifact Section opens is now ①②③: ${protoShapeTiles.length} tile(s)`)
  }
  return { asphalt, highway, curb, sidewalk, grout, proto, protoLabels, protoRefused, protoCurb, protoCurbGs, protoBands, protoStackCollapse, protoSource, protoOwners, protoAuthoring, protoShapeTiles, treelawnByLu, luByClass, block, cornerFillets, cornerSet, _tiles: tiles, _perRunMeta: perTileMeta, _jPolys: jPolys, _jCornerCuts: jCornerCuts, _shapeArtifact, _thruWins: opts.emitArtifact ? thruWins : undefined,
    // [A07] The two disclosures, kept apart all the way out. Consumers: the bake
    // prints both once per pour; the Survey/Section tool surfaces the census.
    _curbProducers: curbProducerCensus.summary(),
    _curbProducerFailures: { count: curbProducerGate.count, report: curbProducerGate.report.bind(curbProducerGate) } }
}
