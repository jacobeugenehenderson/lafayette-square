// tileGround — the ground construction. ONE module shared by the live Designer (BlockGeometryV2Debug) and the bake
// (bake-ground), so live == bake by construction (WYSIWYG).
//
// The construction (`ORIENTATION §3`, `RIBBONS §1`):
//   ① the PROTOPOLYGON — every at-grade centreline stroked to ε and united into one closed compound path. Its holes are
//      the blocks, and every edge carries which street and which side made it (`mintProtopolygon`).
//   ② the CURB — each block offset once by its edges' authored half-widths (`offsetRingByRects`), its corners eased to
//      the authored radius.
//   ③ the BANDS — curb, treelawn, sidewalk and land use, struck inward from ② and cut into owned pieces.
//   H — the grade-separated highways, swept from their own sections; never blocks.
// `sectionOpen` turns ①②③'s tiles into the per-material layers. Survey draws them live; Section and the bake read the
// same tiles frozen (`protoShapeTiles` → shape.json).
//
// Returns raw Clipper ring lists per material; bake-ground packs them.

import clipperLib from 'clipper-lib'
import { smoothChain, jKey, junctionKeysOf } from './smoothCenterline.js'
import { blockKeyFromRing } from './buildBlockGeometryV2.js'
import { resolveChainSegmentation } from './chainSegmentation.js'
import { readCapCustom } from './feCustomKey.js'
import { CLIP_SCALE as SCALE, LATTICE_M } from './lattice.js'
import { nodeCrossings, NODE_BOUND } from './latticeNode.js'
import { absorbInk } from './absorbInk.js'
import { coastSignBreaks } from './coastSign.js'
import { LOCAL_SECTION } from '../cartograph/streetClass.js'

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
//   • degenerate cases come back exactly as Clipper returns them.
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
// so it can be minted ONCE AT PREBAKE and frozen, which is `ORIENTATION §3 (the Wall)`'s
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
// ⭐ H-3 step 5 — HOW A HIGHWAY END MEETS THE TOWN, decided by IDENTITY of the shared vertex and one-way DIRECTION,
// never by angle, proximity or `ref`. `at` = the town chains with a vertex at the end: [{ st, at: 'start'|'end'|'mid' }].
//   'none'      no town chain there (a gore, a joint, off the rim);
//   'butt'      a town chain passes THROUGH the node (a T — a ramp terminal): H arrives at full width;
//   'handoff'   exactly one town chain CONTINUES it (at a highway END, the one-way street that STARTS there; a two-way
//               street only as the node's sole town chain): H tapers to that street's width (`sweepHighway`);
//   'ambiguous' no single continuation: H arrives at full width, and the end is printed by name.
// ONE rule for the sweep (`handoffOf`) and the mint (`rampTerminalFlares`), so the two cannot disagree on which ends butt.
export function highwayEndContact(at, which) {
  if (!at?.length) return { kind: 'none' }
  if (at.some(x => x.at === 'mid')) return { kind: 'butt' }
  const want = which === 'end' ? 'start' : 'end'
  const cand = at.filter(x => x.st.oneway ? x.at === want : at.length === 1)
  if (cand.length !== 1) return { kind: 'ambiguous' }
  return { kind: 'handoff', st: cand[0].st, at: cand[0].at, want }
}

// ⭐⭐ THE RAMP-TERMINAL FLARE (`r-ramp-terminal-flares`, Jacob 2026-09-24: "I think flare because that's real?").
// Where a highway end arrives at FULL width (a butt, or an ambiguous end) and its butt corner lies outside the town
// street's asphalt, the TOWN STREET flares to receive it — H is never narrowed to fit. Frozen per corner AT THE MINT
// (derive.js → `protopolygon.flares`); ② draws it and check 5 reads it.
//   · received: the corner lies over a town leg at the node (0 < along-leg coordinate ≤ the leg's length) within that
//     leg's base half-width ON ITS SIDE — then there is no flare. Otherwise the leg: of the legs it projects onto, the
//     one needing the SMALLEST widening — the least that receives the butt (`d-ramp-terminal-flare-overhang`), no angle cut-off;
//   · the side + span: the leg's side is measure-right = (−dz, dx) of the CHAIN's point order; `segOrd` is the mint's
//     own count (`segOrdAt`), so the flare keys to the same authoring slot as the curb it moves;
//   · `lateral` / `along`: the corner's distance from the leg's centreline and its station along the leg from the node — geometry, independent of any authoring (the draw holds full width out to `along`);
//   · ⛔ the overhang is NOT frozen as the answer: `o = lateral − the street's RESOLVED half-width`, and the resolution
//     needs the look's authoring (blockCustoms), which ① never reads. `baseO` (against the base width) is disclosure only;
//   · the taper: `rate` × o along the leg (`f-caltrans-terminal-widening-taper`, 10:1).
// ⛔ A corner that no town leg can receive is RETURNED as `unreceived`, never dropped. An end outside `disc` (the
// stencil ① is clipped to) is counted, not judged.
export const FLARE_RATE = 10                     // f-caltrans-terminal-widening-taper: 10:1 longitudinal to lateral
export function rampTerminalFlares(streets, gradeSep, hwyClasses, disc = null) {
  const XY = (p) => Array.isArray(p) ? p : [p.x, p.z]
  const hk = (p) => { const q = XY(p); return `${(+q[0]).toFixed(3)},${(+q[1]).toFixed(3)}` }
  const seg = resolveChainSegmentation(streets)
  const townAt = new Map()
  streets.forEach((st, ci) => (st.points || []).forEach((p, i, P) => { const k = hk(p); if (!townAt.has(k)) townAt.set(k, [])
    townAt.get(k).push({ st, ci, i, at: i === 0 ? 'start' : i === P.length - 1 ? 'end' : 'mid' }) }))
  const ixOf = (st) => { const n = st.points.length; return [...(seg.get(st) || [])].filter(i => i > 0 && i < n - 1).sort((a, b) => a - b) }
  const segOrdAt = (st, i) => { let so = 0; for (const k of ixOf(st)) if (k <= i) so++; return so }
  const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  const flares = [], unreceived = []
  let offRim = 0
  for (const s of gradeSep) {
    if (!hwyClasses.has(s.highway)) continue
    const L = s.measure?.left?.section, R = s.measure?.right?.section
    if (!L?.spans?.length || !R?.spans?.length) continue            // no section: the sweep names it; nothing to receive
    const P = s.points.map(XY), n = P.length
    for (const which of ['start', 'end']) {
      const node = which === 'end' ? P[n - 1] : P[0]
      if (disc?.length >= 3 && !pip(node[0], node[1], disc)) { offRim++; continue }   // beyond the circle: ① is clipped there
      const at = townAt.get(hk(node)) || []
      const contact = highwayEndContact(at, which)
      if (contact.kind === 'none' || contact.kind === 'handoff') continue
      const [a, b] = which === 'end' ? [P[n - 2], P[n - 1]] : [P[1], P[0]]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!(len > 0)) continue
      const nx = -(b[1] - a[1]) / len, nz = (b[0] - a[0]) / len
      const sg = which === 'end' ? 1 : -1                            // right of travel: +n at an END, −n at a START
      const hwEnd = (sec) => (which === 'end' ? sec.spans[sec.spans.length - 1] : sec.spans[0]).hw
      const mainline = !/_link$/.test(s.highway)
      for (const [corner, w, sgn] of [['right', hwEnd(R), 1], ['left', hwEnd(L), -1]]) {
        const c = [node[0] + sgn * sg * nx * w, node[1] + sgn * sg * nz * w]
        let best = null, received = false
        for (const x of at) {
          const Q = x.st.points.map(XY)
          for (const k of [x.i - 1, x.i + 1]) {
            if (k < 0 || k >= Q.length) continue
            const vx = Q[k][0] - node[0], vz = Q[k][1] - node[1], vl = Math.hypot(vx, vz); if (!(vl > 0)) continue
            const ux = vx / vl, uz = vz / vl, rx = c[0] - node[0], rz = c[1] - node[1]
            const along = rx * ux + rz * uz; if (!(along > 0)) continue
            const lateral = Math.abs(rx * uz - rz * ux)
            if (along > vl) continue                                   // past this leg's far vertex: not this leg's asphalt
            // the chain's own direction on this leg, and measure-right of it
            const fwd = k > x.i, dx = fwd ? ux : -ux, dz = fwd ? uz : -uz
            const side = (rx * -dz + rz * dx) > 0 ? 'right' : 'left'
            const baseHW = x.st.measure?.[side]?.pavementHW
            if (!Number.isFinite(baseHW)) continue
            const segOrd = segOrdAt(x.st, fwd ? x.i : k)
            const cand = { street: x.st.skelId ?? x.st.name, side, segOrd, node: [node[0], node[1]], toward: [Q[k][0], Q[k][1]],
              hwy: s.skelId ?? s.name, end: which, corner, hH: w, lateral, along, baseHW, baseO: lateral - baseHW, rate: FLARE_RATE,
              sources: ['f-caltrans-terminal-widening-taper', 'd-ramp-terminal-flare-overhang',
                mainline ? '[U] q-ramp-terminal-flare (a highway mainline continuing as a narrower street — 206.2(3) covers lane widening, not a lane-count change)'
                         : '[U] q-ramp-terminal-flare (206.2(3) scopes 10:1 to terminals with large truck turning volumes; the kit carries no truck volume)'] }
            if (cand.baseO <= 0) received = true                       // already inside this leg's asphalt: no flare
            if (!best || cand.baseO < best.baseO) best = cand
          }
        }
        if (received) continue
        if (!best) { unreceived.push({ hwy: s.skelId ?? s.name, end: which, corner, node: [node[0], node[1]] }); continue }
        flares.push(best)
      }
    }
  }
  return { flares, unreceived, offRim }
}

// ⭐⭐ H-3 STEP 4 — THE REGION CLASSIFIER: every ① block is `verge`, `jr` (junction residual) or `block`.
// Runs AT THE MINT (derive.js), not in ②: it needs the skeleton's grade facts and the RAW building footprints,
// which no consumer holds, and freezing the class per block makes live and bake identical by construction.
// ⛔ It reads NO authoring — only the frozen identity (owners/labels) and the raw intake.
//   VERGE (`r-highway-verge`): every street-owned run is a highway, or an OVERPASS SPAN — a non-highway run
//     on an off-grade chain (bridge/tunnel/layer≠0) sitting between two highway runs in the ring's cyclic
//     order. The rim (`__boundary__`) and water (`__water__`) are neutral.
//   JR (ruling g): not verge, a highway run on the ring, an at-grade ramp end on the ring (`gradeEnd`), and
//     ZERO raw footprint centroids inside. ⛔ No building layer ⇒ the JR test is REFUSED, by name — the
//     candidate stays a block; never "no buildings ⇒ everything is JR".
//   BLOCK: everything else.
// A GORE SLIVER is reported, not built differently: a verge bounded by exactly two highway chains.
export function classifyHighwayBlocks({ blocks, blockLabels, blockHoles, blockHoleLabels, owners }, { hwy, offGrade, centroids }) {
  const neutral = (sk) => typeof sk !== 'string' || sk.startsWith('__')
  const runsOf = (labs) => {
    const sks = (labs || []).map(l => owners[l]?.skelId)
    const out = []
    for (const sk of sks) if (!out.length || out[out.length - 1] !== sk) out.push(sk)
    if (out.length > 1 && out[0] === out[out.length - 1]) out.pop()
    return out.filter(sk => !neutral(sk))
  }
  const pip = (x, z, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c } return c }
  const cls = [], jr = [], jrRejected = [], jrRefused = [], verges = [], gores = []
  for (let k = 0; k < (blocks || []).length; k++) {
    const rings = [blockLabels?.[k] || [], ...((blockHoleLabels?.[k]) || [])]
    const ringRuns = rings.map(runsOf)
    const all = ringRuns.flat()
    const isH = (sk) => hwy.has(sk)
    const anyH = all.some(isH)
    const span = (runs, i) => { const n = runs.length; return !isH(runs[i]) && offGrade.has(runs[i]) && isH(runs[(i + n - 1) % n]) && isH(runs[(i + 1) % n]) }
    const verge = anyH && ringRuns.every(runs => runs.every((sk, i) => isH(sk) || span(runs, i)))
    const hasGradeEnd = rings.some(L => L.some(l => owners[l]?.gradeEnd))
    const streets = [...new Set(all.filter(sk => !isH(sk)))]
    let c = 'block'
    if (verge) {
      c = 'verge'; verges.push(k)
      const hs = [...new Set(all.filter(isH))]
      if (hs.length === 2 && all.every(isH)) gores.push({ k, chains: hs })
    } else if (anyH && hasGradeEnd) {
      if (!centroids) jrRefused.push({ k, streets })
      else {
        const outer = blocks[k], holes = blockHoles?.[k] || []
        let xs = Infinity, xe = -Infinity, zs = Infinity, ze = -Infinity
        for (const [x, z] of outer) { if (x < xs) xs = x; if (x > xe) xe = x; if (z < zs) zs = z; if (z > ze) ze = z }
        let inside = 0
        for (const [x, z] of centroids) if (x >= xs && x <= xe && z >= zs && z <= ze && pip(x, z, outer) && !holes.some(h => pip(x, z, h))) inside++
        if (inside === 0) { c = 'jr'; jr.push({ k, streets }) } else jrRejected.push({ k, streets, inside })
      }
    }
    cls.push(c)
  }
  return { cls, verges, jr, jrRejected, jrRefused, gores }
}

// ⭐ ε, THE INK'S HALF-WIDTH: ONE KIT CONSTANT. Its value carries no information, only its non-zero-ness (the topology is
// byte-stable across ε = 0.002 … 0.5 m); it must clear the 1 mm integer floor of the stage that holds it. The mint strokes
// at it and RECORDS it (`MP.eps` → `protopolygon.eps`); ② reads it off the frozen artifact, never from here.
export const INK_EPS = 0.005
/**
 * ⭐ ONE VERTEX'S OUTLINE at ink ε: where each pair of adjacent legs' ε-offsets meet (W, one point per gap, legs sorted by
 * heading), or `bad` — 'degenerate' (a leg of no length) or 'acute' (the inner offsets meet past a leg's own end, or two
 * legs leave in one direction). The mint's own predicate, so bake-coast asks the SAME question of every coast vertex
 * before ① strokes it (Boz's ruling, 2026-10-26: a hairpin can be simple and still acute). Sorts and annotates `legs`.
 * @param legs [{ to: [x, z] }, …] — the far end of each leg leaving o
 */
export function outlineCorner(o, legs, eps = INK_EPS) {
  const rot = (u) => [-u[1], u[0]]                           // the ε side `nrm` names 'right', counter-clockwise of travel
  let bad = null
  for (const g of legs) { const dx = g.to[0] - o[0], dz = g.to[1] - o[1], len = Math.hypot(dx, dz)
    if (!(len > 0)) { bad = 'degenerate'; break }
    g.u = [dx / len, dz / len]; g.len = len; g.ang = Math.atan2(dz, dx) }
  const W = []
  if (!bad) {
    legs.sort((a, b) => a.ang - b.ang)
    for (let j = 0; j < legs.length && !bad; j++) {
      const A = legs[j], B = legs[(j + 1) % legs.length], rA = rot(A.u), rB = rot(B.u)
      const cross = A.u[0] * B.u[1] - A.u[1] * B.u[0], dot = A.u[0] * B.u[0] + A.u[1] * B.u[1]
      if (cross > 0) {
        // A's ccw side o + ε·rot(uA) + s·uA meets B's cw side o − ε·rot(uB) + t·uB
        const c0 = -eps * (rA[0] + rB[0]), c1 = -eps * (rA[1] + rB[1]), det = -cross
        const s = (-c0 * B.u[1] + B.u[0] * c1) / det, t = (A.u[0] * c1 - A.u[1] * c0) / det
        if (!(s >= 0 && t >= 0 && s <= A.len && t <= B.len)) { bad = 'acute'; break }
        W.push([o[0] + eps * rA[0] + s * A.u[0], o[1] + eps * rA[1] + s * A.u[1]])
      } else if (cross < 0 || dot < 0) {
        const th = ((B.ang - A.ang) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI), w = A.ang + th / 2
        W.push([o[0] + eps * Math.cos(w), o[1] + eps * Math.sin(w)])
      } else bad = 'acute'                                   // two legs leave in one direction
    }
  }
  return { bad, W }
}
// the split itself (mintProtopolygon's caller of it states the rule): → { chains: [{ st, ci }], coastChains, dropped }
// ⭐ EVERY WET PIECE IT DROPS IS RECORDED BY IDENTITY (`spans`, frozen as protopolygon.offGradeSpans; Jacob, 2026-10-27: "b for
// now, deck later"): { street, segOrd, kind: 'tagged' | 'byCoast', hwy, wetM, points, banks } — `points` the piece's centreline
// from bank crossing to bank crossing (both shared with the coast arcs), `banks` which of its ends are coast crossings, `hwy`
// whether H sweeps the chain (`isH`). The paint lays each
// non-H span back over the water (`bridgeOverlay`), so a bridge is painted across it while ①'s water face stays whole.
function splitOverWater(list, waterRings, coastChains, segOrdOf = () => 0, isH = () => false) {
  const spans = [], endsInWater = []
  if (!Array.isArray(waterRings) || !waterRings.length || !coastChains.length) return { chains: list, coastChains, waterRings, dropped: 0, spans, endsInWater }
  const rlL = (v) => Math.round(v * SCALE) / SCALE, K = (p) => Math.round(p[0] * SCALE) + ',' + Math.round(p[1] * SCALE)
  const wn = (p, r) => { let w = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if (zj <= p[1]) { if (zi > p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) > 0) w++ } else if (zi <= p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) < 0) w-- } return w }
  const wet = (p) => waterRings.reduce((t, r) => t + wn(p, r), 0) !== 0
  const L = list.filter(x => x.st?.points?.length >= 2)
  const inputs = [...L.map(x => ({ tag: 'street', p: x.st.points.map(q => [rlL(q[0]), rlL(q[1])]), open: true })),
                  ...coastChains.map(c => ({ tag: 'arc', p: c.st.points.map(q => [rlL(q[0]), rlL(q[1])]), open: true }))]
  const nS = L.length
  const out = nodeCrossings(inputs, { pairs: (a, b) => (a < nS) !== (b < nS), who: '① bridge over water' })
  // ⭐ A CROSSING IS A LATTICE POINT ON BOTH A STREET AND AN ARC, whoever's vertex it was (Boz, 2026-10-27: "a street that stays in
  // the water silently is a Layer 0 defect"). Read off the minted points alone, a coast-arc vertex lying exactly on a street (its
  // `src` the arc's) or a street vertex exactly on the coast (its `src` the street's) was no crossing, and the street stayed whole
  // in the water. A point where a street only TOUCHES the coast splits nothing that matters: same-fate pieces are rejoined below.
  const onStreet = new Set(); for (let n = 0; n < nS; n++) for (const v of out[n]) onStreet.add(v.k[0] + ',' + v.k[1])
  const crossKeys = new Set(); for (let n = nS; n < out.length; n++) for (const v of out[n]) { const k = v.k[0] + ',' + v.k[1]; if (onStreet.has(k)) crossKeys.add(k) }
  let dropped = 0
  const pieces = new Map()   // index in L → [{ st, ci }] replacing it
  L.forEach((x, n) => { const st = x.st, P = st.points, o = out[n]
    // the chain as original vertices plus its shoreline crossings (a hot pixel the noding routed through, not a crossing, is not a
    // vertex); an original vertex lying ON the coast is a crossing too, and keeps its index
    const V = []; for (const v of o) { const c = crossKeys.has(v.k[0] + ',' + v.k[1])
      if (v.src != null) V.push({ p: P[v.src], src: v.src, edge: v.src, ...(c && { cross: true }) })
      else if (c) V.push({ p: [v.k[0] / SCALE, v.k[1] / SCALE], src: null, edge: v.edge, cross: true }) }
    // ⛔ A CHAIN WHOLLY IN THE WATER crosses nothing, and was kept whole in the water, silently (found 2026-10-27): it is one wet
    // piece, judged like any other
    if (!V.some(v => v.cross) && !(V.length >= 2 && wet([(V[0].p[0] + V[1].p[0]) / 2, (V[0].p[1] + V[1].p[1]) / 2]))) return
    const cut = [[]]; V.forEach((v, k) => { cut[cut.length - 1].push(v); if (v.cross && k > 0 && k < V.length - 1) cut.push([v]) })
    // pieces of one fate either side of a mere touch are one piece: split only where the street goes into or out of the water
    const wetPart = (part) => part.length >= 2 && wet([(part[0].p[0] + part[1].p[0]) / 2, (part[0].p[1] + part[1].p[1]) / 2])
    const parts = []; for (const part of cut) { if (part.length < 2) continue
      const last = parts[parts.length - 1]; if (last && wetPart(last) === wetPart(part)) last.push(...part.slice(1)); else parts.push(part) }
    const keep = []
    for (let pi = 0; pi < parts.length; pi++) { const part = parts[pi]; if (part.length < 2) continue
      const a = part[0].p, b = part[1].p
      if (!wet([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) { keep.push(part); continue }
      const edges = new Set(); for (let k = 0; k < part.length - 1; k++) edges.add(part[k].edge)
      const runs = (st.gradeRuns || []).filter(r => [...edges].some(e => e >= r.from && e < r.to))
      const len = part.reduce((t, v, k) => k ? t + Math.hypot(v.p[0] - part[k - 1].p[0], v.p[1] - part[k - 1].p[1]) : 0, 0)
      const who = `${st.skelId ?? st.name} segment(s) ${[...edges].join(',')} (${len.toFixed(1)} m in the water)`
      if (!st.gradeRuns) throw new Error(`[①] ⛔ ${who}: a chain with no grade runs lies in ①'s water — its grade cannot be read. Refusing.`)
      if (runs.some(r => (r.offGrade || r.mixed) && !r.exact)) throw new Error(`[①] ⛔ ${who}: off grade only by a run attributed ${runs.filter(r => !r.exact).map(r => r.by).join('/')} — only an exactly attributed run decides a span is not ground. Refusing.`)
      // ⭐ TAGGED off grade: the piece's arc-length span lies within the exact off-grade runs and, on a run whose ways DISAGREE on
      // grade, within the off-grade way's own extent along it (Zob, 2026-10-27: a segment the skeleton simplified across a joint,
      // cleveland-road-east-2). ⛔ A wet piece on such a run reaching past that extent refuses by name
      const S = [0]; for (let k = 1; k < P.length; k++) S.push(S[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]))
      const sOf = (v) => v.src != null ? S[v.src] : S[v.edge] + Math.hypot(v.p[0] - P[v.edge][0], v.p[1] - P[v.edge][1])
      const sA = sOf(part[0]), sB = sOf(part[part.length - 1]), lo = Math.min(sA, sB), hi = Math.max(sA, sB)
      const ok = [...runs.filter(r => r.offGrade).map(r => [S[r.from], S[r.to]]), ...runs.filter(r => r.mixed).flatMap(r => r.offExtents || [])].sort((a, b) => a[0] - b[0])
      let reach = lo; for (const [a, b] of ok) if (a <= reach + 1e-9 && b > reach) reach = b
      // ⛔ ONE MEASURE PER SPAN: a span whose edges reach two segOrds would paint its whole length at the first one's width (Zob)
      const e0 = Math.min(...edges), ords = x.ci >= 0 ? [...new Set([...edges].map(e => segOrdOf(x.ci, e)))] : [0]
      if (ords.length > 1) throw new Error(`[①] ⛔ ${who}: the span over the water crosses a segOrd boundary (${ords.join(' → ')}), so it has no one measure to be painted at. Refusing.`)
      // `banks`: which of its two ends is a crossing of the coast (a chain's own end in the water is not)
      const span = (kind) => ({ street: st.skelId ?? st.name, segOrd: ords[0], kind, hwy: !!isH(x), wetM: +len.toFixed(2), points: part.map(v => [v.p[0], v.p[1]]), banks: [!!part[0].cross, !!part[part.length - 1].cross] })
      if (reach >= hi - 1e-9) { spans.push(span('tagged')); dropped++; continue }
      if (runs.some(r => r.mixed)) throw new Error(`[①] ⛔ ${who}: a wet piece on a segment whose ways disagree on grade reaches ${(hi - reach).toFixed(2)} m past the off-grade way's own extent — its grade there cannot be read. Refusing.`)
      // ⭐ A WAY'S OWN TAG DECIDES BEFORE THE COAST (Jacob, 2026-10-27, `r-a-way-tag-decides-before-byCoast`): each way's verdict in
      // the over-water vocabulary (src/cartograph/streetClass.js#structureOverWater, carried per run by mintInputs#gradeRunsOf). A
      // DECK way is taken out of the water with its deck (structures.mjs#streetDecks), so one whose piece is still wet here was
      // not taken out: refused by name, never let fall to a bridge. A GROUND way (an embankment) is held as LAND by the coast bake
      // (r-the-coast-bake-holds-an-embankment-as-land: structures.mjs#embankmentFootprints), so one whose piece still lies in ①'s
      // water is a hold that missed it: refused by name. A structural value outside the
      // vocabulary (a ford, for now) refuses by name. Only a way with no structural tag goes on to the coast's verdict below.
      if (runs.some(r => !Array.isArray(r.structure))) throw new Error(`[①] ⛔ ${who}: its grade runs carry no structure verdicts (mintInputs#gradeRunsOf) — what its ways ARE over the water cannot be read. Refusing.`)
      // ⛔ judged within each way's OWN extent (Zob): a run whose ways disagree carries each structural way's extent
      // (`structureExtents`), and a piece is that way's only if the extent holds it; one straddling a boundary refuses by name
      { const ws = runs.flatMap(r => {
          if (!r.structureMixed) return r.structure.length ? [{ v: r.structure[0], way: r.ways.join('/') }] : []
          return (r.structureExtents || []).filter(x => x.extent && x.extent[1] > lo + 1e-9 && x.extent[0] < hi - 1e-9).map(x => {
            if (!(x.extent[0] <= lo + 1e-9 && hi <= x.extent[1] + 1e-9)) throw new Error(`[①] ⛔ ${who}: its piece in ①'s water straddles the end of way ${x.way} (${x.v?.unknown ?? x.v}) on a run whose ways disagree — which way the piece is cannot be read. Refusing.`)
            return { v: x.v, way: x.way } }) })
        const un = ws.find(x => x.v?.unknown)
        if (un) throw new Error(`[①] ⛔ ${who}: way ${un.way} over the water is tagged ${un.v.unknown}, outside the over-water vocabulary (offGrade · deck · ground · none; streetClass.js#structureOverWater). Refusing.`)
        const dk = ws.find(x => x.v === 'deck' || x.v === 'ground')
        if (dk?.v === 'deck') throw new Error(`[①] ⛔ ${who}: way ${dk.way} is a DECK by its own tag, yet its piece lies in ①'s water: its deck's take-out (structures.mjs#streetDecks) did not remove it. Refusing.`)
        if (dk) throw new Error(`[①] ⛔ ${who}: way ${dk.way} is GROUND (an embankment) by its own tag, yet its piece lies in ①'s water: the coast bake's hold missed it (bake-coast.mjs holds an embankment's footprint as land, structures.mjs#embankmentFootprints; ▶ re-bake the coast). Refusing.`) }
      // ⭐ OFF GRADE BY THE COAST (Jacob, 2026-10-27: "a; we don't have any mechanism for this in the authoring tools"): a street
      // over ①'s water with no off-grade tag is a bridge all the same — the coast is the high-water mark, and a causeway on fill
      // reads as land in the lidar, so it never reaches here. It leaves the ink like a tagged span, and it is RECORDED, never silent
      // ⛔ …but only a street that CROSSES the water between banks (Jacob's (a)): one with no bank at either end and no tag is no
      // bridge, it is bad data (a ferry line, a mis-drawn way), and a floating strip would be a plausible-looking success (Boz, Zob)
      if (!part[0].cross && !part[part.length - 1].cross) throw new Error(`[①] ⛔ ${who}: a street lying wholly in the water, with no bank at either end and no bridge, tunnel or layer tag — not a bridge but a street or coast datum in question. Refusing.`)
      // ⭐ ONE BANK, NO TAG: a street that crosses the coast and ENDS in the water (a slipway, a boat ramp) STOPS AT THE COAST (Boz's
      // ruling, 2026-10-27): the coast is the high-water mark, nothing is painted past it. Real, so never refused — counted and
      // named (`endsInWater`, frozen; printed below). A ramp drawn running on under the water is the deck's, later.
      if (!part[0].cross || !part[part.length - 1].cross) { const m = part[Math.floor(part.length / 2)].p
        endsInWater.push({ street: st.skelId ?? st.name, segOrd: ords[0], wetM: +len.toFixed(2), at: [+m[0].toFixed(3), +m[1].toFixed(3)] }); dropped++; continue }
      spans.push(span('byCoast'))
      dropped++ }
    if (keep.length === parts.length) return   // nothing left the ink: a street that only touches the coast is kept as it was
    pieces.set(n, keep.map(part => ({ ci: x.ci, st: { ...st, points: part.map(v => v.p), hard: part.map(v => v.src != null && st.hard ? !!st.hard[v.src] : v.src != null),
      caps: { start: part[0].src === 0 ? st.caps?.start : undefined, end: part[part.length - 1].src === P.length - 1 ? st.caps?.end : undefined },
      _orig: part.map(v => v.src), _origSeg: part.map(v => v.edge), _waterEnd: { start: !!part[0].cross, end: !!part[part.length - 1].cross } } }))) })
  if (!dropped) return { chains: list, coastChains, waterRings, dropped: 0, spans, endsInWater }
  // the arcs take the crossings, so a street's end and the coast share the vertex
  const minted = new Map()
  const arcs = coastChains.map((c, m) => { const o = out[nS + m], P = c.st.points
    const pts = []; for (const v of o) { if (v.src != null) pts.push(P[v.src]); else if (crossKeys.has(v.k[0] + ',' + v.k[1])) { const q = [v.k[0] / SCALE, v.k[1] / SCALE]; pts.push(q); minted.set(v.k[0] + ',' + v.k[1], q) } }
    return { ...c, st: { ...c.st, points: pts, hard: pts.map(() => false) } } })
  // ⭐ …AND SO DO THE WATER RINGS: A POINT MINTED ON ONE COPY OF THE SHORELINE GOES INTO EVERY COPY (Boz's ruling, 2026-10-27; ②'s
  // shareIntoFull lesson, in ①). The arc (the coast centreline, stroked) and the water ring (the boolean's water) are one line; a
  // crossing written into the arc alone sat up to a lattice unit off the ring's straight edge, and the two enclosed an ink-less
  // cell that joined no face (Huron, cleveland-road-east-0 at (815.256, 576.511): 0.593 mm off; absorbInk refused it). Each such
  // point goes into the water-ring edge that holds it (insertOnEdges: the boolean's own two-unit containment); one no water edge
  // holds refuses by name. ▶ checks/claims-the-coast-is-one-line-on-the-lattice.mjs
  const ringKeys = new Set(waterRings.flatMap(r => r.map(p => K(p))))
  let rest = [...minted.entries()].filter(([k]) => !ringKeys.has(k)).map(([, q]) => q)
  // ⭐ a ring's per-edge `deck` tag (structures.mjs#waterWithoutDecks) rides the split: each half of an edge keeps the edge's tag
  const water = waterRings.map(r => { if (!rest.length) return r; const x = insertOnEdges(r, Array.isArray(r.deck) ? r.deck : null, rest, () => true); rest = x.missed
    if (Array.isArray(r.deck)) x.ring.deck = x.owners; return x.ring })
  if (rest.length) throw new Error(`[①] ⛔ ${rest.length} street × coast crossing(s) written into the coast arc lie on no water-ring edge, e.g. (${rest[0].map(c => c.toFixed(3)).join(', ')}) — the arc and the water would be two lines. Refusing.`)
  const chains = []; let li = 0
  for (const x of list) { if (!(x.st?.points?.length >= 2)) { chains.push(x); continue } const n = li++; if (pieces.has(n)) chains.push(...pieces.get(n)); else chains.push(x) }
  const byCoast = spans.filter(b => b.kind === 'byCoast'), mid = (b) => b.points[Math.floor(b.points.length / 2)].map(c => c.toFixed(3)).join(', ')
  console.log(`    [①] ${dropped} off-grade span(s) over the water left out of the ink (bridges and tunnels are not ground; recorded, protopolygon.offGradeSpans); their banks end on the coast${byCoast.length ? ` · ⚠️ ${byCoast.length} of them off grade BY THE COAST (no bridge, tunnel or layer tag): ${byCoast.map(b => `${b.street}|${b.segOrd} ${b.wetM} m at (${mid(b)})`).join(' · ')}` : ''}`)
  if (endsInWater.length) console.log(`    [①] ${endsInWater.length} street(s) crossing the coast and ENDING in the water (a slipway, a boat ramp; no tag) stop at the coast — nothing painted past it (protopolygon.endsInWater): ${endsInWater.map(b => `${b.street}|${b.segOrd} ${b.wetM} m at (${b.at.join(', ')})`).join(' · ')}`)
  return { chains, coastChains: arcs, waterRings: water, dropped, spans, endsInWater }
}
// ⭐ THE AUTHORING KEY, ONE HOME: ① stamps `segOrd` with it, and the chain join (cartograph/chainJoins.mjs) asks it whether a new
// crossing would re-key an authored slot — so the two cannot count differently. → (ci, i) ↦ the count of chain ci's interior
// intersection vertices at or before point i (`resolveChainSegmentation`: a coordinate shared by ≥ 2 chains).
export function mintSegOrdAt(streets) {
  const seg = resolveChainSegmentation(streets)
  const ixIdxs = streets.map(st => {
    const n = st?.points?.length || 0
    return [...(seg.get(st) || [])].filter(i => i > 0 && i < n - 1).sort((a, b) => a - b)
  })
  return (ci, i) => { let so = 0; for (const k of (ixIdxs[ci] || [])) if (k <= i) so++; return so }
}
export function mintProtopolygon({ streets, gradeSep = [], eps = INK_EPS, boundary = null, coast = [], coastArcs = [], bb = null, onAbsorbRefusal = null }) {
  const owners = [], rings = [], labels = []
  // ⭐ segOrd is TOPOLOGY — the count of intersection vertices at or before this
  // one — so it is computed unconditionally here. ⚠️ The live path used to gate
  // the segmentation on `blockCustoms` being present (it only needed the map to
  // look an override up), which made an UNAUTHORED scene stamp segOrd 0
  // everywhere. Harmless while the value was only a lookup key into an absent
  // table; ⛔ NOT harmless in a frozen fact, which must carry the real ordinal
  // whether or not anyone has authored against it yet.
  const segOrdAt = mintSegOrdAt(streets)
  // ⛔⛔ GRADE-SEPARATED ROADS BELONG IN ① (Jacob, 2026-09-05: "the highways etc.
  // are gone from the protopoly rendering; they have to be there"). Excluding
  // them CONFLATES two rules: the canon pulls them out of the BLOCK GRID — they
  // do not bound a city block — which says nothing about whether they are in the
  // DRAWING. ① is the ink of the whole network; drop the highway from it and the
  // highway does not exist. ⭐ They carry `gradeSeparated` on the stamp so
  // downstream still tells a highway from a street — by IDENTITY, not by absence.
  // ⭐⭐⭐ THE SHORELINE IS A CHAIN (Jacob, 2026-09-20): "stroke the coast as a two-sided chain."
  // It joins `chains` so it goes through the IDENTICAL expansion below — right boundary forward,
  // left boundary back, one stamp per vertex — rather than a second implementation of stroking.
  // ⇒ The land closes against ①'s OWN edge, ε off the water, carrying `side` and `srcIdx`; that
  // articulated edge is what a slipway T's into. As an area clip the coast had ONE owner for all
  // 1,177 of its edges and no landward side at all, so nothing could meet it.
  // ⛔ NOT A STREET, and the stamp says so rather than a downstream `if`: `hard` is FALSE at every
  // vertex, so ① mints no corner on the shore (`RIBBONS §1`: no coupler, no baseMeasure, no band,
  // no ADA, no cap — "it closes faces; nothing offsets a curb from it"), and it carries no `caps`,
  // so `tipOf` returns null and the arc gets no dead-end tip where it runs off the bb.
  // ⛔ The ARC, never the closed ring — see `coastline.mjs`: stroking a closed ring fragments it.
  const coastChains = (Array.isArray(coastArcs) ? coastArcs : [])
    .filter(a => Array.isArray(a) && a.length >= 2)
    .map(a => ({ st: { skelId: WATER_EDGE_SKEL, points: a.map(p => [p[0], p[1]]),
                       hard: a.map(() => false), gradeSeparated: false, ...(a.deck != null && { deck: a.deck }) }, ci: -1 }))
  // ⭐ AN OFF-GRADE SPAN OVER THE WATER IS NOT GROUND (Boz's ruling B, Zob's read, 2026-10-27): a bridge is above the water, a
  // tunnel below it, and neither is street-on-water. Every street and grade-separated chain is noded ONCE against the shoreline
  // arcs (street × arc only, on the lattice); a piece between two crossings lies in the water iff its first edge's midpoint does
  // (the nonzero rule over the water rings, exact after noding). A wet piece over runs that are ALL off grade and EXACTLY
  // attributed (`gradeRuns`, mintInputs.mjs) leaves the ink; the pieces either side end ON the coast, the crossing shared with
  // the arc, and every vertex keeps its ORIGINAL index for srcIdx / segOrd / hard, so no authoring key moves. ⛔ A wet piece
  // over a run attributed by order or one end, or over a run AT GRADE, refuses by name — never kept silently in the water.
  // Over land nothing changes (a partly-bridge street still bounds blocks), and a bridge over an ISLAND stays ink, like a
  // bridge over land.
  const HWY_CLASS = HIGHWAY_CLASSES
  const split = splitOverWater([...streets.map((st, ci) => ({ st, ci })), ...gradeSep.map(st => ({ st, ci: -1 }))], coast, coastChains, segOrdAt, (x) => x.ci < 0 && HWY_CLASS.has(x.st?.highway))
  const chains = [...split.chains, ...split.coastChains]
  if (Array.isArray(coast) && coast.length) coast = split.waterRings   // the water carries the crossings the arcs took (above)
  // ⭐ H-3 step 4 — `gradeEnd`, the RAMP-END identity stamp. A grade-separated HIGHWAY chain's endpoint that is
  // also a vertex of a non-highway street is where the ramp comes down to the town (an at-grade terminal).
  // Stamped here, by construction, exactly as `tipEnd` is — ⛔ never recovered by proximity afterwards (A15).
  // The junction-residual classifier (derive.js, at the mint) reads it off the block ring.
  const vKey3 = (p) => `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`
  const townVerts = new Set()
  for (const st of [...streets, ...gradeSep.filter(g => !HWY_CLASS.has(g?.highway))]) for (const p of (st?.points || [])) townVerts.add(vKey3(p))
  // ⛔ COUNTED, NOT ASSUMED. A coast that silently failed to expand would leave the land closing
  // against the lake's clip edge again, which looks identical on screen and is the state this
  // change exists to end.
  if (coastChains.length) console.log(`    [①] shoreline expanded as INK: ${coastChains.length} arc(s), ${coastChains.reduce((a, c) => a + c.st.points.length, 0)} vertices → two-sided at ε=${eps} m`)
  else if (Array.isArray(coast) && coast.length) console.warn(`    ⛔ [①] ${coast.length} water ring(s) but NO shoreline arc to expand — the land will close against the clip edge, which carries ONE owner and no landward side.`)
  // ⭐ ONE CONTEXT PER CHAIN — its stamp, its ends. The stroke below may span several chains; every vertex is still
  // stamped by its OWN chain, in that chain's own indexing, so `segOrdAt` is asked exactly as before (the authoring key).
  const ctxOf = ({ st, ci }) => {
    const P = st.points
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
    // `hwy` rides the stamp of a grade-separated HIGHWAY (the class set the ground's hwySkel reads too): its absorbed ink is
    // the highway's, left to H. ⛔ Not `gradeSeparated` alone: a street's own bridge is ROAD for paint (Boz, 2026-10-25).
    const hwyGs = gs && HWY_CLASS.has(st?.highway)
    // Stamped on the chain's whole LAST SPAN (the end vertex and the one before it): the town street's own ε
    // outline swallows the ramp's end vertices in the union, and the ramp edge that survives into the block
    // ring is the one LEAVING the second-to-last vertex — measured on huron, end-vertex-only stamps reached
    // 0 block rings. Carried by construction, still: it is the label of the edge that is actually there.
    const atStart = hwyGs && townVerts.has(vKey3(P[0])), atEnd = hwyGs && townVerts.has(vKey3(P[lastI]))
    const gradeEndOf = (i) => { const s0 = atStart && i <= 1, e0 = atEnd && i >= lastI - 1
      return s0 && e0 ? (i === 0 ? 'start' : 'end') : s0 ? 'start' : e0 ? 'end' : null }
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
    // ⭐ `water` rides the stamp for the same reason `gradeSeparated` does: downstream tells a
    // shore edge from a street edge by IDENTITY, never by the absence of a measure.
    const isCoast = skelId === WATER_EDGE_SKEL
    // a piece of a chain split over the water (splitOverWater) keys every vertex by its ORIGINAL index; its water ends are grade ends
    const orig = st?._orig || null, origSeg = st?._origSeg || null, wEnd = st?._waterEnd || null
    const stamp = (side, i, segI) => { const ge = gradeEndOf(i) || (wEnd && ((i === 0 && wEnd.start) ? 'start' : (i === lastI && wEnd.end) ? 'end' : null))
      return owners.push({ skelId, side, segOrd: ci >= 0 ? segOrdAt(ci, origSeg ? origSeg[segI] ?? origSeg[Math.max(0, Math.min(origSeg.length - 1, segI))] : segI) : 0, gradeSeparated: gs, srcIdx: orig ? orig[i] : i, hard: hardAt ? !!hardAt[i] : true, tipEnd: tipOf(i), ...(tipOf(i) && { tip: [P[i][0], P[i][1]] }), ...(isCoast && { water: true }), ...(isCoast && st?.deck != null && { deck: st.deck }), ...(ge && { gradeEnd: ge }), ...(hwyGs && { hwy: true }) }) - 1 }
    return { st, ci, P, skelId, isCoast, dg0, dg1, lastI, stamp }
  }
  const live = chains.filter(({ st }) => st?.points?.length >= 2).map(ctxOf)
  // ⭐⭐⭐ THE INK MEETS INSIDE THE INK: A CHAIN CUT IS STROKED THROUGH, NEVER BUTTED. ① has no nodes; a degree-2 cut
  // (two chains end on one shared vertex, nothing else there) is bookkeeping, so the chains it joins are ONE stroke and
  // only the label changes at the cut. ⛔ Butted, each end's corners (end ± its own normal × ε) sit up to 2ε outside
  // the neighbour's ink: the union keeps them as sub-ink edges between two owners, and at a near-straight cut the two
  // butts' overlap falls below the grid and the ink parts (`BRIEF-the-ink-meets-inside-the-ink`). The cut is read off
  // the frame's own `caps.*.degree` and the exact shared vertex (0.1 mm key, as `nodes` below); the coast is never
  // joined. ⛔ No endpoint moves and `streets[].points` is never written: the stroke is a walk over the chains as given.
  // ⭐ A group with no free end is a CLOSED stroke — a loop chain whose own two ends meet, or chains in a ring.
  const qk4 = (p) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`
  const endsAt = new Map()
  live.forEach((c, n) => { if (c.isCoast) return
    for (const e of ['start', 'end']) if (c.st.caps?.[e]?.degree === 2) { const k = qk4(e === 'start' ? c.P[0] : c.P[c.lastI]); let a = endsAt.get(k); if (!a) endsAt.set(k, a = []); a.push([n, e]) } })
  const partner = new Map(), hairpins = []
  let oddCuts = 0
  // the vertex beside a chain end, along the chain: where a stroke through the cut comes from or goes to
  const besideEnd = ([n, e]) => { const c = live[n]; return c.P[e === 'start' ? 1 : c.lastI - 1] }
  for (const a of endsAt.values()) {
    if (a.length !== 2) { oddCuts++; continue }
    // ⛔ A STROKE THROUGH THE CUT MUST HAVE A DIRECTION THERE. Where both chains leave the cut toward the SAME vertex the
    // stroke would double back on itself and its normal at the cut is undefined: two chains drawn over each other (PTown
    // `old-colony-way-1`/`-2`, identical twice) — a frame duplicate, not a cut. Left butted and named, never joined.
    if (a[0][0] !== a[1][0] && qk4(besideEnd(a[0])) === qk4(besideEnd(a[1]))) { hairpins.push(`${live[a[0][0]].skelId}|${live[a[1][0]].skelId}`); continue }
    partner.set(`${a[0][0]}:${a[0][1]}`, a[1]); partner.set(`${a[1][0]}:${a[1][1]}`, a[0])
  }
  // ⭐ AN ISLAND'S COAST IS A CLOSED STROKE (Boz's ruling, 2026-10-27, on Zob's read of PTown v3's r215): a coast chain whose two
  // ends are one point (bake-coast writes an island's arc as its ring with the first point repeated) is its own partner, so the
  // walk below returns it `closed` and it is stroked as a band, its seam outlined as a bend like every other vertex. Walked
  // open, its two butts lay on top of each other at the seam and the ink retraced itself (absorbInk refused the face).
  live.forEach((c, n) => { if (c.isCoast && c.lastI >= 3 && qk4(c.P[0]) === qk4(c.P[c.lastI])) { partner.set(`${n}:start`, [n, 'end']); partner.set(`${n}:end`, [n, 'start']) } })
  // ⛔ LOUD: a degree-2 end that is not joined is left butted, and the sub-ink check sees it.
  if (oddCuts) console.warn(`    ⛔ [①] ${oddCuts} degree-2 chain end(s) meet no single other chain end — left butted, NOT joined`)
  if (hairpins.length) console.warn(`    ⛔ [①] ${hairpins.length} degree-2 cut(s) where both chains leave toward the same vertex (a chain drawn twice) — left butted, NOT joined: ${hairpins.join(' · ')}`)
  const strokes = [], seen = new Set()
  const walk = (n, e) => { const seq = []; let cur = [n, e]
    while (cur && !seen.has(cur[0])) { const [m, en] = cur, rev = en === 'end'; seen.add(m); seq.push({ c: live[m], rev }); cur = partner.get(`${m}:${rev ? 'start' : 'end'}`) || null }
    return { seq, closed: !!cur } }
  live.forEach((_, n) => { if (!seen.has(n)) for (const e of ['start', 'end']) if (!seen.has(n) && !partner.has(`${n}:${e}`)) strokes.push(walk(n, e)) })
  live.forEach((_, n) => { if (!seen.has(n)) strokes.push(walk(n, 'start')) })
  const joined = strokes.filter(s => s.seq.length > 1 || s.closed)
  if (joined.length) console.log(`    [①] chain cuts stroked through: ${joined.length} stroke(s) join ${joined.reduce((a, s) => a + s.seq.length, 0)} chains (${joined.filter(s => s.closed).length} closed)`)
  // ⭐ ONE VERTEX PER POINT, TWO MEMBERS AT A CUT: `f` is the chain whose edge LEAVES the vertex walking forward, `b`
  // walking back. So the right pass stamps the cut with the chain ahead and the left pass with the chain behind,
  // and the owner change sits ON the cut vertex, on both sides (kept by `preserveCollinear` in the union).
  const S = strokes.map(({ seq, closed }, si) => {
    const V = []
    seq.forEach(({ c, rev }, s) => { for (let t = 0; t < c.P.length; t++) { const i = rev ? c.lastI - t : t, m = { c, rev, i }
      if (s > 0 && t === 0) V[V.length - 1].f = m; else V.push({ p: c.P[i], f: m, b: m }) } })
    if (closed) { V[0].b = V[V.length - 1].b; V.pop() }
    const nV = V.length, nrm = []
    for (let k = 0; k < nV; k++) {
      const a = V[closed ? (k - 1 + nV) % nV : Math.max(0, k - 1)].p, b = V[closed ? (k + 1) % nV : Math.min(nV - 1, k + 1)].p
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz)
      nrm.push(L > 1e-9 ? [-dz / L * eps, dx / L * eps] : (nrm[nrm.length - 1] || [0, 0]))
    }
    return { seq, closed, V, nrm }
  })
  // ⛔ AN OPEN STROKE WHOSE TWO ENDS ARE ONE POINT IS A CLOSED PATH STROKED OPEN (Boz's ruling, 2026-10-27): its two butts lie
  // on top of each other there, on different normals, and the ink comes out with a near-retrace that only absorbInk's noding
  // makes exact. Refused here, at its cause, by owner. ⭐ Only where the two ends meet NOTHING ELSE: a loop whose ends meet
  // another stroke at a real node (HPDM grandview-place-2, a cul-de-sac loop on grandview-place-0) takes its corners from that
  // node's outline, as every node does. ▶ checks/claims-the-ink-never-retraces-itself.mjs
  const strokesAt = new Map(); S.forEach((s, si) => { for (const v of s.V) { const q = qk4(v.p); let a = strokesAt.get(q); if (!a) strokesAt.set(q, a = new Set()); a.add(si) } })
  for (const [si, s] of S.entries()) { const n = s.V.length
    if (!s.closed && n >= 3 && qk4(s.V[0].p) === qk4(s.V[n - 1].p) && strokesAt.get(qk4(s.V[0].p)).size === 1) { const c = s.seq[0].c
      throw new Error(`[①] ⛔ ${c.skelId}${c.isCoast ? ' (the coast)' : ''}: an OPEN stroke whose two ends are one point, (${s.V[0].p.map(v => (+v).toFixed(3)).join(', ')}), a closed path stroked open — its butts would retrace each other. Refusing.`) } }
  // ⭐⭐⭐ A REAL NODE'S OUTLINE IS BUILT ONCE, FROM ALL ITS LEGS (Boz, 2026-10-25: "one outline per node"). Where three or
  // more legs leave one shared vertex (a stroke passing through it is two legs, in and out), the legs are sorted by angle
  // and each pair of angular neighbours meets at ONE point: where the first's counter-clockwise ε side crosses the
  // second's clockwise one (the point their inks' boundaries cross anyway), or, across a wedge of 180° or more (a bend's
  // outer corner), the point ε out along the wedge's bisector, ON the ink's round ε corner. Every stroke at the node reads its corners from
  // that one outline: a leg that ENDS there closes on its two points and the node itself, in place of a butt whose
  // corners poked up to 2ε past its neighbours' ink; a stroke passing through takes, on each side, the points of the
  // legs either side of it. So neighbours share exact points and the union finds nothing under the grid to round.
  // ⭐⭐ AND EVERY BEND IS THE SAME OUTLINE, WITH TWO LEGS (Boz, 2026-10-25: "the ink is ε wide everywhere: a true offset at
  // every bend, every stroke"). A stroke's interior vertex, a chain cut or a plain bend, coast included, is outlined
  // exactly as a node is: the inner side is the crossing of the two segments' ε sides, the outer side the point on the
  // round ε corner. So the polygon is INSCRIBED in the true ε ink: nothing outside it, one vertex per corner. ⛔ The ε
  // along the bisector on BOTH sides, which this replaces, cut the inner side short of ε: the land met the water a few
  // mm apart at sharp coast vertices (PTown, Huron) and a sharp cut lost ink (Huron jefferson-street→huron-street-0).
  // ⛔ A MITER on the outer side was tried and is wrong: its point lies ε/cos(turn/2) out, OUTSIDE the ink, and the edges
  // leaving it no longer lie on their owner (claims-every-proto-edge-lies-on-its-owner: LS 4, HPDM 44 edges).
  // ⛔ Never a union followed by a merge, and never clamped: an inner crossing past either leg's own first segment
  // (acute), or a leg of no length, is left with its plain offsets and NAMED; so is a chain end at a node no passing
  // chain has a vertex at.
  const over = new Map(), nodeRefusal = { acute: [], degenerate: [], noVertex: [] }
  // ⭐ THE WEDGE SPOKES: at a real node (three or more legs), the segment from the node to each outline point — where one leg's
  // ε side meets the next's, the block's inner corner — closes each street's wedge. absorbInk cuts the ink by these too, so
  // every cell of it lies on ONE stroke's side and takes that owner's class (shore · highway · road) by label, never by overlap.
  const spokes = [], outlineRefused = [], outlineRefusedRec = { acute: [], degenerate: [], noVertex: [] }   // …and where a node's outline was refused (so it has no spokes): absorbInk names it
  {
    const at = new Map()
    S.forEach((s, si) => {
      s.V.forEach((v, k) => { const q = qk4(v.p); let a = at.get(q); if (!a) at.set(q, a = []); a.push({ si, k }) }) })
    for (const [q, here] of at) {
      const legs = []
      for (const { si, k } of here) { const { V, closed } = S[si], n = V.length
        if (closed || k > 0) legs.push({ si, k, dir: 'in', to: V[closed ? (k - 1 + n) % n : k - 1].p })
        if (closed || k < n - 1) legs.push({ si, k, dir: 'out', to: V[closed ? (k + 1) % n : k + 1].p }) }
      // two legs are a BEND only when one stroke passes through; two strokes' ends meeting were not joined, and stay butted
      if (legs.length < 3 && !(legs.length === 2 && here.length === 1)) {
        for (const { si, k } of here) { const s = S[si]; if (s.closed || (k > 0 && k < s.V.length - 1)) continue
          const m = k === 0 ? s.V[0].f : s.V[k].b, e = (k === 0) !== m.rev ? 'start' : 'end'
          if ((e === 'start' ? m.c.dg0 : m.c.dg1) >= 3) { nodeRefusal.noVertex.push(`${m.c.skelId}@${q}`); outlineRefused.push({ p: s.V[k].p, why: 'noVertex' }) } }
        continue
      }
      const o = S[here[0].si].V[here[0].k].p
      const { bad, W } = outlineCorner(o, legs, eps)
      if (bad) { nodeRefusal[bad].push(`${[...new Set(here.map(({ si }) => S[si].seq[0].c.skelId))].join('|')}@${q}`); outlineRefused.push({ p: o, why: bad }); continue }
      legs.forEach((g, j) => { g.ccw = W[j]; g.cw = W[(j - 1 + W.length) % W.length] })
      if (legs.length >= 3) for (const w of W) spokes.push([[o[0], o[1]], [w[0], w[1]]])
      const one = (a, b) => (a === b ? [a] : [a, b])
      for (const { si, k } of here) {
        const gi = legs.find(g => g.si === si && g.k === k && g.dir === 'in'), go = legs.find(g => g.si === si && g.k === k && g.dir === 'out')
        over.set(`${si}:${k}`, gi && go ? { R: one(gi.cw, go.ccw), L: one(go.cw, gi.ccw) }
          : go ? { R: [go.ccw], L: [go.cw, o] } : { R: [gi.cw, o], L: [gi.ccw] })
      }
    }
    const nr = Object.entries(nodeRefusal).filter(([, v]) => v.length)
    // ⛔ LOUD: a refused vertex keeps its plain offsets (its butts, at a node), and the sub-ink check reads it RED.
    if (nr.length) console.warn(`    ⛔ [①] outline REFUSED, plain offsets kept: ${nr.map(([k, v]) => `${v.length} ${k} (${v.slice(0, 4).join(' · ')}${v.length > 4 ? ' …' : ''})`).join(' · ')}`)
    // ⭐ FROZEN, NOT ONLY PRINTED (Boz's ruling, 2026-10-26: "pour on, but RED"): each node whose outline was refused, by kind,
    // with where and whose; checks/claims-the-mint-refuses-no-outline.mjs reads it and is RED on any entry
    { const seen = { acute: 0, degenerate: 0, noVertex: 0 }
      for (const r of outlineRefused) (outlineRefusedRec[r.why] ||= []).push({ at: [r.p[0], r.p[1]], who: nodeRefusal[r.why]?.[seen[r.why]++] ?? null }) }
    console.log(`    [①] outlines: ${over.size} stroke vertices take their corners from one outline (node, cut or bend)`)
  }
  // ⭐⭐ THE SHORE MEETS THE FRAME ACROSS ITS WHOLE INK. A coast arc ends ON a bb edge (`coastline.mjs`: the run inside the bb,
  // both ends on its edge), and the bb is the frame the land is cut from. Butted square to the arc, its cap crossed the
  // edge at a slant, so one corner fell inside the frame and the water face's corner on the edge sat a sub-ink step from
  // it (Huron, PTown: `__boundary__` → `__water__`). ⇒ The cap is where the arc's two ε sides cross that edge, so the frame
  // cuts the stroke once, square to the frame. "On the edge" is the lattice's own rounding bound, never a constant.
  // ⛔ Named refusals, left butted: an end on two edges (a frame corner), an arc running along the edge, a crossing past
  // the arc's last segment.
  const frameRefusal = []
  if (bb && [bb.x0, bb.x1, bb.z0, bb.z1].every(Number.isFinite)) {
    const ON = Math.SQRT1_2 * LATTICE_M
    for (const [si, s] of S.entries()) { if (!s.seq[0].c.isCoast || s.closed || s.V.length < 2) continue
      const n = s.V.length
      for (const k of [0, n - 1]) {
        const p = s.V[k].p, on = [[0, bb.x0], [0, bb.x1], [1, bb.z0], [1, bb.z1]].filter(([a, v]) => Math.abs(p[a] - v) <= ON)
        if (!on.length) continue
        const where = `${s.seq[0].c.skelId}@(${p[0].toFixed(3)}, ${p[1].toFixed(3)})`
        if (on.length > 1) { frameRefusal.push(`${where} on a frame corner`); continue }
        const [a, v] = on[0], A = s.V[k === 0 ? 0 : n - 2].p, B = s.V[k === 0 ? 1 : n - 1].p
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]), d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], r = [-d[1] * eps, d[0] * eps]
        const cut = (sg) => { const o = [p[0] + sg * r[0], p[1] + sg * r[1]], t = (v - o[a]) / d[a]
          return Number.isFinite(t) && Math.abs(t) <= L ? [o[0] + t * d[0], o[1] + t * d[1]] : null }
        const pr = cut(1), pl = cut(-1)
        if (!pr || !pl) { frameRefusal.push(`${where} runs along the edge or crosses it past its last segment`); continue }
        over.set(`${si}:${k}`, { R: [pr], L: [pl] })
      }
    }
  }
  if (frameRefusal.length) console.warn(`    ⛔ [①] shore cap on the frame REFUSED, left butted: ${frameRefusal.join(' · ')}`)
  // the owner (①'s own table) of each stroke segment k → k+1: the label its right-hand pass carries, captured as it is pushed
  const lineOwn = S.map(() => []), lineOwnL = S.map(() => [])   // the right- and left-hand pass's owner per segment
  for (const [si, { seq, closed, V, nrm }] of S.entries()) {
    const nV = V.length
    // ⛔ (-dz, dx) IS MEASURE-RIGHT — derived from the artifact twice. Naming it 'left' puts every ASYMMETRIC authored
    // width on the wrong side of its street. ⭐ A member walked REVERSED has its sides swapped: the stroke's right is its left.
    const right = ({ c, rev, i }) => (rev ? c.stamp('left', i, Math.max(0, i - 1)) : c.stamp('right', i, i))
    const left = ({ c, rev, i }) => (rev ? c.stamp('right', i, i) : c.stamp('left', i, Math.max(0, i - 1)))
    // each vertex's side points in travel order: its own ε offset, or the node outline's points (above)
    const Rk = (k) => over.get(`${si}:${k}`)?.R ?? [[V[k].p[0] + nrm[k][0], V[k].p[1] + nrm[k][1]]]
    const Lk = (k) => over.get(`${si}:${k}`)?.L ?? [[V[k].p[0] - nrm[k][0], V[k].p[1] - nrm[k][1]]]
    const add = (ring, labs) => { rings.push(ring); labels.push(labs) }
    // ⛔ UNIFORM WINDING. Non-zero fill CANCELS where an opposite-wound polygon
    // overlaps, so a mixed pile unions into confetti instead of one object.
    // ⛔ The earlier ruling here — reverse, do NOT rotate ("47 with the rotation, 2 without") — was measured while
    // booleanLabelled's forward scan still handed a minted vertex the NEXT record, which partly cancelled the
    // missing rotation. With the containing edge taken first, rotation is what the geometry oracle agrees with.
    // Retired text + the measurement: `cartograph/_archive/PROTO-labels-reversed-not-rotated-RETIRED-2026-09-25.md`.
    // ⭐ `labs` is PER-EDGE (labs[k] names edge k→k+1: right pass segment i, left pass segment i−1 via `segI`, the two
    // caps at the seams), so a reversal must also ROTATE it: new edge k is old edge n−2−k. `pass` and `pEnd` are
    // per-VERTEX and only reverse. ⛔ The not-rotated reversal this replaces put the span of segment i on segment
    // i−1 wherever i is an IX vertex (▶ `CARTOGRAPH_SCENE=<scene> node scratch/proto-remint.mjs --oracle=<ribbons>`).
    const orient = (ring, labs, want, also = []) => { if (clipperLib.Clipper.Orientation(ring.map(toClipper)) !== want) { ring.reverse(); labs.reverse(); labs.push(labs.shift()); for (const a of also) a.reverse() } }
    if (closed) {
      // ⭐ A CLOSED STROKE IS A BAND: its right boundary and its left boundary, wound opposite, so non-zero fill keeps
      // the ink between them and the inside stays out. No butt, so no cap.
      if (nV < 3) continue
      // the left boundary is walked BACK, so each of its edges is owned by the left stamp at its start
      const rR = [], lR = [], rL = [], lL = []
      for (let k = 0; k < nV; k++) for (const q of Rk(k)) { rR.push([q[0], q[1]]); lR.push(right(V[k].f)); if (lineOwn[si][k] == null) lineOwn[si][k] = lR[lR.length - 1] }
      for (let k = nV - 1; k >= 0; k--) for (const q of Lk(k)) { rL.push([q[0], q[1]]); lL.push(left(V[k].b)); const sg = (k - 1 + nV) % nV; if (lineOwnL[si][sg] == null) lineOwnL[si][sg] = lL[lL.length - 1] }
      const outerR = Math.abs(signedArea(rR)) >= Math.abs(signedArea(rL))
      orient(rR, lR, outerR); orient(rL, lL, !outerR)
      add(rR, lR); add(rL, lL)
      continue
    }
    const ring = [], labs = [], pass = [], pEnd = []   // pass: true = the right-hand pass; reversed WITH the ring below
    const endOf = (k) => (k === 0 ? 'start' : k === nV - 1 ? 'end' : null)
    for (let k = 0; k < nV; k++) for (const q of Rk(k)) { ring.push([q[0], q[1]]); labs.push(right(V[k].f)); pass.push(true); pEnd.push(endOf(k)); if (lineOwn[si][k] == null) lineOwn[si][k] = labs[labs.length - 1] }
    for (let k = nV - 1; k >= 0; k--) for (const q of Lk(k)) { ring.push([q[0], q[1]]); labs.push(left(V[k].b)); pass.push(false); pEnd.push(endOf(k)); if (k > 0 && lineOwnL[si][k - 1] == null) lineOwnL[si][k - 1] = labs[labs.length - 1] }
    if (ring.length < 3) continue
    // the stroke's two TRUE ends, as (chain, end): a cut inside the stroke is no end, so it gets no cap mark
    const first = seq[0], last = seq[seq.length - 1]
    const ends = { start: [first.c, first.rev ? 'end' : 'start'], end: [last.c, last.rev ? 'start' : 'end'] }
    orient(ring, labs, true, [pass, pEnd])
    // ⭐ THE TWO CAP EDGES ARE MARKED, on the FINAL ring: an edge whose ends lie on opposite passes crosses the
    // ribbon. ⛔ Marked AFTER the flip, never by position: the records at the seams label LEGS once it has flipped
    // (▶ `scratch/ink-cap-marks.mjs`). A record is one vertex's (`stamp` pushes a new one per call), so the mark names
    // that vertex's edge. ⛔ Additive: `skelId`, `srcIdx`, `tipEnd` stay — the tip ease reads them.
    // ⭐ TWO MARKS, NOT ONE (Boz's ruling, 2026-10-21, on the coast's capless ends): `across` — the edge runs ACROSS the
    // stroke, so it is not frontage and the run emitter declines it (fc3faf43's reason, which the coast needs too: its end
    // edges survive the union at the frame) — and `cap`, the doctrine's dead end (RIBBONS: a coast has no CAP), only where
    // the owner is a degree-1 tip, so `cap` ⇔ `tipEnd` by construction and a cap always knows its end. A stroke's ends are
    // its TRUE ends (`ends`): a chain cut inside it is no end, so it takes neither mark.
    const endSurvives = (end) => { const [c, e] = ends[end]; return c.isCoast || (e === 'start' ? c.dg0 : c.dg1) === 1 }
    for (let k = 0; k < labs.length; k++) if (pass[k] !== pass[(k + 1) % labs.length] && endSurvives(pEnd[k])) {
      const o = owners[labs[k]]; o.across = true; if (o.tipEnd) o.cap = true }
    add(ring, labs)
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

  // ⭐⭐ THE SEALED CENTRELINE — the line ① was struck from, frozen beside it (BRIEF-the-ink-is-owned-by-its-labels §3.3;
  // Boz approved the record 2026-10-25). Past the Wall the road's paint reads THIS, never `ribbons.streets[].points`: one
  // entry per STROKE as the mint expanded it (chain cuts stroked through, its working copy, not the survey), on the lattice.
  //   points  [[x, z]…] lattice-rounded, consecutive duplicates removed · closed
  //   own     per segment k → k+1: the owner index (①'s `owners`) of its right-hand edge — skelId · segOrd from ONE table
  //   ownL    the same for its LEFT-hand edge (the stroke's other pass): an absorbed face takes the pass on its own side
  //   runs    [{ from, to, skelId, dir }] maximal spans of one chain; `dir` +1 when the stroke runs with the chain's own
  //           point order, −1 against (a stroke may walk a chain reversed). A one-way chain runs in travel order (intake).
  // ⛔ A segment rounding to nothing (shorter than the lattice) is dropped and counted, never merged silently.
  const rl = (v) => Math.round(v * SCALE) / SCALE
  let lineDropped = 0
  const centrelines = S.map(({ closed, V }, si) => {
    const pts = [], own = [], ownL = [], chainOf = []
    const nV = V.length, nSeg = closed ? nV : nV - 1
    for (let k = 0; k < nV; k++) { const p = [rl(V[k].p[0]), rl(V[k].p[1])], q = pts[pts.length - 1]
      if (q && q[0] === p[0] && q[1] === p[1]) { lineDropped++; own.pop(); ownL.pop(); chainOf.pop() } else pts.push(p)
      if (k < nSeg) { own.push(lineOwn[si][k] ?? null); ownL.push(lineOwnL[si][k] ?? null); chainOf.push(V[k].f) } }
    if (closed && pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) { pts.pop(); own.pop(); ownL.pop(); chainOf.pop(); lineDropped++ }   // the zero-length closing segment goes with it
    const runs = []
    chainOf.forEach((m, k) => { const r = runs[runs.length - 1], id = m.c.skelId, dir = m.rev ? -1 : 1
      if (r && r.skelId === id && r.dir === dir) r.to = k + 1; else runs.push({ from: k, to: k + 1, skelId: id, dir }) })
    return { points: pts, closed: !!closed, own, ownL, runs }
  }).filter(l => l.points.length >= 2)
  if (lineDropped) console.log(`    [①] sealed centreline: ${lineDropped} vertex(es) under the lattice dropped (their segment with them)`)

  // ⭐ IDENTITY RIDES THE UNION — `booleanLabelled`, N subject rings each with its
  // own label, labels on Clipper's Z channel, crossings resolved by walking the
  // output ring forward. ⛔ NOT `unionRingLabelled`: that self-unions ONE ring and
  // cannot carry identity across ~200 chain rectangles.
  // ⭐ THE CONTAINMENT RULE LEAVES A LABEL ONLY WHERE IT ALREADY NAMES THE AUTHORING KEY OF THE EDGE IT LIES ON
  // (skelId · side · segOrd). It re-owns a surviving vertex whose leaving edge is not on its own input edge, to the one
  // input edge containing it; where that edge's owner is the same key the label is already right and its record stays.
  // ⛔ "Same stroke" (same skelId) was too coarse once strokes share exact outline points: where a chain's END lands on
  // its own vertex (a self-T) or passes back through its own start, the ring passes one point twice and either record
  // survives, so an edge on the LEFT boundary, or on span 0, kept a RIGHT or span-1 record (Huron eagle-ridge-drive-0,
  // meadowlark-lane; PTown willow-drive, vorse-lane-0: claims-every-proto-edge-lies-on-its-owner).
  const keyOf = (l) => { const o = owners[l]; return o ? `${o.skelId}|${o.side}|${o.segOrd}` : null }
  const sameStroke = (a, b) => keyOf(a) != null && keyOf(a) === keyOf(b)
  const R = booleanLabelled(clipperLib.ClipType.ctUnion, rings, labels, [], null, { sameStroke, preserveCollinear: true })   // ① needs the edge ledger; nothing else does
  if (R.containment) console.log(`    [①] containment: ${R.containment.reassigned} surviving vertex/vertices whose edge runs along ANOTHER stroke re-owned by the input edge it lies on${R.containment.unresolved ? ` · ⛔ ${R.containment.unresolved} with no single containing edge — left as they were` : ''}`)

  // ⭐⭐⭐ THE CIRCLE IS THE STENCIL, NOT A CHAIN. Home: `RIBBONS §1`, "THE RIM BOUNDS, IT DOES
  // NOT OWN" — ruled 2026-08-12 and re-ruled aloud 2026-09-06: "EITHER we build the entire grid
  // of streets and the circle stencils out the circle OR the circle adds the geometry such that
  // the whole perimeter is made of weird odd shapes", and "there should be no tips; the streets
  // clip at the perimeter edge."
  // ⇒ Build the WHOLE grid. ⛔ ① IS NEVER CUT HERE — the boundary is carried out as
  // `boundaryRing`, A PAYLOAD, and stamped LAST on finished geometry (`[PROTO⊙]`).
  //
  // ⛔⛔ THE "UNITE THEN INTERSECT / THE RIM EDGE COMES OUT OWNED BY `__boundary__`" TEXT THAT
  // STOOD HERE IS EXCISED — `_archive/PROTO-rim-owned-ROT-2026-09-20.md`. `RIBBONS §1` struck it
  // on 2026-09-06 and this header was not updated, so it read as current for two weeks and was
  // believed on 2026-09-20, costing a day. **0 of LS's 275 block faces carry a `__boundary__`
  // label**: under stamp-last a block runs PAST the rim and is cut after, so no rim edge is owned.
  //
  // ⭐⭐⭐ AND THE DISTINCTION THAT DAY TURNED ON, BECAUSE THIS HEADER DID NOT MAKE IT:
  // **THE DISC IS A RENDER KNOB. GROUND TRUTH IS NOT.** `RIBBONS §1`'s "a disc, or a disc plus a
  // margin, is STILL the circle deciding block geometry" is about THE CIRCLE — radius,
  // the edge fade (the Look's) and aesthetic padding, all live-editable, none of them facts about the town. It
  // is NOT a rule that only a chain may close a block. A SHORELINE is absolute (`ROADMAP H-4`),
  // so it IS ink: stroked in like a chain (`WATER_EDGE_SKEL`), it closes land-use faces and
  // coast-facing dead ends, and the water field falls out of `frame − ink` on the other side.
  // See `RIBBONS §1`.
  // ⛔ Read as "nothing but a chain may close a face", this header sent an agent to carve the disc
  // up front and write the result beside the radius — inverting which one is the SSoT. The radius
  // is sacrosanct and the circle stamps last; a coast is neither of those things.
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
    // ⇒ Subtract the ink from the FRAME — a plain rectangle around everything, never the disc.
    // ⛔ The "its circle-side edges carry `__boundary__` and resolve to NO measure" claim that
    // stood here is ROT and is excised with the header's copy above; a rim block is CUT by the
    // stamp afterwards and owns no rim edge.
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
    // ⭐⭐⭐ THE FRAME IS THE bb (Jacob, 2026-09-20): "use the bb as the frame" · "the water should
    // go to the edge of the bb just like the roads and everything else."
    // ⛔ THE INK BBOX CANNOT BE THE FRAME ONCE THERE IS A COAST, and it is measured, not argued:
    // Overpass returns WHOLE ways, so highway tails push the ink bbox to 20.6 × 16.4 km on Huron
    // while the shoreline spans the bb's 9.9 × 6.4 km — the coast ends 4.2 km short of the frame,
    // the land flows around both of its ends, and the coastal strip stays joined to the exterior
    // no matter how the shoreline is stroked. `coastline.mjs`'s header predicted exactly this.
    // ⭐ AND THE bb IS NOT THE CIRCLE. `RIBBONS §1` forbids the DISC from deciding block geometry
    // because a radius is a live render knob; the bb is the FROZEN DATA EXTENT, declared at the
    // hard fetch and never moved (`EXTENT-DESIGN §3.3`). Closing against it is not the circle
    // deciding geometry by another name — the circle still stamps LAST, over the result.
    // ⛔ NO MARGIN. The water ring is closed exactly ON the bb edge, so a margin would leave a
    // strip of phantom "land" seaward of the lake.
    let fx0 = Infinity, fx1 = -Infinity, fz0 = Infinity, fz1 = -Infinity
    let M = 50
    if (bb && Number.isFinite(bb.x0) && Number.isFinite(bb.x1) && Number.isFinite(bb.z0) && Number.isFinite(bb.z1)) {
      fx0 = bb.x0; fx1 = bb.x1; fz0 = bb.z0; fz1 = bb.z1; M = 0
      console.log(`    [①] frame = the bb (declared data extent): ${((fx1-fx0)/1000).toFixed(1)} × ${((fz1-fz0)/1000).toFixed(1)} km — ink beyond it is cut by the frame, as the roads and the water both are.`)
    } else {
      // ⛔ LOUD. Without a bb the frame falls back to the ink bbox, and a coast then cannot divide
      // it — the land will not close against the shoreline and nothing on screen will say so.
      for (const rg of R.rings) for (const p of rg) { if (p[0]<fx0)fx0=p[0]; if (p[0]>fx1)fx1=p[0]; if (p[1]<fz0)fz0=p[1]; if (p[1]>fz1)fz1=p[1] }
      for (const p of bRing) { if (p[0]<fx0)fx0=p[0]; if (p[0]>fx1)fx1=p[0]; if (p[1]<fz0)fz0=p[1]; if (p[1]>fz1)fz1=p[1] }
      if (Array.isArray(coast) && coast.length) console.warn(`    ⛔ [①] NO bb PASSED and this town has a coast — the frame is the ink bbox, which the shoreline cannot reach. The land will NOT close against the water.`)
      else console.log(`    [①] frame = the ink bbox + ${M} m (no bb passed)`)
    }
    const rect = [[fx0-M,fz0-M],[fx1+M,fz0-M],[fx1+M,fz1+M],[fx0-M,fz1+M]]
    // ⭐⭐⭐ bb − (WATER ∪ INK), IN ONE MOVE. Jacob, 2026-09-20: "bb <> land/water chop <>
    // water is discrete object, land is joined to the protopoly in a combine/exclude move."
    // ⇒ The water and the street ink are COMBINED and EXCLUDED from the bb together. The land
    // faces fall out bounded by the coast wherever the water was, so the strip between the last
    // street and the shore is a face by construction — it is land, it has a land use, and it
    // belongs in the map.
    //
    // ⛔⛔ IT IS ONE BOOLEAN ON PURPOSE, AND THE TWO-STAGE VERSION IS WHY THIS TOOK SO LONG.
    // Chopping first (`rect − water`) and feeding the result back as the subject LOOKS right and
    // silently is not: Clipper returns the chop as a FLAT LIST of contours — the 4-point rect as
    // the outer and the 1,175-point coast as a HOLE — and re-adding those as separate subject
    // paths loses the hole's orientation, so the frame refills into the plain rectangle. Measured:
    // the "land" frame reported 2 pieces and the dropped exterior came back as a 4-POINT,
    // 341.87 km² rectangle covering 100% of the disc. Every measurement taken against that frame
    // was measuring the un-chopped rect.
    // ⭐ One difference cannot lose a hole, because nothing is ever re-entered as a subject.
    const clipRings = [...R.rings], clipLabels = [...R.labels]
    let wIdx = null
    if (Array.isArray(coast) && coast.length) {
      wIdx = owners.push({ skelId: WATER_EDGE_SKEL, side: 'right', segOrd: 0,
                                 gradeSeparated: false, srcIdx: -1, water: true }) - 1
      // ⛔ THE WATER KEEPS ITS OWN RELATIVE WINDING, TURNED AS ONE TO THE INK'S (Zob, 2026-10-25; the islands, 2026-10-26). The
      // clip set unions by nonzero fill, so a lake wound against the ink cancels it where they overlap (+1 − 1 = 0). The coast
      // arrives in coastFile.mjs#readCoast's convention, checked at that one door — each body's outer positive, each island
      // negative — so every ring is reversed TOGETHER when the ink is wound negative, never ring by ring: rewinding each ring to
      // the ink's sign turned an island hole into water. ▶ checks/claims-an-island-stays-land-in-the-mint.mjs
      if (!R.rings?.length) throw new Error('[①] ⛔ the coast has water rings but ① has no ink to wind them against. Refusing.')
      // ⛔ a coast handed to the mint any other way than readCoast's convention refuses by name (the one predicate, coastSign.js)
      { const bad = coastSignBreaks(coast)
        if (bad.length) throw new Error(`[①] ⛔ ${bad.length} coast ring(s) break the sign rule (a ring at even nesting depth wound positive, at odd depth negative): ring ${bad[0].i} at (${bad[0].at.map(v => v.toFixed(3)).join(', ')}), depth ${bad[0].depth}, wound ${bad[0].got > 0 ? 'positive' : bad[0].got < 0 ? 'negative' : 'flat'}. It would read land as water or water as land. Refusing.`) }
      const inkSign = Math.sign(signedArea(R.rings.reduce((m, r) => Math.abs(signedArea(r)) > Math.abs(signedArea(m)) ? r : m, R.rings[0])))
      const flip = inkSign < 0
      // ⭐ A DECK'S EDGE IS WATER WITH ITS DECK'S IDENTITY (Boz's ruling B, 2026-10-27): an edge structures.mjs#waterWithoutDecks
      // tagged `ring.deck[i]` takes its own water owner carrying `deck`, so the tag is not lost at the one water label.
      if (Array.isArray(coastArcs) && coastArcs.some(a => a?.deck != null) && coast.some(r => !Array.isArray(r.deck))) throw new Error('[①] ⛔ the shoreline arcs carry a deck\'s edge, and a water ring carries no per-edge deck tag (structures.mjs#waterWithoutDecks): the deck\'s edge would take the beach\'s owner. Refusing.')
      const deckOwner = new Map(), ownerOf = (k) => k == null ? wIdx : (deckOwner.get(k) ?? deckOwner.set(k, owners.push({ ...owners[wIdx], deck: k }) - 1).get(k))
      for (const r of coast) {
        if (!Array.isArray(r) || r.length < 3) continue
        const n = r.length, w = r.map(p => [p[0], p[1]]); if (flip) w.reverse()
        clipRings.push(w)
        // a label names the edge i → i+1, so a reversed ring's edge i is the original's edge n − 2 − i
        clipLabels.push(w.map((_, i) => ownerOf(r.deck?.[flip ? (n - 2 - i + n) % n : i] ?? null)))
      }
      console.log(`    [①] land = bb − (water ∪ ink): ${coast.length} water ring(s) combined with ${R.rings.length} ink ring(s) and excluded in one move.`)
    }
    const grown = rect

    // ⭐⭐⭐ `asTree` — A BLOCK IS A COMPOUND FACE, and the boolean already knows which ring
    // is a hole of which. Read as a flat list, `frame − ink` hands back the exterior as the
    // frame ring PLUS one hole per connected ink component, and every one of those holes was
    // being carried out as a block. See `booleanLabelled`'s header for the measurement.
    const D = booleanLabelled(clipperLib.ClipType.ctDifference, [grown], [grown.map(() => bIdx)], clipRings, clipLabels, { sameStroke, preserveCollinear: true }, true)
    if (D.containment) console.log(`    [①] blocks containment: ${D.containment.reassigned} re-owned · ${D.containment.walkedBack} walked backward, labelled by the edge they leave on${D.containment.unresolved ? ` · ⛔ ${D.containment.unresolved} with no single containing edge — left as they were` : ''}`)
    if (D.containment?.walkedBackRefused) console.warn(`    ⛔ [①] ${D.containment.walkedBackRefused} vertex/vertices walked backward with two arriving input edges of different owners — label left as it was`)
    let blocks = null, blockLabels = null, blockHoles = null, blockHoleLabels = null, absorbed = null
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
      let unlabelledHoles = 0
      // ⛔⛔ ALL FOUR CORNERS, because with the frame ON the bb a corner can lie IN THE WATER.
      // The old single corner (x0,z0) is Huron's NW — which is Lake Erie, subtracted, held by no
      // face at all. Testing one corner there identifies no exterior, and the giant outer face
      // goes unrecognised: that is the solid-blue Survey incident, arriving by a new route.
      // ⭐ Still a containment test with nothing to tune — a corner is either in a face or in the
      // water, and any face holding any corner reaches the edge of the declared data.
      const corners = [[fx0 - M + 1e-3, fz0 - M + 1e-3], [fx1 + M - 1e-3, fz0 - M + 1e-3],
                       [fx1 + M - 1e-3, fz1 + M - 1e-3], [fx0 - M + 1e-3, fz1 + M - 1e-3]]
      const FT = 1e-3
      const touchesFrame = (p) => Math.abs(p[0] - (fx0 - M)) < FT || Math.abs(p[0] - (fx1 + M)) < FT
                                || Math.abs(p[1] - (fz0 - M)) < FT || Math.abs(p[1] - (fz1 + M)) < FT
      const holdsPoint = (rg, corner) => {
        let inside = false
        for (let a = 0, b = rg.length - 1; a < rg.length; b = a++) {
          const p1 = rg[a], p2 = rg[b]
          if ((p1[1] > corner[1]) !== (p2[1] > corner[1]) &&
              corner[0] < (p2[0]-p1[0]) * (corner[1]-p1[1]) / ((p2[1]-p1[1]) || 1e-12) + p1[0]) inside = !inside
        }
        return inside
      }
      const holdsCorner = (rg) => corners.some(c => holdsPoint(rg, c))
      let degenerate = 0
      let keptOnEdge = 0
      let outerZones = 0
      // ⭐⭐⭐ A FACE THINNER THAN ε HAS NO INTERIOR — it is a residue of the boolean, not a region.
      // ⛔ NOT A SIZE THRESHOLD, and the distinction is the whole reason this is allowed to exist:
      // ε is the minimum width the construction ASSERTS (every chain, and now the shoreline, is
      // expanded to exactly ε), so nothing in ① can be thinner than ε. A face that is has no
      // width the ink could have given it. The cut is the declaration itself — there is no number
      // to tune, and it moves with ε rather than needing to be re-picked per town.
      // ⛔ AREA ALONE IS THE WRONG MEASURE, and extent alone is too: Huron's residues are 0.5 m
      // and 1.3 m ACROSS while being 0.2 mm thick, so a small-area cut catches real blocks and an
      // extent cut misses these. Thickness = area / bbox diagonal separates them with four orders
      // of magnitude to spare — measured: residues 1.75e-4 … 4.29e-4 m, next real block 2.02 m.
      // ⭐ THEY APPEARED WITH THE SHORELINE STROKE — where ε-wide coast ink crosses ε-wide street
      // ink the union leaves a sliver triangle — so this is disclosed as its own class, never
      // folded into `degenerate`, which counts a DIFFERENT failure (no vertices, or no identity).
      let slivers = 0
      const thickness = (rg) => {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
        for (const q of rg) { if (q[0]<x0)x0=q[0]; if (q[0]>x1)x1=q[0]; if (q[1]<z0)z0=q[1]; if (q[1]>z1)z1=q[1] }
        const diag = Math.hypot(x1 - x0, z1 - z0)
        return diag > 0 ? Math.abs(signedArea(rg)) / diag : 0
      }
      // ⭐ EACH POCKET ITS OWN FACE (`faceLobes`, Boz's ruling B (b)): a face ring pinched along its own edge (a collinear retrace)
      // is split into its lobes here, before anything reads it; each hole goes with the lobe that holds it. A ring that is neither
      // goes through as the boolean returned it.
      let pinched = 0, lobesMade = 0, retracesDropped = 0
      const faceList = []
      for (const f of D.faces) {
        const rg = D.rings[f.outer], lb = D.labels?.[f.outer], holes = f.holes.map(hi => ({ hr: D.rings[hi], hl: D.labels?.[hi] }))
        const L = (rg?.length >= 3 && lb) ? faceLobes(rg, lb) : null
        if (!L) { faceList.push({ rg, lb, holes }); continue }
        pinched++; lobesMade += L.lobes.length; retracesDropped += L.retraces
        const mine = L.lobes.map(() => [])
        for (const h of holes) {
          // read by the hole's vertices that lie on NO lobe's ring (exact, on the lattice); every one of them must name the same lobe
          const free = (h.hr || []).filter(p => !L.lobes.some(o => onRingExact(p, o.ring)))
          const by = [...new Set(free.map(p => L.lobes.findIndex(o => pointInRing(p[0], p[1], o.ring))))]
          if (by.length !== 1 || by[0] < 0) throw new Error(`[①] ⛔ a hole of a pinched face (at ${h.hr?.[0]?.map(v => v.toFixed(3)).join(', ')}) is read in ${by.filter(q => q >= 0).length} of its ${L.lobes.length} lobes by its ${free.length} vertex(es) off every lobe ring (want exactly 1). Refusing.`)
          mine[by[0]].push(h) }
        L.lobes.forEach((o, q) => faceList.push({ rg: o.ring, lb: o.labels, holes: mine[q] })) }
      if (pinched) console.log(`    [①] ${pinched} face ring(s) pinched along their own edge (a retrace), split into ${lobesMade} face(s); ${retracesDropped} zero-width retrace(s) dropped (faceLobes)`)
      for (const { rg, lb, holes } of faceList) {
        // ⛔ NOT SILENT. A face the boolean returned but that carries fewer than 3 vertices or no
        // identity is a real state and must be countable — on town #2 nobody is looking.
        if (!(rg?.length >= 3) || !lb) { degenerate++; continue }
        if (thickness(rg) < eps) { slivers++; continue }
        // ⛔⛔ EVERY COMPONENT THAT TOUCHES THE FRAME IS ARTIFICIAL, not just the one holding the
        // corner. The frame is a construction convenience, so any face resting against it exists
        // only because we drew a rectangle — it is not a face of the street graph.
        // ⭐ Coincidence with the frame, at 1e-3 m — the frame is an EXACT input we chose, so this
        // is an identity test against a known line, not a tuned tolerance. Both tests are kept:
        // the corner test is the containment one, the frame test catches a component resting on
        // an edge without enclosing a corner. Under `asTree` the exterior is ONE face and its
        // holes leave with it, which is what removed the ghost block.
        // ⭐⭐⭐ THE OUTER ZONE IS A BLOCK. IT IS NOT DROPPED AND IT IS NOT A SEPARATE CLASS.
        // (Jacob, 2026-09-20) "each of the blue centerlines is *forbidden* from being a chain,
        // and instead is ringed polygon. At the bb, that uninterrupted polygon hits the bb and
        // merges there… it encounters the shore side of the split shoreline chain and joins
        // there too… thus creating one large continuous zone with the streets, grout, dead
        // ends, cul de sacs, etc etc etc already there."
        // ⇒ The bb edge, the street ink that runs off it, and the shoreline JOIN into one
        // closed path, and what it encloses is a COMPOUND FACE whose holes are the streets.
        // Nothing about it needs a special class: it is a block, and the streets inside it are
        // painted because ② offsets a block inward from ALL its edges, holes included.
        //
        // ⛔⛔ WHY THIS DOES NOT REPRODUCE THE SOLID-BLUE INCIDENT, and it is identity, not luck.
        // The old rule dropped this face because ② offset it and handed back a frame-sized curb
        // ring ("basically just wrecked survey interface"). ② reads a depth per edge from
        // `freezeCurbEdgeFacts`, which builds facts ONLY from `runs` — and runs come from the
        // chain world via `streetIdx`. A `__boundary__` or `__water__` edge has no run, so it
        // has NO FACT, and `depthAt` returns 0 for it. The zone's bb and shore edges are
        // therefore silent by construction; only its street-hole edges carry a measure.
        // ⭐ That is also why the face had to be dropped BEFORE the coast existed: with no
        // shoreline and no identity on the frame, the whole outer ring was anonymous.
        //
        // ⛔ Dropping it is what made a coast-facing dead end impossible to close: the region
        // the spur points into had already ceased to exist. Measured before this: 833 street
        // centreline points across 74 streets sat under an undifferentiated fill with no
        // pavement — "these are supposed to be streets."
        if (holdsCorner(rg)) outerZones++
        if (rg.some(touchesFrame)) keptOnEdge++
        // ⛔⛔ A HOLE IS WOUND OPPOSITE ITS OUTER AND MUST STAY THAT WAY. The outer is converted
        // below to the winding the consumer expects (blocks wound as ①'s holes, offset inward by
        // a POSITIVE depth); a hole of that face has to carry the opposite sign or the compound
        // path's fill is inverted. Converted HERE, once, at the source — this repo carries both
        // shoelace conventions and letting each consumer guess has already cost a day.
        const hs = [], hls = []
        for (const { hr, hl } of holes) {
          // ⛔ NO SILENT DROP. A hole with no identity cannot be offset at its authored width,
          // and dropping it would offset the face AS IF SOLID — a plausible-looking wrong curb,
          // which is the one outcome a kit may not have. Counted and reported by name.
          if (!(hr?.length >= 3) || !hl) { unlabelledHoles++; continue }
          // ⭐ labels are PER EDGE (label i names edge i→i+1), so a reversal ROTATES them, as the stroke code does
          if (signedArea(hr) < 0) { const l = [...hl].reverse(); l.push(l.shift()); hs.push([...hr].reverse()); hls.push(l) }
          else { hs.push(hr); hls.push(hl) }
        }
        if (signedArea(rg) > 0) { const l = [...lb].reverse(); l.push(l.shift()); blocks.push([...rg].reverse()); blockLabels.push(l) }
        else { blocks.push(rg); blockLabels.push(lb) }
        blockHoles.push(hs); blockHoleLabels.push(hls)
      }
      // ⛔⛔ THE EXIT ASSERT, THE RETRACE FAMILY'S ONE CHECK (Boz's ruling, 2026-10-27, after four moves in one night were each a
      // retrace caught one stage late): no INK ring and no FACE ring (outer or hole, after faceLobes) runs back over one of its
      // own edges, exact on the lattice (`ringRetraces`); refused by owner, at ①'s exit. A zero-width retrace is two faces (or no
      // ink), never one. ⛔ A one-vertex TOUCH is not a retrace (Boz's (b): the census, BACKLOG). ⛔ And this does NOT catch a
      // NEAR-retrace that only becomes exact after absorbInk nodes the ink against the centrelines: absorbInk stays the backstop
      // for that, and refuses loudly. ▶ checks/claims-the-ink-never-retraces-itself.mjs
      { const own = (l) => { const o = owners[l]; return o ? `${o.skelId}${o.side ? ` ${o.side}` : ''}` : `label ${l}` }
        const bad = [...R.rings.map((r, k) => ({ what: `ink ring ${k}`, r, L: R.labels[k] })),
          ...blocks.flatMap((b, k) => [b, ...blockHoles[k]].map((r, h) => ({ what: `block ${k} ${h ? `hole ${h - 1}` : 'outer'}`, r, L: h ? blockHoleLabels[k][h - 1] : blockLabels[k] })))]
          .map(x => ({ ...x, o: ringRetraces(x.r) })).filter(x => x.o.length)
        if (bad.length) { const x = bad[0], o = x.o[0]
          throw new Error(`[①] ⛔ ${bad.length} ring(s) retrace their own edge in the opposite direction at ①'s exit — ${x.what}, edges ${o.i} (${own(x.L?.[o.i])}) and ${o.j} (${own(x.L?.[o.j])}), ${o.m.toFixed(3)} m at (${x.r[o.i].map(v => v.toFixed(3)).join(', ')}). Refusing.`) } }
      const withHoles = blockHoles.filter(h => h.length).length
      if (outerZones) console.log(`    [①] ${outerZones} OUTER ZONE face(s) kept as blocks — the bb + coast + street ink close into one continuous zone; its streets are its holes and are painted from them.`)
      if (keptOnEdge) console.log(`    [①] kept ${keptOnEdge} face(s) touching the frame EDGE without a corner — real land the rectangle merely truncates; the stamp cuts them.`)
      if (degenerate) console.warn(`    ⛔ [①] ${degenerate} face(s) came back degenerate (<3 vertices or no identity) and are NOT blocks — reported, not hidden.`)
      if (slivers) console.warn(`    ⛔ [①] ${slivers} face(s) are THINNER THAN ε (${eps} m) and are NOT blocks — a region the ink cannot have made, dropped as a boolean residue. Counted, never silent.`)
      console.log(`    [①] ${blocks.length} block face(s); ${withHoles} carry hole(s) (a compound face — outer + its holes, carried together)`)
      if (unlabelledHoles) console.warn(`    ⛔ [①] ${unlabelledHoles} hole(s) came back with NO identity — those faces would be offset as if SOLID. NOT trustworthy.`)
      // ⭐⭐ THE INK IS ABSORBED HERE, AT THE MINT'S EXIT (absorbInk.js): each face's PAINTED boundary, the ε strip cut along the
      // centrelines and spliced into the face that owns it. ② keeps reading `blocks` (the un-absorbed face); the tiles paint
      // from `paint`. Frozen beside the faces.
      const absorbIn = { inkRings: R.rings, inkLabels: R.labels, frame: rect, frameOwner: bIdx, waterRings: Array.isArray(coast) ? coast : [], waterOwner: wIdx,
        centrelines, spokes, outlineRefused, faces: blocks.map((_, k) => ({ ring: blocks[k], labels: blockLabels[k], holes: blockHoles[k], holeLabels: blockHoleLabels[k] })), owners }
      // a refusal hands its inputs (and the faces' rings) to the caller's diagnostic, when it asked for one, then stands
      try { absorbed = absorbInk(absorbIn) } catch (e) { if (onAbsorbRefusal) onAbsorbRefusal({ ...absorbIn, blocks, blockHoles, error: e.message }); throw e }
    } else if (D.refused) {
      console.warn(`    ⛔ [①] BLOCK SUBTRACTION REFUSED (${D.refused}) — falling back to ①'s HOLES, which LOSE every block the circle cuts. Rim geometry from this pour is NOT trustworthy.`)
    }

    return { rings: R.rings, labels: R.labels, owners, refused: R.refused, chainRings: rings.length,
             crossings: R.crossings, stencilled: false, boundaryOwner: bIdx, blocks, blockLabels,
             blockHoles, blockHoleLabels, boundaryRing: bRing,
             // ⭐ Carried so the painter can SHADE the water. ⛔ Not a hole and not a gap —
             // "360 degrees of circle filled with map"; a blank here would be the absence the
             // rim doctrine forbids.
             waterRings: (Array.isArray(coast) && coast.length) ? coast.map(r => r.map(p => [p[0], p[1]])) : null,
             nodes, centrelines, outlineRefused: outlineRefusedRec, offGradeSpans: split.spans, endsInWater: split.endsInWater, ...(absorbed ? { paint: absorbed.paint, inkCells: absorbed.cells } : {}), eps }
  }
  return { rings: R.rings, labels: R.labels, owners, refused: R.refused, chainRings: rings.length, crossings: R.crossings, stencilled: false, nodes, centrelines, outlineRefused: outlineRefusedRec, offGradeSpans: split.spans, endsInWater: split.endsInWater, eps }
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
// ⭐ `payload` (H-3 step 3, OPT-IN): `{ subject: [[per-vertex value]], clip: [[…]] }`. When given, Z is an
// index into a record of (label, value) instead of the bare label, so each SURVIVING input vertex carries
// its value through the boolean — by construction, never recovered from coordinates afterwards — and the
// result gains `payloads` (null at a minted crossing). ⛔ Callers that pass nothing take the unchanged
// path: Z = label + 1 exactly as before, so their output is byte-identical.
// ⭐ A FACE PINCHED ALONG ITS OWN EDGE IS TWO FACES (Boz's ruling B, narrowed to (b), 2026-10-27). `booleanLabelled` runs with
// ioPreserveCollinear and without StrictlySimple, so where the water lies ALONG a frame edge for a stretch with land either side
// of it, Clipper hands back ONE outer ring: the two land pockets joined by a zero-width double-back along the frame (PTown's
// east edge: the frame edge down 108.7 m, the water edge back up 91.0 m of it). Each pocket is a face of its own.
// The ring is split exactly, on the lattice: every vertex of the ring lying strictly inside another of its edges is inserted
// into that edge (so the retrace's ends become shared vertices), then the ring is cut into its loops at each repeated vertex.
// A loop of zero area is the retrace itself and is dropped (counted). Labels are POSITIONAL (label i names edge i→i+1): an
// inserted vertex takes the label of the edge it splits, and every loop keeps its own edges' labels.
// ⛔ ONLY A RETRACE SPLITS (Boz's (b)): a ring that merely touches itself at one vertex is NOT split — absorbInk accepts it, and
// whether such a lobe is a face of its own is an open question (BACKLOG census: LS #327, PTown #40). And a ring with a retrace
// is cut ONLY at the retrace's own vertices (the ends of an edge whose reverse is also in the ring): a one-vertex touch elsewhere
// on it stays inside its lobe, so whether a touch is cut never depends on a retrace somewhere else (Zob's read, 2026-10-27).
// → null when the ring has no retrace (the caller keeps the ring as it was, byte for byte), else
//   { lobes: [{ ring, labels }], retraces: n }. ⛔ A lobe wound against the ring refuses by name: it would be a hole, not a pocket.
export function faceLobes(ring, labels, who = '①') {
  if (!ringRetraces(ring).length) return null
  const n = ring.length, I = ring.map(p => [Math.round(p[0] * SCALE), Math.round(p[1] * SCALE)])
  const G = 50 * SCALE, cells = new Map(), cellOf = (x, z) => Math.floor(x / G) + ',' + Math.floor(z / G)
  I.forEach((p, k) => { const c = cellOf(p[0], p[1]); (cells.get(c) || cells.set(c, []).get(c)).push(k) })
  const ins = new Map()   // edge i → [{ k, t }] the ring's own vertices strictly inside it
  for (let i = 0; i < n; i++) { const a = I[i], b = I[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    if (!L2) continue
    for (let gx = Math.floor(Math.min(a[0], b[0]) / G); gx <= Math.floor(Math.max(a[0], b[0]) / G); gx++)
      for (let gz = Math.floor(Math.min(a[1], b[1]) / G); gz <= Math.floor(Math.max(a[1], b[1]) / G); gz++)
        for (const k of cells.get(gx + ',' + gz) || []) { const v = I[k]
          if ((v[0] === a[0] && v[1] === a[1]) || (v[0] === b[0] && v[1] === b[1])) continue
          if (dx * (v[1] - a[1]) - dz * (v[0] - a[0]) !== 0) continue
          const t = dx * (v[0] - a[0]) + dz * (v[1] - a[1]); if (t <= 0 || t >= L2) continue
          (ins.get(i) || ins.set(i, []).get(i)).push({ k, t }) } }
  const E = []
  for (let i = 0; i < n; i++) { E.push({ p: ring[i], q: I[i], lab: labels[i] })
    const S = ins.get(i); if (!S) continue
    const seen = new Set(); S.sort((u, v) => u.t - v.t)
    for (const { k } of S) { const key = I[k][0] + ',' + I[k][1]; if (seen.has(key)) continue; seen.add(key); E.push({ p: ring[k], q: I[k], lab: labels[i] }) } }
  const keyOf = (e) => e.q[0] + ',' + e.q[1]
  const dir = new Set(E.map((e, i) => keyOf(e) + '>' + keyOf(E[(i + 1) % E.length]))), R = new Set()
  E.forEach((e, i) => { const a = keyOf(e), b = keyOf(E[(i + 1) % E.length]); if (dir.has(b + '>' + a)) { R.add(a); R.add(b) } })
  const loops = [], stack = [], at = new Map()
  for (const e of E) { const k = keyOf(e)
    if (at.has(k)) { const loop = stack.splice(at.get(k)); for (const u of loop) at.delete(keyOf(u)); loops.push(loop) }
    if (R.has(k)) at.set(k, stack.length); stack.push(e) }
  if (stack.length) loops.push(stack)
  const area2 = (L) => L.reduce((t, e, i) => { const f = L[(i + 1) % L.length]; return t + e.q[0] * f.q[1] - f.q[0] * e.q[1] }, 0)
  const sign = Math.sign(area2(E)), lobes = []
  let retraces = 0
  for (const L of loops) { const a = area2(L)
    if (L.length < 3 || a === 0) { retraces++; continue }
    if (Math.sign(a) !== sign) throw new Error(`[${who}] ⛔ a face ring pinched at (${L[0].p.map(v => v.toFixed(3)).join(', ')}) has a loop wound AGAINST it (${(a / 2 / SCALE / SCALE).toFixed(3)} m²) — a hole carried in the outer ring, not a pocket. Refusing.`)
    lobes.push({ ring: L.map(e => e.p), labels: L.map(e => e.lab) }) }
  return { lobes, retraces }
}

// Exactly on a ring's boundary, on the lattice: the point lies on one of its edges (integer cross product 0, within the edge).
function onRingExact(p, ring) {
  const v = [Math.round(p[0] * SCALE), Math.round(p[1] * SCALE)]
  for (let i = 0; i < ring.length; i++) { const a = ring[i].map(c => Math.round(c * SCALE)), b = ring[(i + 1) % ring.length].map(c => Math.round(c * SCALE))
    const dx = b[0] - a[0], dz = b[1] - a[1]
    if (dx * (v[1] - a[1]) - dz * (v[0] - a[0]) !== 0) continue
    const t = dx * (v[0] - a[0]) + dz * (v[1] - a[1]); if (t >= 0 && t <= dx * dx + dz * dz) return true }
  return false
}

// The opposite-direction overlaps of a ring's own edges: [{ i, j, m }] for each pair of its edges lying on one line, overlapping by
// m metres, run in OPPOSITE directions (a zero-width retrace). The assert on every block ring after `faceLobes` reads this.
export function ringRetraces(ring) {
  const n = ring.length, I = ring.map(p => [Math.round(p[0] * SCALE), Math.round(p[1] * SCALE)]), out = []
  const G = 50 * SCALE, cells = new Map()
  for (let i = 0; i < n; i++) { const a = I[i], b = I[(i + 1) % n]
    for (let gx = Math.floor(Math.min(a[0], b[0]) / G); gx <= Math.floor(Math.max(a[0], b[0]) / G); gx++)
      for (let gz = Math.floor(Math.min(a[1], b[1]) / G); gz <= Math.floor(Math.max(a[1], b[1]) / G); gz++) { const c = gx + ',' + gz; (cells.get(c) || cells.set(c, []).get(c)).push(i) } }
  const done = new Set()
  for (const L of cells.values()) for (let x = 0; x < L.length; x++) for (let y = x + 1; y < L.length; y++) {
    const i = Math.min(L[x], L[y]), j = Math.max(L[x], L[y]), id = i + '|' + j; if (i === j || done.has(id)) continue; done.add(id)
    const a = I[i], b = I[(i + 1) % n], c = I[j], d = I[(j + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    if (!L2 || dx * (c[1] - a[1]) - dz * (c[0] - a[0]) !== 0 || dx * (d[1] - a[1]) - dz * (d[0] - a[0]) !== 0) continue
    const tc = dx * (c[0] - a[0]) + dz * (c[1] - a[1]), td = dx * (d[0] - a[0]) + dz * (d[1] - a[1])
    if (td >= tc) continue   // the same direction: a collinear run, not a retrace
    const lo = Math.max(0, td), hi = Math.min(L2, tc)
    if (hi > lo) out.push({ i, j, m: (hi - lo) / Math.sqrt(L2) / SCALE }) }
  return out
}

function booleanLabelled(clipType, subjectRings, subjectLabels, clipRings = [], clipLabels = null, carryEdges = false, asTree = false, payload = null) {
  // `carryEdges` may be `{ sameStroke(labA, labB) }` — the caller's own identity test, which the containment rule
  // needs because labels are opaque here. Any truthy value keeps the ledger on, as before.
  const sameStroke = typeof carryEdges === 'object' && carryEdges ? carryEdges.sameStroke : null
  // `preserveCollinear` (the ① mint only, both its booleans): an owner change on a straight run is a vertex by
  // construction. Without it Clipper drops every exactly-collinear vertex, labels and all, and two frontages merge.
  const keepCollinear = typeof carryEdges === 'object' && carryEdges ? !!carryEdges.preserveCollinear : false
  const { Clipper, PolyType, PolyFillType } = clipperLib
  const prev = clipperLib.use_xyz
  clipperLib.use_xyz = true
  let out = []
  let faces = null
  const recs = payload ? [] : null
  const labOfZ = (z) => (recs ? recs[z - 1].lab : z - 1)
  const enc = (p, lab, pay) => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE),
    Z: !Number.isInteger(lab) ? 0 : recs ? recs.push({ lab, pay: pay === undefined ? null : pay }) : lab + 1 })
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
  let segs = null, segGrid = null       // the input edges, for the containment rule (filled inside the try, carryEdges only)
  const SEG_CELL = 50 * SCALE           // their hash cell, in grid units; a lookup scans a 3×3 neighbourhood
  const mkey = (q) => q.X + ',' + q.Y
  try {
    const c = new Clipper(keepCollinear ? Clipper.ioPreserveCollinear : 0)
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
        const lab = bo.Z > 0 ? labOfZ(bo.Z) : (to.Z > 0 ? labOfZ(to.Z) : -1)
        if (lab < 0) continue
        const dx = to.X - bo.X, dy = to.Y - bo.Y, L = Math.hypot(dx, dy) || 1
        arr.push({ lab, dx: dx / L, dy: dy / L })
      }
    }
    // ⭐⭐ THE INPUT SEGMENTS, AS HANDED TO CLIPPER — for the containment rule on the output walk (carryEdges only).
    // Every input edge with its two endpoints (integer, Z-labelled exactly as encoded), hashed on a grid so an output
    // edge can ask which input edge it LIES ON. Carried, not recovered: these are the operands of this boolean.
    // ⛔ OPT-IN, like the ledger's other extensions (`ROADMAP A18`): only a caller that passes `sameStroke` (the ①
    // mint) gets the containment rule, so ②'s differences and every other caller are byte-identical by construction.
    segs = sameStroke ? [] : null; segGrid = sameStroke ? new Map() : null
    const addSegs = (ring, L) => { const e = ring.map((p, i) => enc(p, Array.isArray(L) ? L[i] : L)), n = e.length
      for (let i = 0; i < n; i++) { const a = e[i], b = e[(i + 1) % n], id = segs.push({ a, b }) - 1
        const x0 = Math.floor(Math.min(a.X, b.X) / SEG_CELL), x1 = Math.floor(Math.max(a.X, b.X) / SEG_CELL)
        const y0 = Math.floor(Math.min(a.Y, b.Y) / SEG_CELL), y1 = Math.floor(Math.max(a.Y, b.Y) / SEG_CELL)
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; let c = segGrid.get(k); if (!c) segGrid.set(k, c = []); c.push(id) } } }
    let s = 0
    for (let k = 0; k < subjectRings.length; k++) {
      const r = subjectRings[k]; if (!r || r.length < 3) continue
      const L = subjectLabels?.[k], PL = payload?.subject?.[k]
      if (segs) addSegs(r, L)
      c.AddPath(r.map((p, i) => enc(p, Array.isArray(L) ? L[i] : L, PL?.[i])), PolyType.ptSubject, true); s++
    }
    if (!s) return { rings: [], labels: [], refused: null }
    for (let k = 0; k < clipRings.length; k++) {
      const r = clipRings[k]; if (!r || r.length < 3) continue
      const L = clipLabels?.[k], PL = payload?.clip?.[k]
      if (segs) addSegs(r, L)
      c.AddPath(r.map((p, i) => enc(p, Array.isArray(L) ? L[i] : L, PL?.[i])), PolyType.ptClip, true)
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
  const payloads = recs ? out.map(p => p.map(q => (q.Z ? recs[q.Z - 1].pay : null))) : undefined
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
  // ⭐⭐⭐ THE CONTAINMENT RULE — a SURVIVING vertex's label names the edge leaving it ONLY IF that edge lies on one of
  // the vertex's OWN input edges. (Gantry, 2026-09-24; `claims-every-proto-edge-lies-on-its-owner`.) Where chain X ENDS
  // on Y's stroke at a shallow angle, X's butt-corner vertex lies on Y's ε boundary and survives the union with X's
  // label — and the output edge leaving it runs along Y (provincetown: 14.49 m of snail-road stamped trunk-link-28;
  // LS: 322.6 m of truman-parkway-0 stamped secondary-link-45). Such an edge takes the owner of the input edge it
  // LIES ON — the Z of that input edge's endpoint BEHIND the output edge's start (the end the walk would have entered
  // it by). No angle and no orientation assumption: `on` is containment on the integer grid (2 units), and "behind"
  // is the sign of a dot product. ⛔ No such input edge, or two with different owners ⇒ the vertex's
  // label is LEFT AS IT WAS and COUNTED as `containment.unresolved`, which the mint prints by number — this rule changes
  // only a label it can name.
  const onSeg = (q, a, b) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy; if (!L2) return false
    const t = (q.X - a.X) * dx + (q.Y - a.Y) * dy; if (t < -2 * Math.sqrt(L2) || t > L2 + 2 * Math.sqrt(L2)) return false
    return Math.abs((q.X - a.X) * dy - (q.Y - a.Y) * dx) / Math.sqrt(L2) <= 2 }
  const segsNear = (q) => { const cx = Math.floor(q.X / SEG_CELL), cy = Math.floor(q.Y / SEG_CELL), ids = new Set()
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const id of segGrid.get(x + ',' + y) || []) ids.add(id)
    return [...ids].map(id => segs[id]) }
  // the output edge v→q: does it lie on one of v's OWN input edges (an input edge with v's Z at an end, through v)?
  const ownEdge = (v, q) => segsNear(v).some(sg => ((sg.a.Z === v.Z && sg.a.X === v.X && sg.a.Y === v.Y) || (sg.b.Z === v.Z && sg.b.X === v.X && sg.b.Y === v.Y))
    && onSeg(q, sg.a, sg.b) && (() => { const e = (sg.a.X === v.X && sg.a.Y === v.Y) ? sg.b : sg.a; return (q.X - v.X) * (e.X - v.X) + (q.Y - v.Y) * (e.Y - v.Y) > 0 })())
  // the owner of the input edge the output edge v→q lies on: its endpoint BEHIND v (dot < 0), or at v
  const containingOwner = (v, q) => { const own = new Set()
    for (const sg of segsNear(v)) { if (!sg.a.Z || !sg.b.Z) continue; if (!onSeg(v, sg.a, sg.b) || !onSeg(q, sg.a, sg.b)) continue
      const dq = [q.X - v.X, q.Y - v.Y], back = [sg.a, sg.b].filter(e => (e.X - v.X) * dq[0] + (e.Y - v.Y) * dq[1] <= 0)
      if (back.length !== 1) continue
      own.add(labOfZ(back[0].Z)) }
    return own.size === 1 ? [...own][0] : -1 }
  // the owner of the ONE input edge containing the output edge v→q, read as that edge's own label — its START in input
  // order (`segs` keeps a→b as handed to Clipper), so the answer does not depend on which way the output walks it
  const inputEdgeOwner = (v, q) => { const own = new Set()
    for (const sg of segsNear(v)) { if (!sg.a.Z || !sg.b.Z) continue; if (onSeg(v, sg.a, sg.b) && onSeg(q, sg.a, sg.b)) own.add(labOfZ(sg.a.Z)) }
    return own.size === 1 ? [...own][0] : -1 }
  // v's own input edges, by its Z and position: the one LEAVING v that q lies ahead on; the labels of those ARRIVING at v
  const atV = (e, v) => e.Z === v.Z && e.X === v.X && e.Y === v.Y
  const ownLeaving = (v, q) => segsNear(v).some(sg => atV(sg.a, v) && onSeg(q, sg.a, sg.b) && (q.X - v.X) * (sg.b.X - v.X) + (q.Y - v.Y) * (sg.b.Y - v.Y) > 0)
  const ownArriving = (v, q) => new Set(segsNear(v).filter(sg => atV(sg.b, v) && sg.a.Z && onSeg(q, sg.a, sg.b) && (q.X - v.X) * (sg.a.X - v.X) + (q.Y - v.Y) * (sg.a.Y - v.Y) > 0).map(sg => labOfZ(sg.a.Z)))
  let containReassigned = 0, containRefused = 0, walkedBack = 0, walkedBackRefused = 0
  for (const p of out) {
    const raw = p.map(q => (q.Z ? labOfZ(q.Z) : -1))      // -1 = a crossing
    // ⛔ `raw` itself is NOT rewritten: it is what the vertex CONTRIBUTED, and the crossings before it inherit from
    // that (the edge a crossing leaves toward X's butt corner does run along X). Only this vertex's own leaving
    // edge takes the containing owner — measured: rewriting `raw` broke 22 correct LS labels upstream of it.
    const fix = new Map()                                  // surviving vertex i → the containing owner (−1: none)
    if (segs) for (let i = 0; i < raw.length; i++) {
      if (raw[i] < 0) continue
      const q = p[(i + 1) % raw.length]
      if (Math.abs(q.X - p[i].X) + Math.abs(q.Y - p[i].Y) <= 2) continue   // a zero-length edge has no direction to own
      // ⭐⭐ A VERTEX WALKED BACKWARD. A difference walks its clip rings against their input direction, so the output edge
      // v→q lies on v's ARRIVING input edge (prev→v), and v's own Z names the edge v LEFT in its input, the wrong one. Its
      // label is then that arriving edge's own (its start's Z), so every ① label names the edge leaving its vertex in
      // OUTPUT order, whatever direction the ring was walked. (The frame difference D; Zob read it in source.)
      // ⛔ Into `fix`, never `raw`: every minted vertex before it resolves off raw's ORIGINAL Z.
      if (!ownLeaving(p[i], q)) { const back = ownArriving(p[i], q)
        if (back.size === 1) { fix.set(i, [...back][0]); walkedBack++; continue }
        if (back.size > 1) { walkedBackRefused++; continue } }
      if (ownEdge(p[i], q)) continue
      const o = containingOwner(p[i], q)
      // ⛔ ONLY ACROSS STROKES: the defect is an edge running along ANOTHER chain. Where the containing edge is the
      // vertex's own chain (a tip, a self-overlap), the label is left exactly as it was — this rule does not re-rule it.
      if (o >= 0 && sameStroke(o, raw[i])) continue
      // no single containing edge ⇒ the label stays EXACTLY as it was, and is counted — this rule changes only what it
      // can name; it never hands the vertex to the crossing path (measured: that moved 2 correct labels' srcIdx)
      if (o < 0) { containRefused++; continue }
      fix.set(i, o); containReassigned++
    }
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
      if (raw[i] >= 0) { res[i] = fix.has(i) ? fix.get(i) : raw[i]; continue }
      // ⭐ A MINTED VERTEX'S EDGE LIES ON AN INPUT EDGE — take THAT edge's owner record FIRST. Both fallbacks below
      // name the right street side but an arbitrary VERTEX: the ledger reads the Z Clipper kept for the contributing
      // edge (either end of it), and the forward scan the NEXT surviving vertex's record (its leaving edge). A record
      // is one vertex's, so the wrong one carries the wrong `srcIdx` and `cap`. Only where exactly one input edge
      // contains the output edge (`inputEdgeOwner`); otherwise the ledger, then the scan, as before. ① only (`segs`).
      if (segs) { const c = inputEdgeOwner(p[i], p[(i + 1) % n]); if (c >= 0) { res[i] = c; continue } }
      const led = ownerLeaving(i)
      if (led >= 0) { res[i] = led; continue }
      let v = -1
      for (let k = 1; k <= n; k++) { const j = raw[(i + k) % n]; if (j >= 0) { v = j; break } }
      // ⭐ THE REFUSAL IS THE SHIPPED CONTRACT: a wholly-minted ring has no owner this function
      // can honestly name, so it says so and hands back `labels: null` — and the tile construction
      // branches on exactly that. Guessing an owner instead is what mislabelled the shipped bands.
      if (v < 0 && !carryEdges) return { rings, labels: null, refused: 'all-vertices-minted', faces, ...(recs ? { payloads } : {}) }
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
      if (!ok) return { rings, labels: null, refused: 'all-vertices-minted', faces, ...(recs ? { payloads } : {}) }
    }
    labs.push(res)
  }
  return { rings, labels: labs, refused: null, crossings, faces, ...(segs ? { containment: { reassigned: containReassigned, unresolved: containRefused, walkedBack, walkedBackRefused } } : {}), ...(recs ? { payloads } : {}) }
}
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
// ▶ node checks/claims-stamp-follows-the-edge.mjs
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

// ⭐⭐⭐ ② BY ①'s OWN RULE — "EXPAND EACH SEGMENT TO ITS OWN RECTANGLE AND UNITE" (`RIBBONS §1`), at the
// authored depth instead of ε. Jacob, 2026-09-24: yes. The block is ① MINUS every edge's DEPTH BAND:
//   · edge i's band is the quad from the edge to its offset line at [dS, dE] (a ramp stays a ramp);
//   · where two bands leave a gap — the vertex turns AWAY from the offset side — the gap is closed by the
//     region of that gap on the road side of BOTH offset lines. Where the two lines meet inside the gap that
//     is exactly the SHARP miter (the corner "full stop"); where they cannot — a width step at a vertex that
//     barely turns, whose lines meet kilometres away — it is the STEP, and nothing diverges. No limit, no
//     clamp: the gap itself bounds it.
// ⇒ Where a block is narrower than its two curbs the bands overlap and the curb goes to ZERO THERE —
// "self-intersection means the feature is gone" performed by construction, with no fill rule, no fold-spur
// pass and nothing to detect. The per-vertex miter it replaces (`offsetRingVariable`) had no step for a
// block collapsing: its self-union kept the lobe that crossed itself (pftNonZero fills winding −1), and a
// sliver narrower than its curbs threw ② outside the block altogether.
// ⭐ IDENTITY IS CARRIED, NOT RECOVERED: every side of edge i's band and wedge carries label i through
// `booleanLabelled`, so each ② edge comes out naming the ① edge it lies on (`edgeLabels`). A ② vertex is
// the corner of ① vertex v exactly when its two edges are ① edges v−1 and v; anywhere else — a width step,
// or where two non-adjacent bands met — it has no corner, `vtx` is null and the ease leaves it sharp.
// `outward` — a HOLE of a compound face: the band grows away from the hole and is UNITED with it.
// ▶ node checks/claims-the-curb-never-enters-the-road.mjs
const sameGridPt = (p, q) => Math.abs(Math.round(p[0] * SCALE) - Math.round(q[0] * SCALE)) <= 1 && Math.abs(Math.round(p[1] * SCALE) - Math.round(q[1] * SCALE)) <= 1
// ⭐⭐ THE WIDTH STEP TAPERS — Jacob, 2026-09-24: "taper". Where one street's authored width changes at a vertex
// (the same road, the same side, two widths — per-block authoring, `SURVEY §4`), the curb moves between the two at
// the Caltrans lane-widening rate we already cite, 10:1 (`references/` f-caltrans-terminal-widening-taper; [U] for a
// same-street change, as trunk-11 is marked). ⭐ ON THE WIDER BLOCK, FROM THE BOUNDARY: the narrower frontage keeps
// exactly its authored width everywhere, and the wider one reaches its own 10·|Δ| back from the boundary — both are
// the operator's widths, so the wider gives way. ⭐ A LEG SHORTER THAN ITS TAPER takes the taper over the whole leg,
// steeper, and is COUNTED with where and how steep (Jacob: option A) — never silently shortened.
// Built as a WORKING COPY of the ring: the wider leg is split where the taper ends and its pieces carry
// [start, end] depths, which the band construction draws as a ramp. Each piece keeps its ① edge, each original
// vertex its ① vertex; a split point is no corner. ⛔ ① itself is untouched.
const TAPER_RATE = 10                          // run : offset — Caltrans HDM 206.2(3) lane-widening, cited in references/
const roadOfSkel = (id) => String(id ?? '').replace(/-\d+$/, '')
function taperWorkingCopy(ringIn, depthOfIn, ownerOfIn, report = null, isHwyEdge = () => false, turnAt = null) {
  const ownerKeyIn = (i) => { const o = ownerOfIn(i); return o ? `${o.skelId}|${o.side}` : null }
  const ring = ringIn, depthOf = depthOfIn, ownerOf = ownerOfIn
  const n = ring.length, d = [], len = []
  for (let i = 0; i < n; i++) { d.push(depthOf(i)); const a = ring[i], b = ring[(i + 1) % n]; len.push(Math.hypot(b[0] - a[0], b[1] - a[1])) }
  // ⛔ the ROAD only, never `side`: side is relative to each chain's own direction, and two chains of one road can run
  // opposite ways (chouteau-avenue-0's left is chouteau-avenue-2's right). Two CONSECUTIVE edges of one block ring
  // lie on the same side of that road by construction.
  const street = (i) => { const o = ownerOf(i); return (o && !o.gradeSeparated && o.skelId && o.skelId !== '__boundary__') ? roadOfSkel(o.skelId) : null }
  const specs = Array.from({ length: n }, () => [])       // per edge: ramps { s0, covered, dn, dw, fromEnd }
  for (let v = 0; v < n; v++) {
    const a = (v - 1 + n) % n, b = v
    if (typeof d[a] !== 'number' || typeof d[b] !== 'number' || !(Math.abs(d[a] - d[b]) > 1e-9)) continue
    // ⭐ A WIDTH STEP is a width change where there is NO CORNER: the same road continuing, OR any vertex that turns
    // less than `FILLET_TURN_TOL` — the ruled line between a curve sample and a corner (a curved junction changes
    // street on a sample, and the ease never rounds a sample, so the corner would never absorb the change).
    const sa = street(a), sb = street(b)
    if (!sa || !sb) continue
    // ⛔ a CAP is not a width step: at a dead-end tip one chain's two SIDES meet (the same skelId, the side flipping),
    // and asymmetric authored widths there are the two sides of one street, not a change along it
    const oa = ownerOf(a), ob = ownerOf(b)
    if (oa.skelId === ob.skelId && oa.side !== ob.side) continue
    // the turn here is the vertex's sub-ink CLUSTER's (`subInkClusters`, handed in as `turnAt`, radians): an owner change
    // on a cluster's gentle vertex sits at the cluster's corner, never at a width step
    const P0 = ring[(v - 1 + n) % n], V0 = ring[v], N0 = ring[(v + 1) % n]
    const tv = turnAt ? turnAt(v) : Math.abs(Math.atan2((V0[0] - P0[0]) * (N0[1] - V0[1]) - (V0[1] - P0[1]) * (N0[0] - V0[0]), (V0[0] - P0[0]) * (N0[0] - V0[0]) + (V0[1] - P0[1]) * (N0[1] - V0[1])))
    if (sa !== sb && tv >= FILLET_TURN_TOL) continue
    const dn = Math.min(d[a], d[b]), dw = Math.max(d[a], d[b]), back = d[a] > d[b], L = TAPER_RATE * (dw - dn)
    // the wider LEG: edges of the wider street at the wider depth, walking away from v
    const sw = back ? sa : sb
    const leg = []; let tot = 0
    for (let k = 0; k < n && tot < L; k++) {
      const e = back ? (a - k + n) % n : (b + k) % n
      if (street(e) !== sw || d[e] !== dw) break
      leg.push({ e, s0: tot }); tot += len[e]
    }
    if (!leg.length || !(tot > 0)) continue
    const covered = Math.min(L, tot)
    if (report) { report.n++; if (covered < L - 1e-9) report.steep.push({ at: ring[v], rate: covered / (dw - dn), need: L, have: tot }) }
    for (const { e, s0 } of leg) specs[e].push({ s0, covered, dn, dw, fromEnd: back })
  }
  const W = [], D = [], E = [], V = []
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    if (!specs[i].length) { W.push(a); D.push(d[i]); E.push(i); V.push(i); continue }
    // breakpoints along the edge (t from a to b), at every taper end that falls inside it
    const ts = new Set([0, 1])
    for (const sp of specs[i]) { const t = (sp.covered - sp.s0) / len[i]; if (t > 0 && t < 1) ts.add(sp.fromEnd ? 1 - t : t) }
    if (specs[i].length > 1 && report) report.overlap++
    const at = (t) => { let best = null
      for (const sp of specs[i]) { const sdist = sp.s0 + (sp.fromEnd ? (1 - t) : t) * len[i]
        const val = sdist >= sp.covered ? sp.dw : sp.dn + (sp.dw - sp.dn) * sdist / sp.covered
        best = best == null ? val : Math.min(best, val) }
      return best }
    const T = [...ts].sort((x, y) => x - y)
    for (let k = 0; k < T.length - 1; k++) {
      W.push([a[0] + (b[0] - a[0]) * T[k], a[1] + (b[1] - a[1]) * T[k]])
      D.push([at(T[k]), at(T[k + 1])]); E.push(i); V.push(k === 0 ? i : null)
    }
  }
  return { ring: W, depth: D, e: E, v: V, hwy: E.map(e => !!isHwyEdge(e)), own: E.map(e => ownerKeyIn(e)) }
}

// ⭐⭐ THE RAMP-TERMINAL FLARE, DRAWN — one more pass on ②'s working copy (`r-ramp-terminal-flares`). Each frozen flare
// (derive's `rampTerminalFlares`: street/side/segOrd, node, toward, lateral, along, rate) names the town street that
// widens to receive a highway end wider than itself. Its working edges are found by IDENTITY (the ① owner of each
// working edge's original edge, `WC.e`), as a run leaving the flare's node ALONG ITS LEG (`toward`). ⛔ The run must
// reach the corner's station, or the node's edge carries another label and the flare is REFUSED (① attribution).
// The overhang is resolved with authoring: o = lateral − the street's resolved half-width (`hwOf`). Along the run the
// depth gains o out to the corner's station (`along`, the hold), then o → 0 over rate·o (10:1). Every station where
// that profile bends inside a working edge is a split: the new point has `v = null` (no corner) and keeps its edge's
// `e`, `hwy`, `own`; the pieces carry [start, end] depths ADDED to whatever depth the edge already had (a width-step
// taper's pair included). ⛔ ① is untouched. Every refusal, truncation and collision is disclosed by name.
export function flareWorkingCopy(WC, flares, ownerOfOrig, hwOf, disclosure) {
  let { ring, depth, e: E, v: V, hwy: H, own: O } = WC
  for (const f of flares) {
    const name = `${f.hwy}.${f.end} ${f.corner} → ${f.street} ${f.side}/${f.segOrd}`
    const n = ring.length, mine = (j) => { const o = ownerOfOrig(E[j]); return !!o && !o.gradeSeparated && o.skelId === f.street && o.side === f.side && o.segOrd === f.segOrd }
    const nOwn = E.reduce((c, _, j) => c + (mine(j) ? 1 : 0), 0)
    if (!nOwn) continue                                        // this ring does not carry the flare's street
    const lx = f.toward[0] - f.node[0], lz = f.toward[1] - f.node[1]
    let best = null
    for (let j = 0; j < n; j++) {
      if (!mine(j) || (nOwn < n ? mine((j - 1 + n) % n) : j > 0)) continue
      const run = []; for (let q = j, c = 0; mine(q) && c < n; q = (q + 1) % n, c++) run.push(q)
      const a = ring[run[0]], a2 = ring[(run[0] + 1) % n], b = ring[(run[run.length - 1] + 1) % n], b2 = ring[run[run.length - 1]]
      for (const [fwd, p, q] of [[true, a, a2], [false, b, b2]]) {
        if ((q[0] - p[0]) * lx + (q[1] - p[1]) * lz <= 0) continue
        const d = Math.hypot(p[0] - f.node[0], p[1] - f.node[1]); if (!best || d < best.d) best = { run, fwd, d } }
    }
    if (!best) { disclosure.noRun.add(name); continue }
    // ⛔ the corner's station is part of the frozen record; a record without it predates the draw — never read as 0
    if (!Number.isFinite(f.along)) { disclosure.misattributed.add(`${name}: the frozen record carries no \`along\` (poured before the draw) — re-pour`); continue }
    if (best.d > f.along) { disclosure.misattributed.add(`${name}: its run starts ${best.d.toFixed(1)} m from the node, past the corner (${(f.along ?? 0).toFixed(1)} m)`); continue }
    const o = f.lateral - hwOf(best.run[0], E)
    if (!(o > 0)) { disclosure.received.add(`${name} (the authored width receives it: o = ${o.toFixed(2)} m)`); continue }
    const H0 = (f.along ?? 0) + best.d, T = H0 + f.rate * o, ex = (x) => x <= H0 ? o : x < T ? o * (1 - (x - H0) / (T - H0)) : 0
    const seq = best.fwd ? best.run : [...best.run].reverse(), edits = new Map()
    let x = 0
    for (const j of seq) {
      if (x >= T) break
      const A = ring[j], B = ring[(j + 1) % n], len = Math.hypot(B[0] - A[0], B[1] - A[1]), x0 = x, x1 = x + len
      const st = [x0, ...[H0, T].filter(b => b > x0 && b < x1), x1]
      const tf = st.map(q => len > 0 ? (best.fwd ? (q - x0) / len : 1 - (q - x0) / len) : 0), xs = st.map(ex)
      if (!best.fwd) { tf.reverse(); xs.reverse() }
      edits.set(j, { tf, xs }); x = x1
    }
    if (x < T) disclosure.truncated.add(`${name}: the span ends ${x.toFixed(1)} m from the node, the flare wants ${T.toFixed(1)} m`)
    // rebuild the working copy with this flare's splits and extra depth
    const R = [], D = [], E2 = [], V2 = [], H2 = [], O2 = []
    for (let j = 0; j < n; j++) {
      const ed = edits.get(j)
      if (!ed) { R.push(ring[j]); D.push(depth[j]); E2.push(E[j]); V2.push(V[j]); H2.push(H[j]); O2.push(O[j]); continue }
      const A = ring[j], B = ring[(j + 1) % n], dj = depth[j]
      const base = (t) => Array.isArray(dj) ? dj[0] + (dj[1] - dj[0]) * t : dj
      for (let k = 0; k + 1 < ed.tf.length; k++) {
        const t0 = ed.tf[k], t1 = ed.tf[k + 1]
        R.push(k === 0 ? A : [A[0] + (B[0] - A[0]) * t0, A[1] + (B[1] - A[1]) * t0])
        const d0 = base(t0) + ed.xs[k], d1 = base(t1) + ed.xs[k + 1]
        D.push(d0 === d1 && !Array.isArray(dj) ? d0 : [d0, d1]); E2.push(E[j]); V2.push(k === 0 ? V[j] : null); H2.push(H[j]); O2.push(O[j])
      }
    }
    ring = R; depth = D; E = E2; V = V2; H = H2; O = O2
    disclosure.drawn.add(`${name}: +${o.toFixed(2)} m held ${H0.toFixed(1)} m, tapered over ${(T - H0).toFixed(1)} m`)
  }
  return { ring, depth, e: E, v: V, hwy: H, own: O }
}

const maxDepthOf = (seg) => seg.reduce((m, x) => Math.max(m, x.dS, x.dE), 0)
export function offsetRingByRects(ringIn, depthAtIn, outward = false, stamp = null, easeAt = null, idMap = null, ownerKeyOf = null, nose = null, turnAtSrc = null) {
  const nIn = ringIn.length
  if (nIn < 3) return []
  // ⭐ Every edge of ① is read as it is: the mint makes no sub-ink residue (strokes meet inside each other's ink,
  // BRIEF-the-ink-meets-inside-the-ink), so an edge shorter than the ink is wide is TRUE geometry (two crossings a few
  // mm apart) and is offset like any other. ⛔ The fold that dropped such edges here (and in `taperWorkingCopy`) is gone.
  const ring = ringIn, n = nIn
  // `idMap` — when the caller hands a WORKING COPY (a taper split an edge), each working edge/vertex names the
  // ① edge/vertex it came from; a split point names none. Depth is read by WORKING index, identity leaves by ①'s.
  // `idMap.water` — per WORKING edge, whether it is owned by the water (WATER_EDGE_SKEL), read by IDENTITY off the caller's own
  // owners. It decides a GEOMETRY question (the water join below), so every caller that strikes this ring passes the same flag,
  // labelled or not: ② and ③ build one corner (Zob, 2026-10-27). ⛔ A labelled offset without it refuses; `e`/`v` may be absent
  // (no working copy: the identity).
  const origE = ring.map((_, k) => (idMap?.e ? idMap.e[k] : k)), origV = ring.map((_, k) => (idMap?.v ? idMap.v[k] : k))
  if (idMap?.water && idMap.water.length !== n) throw new Error(`[tileGround][offsetRingByRects] ⛔ idMap.water names ${idMap.water.length} edge(s) for a ring of ${n}. Refusing.`)
  const depthAt = depthAtIn
  const ccw = (signedArea(ring) > 0) !== outward
  const seg = []
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n]
    let dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L
    const nx = ccw ? -dy : dy, ny = ccw ? dx : -dx
    const raw = depthAt(i)
    const dS = Math.max(0, (Array.isArray(raw) ? raw[0] : raw) || 0)
    const dE = Math.max(0, (Array.isArray(raw) ? raw[1] : raw) || 0)
    const P = [a[0] + nx * dS, a[1] + ny * dS], Q = [b[0] + nx * dE, b[1] + ny * dE]
    let ex = Q[0] - P[0], ey = Q[1] - P[1]; const eL = Math.hypot(ex, ey) || 1
    seg.push({ a, b, e: [dx, dy], dir: [ex / eL, ey / eL], nrm: [nx, ny], P, Q, dS, dE, eL })
  }
  const clips = []
  // ⭐ THE CONTRIBUTORS — every segment a ② edge can lie on, with the ① edge it belongs to and what it is:
  // 1 = a curb line (a band's inner edge, or a corner's miter line), 2 = the ① edge itself, 3 = a band's end cap.
  // ⭐ RINGS ONLY when no caller can read a label: the labels leave only through `stamp`, and only `easeAt` turns them
  // into geometry (the ease reads each corner's ① vertex). Without both, the rings are B's rings through the area floor
  // and `mergeGrid`, which merges by grid point alone, so skipping the labelling leaves them byte-identical (③'s strikes
  // and its capacity guard, which keep only the rings or only their count).
  const labelled = !!(stamp || easeAt)
  // ⛔ a labelled offset pools its contributors BY OWNER (`labelOf`), so it must be told whose each ① edge is
  if (labelled && !Array.isArray(idMap?.water)) throw new Error('[tileGround][offsetRingByRects] ⛔ a labelled offset needs `idMap.water` (per edge: owned by the water?): the water join is decided by identity, and a caller that cannot say builds another corner. Refusing.')
  if (labelled && typeof ownerKeyOf !== 'function') throw new Error('[tileGround][offsetRingByRects] ⛔ a labelled offset needs `ownerKeyOf` (① edge → skelId|side|segOrd): its edges take an OWNER, never a guess. Refusing.')
  const contrib = []
  const addSeg = (a, b, lab, kind) => { if (labelled && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) contrib.push({ a, b, lab, kind }) }
  // one orientation for every band, or two overlapping bands of opposite winding would CANCEL (NonZero)
  const clipOwn = [], clipD = []   // per clip, the reduced edge(s) it is struck from ([i] an edge's band, [ia, i] the join at vertex i), and a band's depths at its two ends
  const addClip = (poly, own = null, d = null) => {
    if (poly.length < 3 || !(Math.abs(signedArea(poly)) > 1e-12)) return
    clips.push(clipperLib.Clipper.Orientation(poly.map(toClipper)) === true ? poly : [...poly].reverse()); clipOwn.push(own); clipD.push(d)
  }
  let wedges = 0, bevels = 0
  // ⭐⭐ SHARED JOINS (BRIEF-the-ink-meets-inside-the-ink §5d; Zob's rules, 2026-10-25). Each vertex's join is computed ONCE
  // and both bands that meet there are built FROM it, so a corner point is one float and rounds to one lattice point. Built
  // apart, a band's own corner and the join's copy of it rounded apart: at a shallow miter four near-collinear lattice edges
  // crossed mm apart out of order (HPDM, a 2 mm zigzag), and two caps of one line lay a sub-step apart, a slit read as a
  // needle (JH, 3.96 m). In exact arithmetic the union is the same polygon.
  //   • ONE JOIN FOR EVERY CORNER, whichever way it turns. Where the two curb lines MEET INSIDE THE CORNER (between the two
  //     bands' end caps) the join is their SHARP MITER, the corner "full stop" the ease rounds; where they cannot (nearly
  //     parallel lines, a width change at a vertex that barely turns, a tip that turns straight back) it is the CHORD
  //     between the two bands' ends. ⭐ "Between the caps" is THE test: X is never behind A's start nor past S's end (HPDM
  //     w12: a miter 46.5 m away, 14.8 band-lengths behind a 2.9 m band, was used while a cone test decided).
  //   • GAP (tA > 1, tS < 0: the lines meet past both bands' ends): both bands run on to X (rect ∪ the miter's triangle, exact).
  //   • OVERLAP (tA ≤ 1, tS ≥ 0): a band stops at X only where the corner that drops lies inside the other band's rect, else it
  //     is kept whole (a short band beside a deep one would leave a sliver of ground); the rects cover the corner, so no join
  //     piece. Any other X (past one band only) keeps today's miter piece [v, A.Q, X, S.P].
  //   • CHORD: the triangle [v, A.Q, S.P], whose points ARE the bands' own.
  // ⭐ a HIGHWAY-owned edge's depth is a placeholder strictly inside H (the H-3 difference puts the real edge on H's boundary),
  // so a chord to it would leave a notch of block the difference never removes. There the town curb line runs on to the miter,
  // past the caps if it must, and H trims it: the sharp town↔highway corner H-3 rules for. Exempt from the extent test, said.
  const inRect = (q, T) => { const C = [T.a, T.b, T.Q, T.P]; let pos = false, neg = false
    for (let k = 0; k < 4; k++) { const a = C[k], b = C[(k + 1) % 4], c = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]); if (c > 0) pos = true; if (c < 0) neg = true }
    return !(pos && neg) }
  const J = seg.map((S, i) => {
    const A = seg[(i - 1 + n) % n], v = ring[i], ia = (i - 1 + n) % n
    if (!(A.dE > 0 || S.dS > 0)) return null
    const turn = A.e[0] * S.e[1] - A.e[1] * S.e[0]
    if (!(Math.abs(turn) > 1e-12)) return null                     // straight on: the two bands abut exactly
    const det = A.dir[0] * S.dir[1] - A.dir[1] * S.dir[0]
    let X = null, kind = 'chord', J_t = [NaN, NaN]
    if (Math.abs(det) > 1e-12) {
      const t = ((S.P[0] - A.Q[0]) * A.dir[1] - (S.P[1] - A.Q[1]) * A.dir[0]) / det
      const Xc = [S.P[0] + S.dir[0] * t, S.P[1] + S.dir[1] * t], u = [Xc[0] - v[0], Xc[1] - v[1]]
      const tA = ((Xc[0] - A.P[0]) * A.dir[0] + (Xc[1] - A.P[1]) * A.dir[1]) / A.eL, tS = ((Xc[0] - S.P[0]) * S.dir[0] + (Xc[1] - S.P[1]) * S.dir[1]) / S.eL
      const hwyJoin = idMap?.hwy && (idMap.hwy[ia] || idMap.hwy[i])
      // ⭐ THE MITER, BY ONE CRITERION (Boz's ruling, Zob's form, 2026-10-25): X between the caps (never behind A's start nor
      // past S's end) and the miter piece [v, A.Q, X, S.P] SIMPLE: its opposite edges (v, A.Q) × (X, S.P) and (A.Q, X) ×
      // (S.P, v) do not properly cross (A.Q = v, a depth-0 edge, makes it a triangle, simple). Else the chord. It replaced a cone test (X between the two normals at v) that decided nothing else on the
      // captured joins (115 of 118 agree, scratch/splice/cone-vs-caps.mjs) and failed both ways on the other three: it took two
      // miters 8.6 and 14.8 band-lengths behind A's start, and refused by float noise on its own boundary (−0.0465) the one a
      // depth-0 edge needs, X on the ① edge itself (LS block 345, a 4.58 m × 46 mm sliver of ground left by the empty chord).
      // The simplicity is what the cone really guarded: a mixed X that would make the piece a bow-tie.
      // ⚠️ OPEN, not a regression: in the GAP case (tA > 1, tS < 0) tA is unbounded, so nearly parallel curb lines of unequal
      // depth can still meet far out; the extent test bounds only the overlap side.
      const crosses = (p1, p2, p3, p4) => { const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
        const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4); return d1 * d2 < 0 && d3 * d4 < 0 }
      const simple = ([q0, q1, q2, q3]) => !crosses(q0, q1, q2, q3) && !crosses(q1, q2, q3, q0)
      if (hwyJoin ? u[0] * (A.nrm[0] + S.nrm[0]) + u[1] * (A.nrm[1] + S.nrm[1]) > 0 : (tA >= 0 && tS <= 1 && simple([v, A.Q, Xc, S.P]))) { X = Xc
        kind = hwyJoin ? 'piece' : (tA > 1 && tS < 0) ? 'gap' : (tA <= 1 && tS >= 0) ? 'overlap' : 'piece'; J_t = [tA, tS] }
    }
    // ⭐ A DEPTH-0 NEIGHBOUR: SEEK X ALONG ITS RUN (Zob's read, Boz's ruling, 2026-10-27). Where one side is depth 0 (a water edge,
    // the coast) and the miter fails because that edge is SHORT (Huron, cleveland-road-east-0 at ① 11: a 0.22 m water sub-edge
    // after a coast bend put the miter behind its start), the curb line of the other side runs on — as hwyJoin's does — along
    // the depth-0 RUN (the edge and its same-owner depth-0 neighbours, walking away from v) to its FIRST crossing of ①'s line,
    // X, ON ①. The piece is [v, the run vertices passed, X, the band's end]; the water run then starts at X, on ①'s line.
    // ⛔ The chord was the defect: it contributed the deep band's END CAP as a kind-1 curb line under the WATER edge's label.
    if (!X && !(idMap?.hwy && (idMap.hwy[ia] || idMap.hwy[i]))) {
      // ⛔ SCOPED TO THE WATER, by identity (Boz's ruling (i), 2026-10-27): the defect is a kind-1 line under the WATER's label.
      // Every other depth-0 join stays as it was (HPDM ① v7 and PTown ① v42 built non-simple run pieces when this was general;
      // the general case is filed in the cut-separately census). The run is the water's: consecutive depth-0 water edges.
      const isWater = (k) => !!idMap?.water?.[k], z0 = (k) => !(seg[k].dS > 0) && !(seg[k].dE > 0)
      const aZ = z0(ia), sZ = z0(i)
      if (aZ !== sZ && isWater(aZ ? ia : i)) {
        // the curb line: from the deep band's end at v, away from v along its own direction
        const o = aZ ? S.P : A.Q, d = aZ ? [-S.dir[0], -S.dir[1]] : A.dir
        const hit = (a, b) => { const ex = b[0] - a[0], ey = b[1] - a[1], den = d[0] * ey - d[1] * ex; if (!(Math.abs(den) > 1e-15)) return null
          const s0 = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den, u0 = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den
          return s0 >= 0 && u0 >= 0 && u0 <= 1 ? [o[0] + d[0] * s0, o[1] + d[1] * s0] : null }
        const passed = [], passedIdx = []
        for (let step = 0, k = aZ ? ia : i; step < n; step++) { if (!z0(k) || !isWater(k)) break
          const a = ring[k], b = ring[(k + 1) % n]
          let h = hit(a, b)
          // ⭐ AN X WITHIN THE ROUNDING OF THE CURB LINE'S OWN START IS THAT START (Boz's ruling, 2026-10-28, the doctrine's one join rule:
          // latticeNode.js#NODE_BOUND, no new number). At a 90° corner where the depth-0 run lies along the band's normal, the start
          // (S.P / A.Q) sits ON the run, so X is found at it, 26 µm off (PTown, Fishermen's Wharf, ① v4696): the piece then
          // repeated a vertex, and the crossing test refused that degenerate TRIANGLE as "not simple". One point, so no repeat.
          if (h && Math.hypot(h[0] - o[0], h[1] - o[1]) * SCALE <= NODE_BOUND) h = o
          if (h) { const piece = (aZ ? [v, ...passed, h, S.P] : [v, A.Q, h, ...passed.slice().reverse()]).filter((p, j, P) => j === 0 || p !== P[j - 1])
            const pc = (p1, p2, p3, p4) => { const or = (x, y, z) => Math.sign((y[0] - x[0]) * (z[1] - x[1]) - (y[1] - x[1]) * (z[0] - x[0])); return or(p3, p4, p1) * or(p3, p4, p2) < 0 && or(p1, p2, p3) * or(p1, p2, p4) < 0 }
            let ok = true; for (let x = 0; x < piece.length && ok; x++) for (let y = x + 2; y < piece.length && ok; y++) { if (x === 0 && y === piece.length - 1) continue
              if (pc(piece[x], piece[(x + 1) % piece.length], piece[y], piece[(y + 1) % piece.length])) ok = false }
            if (!ok) throw new Error(`[tileGround][offsetRingByRects] ⛔ the join at ① vertex ${origV[i]} (${v.map(c => c.toFixed(3)).join(', ')}) runs on along its depth-0 run to (${h.map(c => c.toFixed(3)).join(', ')}), and the piece is not simple. Refusing.`)
            // ⭐ SNAPPED (X IS the curb line's start), the piece is exactly the passed stretch closed by X: [v, …passed, X] (aZ) or
            // [v, X, …passed reversed] (!aZ). Its passed ① vertices are CONSUMED: the band owns that stretch (Boz, Zob, 2026-10-28).
            return { X: h, kind: 'run', A, S, v, ia, i, tA: NaN, tS: NaN, piece, zSide: aZ ? 'A' : 'S', passed, consumed: h === o ? passedIdx : null } }
          passed.push(aZ ? a : b); passedIdx.push(aZ ? k : (k + 1) % n); k = aZ ? (k - 1 + n) % n : (k + 1) % n }
        // the curb line leaves the run without crossing it: the bands' own join decides (Boz) — no piece, no water vertex minted.
        // ⛔ Never the chord: at a depth-0 side its triangle is degenerate (A.Q or S.P is v) and all it adds is the deep band's
        // end cap as a kind-1 line under the depth-0 edge's owner, the defect itself
        return { X: null, kind: 'none', A, S, v, ia, i, tA: NaN, tS: NaN } } }
    return { X, kind, A, S, v, ia, i, tA: J_t[0], tS: J_t[1] }
  })
  // where band i starts and ends on its curb side: its own P / Q, or the shared X
  const startOf = (i) => { const j = J[i], S = seg[i]; if (!j?.X) return S.P
    return j.kind === 'gap' || (j.kind === 'overlap' && inRect(S.P, j.A)) ? j.X : S.P }
  const endOf = (i) => { const j = J[(i + 1) % n], A = seg[i]; if (!j?.X) return A.Q
    return j.kind === 'gap' || (j.kind === 'overlap' && inRect(A.Q, j.S)) ? j.X : A.Q }
  // ⭐ AND WHERE A BAND IS KEPT WHOLE, the join's X that lies INSIDE its curb segment is a vertex of it too (Zob, 2026-10-25):
  // collinear, so no area moves, and the shape that ends at X and the band that runs past it round X ONCE, shared, never as
  // two copies of one line (17 of the 118 captured joins: an overlap that stops one band or none, and the mixed piece).
  // ⛔ strictly between the band's ACTUAL ends (its P or Q, or the X it stops or runs on to), never past one: on a short band
  // stopped at X₁, a second join's X₂ beyond X₁ would make the clip double back [a, b, Q, X₂, X₁] (Zob).
  const onCurb = (i, P, Q) => { const at = [], js = J[i], je = J[(i + 1) % n]
    const lo = js?.X && P === js.X ? js.tS : 0, hi = je?.X && Q === je.X ? je.tA : 1
    for (const [j, t] of [[js, js?.tS], [je, je?.tA]])
      if (j?.X && t > lo && t < hi && j.X !== P && j.X !== Q) at.push({ X: j.X, t })
    return at.sort((u, w) => w.t - u.t).map(u => u.X) }                // from Q back toward P, the band's own order
  for (let i = 0; i < n; i++) {
    const S = seg[i]
    addSeg(S.a, S.b, i, 2)
    if (S.dS > 0 || S.dE > 0) { const P = startOf(i), Q = endOf(i)
      addClip([S.a, S.b, Q, ...onCurb(i, P, Q), P], [i], [S.dS, S.dE]); addSeg(P, Q, i, 1); addSeg(S.b, Q, i, 3); addSeg(S.a, P, i, 3) }
    const j = J[i]; if (!j) continue
    const { A, v, ia } = j
    if (j.X && j.kind === 'piece') { addClip([v, A.Q, j.X, S.P], [ia, i]); addSeg(A.Q, j.X, ia, 1); addSeg(j.X, S.P, i, 1) }
    // ⭐ a SNAPPED run's piece is its consumed stretch, taken out of the difference's ring below (ringB), so its clip would subtract
    // nothing: it is not added. ⛔ A run whose X is NOT the curb line's start keeps its clip: [v, …passed, X, S.P] still subtracts [v, X, S.P].
    else if (j.kind === 'run') { if (!j.consumed) addClip(j.piece, [ia, i]); if (j.zSide === 'A') addSeg(j.X, S.P, i, 1); else addSeg(A.Q, j.X, ia, 1) }
    else if (!j.X && j.kind !== 'none') { addClip([v, A.Q, S.P], [ia, i]); addSeg(A.Q, S.P, ia, 1); bevels++ }
    addSeg(v, A.Q, ia, 3); addSeg(S.P, v, i, 3); wedges++
  }
  // ⛔ UNITE THE BANDS FIRST, then subtract. One pass (the difference's own NonZero clip fill) leaves a zero-width
  // slit where two bands share an edge exactly — measured: a 23 m out-and-back spike at an LS highway join.
  // ⛔ ONE WINDING, WHICHEVER PATH (Swash's find, Boz's ruling, 2026-10-27): with no band to clip (every depth 0: an all-water
  // island block) the ring came back as ① wound it, CLOCKWISE, where the difference returns Clipper's positive outer — so
  // `piecesOfIA` read the island as a HOLE and painted no piece (Huron: 29 island tiles, 16,188 m²). Normalised once, by sign.
  // ⭐⭐ ONE OWNER PER STRETCH (Boz's direction, Zob's read, 2026-10-28): a snapped run's passed ① vertices are CONSUMED. The ring the
  // difference takes has them replaced by X, so ② reaches X along its own water edge and X→v is the band's own end edge, the same
  // points: nothing between two copies of one stretch is left to round into an antenna (PTown, Fishermen's Wharf: ① v4695 lay
  // 0.1 mm off the band's end edge S.P→v, and the lattice turned that sub-lattice sliver into an out-and-back on ②). Set-equivalent
  // to subtracting the piece, by topology instead of a boolean. ⛔ Valid only because the piece IS [v, …passed, X]: checked by its
  // vertex list, and two runs that consume one vertex refuse.
  const consumedAt = new Map()
  for (const j of J) { if (j?.kind !== 'run' || !j.consumed?.length) continue
    const want = j.zSide === 'A' ? [j.v, ...j.passed, j.X] : [j.v, j.X, ...j.passed.slice().reverse()]
    if (j.piece.length !== want.length || j.piece.some((p, x) => p !== want[x])) throw new Error(`[tileGround][offsetRingByRects] ⛔ a run piece that is not its passed stretch at ① vertex ${origV[j.i]}: the ring shortcut would drop land the band does not cover. Refusing.`)
    for (const k of j.consumed) { if (consumedAt.has(k)) throw new Error(`[tileGround][offsetRingByRects] ⛔ two run joins consume ① vertex ${origV[k]} (at ① vertices ${origV[consumedAt.get(k).i]} and ${origV[j.i]}): one stretch, two owners. Refusing.`)
      consumedAt.set(k, j) } }
  // each consumed run's FIRST vertex in ring order becomes its X; the rest are dropped
  const firstOf = new Map()
  for (const [k, j] of consumedAt) { const ks = j.consumed, first = j.zSide === 'A' ? ks[ks.length - 1] : ks[0]; if (k === first) firstOf.set(k, j.X) }
  const ringB = consumedAt.size ? ring.flatMap((p, k) => (consumedAt.has(k) ? (firstOf.has(k) ? [firstOf.get(k)] : []) : [p])) : ring
  const B = { rings: outward ? unionRings([ringB, ...clips]) : (clips.length ? differenceRings([ringB], unionRings(clips)) : [signedArea(ringB) < 0 ? [...ringB].reverse() : ringB.slice()]) }
  // ⭐ EACH ② EDGE TAKES THE OWNER IT LIES ON — among this block's OWN bands only (the known contributors; never a lookup
  // against other geometry). A contributor is a candidate where both the edge's ends lie within TOL (two grid steps) of its line;
  // what it covers of the edge is POOLED PER OWNER (skelId · side · segOrd, `ownerKeyOf`), because one owner's curb line
  // reaches a corner in pieces (the band line and its miter stub, or two ① edges of one frontage), and an edge that
  // straddles the join covers less than TOL of each piece. An owner TAKES the edge when its pooled cover exceeds TOL or
  // leaves less than half a grid step of the edge uncovered. A curb line outranks the ① edge, which outranks an end cap; among
  // owners of one kind the larger cover wins — the tie-break `SECTION §3.3` step 1 already uses.
  // ⭐ A BOUNDARY STUB TAKES THE EDGE THAT LEAVES IT. Where two owners meet, a stub a grid step or two long lies on both
  // lines and is covered by neither: with both its ends within TOL of each owner's end, it takes the owner of the ① edge
  // that LEAVES the boundary — the rule the sub-ε edges already follow above (the run keeps the edge that leaves it).
  // ⭐ An edge exactly TOL long that lies along its owner (float noise puts its overlap either side of TOL) is covered whole,
  // so it is the owner's by its cover. ⛔ Every distance here is from a lattice point to a FLOAT line (a band is ① offset by
  // a depth), so none is rounded onto the grid: rounding a 2.22 mm overlap to two steps moved a real corner (HPDM, 2026-10-17).
  // ⛔ Not the vertex Z: two bands share their corner points, so a surviving vertex names whichever band Clipper kept.
  const TOL = 2 / SCALE, HALF = 0.5 / SCALE, CELL = Math.max(1, 2 * maxDepthOf(seg))
  const grid = new Map(), gk = (x, y) => Math.floor(x / CELL) + ',' + Math.floor(y / CELL)
  contrib.forEach((c, id) => { const x0 = Math.floor(Math.min(c.a[0], c.b[0]) / CELL), x1 = Math.floor(Math.max(c.a[0], c.b[0]) / CELL)
    const y0 = Math.floor(Math.min(c.a[1], c.b[1]) / CELL), y1 = Math.floor(Math.max(c.a[1], c.b[1]) / CELL)
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) { (grid.get('*') || grid.set('*', []).get('*')).push(id); return }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; (grid.get(k) || grid.set(k, []).get(k)).push(id) } })
  const labelOf = (p, q) => {
    const ids = new Set([...(grid.get(gk((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) || []), ...(grid.get(gk(p[0], p[1])) || []), ...(grid.get('*') || [])])
    const ex = q[0] - p[0], ey = q[1] - p[1], eL = Math.hypot(ex, ey); if (!(eL > 0)) return null
    // first, a contributor the edge runs along by more than TOL on its own: the lowest kind, then the larger overlap
    let best = null
    for (const id of ids) { const c = contrib[id], dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L = Math.hypot(dx, dy)
      const off = (r) => Math.abs((r[0] - c.a[0]) * dy - (r[1] - c.a[1]) * dx) / L
      if (off(p) > TOL || off(q) > TOL) continue
      const tp = ((p[0] - c.a[0]) * dx + (p[1] - c.a[1]) * dy) / L, tq = ((q[0] - c.a[0]) * dx + (q[1] - c.a[1]) * dy) / L
      const ov = Math.min(L, Math.max(tp, tq)) - Math.max(0, Math.min(tp, tq))
      if (!(ov > TOL)) continue
      if (!best || c.kind < best.kind || (c.kind === best.kind && ov > best.ov)) best = { kind: c.kind, ov, lab: c.lab } }
    if (best) return best.lab
    const ux = ex / eL, uy = ey / eL, pool = new Map()
    for (const id of ids) { const c = contrib[id], dx = c.b[0] - c.a[0], dy = c.b[1] - c.a[1], L = Math.hypot(dx, dy)
      const off = (r) => Math.abs((r[0] - c.a[0]) * dy - (r[1] - c.a[1]) * dx) / L
      if (off(p) > TOL || off(q) > TOL) continue
      const sa = (c.a[0] - p[0]) * ux + (c.a[1] - p[1]) * uy, sb = (c.b[0] - p[0]) * ux + (c.b[1] - p[1]) * uy
      const s0 = Math.max(0, Math.min(sa, sb)), s1 = Math.min(eL, Math.max(sa, sb)); if (s1 < s0) continue
      const owner = ownerKeyOf(origE[c.lab]) ?? `① edge ${origE[c.lab]}`, k = c.kind + '|' + owner
      const e = pool.get(k) || pool.set(k, { kind: c.kind, iv: [], byLab: new Map(), ends: [] }).get(k)
      e.iv.push([s0, s1]); e.byLab.set(c.lab, (e.byLab.get(c.lab) || 0) + (s1 - s0)); e.ends.push(c.a, c.b) }
    if (!pool.size) return null
    const cands = [...pool.values()]
    for (const e of cands) { e.iv.sort((a, b) => a[0] - b[0]); let cov = 0, hi = -Infinity
      for (const [a, b] of e.iv) { if (a > hi) { cov += b - a; hi = b } else if (b > hi) { cov += b - hi; hi = b } }
      e.cov = cov; e.lab = [...e.byLab].sort((a, b) => b[1] - a[1])[0][0] }
    const take = cands.filter(e => e.cov > TOL || eL - e.cov < HALF).sort((a, b) => a.kind - b.kind || b.cov - a.cov)
    if (take.length) return take[0].lab
    const kind = Math.min(...cands.map(e => e.kind)), mine = cands.filter(e => e.kind === kind)
    if (mine.length !== 2) return null
    const atEnd = (e) => { let d = Infinity; for (const v of e.ends) d = Math.min(d, Math.max(Math.hypot(p[0] - v[0], p[1] - v[1]), Math.hypot(q[0] - v[0], q[1] - v[1]))); return d <= TOL }
    if (!mine.every(atEnd)) return null
    const [a, b] = [mine[0].lab, mine[1].lab]
    return (b - a + n) % n <= (a - b + n) % n ? b : a }
  if (labelled) B.labels = B.rings.map(rg => rg.map((p, j) => labelOf(p, rg[(j + 1) % rg.length])))
  if (stamp) { stamp.foldDropped = 0; stamp.wedges = wedges; stamp.bevels = bevels; if (B.refused) stamp.refused = B.refused }
  let maxD = 0; for (const x of seg) { if (x.dS > maxD) maxD = x.dS; if (x.dE > maxD) maxD = x.dE }
  const AREA_MIN = Math.max(0.5, maxD * maxD * 0.6)
  const outR = [], outE = [], outV = [], outA = [], easeArcs = []
  // ⛔ ONE POINT PER GRID POINT. Two bands' shared corner rounds to NEIGHBOURING grid points, and an arc's tangent
  // point can land on the vertex beside it: a 0–1 mm edge with no usable direction, which reads as a 90–180° turn
  // and gives the next inward strike no normal. Vertices within one Clipper grid step (1/SCALE) are the grid's own
  // rounding of ONE point: merged, keeping the edge that LEAVES the pair (a sub-grid edge owns nothing), the
  // corner it is part of, and its ① source. Run before the corner test and again after the ease.
  // ⭐ A DEPTH-0 EDGE CONTRIBUTES NO BAND: ITS LINE IS THE RING'S OWN (Boz's ruling, 2026-10-21). A vertex with depth 0 on
  // both its edges is not moved by the offset — it IS the input ring's vertex, a lattice point — so two such vertices a grid
  // step apart are two ends of a real edge (LS tile 47: motorway-27's 1 mm ② edge at (67.738→67.739, 381.187)), never one
  // point rounded twice. Merged, the depth line cut the corner off iA and `band(curbOuter, pedOuter)` painted the 3-vertex
  // curb needle the riser then stood a bare step on (#39's finger, 4 mm). They are kept.
  const unmoved = new Set()
  for (let i = 0; i < n; i++) { const A = seg[(i - 1 + n) % n], S = seg[i]; if (!(A.dE > 0) && !(S.dS > 0)) unmoved.add(ring[i][0] + ',' + ring[i][1]) }
  const isUnmoved = (p) => unmoved.has(p[0] + ',' + p[1])
  const mergeGrid = (R0, E0, V0, A0) => {
    const kR = [], kE = [], kV = [], kA = []
    for (let j = 0; j < R0.length; j++) {
      const L = kR.length
      if (L && sameGridPt(R0[j], kR[L - 1]) && !(isUnmoved(R0[j]) && isUnmoved(kR[L - 1]))) { kE[L - 1] = E0[j]; kV[L - 1] = kV[L - 1] ?? V0[j]; kA[L - 1] = kA[L - 1] ?? A0[j]; continue }
      kR.push(R0[j]); kE.push(E0[j]); kV.push(V0[j]); kA.push(A0[j])
    }
    while (kR.length > 3 && sameGridPt(kR[0], kR.at(-1)) && !(isUnmoved(kR[0]) && isUnmoved(kR.at(-1)))) { kV[0] = kV[0] ?? kV.at(-1); kA[0] = kA[0] ?? kA.at(-1); kR.pop(); kE.pop(); kV.pop(); kA.pop() }
    return { R: kR, E: kE, V: kV, A: kA }
  }
  const dropped = []   // the rings left out below for their size (a DISCLOSURE for the band-piece trace; nothing reads it to decide)
  for (let k = 0; k < B.rings.length; k++) {
    if (!(B.rings[k].length >= 3 && Math.abs(signedArea(B.rings[k])) > AREA_MIN)) { if (B.rings[k].length >= 3) dropped.push(B.rings[k]); continue }
    const g0 = mergeGrid(B.rings[k], (B.labels?.[k] || []).map(x => (Number.isInteger(x) && x >= 0 && x < n) ? x : null), B.rings[k].map(() => null), B.rings[k].map(() => null))
    if (g0.R.length < 3) continue
    if (!labelled) { const g1 = mergeGrid(g0.R, g0.E, g0.V, g0.A); if (g1.R.length >= 3) outR.push(g1.R); continue }
    const rg = g0.R, el = g0.E
    const m = rg.length
    // the ① vertex this ② vertex is the corner OF — only where its two edges are two consecutive ① edges
    // the ① vertex a ② corner is the corner OF. Two consecutive ① edges: the vertex between them. Where ① edges were
    // SWALLOWED between them (a leg shorter than the corner's setback lies wholly inside the next band), the corner is
    // the one swallowed vertex where the OWNER changes — "a run seam is a CORNER" (`SECTION`, the leg rule). None, or
    // more than one (two far-apart edges meeting across a collapsed neck), is no single corner: sharp, as ruled.
    const own = (r) => (idMap?.own ? idMap.own[r] : null)
    const seamBetween = (from, to) => {                 // walk reduced vertices from+1 … to, forward in ring order
      let hit = null, cnt = 0
      for (let r = (from + 1) % n; ; r = (r + 1) % n) { if (own((r - 1 + n) % n) !== own(r)) { hit = r; cnt++ } if (r === to) break }
      return cnt === 1 ? origV[hit] : null
    }
    const vs = rg.map((_, j) => {
      const a = el[(j - 1 + m) % m], b = el[j]
      if (a == null || b == null || a === b) return null
      if ((b - a + n) % n === 1) return origV[b]
      if ((a - b + n) % n === 1) return origV[a]
      if (!idMap?.own) return null
      const fwd = (b - a + n) % n, bwd = (a - b + n) % n
      return fwd <= bwd ? seamBetween(a, b) : seamBetween(b, a)
    })
    let R2 = rg, E2 = el, V2 = vs, A2 = rg.map(() => null)
    if (easeAt) {
      const arcs = []
      const e = easeContour(rg, (j) => easeAt(vs[j]) || 0, el, arcs, vs, nose, turnAtSrc)
      // ⭐ an arc's id is its index in `easeArcs` — unique across every ring, so a boolean that merges rings cannot make
      // two corners share an id, and a consumer reads the arc's own entry rather than the ring it was found on
      const gid = new Map(); for (const a of arcs) { gid.set(a.i, easeArcs.length); easeArcs.push({ ...a, src: a.src }) }
      R2 = e.ring; E2 = e.labs; V2 = e.vtx; A2 = e.arc.map(x => x == null ? null : gid.get(x))
    }
    const g1 = mergeGrid(R2, E2, V2, A2)
    if (g1.R.length < 3) continue
    outR.push(g1.R); outE.push(g1.E); outV.push(g1.V); outA.push(g1.A)
  }
  // edge labels leave in ORIGINAL ① edge indices, so the caller's `labs[e]` is the owner
  if (stamp) { stamp.dropped = dropped; stamp.areaMin = AREA_MIN; stamp.labels = outV; stamp.edgeLabels = outE.map(E => E.map(e => (e == null ? null : origE[e]))); stamp.arcMask = outA; if (easeAt) stamp.easeArcs = easeArcs
    // the rects themselves, each with the source edge(s) it is struck from (`bandPiecesOfTile` gives the ground no cell
    // reaches to the spans whose own rects hold it — Boz, 2026-10-18), and the source VERTEX of a join
    stamp.clips = clips.map((poly, k) => ({ poly, e: clipOwn[k].map(r => origE[r]), v: clipOwn[k].length === 2 ? origV[clipOwn[k][1]] : null, ...(clipD[k] ? { d: clipD[k] } : {}) }))
    // every source edge's depths at its two ends AS STRUCK, a zero depth included (a zero-depth edge strikes no rect, but 0 is its depth)
    // ⭐ and, for a struck edge, the CURB LINE it drew, exactly as its clip has it — its start (P or the join's X), the joins'
    // X inside it (`onCurb`), its end — the same float points, in P → Q order, with the band's own direction. A caller that
    // continues a band (the perpendicular corner's legs) reads these, so every vertex it shares with the band is the band's
    // own and rounds with it; a line re-derived from the edge is a second construction that rounds apart (HPDM block 556).
    stamp.edgeDepths = seg.map((S, i) => { const struck = S.dS > 0 || S.dE > 0, P = struck ? startOf(i) : null, Q = struck ? endOf(i) : null
      return { e: origE[i], a: S.a, b: S.b, d: [S.dS, S.dE], ...(struck ? { line: [P, ...onCurb(i, P, Q).reverse(), Q], dir: S.dir } : {}) } }) }
  return outR
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
export const FILLET_TURN_TOL = 18 * Math.PI / 180
// ⭐ "NO LEG OF ① IS SHORTER THAN THE INK IS WIDE": 2ε less two Clipper grid steps for the rounding. An edge shorter than
// this is not a leg; it joins its neighbours into one CLUSTER, which turns once (`subInkClusters`).
export const subInkLen = (eps) => (eps > 0 ? 2 * eps - 2 / SCALE : 0)
// ⭐⭐ THE TURN OF A ① VERTEX, AS ② READS IT: the NET turn of its cluster (Boz, BRIEF §5b). A cluster is a maximal run of
// ring vertices joined by edges shorter than `subInkLen`; its net turn is the angle from the edge ENTERING its first
// vertex to the edge LEAVING its last, and its corner, if it has one, sits at ONE vertex: the one whose own turn is
// largest (first in ring order on a tie). A vertex in no cluster is its own, so its turn is its own. ⛔ The per-vertex
// turn this replaces read a true sub-ink edge (two crossings mm apart, §5a) as two turns: a 4 mm notch of ±45° took
// two corner radii (JH 99th-street-6), where the ground does not turn at all.
// Returns per vertex `{ turn: degrees, carrier: boolean, inCluster: boolean }` — ONE answer to "does ① turn here", read by
// every corner reader (protoRAt, the ease's corner test, the taper's width-step test, the fold-spur diagnostic).
// ⛔ A ring made only of sub-ink edges has no edge to enter by: no vertex carries a corner. The check
// (claims-no-corner-at-a-true-geometry-edge) computes this independently.
export function subInkClusters(ring, eps) {
  const n = ring.length, sub = subInkLen(eps)
  const dir = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0])
  const deg = (a1, a2) => { const t = a2 - a1; return Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) * 180 / Math.PI }
  const own = ring.map((V, i) => deg(dir(ring[(i - 1 + n) % n], V), dir(V, ring[(i + 1) % n])))
  const turn = own.slice(), carrier = ring.map(() => true), inCluster = ring.map(() => false)
  const short = ring.map((p, i) => { const q = ring[(i + 1) % n]; return Math.hypot(q[0] - p[0], q[1] - p[1]) < sub })
  if (!short.some(Boolean)) return { turn, carrier, inCluster }
  if (short.every(Boolean)) return { turn: ring.map(() => 0), carrier: ring.map(() => false), inCluster: ring.map(() => true) }
  for (let s = 0; s < n; s++) {
    if (!short[s] || short[(s - 1 + n) % n]) continue      // s is a cluster's FIRST sub-ink edge (wraps index 0 freely)
    const vs = [s]; let e = s; while (short[e % n]) { e++; vs.push(e % n) }
    const v0 = vs[0], v1 = vs[vs.length - 1]
    const net = deg(dir(ring[(v0 - 1 + n) % n], ring[v0]), dir(ring[v1], ring[(v1 + 1) % n]))
    let at = v0; for (const v of vs) if (own[v] > own[at]) at = v
    for (const v of vs) { turn[v] = net; carrier[v] = v === at; inCluster[v] = true }
  }
  return { turn, carrier, inCluster }
}
// A corner exists only where two REAL legs meet (the osm2streets doctrine:
// corners come from leg adjacency, never from whatever stroke geometry falls
// at a vertex). Clipper's union/difference leaves near-duplicate vertices
// (sub-cm micro-edges) exactly at junction stations — where a tile-ring chain
// vertex meets coincident stroke edges — and the micro-edge's direction is
// quantization NOISE. Reading that noise as a corner leg extrapolated a 4.5 m
// tangent into a multi-meter bite (the Lafayette-park 105 m diagonal at the
// Waverly station; θ→0 made the Mackay wedge unbounded) and minted a spurious
// magenta corner handle on a straight run — "the initial thing".
// Cure at the ring layer: collapse micro-edges BEFORE corner detection.
const RING_DUP_EPS = 0.02      // m — collapse consecutive verts closer than this
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
// ── H-3 step 2: THE HIGHWAY SWEEP — the roadway IS the object (`r-highway-positive-object`) ──
// A highway is its alignment swept by its typical section: the SAME flattened points ① consumes
// (never a consumer resample — faceting is the skeleton's curve fit, `r-ssot-skeleton-geometry`),
// offset RIGHT by right(station) and LEFT by left(station), built as one explicit outline — right
// boundary forward, left boundary back — not a ClipperOffset, so each vertex knows its source
// index and side (`RIBBONS §1`). Right = (−dz, dx) of point order, the measure convention.
// The width is per lane span (`section.spans`, stations on the raw welded line, rescaled to the
// drawn length). Where it steps, it tapers over `section.taper.rate` × the change, centred on the
// step (`d-lane-step-taper-rate`; placement [U]); a taper longer than half a neighbouring span is
// shortened to it and REPORTED. Ends are butt.
function highwayWidthProfile(sec, drawnLen, ends = null) {
  const spans = (sec?.spans || []).filter(sp => Number.isFinite(sp.hw))
  if (!spans.length) return null
  const scale = sec.length > 0 ? drawnLen / sec.length : 1
  const st = (x, dflt) => (Number.isFinite(x) ? x * scale : dflt)
  const knots = [[0, spans[0].hw]], tapers = []
  for (let k = 0; k + 1 < spans.length; k++) {
    const a = spans[k], b = spans[k + 1], d = Math.abs(b.hw - a.hw)
    if (d < 1e-6) continue
    const at = st(b.s0, drawnLen * (k + 1) / spans.length)
    const want = sec.taper.rate * d
    const room = Math.min(at - st(a.s0, 0), st(b.s1, drawnLen) - at)
    const half = Math.max(0, Math.min(want / 2, room / 2))
    knots.push([at - half, a.hw], [at + half, b.hw])
    tapers.push({ at: +at.toFixed(1), from: a.hw, to: b.hw, length: +(2 * half).toFixed(2), wanted: +want.toFixed(2), shortened: 2 * half < want - 1e-6 })
  }
  knots.push([drawnLen, spans[spans.length - 1].hw])
  // ⭐ H-3 step 5 — END-TO-END: where the highway hands off to an at-grade street that CONTINUES it, H tapers
  // from its section to that street's resolved width, ending exactly at the node (one material handoff), over
  // the same 12:1 rate (`d-lane-step-taper-rate`, which names this handoff). Too long for the end span ⇒
  // shortened to it, and REPORTED.
  const endTaper = (which, w) => {
    if (!Number.isFinite(w)) return
    const atEnd = which === 'end', k0 = atEnd ? knots.length - 1 : 0
    const from = knots[k0][1], d = Math.abs(from - w)
    if (d < 1e-6) { knots[k0] = [knots[k0][0], w]; return }
    const want = sec.taper.rate * d
    const nb = atEnd ? knots[knots.length - 2][0] : knots[1][0]
    const room = atEnd ? drawnLen - nb : nb
    const len = Math.max(0, Math.min(want, room))
    if (atEnd) knots.splice(knots.length - 1, 1, [drawnLen - len, from], [drawnLen, w])
    else knots.splice(0, 1, [0, w], [len, from])
    tapers.push({ at: atEnd ? 'end' : 'start', from: +from.toFixed(3), to: +w.toFixed(3), length: +len.toFixed(2), wanted: +want.toFixed(2), shortened: len < want - 1e-6, handoff: true })
  }
  if (ends?.start != null) endTaper('start', ends.start)
  if (ends?.end != null) endTaper('end', ends.end)
  const at = (t) => {
    for (let i = 1; i < knots.length; i++) if (t <= knots[i][0] + 1e-9) {
      const [t0, v0] = knots[i - 1], [t1, v1] = knots[i]
      return t1 - t0 < 1e-9 ? v1 : v0 + (v1 - v0) * (t - t0) / (t1 - t0)
    }
    return knots[knots.length - 1][1]
  }
  return { at, stations: knots.map(k => k[0]), tapers }
}
function sweepHighway(points, leftSec, rightSec, handoff = null) {
  const pts = []
  for (const p of points) { const q = Array.isArray(p) ? p : [p.x, p.z]; if (!pts.length || Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]) > 1e-6) pts.push(q) }
  if (pts.length < 2) return null
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const Ltot = cum[cum.length - 1]
  const L = highwayWidthProfile(leftSec, Ltot, handoff && { start: handoff.start?.left, end: handoff.end?.left })
  const R = highwayWidthProfile(rightSec, Ltot, handoff && { start: handoff.start?.right, end: handoff.end?.right })
  if (!L || !R) return null
  // Insert the taper knots as vertices so the width changes exactly where the profile says.
  // ⛔ MERGED WITHIN A MICRON: the left and right profiles taper at the same station, but their knots
  // can differ by float noise — two near-equal stations make a ZERO-LENGTH segment, its normal is
  // (0, 0), and the miter divides by zero (Provincetown's US 6, trunk-45: an Infinity vertex that took
  // the whole ground build down, live and bake).
  const extra = []
  for (const t of [...L.stations, ...R.stations].filter(t => t > 1e-6 && t < Ltot - 1e-6).sort((a, b) => a - b))
    if (!extra.length || t - extra[extra.length - 1] > 1e-6) extra.push(t)
  const P = [], T = [], SRC = []
  let e = 0
  for (let i = 0; i < pts.length; i++) {
    while (e < extra.length && extra[e] < cum[i] - 1e-6) {
      const t = extra[e++], j = i - 1, f = (t - cum[j]) / (cum[i] - cum[j])
      P.push([pts[j][0] + (pts[i][0] - pts[j][0]) * f, pts[j][1] + (pts[i][1] - pts[j][1]) * f]); T.push(t); SRC.push(j + f)
    }
    if (e < extra.length && Math.abs(extra[e] - cum[i]) <= 1e-6) e++
    P.push(pts[i]); T.push(cum[i]); SRC.push(i)
  }
  // …and any vertex that still lands within a micron of its predecessor is dropped, so no segment is degenerate.
  for (let i = P.length - 1; i > 0; i--) if (Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) <= 1e-6) { P.splice(i, 1); T.splice(i, 1); SRC.splice(i, 1) }
  if (P.length < 2) return null
  const dir = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l] }
  const right = [], left = [], stamp = []
  for (let i = 0; i < P.length; i++) {
    const dIn = i > 0 ? dir(P[i - 1], P[i]) : null, dOut = i < P.length - 1 ? dir(P[i], P[i + 1]) : null
    const nOf = (d) => [-d[1], d[0]]
    let n
    if (dIn && dOut) {
      const a = nOf(dIn), b = nOf(dOut), m = [a[0] + b[0], a[1] + b[1]], ml = Math.hypot(m[0], m[1])
      if (ml < 1e-9) n = a
      else { const u = [m[0] / ml, m[1] / ml], c = u[0] * a[0] + u[1] * a[1]; n = [u[0] / c, u[1] / c] }
    } else n = nOf(dIn || dOut)
    const r = R.at(T[i]), l = L.at(T[i])
    right.push([P[i][0] + n[0] * r, P[i][1] + n[1] * r])
    left.push([P[i][0] - n[0] * l, P[i][1] - n[1] * l])
    stamp.push(SRC[i])
  }
  const ring = [...right, ...left.slice().reverse()]
  // ⛔ LOUD, never garbage into Clipper: a non-finite vertex is a construction defect, named here.
  const bad = ring.findIndex(q => !Number.isFinite(q[0]) || !Number.isFinite(q[1]))
  if (bad >= 0) throw new Error(`[tileGround][H] ⛔ the highway sweep produced a NON-FINITE vertex (ring index ${bad} of ${ring.length}, source index ${stamp[bad]?.toFixed?.(3)}) — refusing to hand Clipper an invalid coordinate`)
  return { ring, stamp: [...stamp.map(i => ({ src: i, side: 'right' })), ...stamp.slice().reverse().map(i => ({ src: i, side: 'left' }))],
           tapers: { left: L.tapers, right: R.tapers }, length: Ltot }
}

// ⭐ A BRIDGE OVER THE WATER IS PAINTED ACROSS IT (Jacob, 2026-10-27: "b for now, deck later"): ① leaves the off-grade span out of
// the ink, so the water face stays whole; the paint lays the span back over the water as an OVERLAY, the way H is (`sweepHighway`
// from the chain into its paint group). One behaviour for every road class; a span H sweeps (`hwy`) is H's and is skipped here.
// ⭐ THE COAST WINS, FOR STREET AND BRIDGE ALIKE (Boz's ruling (A), 2026-10-27): nothing is painted over the water but the SPAN's
// own strip. Each span (protopolygon.offGradeSpans, by identity) is swept at the street's own measure per side, WITH authoring
// (`hwOf(street, side, segOrd)`), along its own centreline run on STRAIGHT past each bank crossing, bounded by that bank's CUT,
// and clipped to the water. A continuation's pavement never reaches over the water (where the street bends at the bank, or turns
// to hug the shore — 140.8 m² on the planted 130° turn, when the run-on followed the chain).
// The CUT: the coast walked from the crossing both ways across the strip (out to its half-width R — a straight run-on has no
// miter at the crossing); where the coast stops crossing it (it turns to run along the street), the cut runs on SQUARE across
// the street from the last coast point it reached, so it never leans back over the span. The run-on reaches as far along the
// street as the cut does, and everything past the cut, away from the span, is cut away.
// ⛔ CLOSURE, by name: the piece meets the BANK (the coast, or a cut) in exactly one contiguous run per bank crossing, each
// through that crossing. Anything else (a strip edge in and out of the water) refuses. → [{ span, street, segOrd, hwy: false, rings }]
export function bridgeOverlay(spans, waterRings, hwOf) {
  const out = []
  if (!spans?.length) return out
  if (!waterRings?.length) throw new Error(`[tileGround][bridges] ⛔ ${spans.length} off-grade span(s) over the water but no water rings to clip them to. Refusing.`)
  const TOL = 2 / SCALE
  const sd = (p, a, c) => { const dx = c[0] - a[0], dz = c[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
  const onCoast = (p) => waterRings.some(w => w.some((q, i) => sd(p, q, w[(i + 1) % w.length]) <= TOL))
  for (const [span, sp] of spans.entries()) { if (sp.hwy) continue
    const who = `${sp.street}|${sp.segOrd} (${sp.wetM} m over the water)`
    const hl = hwOf(sp.street, 'left', sp.segOrd), hr = hwOf(sp.street, 'right', sp.segOrd)
    if (!(hl > 0) || !(hr > 0)) throw new Error(`[tileGround][bridges] ⛔ ${who}: no pavement width (left ${hl}, right ${hr}) — the bridge cannot be painted across the water. Refusing.`)
    const P = sp.points
    if (!(P?.length >= 2)) throw new Error(`[tileGround][bridges] ⛔ ${who}: a span with no centreline. Refusing.`)
    if (!Array.isArray(sp.banks)) throw new Error(`[tileGround][bridges] ⛔ ${who}: the span carries no \`banks\` — a ① poured before it. ▶ re-pour`)
    const R = Math.max(hl, hr) + TOL, cuts = []
    // one bank: its cut (the coast across the strip, run on square), how far along the street it reaches, and the region past it
    const bankOf = (X, from) => { const dl = Math.hypot(X[0] - from[0], X[1] - from[1]), d = [(X[0] - from[0]) / dl, (X[1] - from[1]) / dl], nn = [-d[1], d[0]]
      const sOf = (q) => (q[0] - X[0]) * nn[0] + (q[1] - X[1]) * nn[1]
      let ring = null, ei = -1; for (const w of waterRings) { const i = w.findIndex((q, k) => sd(X, q, w[(k + 1) % w.length]) <= TOL); if (i >= 0) { ring = w; ei = i; break } }
      if (!ring) throw new Error(`[tileGround][bridges] ⛔ ${who}: its bank crossing (${X.map(v => v.toFixed(3)).join(', ')}) lies on no edge of the water. Refusing.`)
      const m = ring.length, walk = (step) => { const o = [X]; let k = step > 0 ? (ei + 1) % m : ei, sgn = 0, far = 0
        for (let g = 0; g < m; g++, k = (k + step + m) % m) { const q = ring[k], sq = sOf(q); if (!sgn) { if (Math.abs(sq) <= TOL) continue; sgn = Math.sign(sq) }
          if (sgn * sq > far + TOL) { if (sgn * sq >= R) { const a = o[o.length - 1], sa = sOf(a), t = (sgn * R - sa) / (sq - sa); o.push([a[0] + (q[0] - a[0]) * t, a[1] + (q[1] - a[1]) * t]); return { sgn, o } }
            o.push(q); far = sgn * sq; continue }
          break }
        if (o.length < 2) throw new Error(`[tileGround][bridges] ⛔ ${who}: the coast at its bank (${X.map(v => v.toFixed(3)).join(', ')}) does not cross the street. Refusing.`)
        const b = o[o.length - 1], sb = sOf(b); o.push([b[0] + nn[0] * (sgn * R - sb), b[1] + nn[1] * (sgn * R - sb)]); return { sgn, o } }
      const f = walk(1), b = walk(-1)
      if (f.sgn === b.sgn) throw new Error(`[tileGround][bridges] ⛔ ${who}: the coast at its bank (${X.map(v => v.toFixed(3)).join(', ')}) leaves on one side of the street only. Refusing.`)
      const cut = [...b.o.slice().reverse(), ...f.o.slice(1)]; cuts.push(cut)
      const reach = Math.max(0, ...cut.map(q => (q[0] - X[0]) * d[0] + (q[1] - X[1]) * d[1])) + TOL, L = reach + 2 * R
      const e0 = cut[0], e1 = cut[cut.length - 1]
      return { X, d, reach, far: [...cut, [e1[0] + d[0] * L, e1[1] + d[1] * L], [e0[0] + d[0] * L, e0[1] + d[1] * L]] } }
    const b0 = sp.banks[0] ? bankOf(P[0], P[1]) : null, b1 = sp.banks[1] ? bankOf(P[P.length - 1], P[P.length - 2]) : null
    const run = (b) => [b.X[0] + b.d[0] * b.reach, b.X[1] + b.d[1] * b.reach]
    const line = [...(b0 ? [run(b0)] : []), ...P, ...(b1 ? [run(b1)] : [])]
    const sw = sweepHighway(line, { spans: [{ hw: hl }] }, { spans: [{ hw: hr }] })
    if (!sw) throw new Error(`[tileGround][bridges] ⛔ ${who}: the sweep failed. Refusing.`)
    const mids = P.slice(1).map((q, k) => [(q[0] + P[k][0]) / 2, (q[1] + P[k][1]) / 2])
    const fars = [b0, b1].filter(Boolean).map(b => (signedArea(b.far) < 0 ? [...b.far].reverse() : b.far))
    const wetStrip = intersectRings([sw.ring], waterRings)
    const A = (fars.length ? differenceRings(wetStrip, unionRings(fars)) : wetStrip).filter(r => mids.some(m => pointInRing(m[0], m[1], r)))
    if (A.length !== 1) throw new Error(`[tileGround][bridges] ⛔ ${who}: ${A.length} piece(s) of its strip over the water hold its centreline (want 1). Refusing.`)
    const onBank = (p) => onCoast(p) || cuts.some(cu => cu.some((q, k) => k + 1 < cu.length && sd(p, q, cu[k + 1]) <= TOL))
    const r = A[0], n = r.length, c = r.map((q, i) => onBank(q) && onBank(r[(i + 1) % n]) && onBank([(q[0] + r[(i + 1) % n][0]) / 2, (q[1] + r[(i + 1) % n][1]) / 2]))
    const runs = []; if (c.every(Boolean)) runs.push([...Array(n).keys()])
    else { const s0 = c.findIndex(v => !v); for (let k = 1; k <= n; k++) { const i = (s0 + k) % n; if (!c[i]) continue
      if (c[(i - 1 + n) % n] && runs.length) runs[runs.length - 1].push(i); else runs.push([i]) } }
    const banks = [...(b0 ? [P[0]] : []), ...(b1 ? [P[P.length - 1]] : [])]
    const holds = (rn, p) => rn.some(i => sd(p, r[i], r[(i + 1) % n]) <= TOL)
    const closed = runs.length === banks.length && banks.every(b => runs.filter(rn => holds(rn, b)).length === 1) && runs.every(rn => banks.filter(b => holds(rn, b)).length === 1)
    if (!closed) throw new Error(`[tileGround][bridges] ⛔ ${who}: its piece over the water meets the bank in ${runs.length} run(s) for ${banks.length} bank crossing(s), not one through each — a strip edge in and out of the water. Refusing.`)
    out.push({ span, street: sp.street, segOrd: sp.segOrd, hwy: false, rings: A }) }
  return out
}

// ⭐ H's SPANS OVER THE WATER (Boz's ruling (iv), 2026-10-27): for each recorded span H sweeps (`hwy`), the piece(s) of H ∩ the
// water holding the span's own centreline — by identity of the recorded span, never the sheet. The caller moves them out of the
// highway's paint into the bridge's, so the two meet on the coast. ⛔ A recorded H span no piece holds refuses by name.
export function highwayBridges(spans, Hrings, waterRings) {
  const H = (spans || []).map((sp, span) => ({ sp, span })).filter(x => x.sp.hwy)
  if (!H.length) return []
  const wet = intersectRings(Hrings, waterRings || [])
  return H.map(({ sp, span }) => { const P = sp.points, mids = P.slice(1).map((q, k) => [(q[0] + P[k][0]) / 2, (q[1] + P[k][1]) / 2])
    const rings = wet.filter(r => mids.some(m => pointInRing(m[0], m[1], r)))
    if (!rings.length) throw new Error(`[tileGround][bridges] ⛔ ${sp.street}|${sp.segOrd} is recorded as swept by H, but no piece of H over the water holds its centreline. Refusing.`)
    return { span, street: sp.street, segOrd: sp.segOrd, hwy: true, rings } })
}

export function unionRings(rings) {
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
export function differenceRings(subjectRings, clipRings) {
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
function intersectRings(subjectRings, clipRings, { preserveCollinear = false } = {}) {
  if (!subjectRings.length || !clipRings.length) return []
  const { Clipper, ClipType, PolyType, PolyFillType } = clipperLib
  const c = new Clipper(preserveCollinear ? Clipper.ioPreserveCollinear : 0)
  for (const r of subjectRings) if (r && r.length >= 3) c.AddPath(r.map(toClipper), PolyType.ptSubject, true)
  for (const r of clipRings)    if (r && r.length >= 3) c.AddPath(r.map(toClipper), PolyType.ptClip,    true)
  const out = []
  c.Execute(ClipType.ctIntersection, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
  return out.map(p => p.map(fromClipper))
}

// ⭐⭐⭐ LAND USE IS PER PIECE, AND A PIECE TAKES THE CLASS THAT COVERS MOST OF IT
// (Jacob, 2026-10-04 — `docs/briefs/BRIEF-land-use-per-piece-and-the-control.md`, option a).
// A tile's inner area (`iA`) can fall into SEVERAL PIECES — a motorway median joined to a 186 ha
// block through a 1–10 mm throat, a strip cut off by a trail's bands, the disc slicing a rim block.
// ⛔ The tile used to take ONE class from ONE interior point of its ring, so every piece took the
// class of wherever that point happened to land: Huron's median grew crop, and downtown Huron was
// painted `residential` while 98% of it lay under a face voted `industrial` (the point landed on
// road). ⭐ Now each piece is voted on its own, BY AREA: the faces under it are credited smallest
// first (a face never re-claims ground a smaller face inside it already holds — the old
// "smallest containing face" rule, kept as an area rule), and the class with the most ground wins.
// ⛔⛔ NOTHING IS INVENTED: a piece no face covers is `underived`, by name. The weighted hash that
// used to roll a class here (`pickLuFromHash`) is DELETED — Layer 0 q2.
// ▶ node checks/claims-every-piece-takes-its-own-land-use.mjs
export const UNDERIVED_LU = 'underived'
// The painters strike a tile's own land-use + treelawn under this key; `rekeyByPiece` moves it to
// each piece's class before any caller sees it. ⛔ Never a class, never returned.
const OWN_LU = '\u0000own'
const ringBB = (r) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity
  for (const p of r) { if (p[0] < a) a = p[0]; if (p[0] > b) b = p[0]; if (p[1] < c) c = p[1]; if (p[1] > d) d = p[1] } return [a, b, c, d] }
const ringsArea = (rs) => Math.abs(rs.reduce((s, r) => s + signedArea(r), 0))
// The pieces of an `iA`: each OUTER (positive) ring with the holes that lie inside it. `i` is the
// outer's index into `iA`, which is what `luByPiece` is aligned to.
export function piecesOfIA(iA) {
  const rings = (iA || []).map((r, i) => ({ r, i, a: (r?.length >= 3) ? signedArea(r) : 0 }))
  const outers = rings.filter(o => o.a > 0), holes = rings.filter(o => o.a < 0)
  return outers.map(o => ({ i: o.i, outer: o.r, holes: holes.filter(h => pointInRing(h.r[0][0], h.r[0][1], o.r)).map(h => h.r) }))
}
// One class per piece, aligned to `iA` (a hole's slot is null).
//   fixed    — the mint's own ruling for the whole block (`verge` / JR): no land-use choice.
//   override — the operator's `blockLandUse` for this block (step 2 re-keys it per piece).
//   faces    — the voted faces (`ribbons.faces`), each { use, ring }.
export function landUseByPiece(iA, { faces, fixed = null, override = null }) {
  const out = (iA || []).map(() => null)
  for (const p of piecesOfIA(iA)) {
    if (fixed) { out[p.i] = fixed; continue }
    if (override) { out[p.i] = override; continue }
    const region = [p.outer, ...p.holes], pb = ringBB(p.outer)
    const cand = faces.filter(f => !(f.bb[0] > pb[1] || f.bb[1] < pb[0] || f.bb[2] > pb[3] || f.bb[3] < pb[2]))
      .sort((x, y) => x.area - y.area)
    const byUse = {}; let claimed = []
    for (const f of cand) {
      const under = intersectRings(region, [f.ring]); if (!under.length) continue
      const mine = claimed.length ? differenceRings(under, claimed) : under
      const a = ringsArea(mine)
      if (a > 0) byUse[f.use] = (byUse[f.use] || 0) + a
      claimed = unionRings([...claimed, f.ring])
    }
    let best = null, bestA = 0
    for (const [u, a] of Object.entries(byUse)) if (a > bestA) { bestA = a; best = u }
    out[p.i] = best || UNDERIVED_LU
  }
  return out
}
// The class of each piece of a FROZEN tile. ⛔ A tile frozen before per-piece land use carries one
// `lu` for the whole tile: it is painted that way and SAID, once — the cure is a re-bake.
let _wholeTileLuWarned = false
export function tilePieceLus(st) {
  if (Array.isArray(st?.luByPiece)) return st.luByPiece
  if (typeof st?.lu === 'string') {
    if (!_wholeTileLuWarned) { _wholeTileLuWarned = true
      console.warn('[tileGround][LU] ⛔ this shape artifact predates per-piece land use: each tile carries ONE `lu`, so every piece of a split tile is painted with it. RE-BAKE to paint each piece its own class.') }
    return (st.iA || []).map(r => (r?.length >= 3 && signedArea(r) > 0) ? st.lu : null)
  }
  throw new Error('[tileGround][LU] a tile carries neither `luByPiece` nor `lu` — no land use was minted for it. Refusing to paint a class nobody derived.')
}
// ⭐⭐⭐ EACH PIECE IS PAINTED BY ITS EVIDENCE, POLYGON BY POLYGON (Jacob, 2026-10-05). The pour lays the
// land evidence out as disjoint regions (`derive.js` `layerLandEvidence`: OSM polygons, then readable parcels);
// a piece paints each region it holds in that region's class and `underived` — grass — wherever none
// reaches. A block that is half houses and half field paints both. ⭐ Crop rows grow where the pour flags `crop`
// (`paintClassOf`, below). ⛔ The piece's CLASS (`luByPiece`) is now its LABEL — the class holding most
// of it — for the operator; the paint is the evidence. ▶ node checks/claims-the-land-is-painted-by-its-evidence.mjs
export const CROP_LU = 'agricultural'
// ⭐ Crop ROWS only where the pour says the ground grows them (`crop`, set in `layerLandEvidence`: a mapped field, or
// farmland the USDA Cropland Data Layer reads as crop); meadow, farmyard and an unread farm parcel paint grass.
let _noCropFlagWarned = false
const paintClassOf = (e) => {
  if (e.lu !== CROP_LU) return e.lu
  if (e.crop === undefined) {           // evidence poured before the crop flag: the rule it was poured under, said once
    if (!_noCropFlagWarned) { _noCropFlagWarned = true; console.warn('[tileGround][LU] ⛔ this land evidence predates the crop flag: crop rows grow on every OSM agricultural polygon (meadow and farmyard included) and nowhere else. RE-POUR.') }
    return e.src === 'osm' ? CROP_LU : UNDERIVED_LU
  }
  return e.crop ? CROP_LU : UNDERIVED_LU
}
// Grouped by (evidence class, paint class): one boolean per class per piece, not one per region.
export function prepareEvidence(evidence) {
  if (!Array.isArray(evidence)) return null
  const groups = new Map()
  for (const e of evidence) {
    if (!e?.rings?.length) continue
    const paint = paintClassOf(e), k = `${e.lu}|${paint}`
    const g = groups.get(k) || groups.set(k, { lu: e.lu, paint, rings: [] }).get(k)
    for (const r of e.rings) g.rings.push({ r, bb: ringBB(r) })
  }
  return [...groups.values()]
}
// Per piece (aligned to `iA`): [{ lu: the PAINT class, ev: the evidence class, rings }]; null for a piece painted
// whole (a verge/JR ruling, an operator's override) and for a hole.
export function evidenceByPiece(iA, groups, wholeByPiece) {
  const out = (iA || []).map(() => null)
  for (const p of piecesOfIA(iA)) {
    if (wholeByPiece?.[p.i]) continue
    const pb = ringBB(p.outer), region = [p.outer, ...p.holes], parts = []
    for (const g of groups) {
      const near = g.rings.filter(x => !(x.bb[0] > pb[1] || x.bb[1] < pb[0] || x.bb[2] > pb[3] || x.bb[3] < pb[2])).map(x => x.r)
      if (!near.length) continue
      const r = intersectRings(region, near); if (r.length) parts.push({ lu: g.paint, ev: g.lu, rings: r })
    }
    out[p.i] = parts
  }
  return out
}
// The LABEL of each piece: the evidence class holding most of it (`underived` when evidence holds none, or less
// than the ground nothing reaches). Read off the parts already cut — no second pass.
export function labelFromEvidence(iA, parts, fixedOrOverride) {
  const out = (iA || []).map(() => null)
  for (const p of piecesOfIA(iA)) {
    if (fixedOrOverride) { out[p.i] = fixedOrOverride; continue }
    const by = {}; let held = 0
    for (const e of parts[p.i] || []) { const a = ringsArea(e.rings); by[e.ev] = (by[e.ev] || 0) + a; held += a }
    by[UNDERIVED_LU] = (by[UNDERIVED_LU] || 0) + Math.max(0, ringsArea([p.outer, ...p.holes]) - held)
    out[p.i] = Object.entries(by).sort((a, b) => b[1] - a[1])[0][0]
  }
  return out
}
// ⛔ a shape frozen before the stamp moved into the cut: its pieces were cut from the raw evidence, so each class boundary
// meets the block a hair off its line (one-side crossings). Painted as it is, and SAID once.
let _unstampedWarned = false
const unstampedWarn = () => { if (_unstampedWarned) return; _unstampedWarned = true
  console.warn('[tileGround][stamp] ⛔ this shape was frozen BEFORE the land-use stamp (`evidenceStamped` absent): each class boundary meets the block off its line, and the strips cut there fold or slit. RE-FREEZE (re-bake).') }
let _noEvidenceWarned = false
const noEvidenceWarn = () => { if (_noEvidenceWarned) return; _noEvidenceWarned = true
  console.warn('[tileGround][LU] ⛔ this artifact carries NO land evidence (`ribbons.landEvidence` / `evidenceByPiece`): each piece is painted WHOLE in its one class — a block that is half houses and half field paints one half wrong. RE-POUR, then re-bake.') }

// Move the geometry a painter struck under `OWN_LU` to each piece's own class. Every other key
// (a divided road's `median`) is left exactly where the painter put it.
// ⭐⭐ THE LAND-USE STAMP IS ONE CUT OVER THE WHOLE PARTITION (RIBBONS's SUPPLY row for `lu`: "stamp the LU into the
// initial ground map" — a fact laid over the ground once; Jacob, 2026-10-14: "treated like any thing else, flattened into
// the ground layer"). Its boundary is a line of the ground map, so EVERY strip it crosses carries the crossing — the
// lawn and the land use take its class there (`rekeyByPiece`), the walk, the curb and the curb cut keep their own key but
// are cut at the same lines (`cutByStamp`). ⛔ Cutting only the keyed strips put each crossing on ONE side of a shared
// line: Clipper rounds it to the lattice, up to ½ step off the neighbour's straight edge, and the lawn's copy of the line
// became a second line (HPDM, 2026-10-14: 91% of the cross-layer line drawn twice was made here). Each strip is cut by
// the same class groups through the same `intersectRings`, and Clipper rounds the crossing of the same two segments to
// the same point whichever way either runs (▶ scratch/ground-budget/flatten-r1/crossing-premise.mjs), so a shared line
// keeps one vertex set. ▶ node checks/claims-no-edge-is-drawn-twice.mjs
// (class, region) per piece: each evidence region in its class, and `underived` where none reaches. Computed per call,
// never memoised on the tile: an authored land use changes `tilePieceLus(st)` while the tile object stays the same.
function stampParts(st) {
  const lus = tilePieceLus(st), pieces = piecesOfIA(st.iA)
  const ev = Array.isArray(st.evidenceByPiece) ? st.evidenceByPiece : null
  if (st.evidenceByPiece === undefined) noEvidenceWarn()   // absent = an artifact from before the evidence; null = by design
  const parts = []
  for (const p of pieces) {
    const region = [p.outer, ...p.holes], mine = ev?.[p.i]
    if (!Array.isArray(mine)) { parts.push({ lu: lus[p.i], region }); continue }   // whole: ruled, authored, or a pre-evidence artifact
    for (const e of mine) parts.push({ lu: e.lu, region: e.rings })
    const held = mine.flatMap(e => e.rings)
    parts.push({ lu: UNDERIVED_LU, region: held.length ? differenceRings(region, held) : region })
  }
  const classes = [...new Set(parts.filter(x => x.region.length).map(x => x.lu))]
  return { pieces, parts, classes, whole: classes.length === 1 && !ev, regionsOf: (lu) => parts.filter(x => x.lu === lu).flatMap(x => x.region) }
}
// ⛔ REFUSED, NEVER DROPPED: paint lying in NO piece has no class to take. The painters confine it to `iA`, so this should
// be 0 m²; if it is not, the bake stops by name rather than leave that ground painted by nobody.
// ⭐ Tolerance = one lattice step (1 / SCALE, lattice.js) × the paint's own perimeter — a property of the geometry.
function warnOutside(sp, own, what) {
  const outside = ringsArea(differenceRings(own, sp.pieces.flatMap(p => [p.outer, ...p.holes])))
  const tol = own.reduce((t, r) => { let q = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) q += Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]); return t + q }, 0) / SCALE
  if (outside > tol) throw new Error(`[tileGround][LU] ⛔ ${outside.toFixed(4)} m² of a split tile's ${what} lies in none of its pieces (lattice tolerance ${tol.toFixed(4)} m²) — REFUSED: it has no piece to take its class from, and dropping it would leave ground painted by nobody.`)
}
export function rekeyByPiece(st, byLu, sp = null) {
  const own = byLu[OWN_LU]; delete byLu[OWN_LU]
  if (!own?.length) return byLu
  sp ||= stampParts(st)
  if (sp.whole) { (byLu[sp.classes[0]] ||= []).push(...own); return byLu }
  for (const lu of sp.classes) {
    const part = intersectRings(own, sp.regionsOf(lu))
    if (part.length) (byLu[lu] ||= []).push(...part)
  }
  warnOutside(sp, own, 'land-use paint')
  return byLu
}
// ⭐ THE PAINTED RING LISTS of a tile's bundle — the ONE table the painted layers are built from (accumulated over the
// tiles, unioned, clipped: `sectionOpen`'s finish) and the stamp's insert targets. So a list the flatten paints is a
// target by construction, and the block silhouette (kerbPlan's and the deformer's, not paint) is not; a painted layer
// added later joins this table to be painted at all, and is a target from then on.
const PAINTED = { A: 'asphalt', C: 'curb', W: 'sidewalk', R: 'curbCut', S: 'shore' }
// ⭐ THE BAND FROM THE PAINTED RING TO ②, BY ITS OWNER'S CLASS (BRIEF-the-ink-is-owned-by-its-labels §3.2; Zob's (a)): the
// absorbed ink a WATER-owned edge holds is the land's shore (`S`), a HIGHWAY's is the highway's, left to H and painted by it,
// everything else is the asphalt (`A`). Both cut from the one band, so the rim is never cut again. A tile with no such cell
// is all asphalt.
// ⛔ The shore is the CELLS THEMSELVES — exact lattice rings out of the arrangement, wholly inside the band — never band ∩ cells:
// that second boolean rounded the boundary it shared with the asphalt a second time, and the two met up to a step apart
// (claims-no-edge-is-drawn-twice, the probe of 2026-10-25: asphalt / shore drawn twice). Only the asphalt is cut, by the cells'
// own edges.
function bandByClass(band, st) {
  const of = (cls) => (st.inkCells || []).filter(c => c.cls === cls).flatMap(c => c.rings)
  const shore = of('shore'), hwy = of('highway')
  if (!shore.length && !hwy.length) return { A: band, S: [] }
  return { A: differenceRings(band, [...shore, ...hwy]), S: shore }
}
const PAINTED_BY_LU = { tlByLu: 'treelawnByLu', luByLu: 'luByClass' }

// ⭐⭐ STAMP THE TILE ONCE, WHERE ITS LAND USE IS CUT (ROADMAP A10: "cut iA at every … ownership change …; a gap is not
// constructible", none of clamp · wrap · re-key · snap). The stamp's lines are the RAW land evidence's boundaries
// (`ribbons.landEvidence`, prepared as the painter groups it); where one crosses the block contour (`iaFull`, the struck
// one, and `iA`, the cut one), the crossing is computed ONCE from the two segments that make it, rounded to the lattice
// ONCE, and written into BOTH rings — and only THEN is each piece cut into its evidence (`evidenceByPiece`). So the strips,
// asphalt (tile − iA), the block silhouette (kerbPlan, the deformer) and the evidence parts all meet at vertices they
// SHARE, by construction — no search, no tolerance.
// ⛔ Cutting the pieces from the RAW evidence first put each crossing on ONE side: `intersectRings` rounded it into the
// evidence part and never into iA, so a class boundary met the block 0.3–0.6 mm off its line (HPDM, 2026-10-14: 1,588
// such vertices; three of them folded the curb or slit the asphalt). Stamping the parts AFTER that cut cannot recover
// it — the crossing is already a vertex beside the line. ▶ checks/claims-the-stamp-keeps-its-owners.mjs.
// FROZEN with the shape (`evidenceStamped`): the iaFull-aligned arrays are expanded (an inserted vertex lies inside an
// edge: it starts a half that carries that edge's stamp — the same owner — is no corner, and keeps the edge's arc /
// junction only when both ends share it).
// ⛔ The evidence is DISJOINT only to ½ cm until the pour is fixed (derive.js runs `layerLandEvidence` on its own SCALE =
// 100 lattice, not lattice.js's CLIP_SCALE) — evidence × evidence is not stamped (its overlaps do not settle); they are
// measured in the pour's regions, never resolved here. ▶ checks/claims-the-land-is-painted-by-its-evidence.mjs.
// ⭐ ① ON THE LATTICE, ONCE: the curb contour is rounded to lattice.js's grid where it is born, so the stamp nodes lattice
// rings and the circle cut only cuts. ⛔ It used to stay float until the circle's `intersectRings` rounded `iA` (and never
// `iaFull`): the stamp's crossings were computed on rounded keys beside a float contour, and the cut dropped some of them
// from contours 600–3,400 m inside the circle (02da626e). ⛔ A ring whose rounding makes two neighbours one point has an
// edge shorter than the lattice; it is REFUSED by name, never merged (the stamp arrays are aligned to its vertices).
// ⭐ THE ROAD IS HELD BY ① (Boz's ruling, 2026-10-17): every vertex of a ROAD group (asphalt · stripe · highway) inside the
// disc lies in a tile ring (which holds the ink it absorbed, absorbInk.js) or a curbless block's piece — the things that carry an owner, so a road vertex in neither has no line
// to take its height from. Bounded by the road's GROUPS, not by space: water and land use are not road, so the sea never
// enters the test. The lattice is tile rings ∪ ink pieces (with the curbless blocks' `kind: 'block'`) ∪ H: a block
// wholly under the highway corridor is the highway's own ground (Boz, 2026-10-17), so a road vertex inside H is on the road. On a tile or piece edge (within 2 grid units, the boolean's own tolerance) counts as held.
// Returns per group { n, off: [[x, z]…] }; the bake refuses. ▶ checks/claims-the-road-lies-on-the-lattice.mjs
export function roadOffTheLattice(groups, tiles, inkPieces, disc, highway = []) {
  const TOL = 2 / SCALE, G = 50
  const wind = (p, rings) => { let w = 0; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if (zj <= p[1]) { if (zi > p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) > 0) w++ } else if (zi <= p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) < 0) w-- } return w }
  const onEdge = (p, rings) => rings.some(r => r.some((a, i) => { const b = r[(i + 1) % r.length], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) <= TOL }))
  const cov = [...tiles.map(t => [t.ring]), ...inkPieces.map(q => q.rings), ...(highway.length ? [highway.filter(r => r?.length >= 3)] : [])]
  const bb = cov.map(rs => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const r of rs) for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a - TOL, b - TOL, c + TOL, d + TOL] })
  const grid = new Map(); bb.forEach((q, i) => { for (let x = Math.floor(q[0] / G); x <= Math.floor(q[2] / G); x++) for (let z = Math.floor(q[1] / G); z <= Math.floor(q[3] / G); z++) (grid.get(x + ',' + z) || grid.set(x + ',' + z, []).get(x + ',' + z)).push(i) })
  const held = (p) => (grid.get(Math.floor(p[0] / G) + ',' + Math.floor(p[1] / G)) || []).some(i => p[0] >= bb[i][0] && p[0] <= bb[i][2] && p[1] >= bb[i][1] && p[1] <= bb[i][3] && (wind(p, cov[i]) !== 0 || onEdge(p, cov[i])))
  const out = {}
  for (const [g, rings] of Object.entries(groups)) { const o = out[g] = { n: 0, off: [] }
    for (const r of rings || []) for (const p of r) { if (wind(p, [disc]) === 0 && !onEdge(p, [disc])) continue; o.n++; if (!held(p)) o.off.push(p) } }
  return out
}
function onLattice(ring, what) {
  const out = ring.map(p => [Math.round(p[0] * SCALE) / SCALE, Math.round(p[1] * SCALE) / SCALE])
  for (let i = 0; i < out.length; i++) { const a = out[i], b = out[(i + 1) % out.length]
    if (a[0] === b[0] && a[1] === b[1]) throw new Error(`[tileGround][PROTO②] ⛔ ${what}: vertices ${i} and ${(i + 1) % out.length} round to one lattice point (${a}) — an edge shorter than the lattice (1 / ${SCALE} m). Refused, never merged.`) }
  return out
}
// ⭐ AN iaFull-ALIGNED ARRAY THROUGH AN INSERTION, one rule for every pass that adds a vertex to iaFull. `o` is the new ring,
// each vertex either an old one (`src`, its index) or one inserted inside edge `edge`: it starts a half that carries that
// edge's stamp (the same owner), is no corner, and keeps the edge's arc / junction only when both ends share it.
const expandAligned = (arr, ring, o, kind, arc) => o.map(v => { if (v.src != null) return arr[v.src]
  const q = v.edge, q1 = (q + 1) % ring.length
  if (kind === 'stamp') return arr[q]
  if (kind === 'corner') return false
  if (kind === 'arc') return arr[q] === arr[q1] ? arr[q] : null
  return (arc && arc[q] != null && arc[q] === arc[q1] && arr[q] === arr[q1]) ? arr[q] : null })   // junction
const ALIGNED_KIND = { iaStamp: 'stamp', iaCap: 'stamp', iaArc: 'arc', iaCorner: 'corner', iaJunction: 'junction' }
// ⭐ ② IS ONE RING: A CROSSING A CUT MINTED IN THE BLOCK IS WRITTEN INTO THE STRUCK CONTOUR TOO (02da626e's MORNING item 1, its
// first site; Boz, 2026-10-21). The bands are struck from `iaFull` (uncut, so a rim band is cut, never bent) and the block is
// `iA` (cut). A cut rounds its crossing onto the lattice in `iA` alone, so the cut sub-edge tilts off the struck edge it came
// from (LS tile 1: ≤ 0.4 mm along 79 m) and the asphalt (ring − iA) and the bands drew one line twice. Each such point is
// inserted into `iaFull` on the edge that holds it (insertOnEdges: the boolean's own containment, two grid units), and every
// iaFull-aligned array is carried (`expandAligned`). iaFull stays whole; its edge now passes through the crossing, so the
// block's edge IS a piece of the struck one. ⛔ An aligned array with no rule here, or a point no iaFull edge holds, throws.
function shareIntoFull(st, pts, where) {
  if (!pts.length) return st
  for (const [key, v] of Object.entries(st)) if (key !== 'iaFull' && /^ia[A-Z]/.test(key) && Array.isArray(v) && v.every(r => r == null || Array.isArray(r)) && !ALIGNED_KIND[key])
    throw new Error(`[tileGround][②] ⛔ ${where}: \`${key}\` is aligned to iaFull and has no insertion rule (ALIGNED_KIND) — it would read its neighbour's entry. Refusing.`)
  let rest = pts
  const full = [], out = { ...st }
  for (const k of Object.keys(ALIGNED_KIND)) if (st[k]) out[k] = []
  st.iaFull.forEach((ring, ri) => {
    const x = insertOnEdges(ring, ring.map((_, k) => ({ k })), rest, () => true)
    const o = x.ring.map((p, i) => ring[x.owners[i].k] === p ? { p, src: x.owners[i].k } : { p, edge: x.owners[i].k })
    rest = x.missed; full[ri] = x.ring
    for (const [k, kind] of Object.entries(ALIGNED_KIND)) if (st[k]) out[k][ri] = st[k][ri] ? expandAligned(st[k][ri], ring, o, kind, st.iaArc?.[ri]) : st[k][ri] })
  if (rest.length) throw new Error(`[tileGround][②] ⛔ ${where}: the cut minted a block crossing at (${rest[0][0].toFixed(3)}, ${rest[0][1].toFixed(3)}) that no edge of the struck contour (iaFull) holds — the block and its contour disagree. Refusing.`)
  out.iaFull = full
  return out
}
// `groups`: `prepareEvidence`'s output. Returns { tile: st⁺ (iaFull, iA and the aligned arrays stamped), groups: the
// evidence near this tile, stamped, in the same shape } — or { tile: st, groups } where there is nothing to stamp.
export function stampTile(st, groups) {
  if (!groups?.length || !st?.iaFull?.length) return { tile: st, groups }
  const bb = [Infinity, -Infinity, Infinity, -Infinity]
  for (const r of st.iaFull) for (const p of r) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.max(bb[1], p[0]); bb[2] = Math.min(bb[2], p[1]); bb[3] = Math.max(bb[3], p[1]) }
  const near = groups.map(g => ({ g, rings: g.rings.filter(x => !(x.bb[0] > bb[1] || x.bb[1] < bb[0] || x.bb[2] > bb[3] || x.bb[3] < bb[2])).map(x => x.r) })).filter(x => x.rings.length)
  const items = []
  st.iaFull.forEach((r, ri) => items.push({ kind: 'full', ri, r }))
  ;(st.iA || []).forEach((r, ri) => items.push({ kind: 'cut', ri, r }))
  near.forEach((x, gi) => x.rings.forEach(r => items.push({ kind: 'ev', gi, r })))
  // the two block contours against each other are the disc cut's business, and evidence × evidence the pour's
  // ⭐ noded ONCE by the one home (latticeNode.js#nodeCrossings: snap rounding by hot pixels, verified every run); a tile
  // contour meets the evidence, never itself or the other contour, and evidence never evidence (the pour's business)
  const out = nodeCrossings(items.map(x => ({ p: x.r, tag: x.kind })), { pairs: (a, b) => (items[a].kind === 'ev') !== (items[b].kind === 'ev'), who: 'stamp' })
  // an antenna the noding removed may take an input vertex with it (`out.dropped`): a CORNER or an ARC BOUNDARY (its arc
  // differs from a neighbour's: dropping a tangent moves the arc) is never dropped silently; one inside an arc or on a leg is
  // counted. A survivor carrying the first A's `src` with the second A's edge (`out.relabelled`) must name the same owner.
  // ⛔ AND A WATER RUN'S TIP THAT iA KEEPS IS NEVER DROPPED (Boz's ruling, 2026-10-27, on Zob's read): iaFull and iA are noded
  // apart, so an antenna routed into iaFull alone (two banks closer than a pixel or two, both through one hot pixel) cuts a
  // stretch of coast out of the struck contour that the block still carries, and the shore can bracket neither. Refused here,
  // at its cause. ▶ checks/claims-a-coast-finer-than-its-trace-is-not-drawn.mjs
  const kept = new Set(); items.forEach((x, n) => { if (x.kind === 'cut') for (const v of out[n]) kept.add(v.k[0] + ',' + v.k[1]) })
  const wetEdge = (ri, e) => st.runs?.[st.iaStamp?.[ri]?.[e]]?.skelId === WATER_EDGE_SKEL
  let antennaDropped = 0
  items.forEach((x, n) => { if (x.kind !== 'full') return
    const arc = st.iaArc?.[x.ri], m = x.r.length, at = (q) => `iaFull ring ${x.ri} vertex ${q} at (${x.r[q].join(', ')})`
    for (const q of out.dropped[n]) { antennaDropped++
      const K = x.r[q].map(c => Math.round(c * SCALE)).join(',')
      if ((wetEdge(x.ri, q) || wetEdge(x.ri, (q - 1 + m) % m)) && kept.has(K)) throw new Error(`[tileGround][stamp] ⛔ the noding removed an antenna through ${at(q)} on a WATER run, and the block (iA) keeps that point — the struck contour would lose a stretch of coast the block still carries. A coast feature finer than the trace (bake-coast opens and closes the water at its step). Refusing.`)
      if (st.iaCorner?.[x.ri]?.[q]) throw new Error(`[tileGround][stamp] ⛔ the noding removed an antenna through the CORNER ${at(q)} — the contour retraces itself at a corner. Refusing.`)
      if (arc && (arc[q] !== arc[(q - 1 + m) % m] || arc[q] !== arc[(q + 1) % m])) throw new Error(`[tileGround][stamp] ⛔ the noding removed an antenna through the ARC BOUNDARY ${at(q)} (arc ${arc[q]} between ${arc[(q - 1 + m) % m]} and ${arc[(q + 1) % m]}) — the arc's extent would move. Refusing.`) }
    for (const { src, edge } of out.relabelled[n]) if (st.iaStamp?.[x.ri] && st.iaStamp[x.ri][src] !== st.iaStamp[x.ri][edge]) throw new Error(`[tileGround][stamp] ⛔ an antenna's survivor at ${at(src)} keeps its own stamp (${st.iaStamp[x.ri][src]}) but leaves along input edge ${edge} (${st.iaStamp[x.ri][edge]}) — two owners at one retrace. Refusing.`) })
  const pts = (o) => o.map(v => v.p)
  const iaFull = [], iA = [], evRings = near.map(() => [])
  const expand = expandAligned
  const st2 = { ...st, iaStamp: [], iaArc: [], iaCorner: [], iaJunction: [], ...(st.iaCap ? { iaCap: [] } : {}) }
  items.forEach((x, n) => { const o = out[n]
    if (x.kind === 'cut') iA[x.ri] = pts(o)
    else if (x.kind === 'ev') evRings[x.gi].push(pts(o))
    else { iaFull[x.ri] = pts(o); const r = x.r
      st2.iaStamp[x.ri] = st.iaStamp?.[x.ri] ? expand(st.iaStamp[x.ri], r, o, 'stamp') : st.iaStamp?.[x.ri]
      // ⭐ a crossing on a cap edge takes that edge's cap, exactly as one on a run takes the run (the cap is the edge's owner)
      if (st.iaCap) st2.iaCap[x.ri] = st.iaCap[x.ri] ? expand(st.iaCap[x.ri], r, o, 'stamp') : st.iaCap[x.ri]
      st2.iaArc[x.ri] = st.iaArc?.[x.ri] ? expand(st.iaArc[x.ri], r, o, 'arc') : st.iaArc?.[x.ri]
      st2.iaCorner[x.ri] = st.iaCorner?.[x.ri] ? expand(st.iaCorner[x.ri], r, o, 'corner') : st.iaCorner?.[x.ri]
      st2.iaJunction[x.ri] = st.iaJunction?.[x.ri] ? expand(st.iaJunction[x.ri], r, o, 'junction', st.iaArc?.[x.ri]) : st.iaJunction?.[x.ri] } })
  st2.iaFull = iaFull; st2.iA = iA
  return { tile: st2, groups: near.map((x, gi) => ({ ...x.g, rings: evRings[gi].map(r => ({ r, bb: ringBB(r) })) })), counts: { ...out.counts, ...(antennaDropped ? { 'full: input vertices an antenna took': antennaDropped } : {}) } }
}

// A strip that keeps its own key, cut at the stamp's lines all the same: the same class groups, the same call.
// ⭐ THE RIM IS CUT ONCE: THE TILE RING CARRIES THE BLOCK'S OWN RIM CROSSINGS (BRIEF-the-rim-is-cut-once (C); Plumb's LS
// needle). The disc stamp cuts the tile's ① ring and its block `iA` separately, and each cut rounds its own crossings onto the
// lattice: a block edge that crosses the rim chord met it at a point the ring did not have, so `ring − iA` left a sub-lattice
// needle along the rim (LS tile 133: 12.7 m, ≤ 0.166 mm). The crossings the block's cut MINTED (its vertices in neither the
// input block nor the stamp, matched exactly on the grid) are inserted into the ring on the RIM-owned edge that holds them, by
// the boolean's own containment (two grid units, `cutOwned`'s rule): the same point, shared, never a second rounding.
// Returns { ring, owners } with the ring's edges split there (each half keeps the rim owner). ⛔ A minted crossing on no
// rim edge of its ring throws: the two cuts disagree about where the rim is.
// insert each point into the ring on the edge that holds it (the boolean's own containment, two grid units), among the edges
// `ok(k)` allows; each half of a split edge keeps that edge's owner. Returns { ring, owners, missed: the points no such edge holds }
function insertOnEdges(ring, owners, pts, ok) {
  const S = ring.map(toClipper), onSeg = (q, a, b) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy; if (!L2) return false
    const L = Math.sqrt(L2), u = (q.X - a.X) * dx + (q.Y - a.Y) * dy; return u > 0 && u < L2 && Math.abs((q.X - a.X) * dy - (q.Y - a.Y) * dx) / L <= 2 }
  const at = ring.map(() => []), missed = [], off = [], edgeOf = new Map()   // off: each placed point's distance off its edge's line, in grid units; edgeOf: its key → the edge
  for (const v of pts) { const q = toClipper(v), j = S.findIndex((a, k) => ok(k) && onSeg(q, a, S[(k + 1) % S.length]))
    if (j < 0) { missed.push(v); continue }
    edgeOf.set(q.X + ',' + q.Y, j)
    const a = S[j], b = S[(j + 1) % S.length], dx = b.X - a.X, dy = b.Y - a.Y
    off.push(Math.abs((q.X - a.X) * dy - (q.Y - a.Y) * dx) / Math.sqrt(dx * dx + dy * dy))
    at[j].push({ u: (q.X - a.X) * (b.X - a.X) + (q.Y - a.Y) * (b.Y - a.Y), v }) }
  const R = [], O = owners ? [] : null
  ring.forEach((p, k) => { R.push(p); O?.push(owners[k]); for (const { v } of at[k].sort((x, y) => x.u - y.u)) { R.push(v); O?.push(owners[k]) } })
  return { ring: R, owners: O, missed, off, edgeOf }
}
// ⭐ WHERE THE BLOCK FOLLOWS THE RING, THE RING CARRIES THE BLOCK'S VERTICES (Boz, 2026-10-21, on LS's papin-street nose and the
// coast). Where ① runs inside ② the face trim makes the block take the ring's own edges, and the points where it leaves them (the
// trim's crossings, and the land-use stamp's crossings along that stretch) were the block's alone: `ring − iA` and the deformer's
// rays then met two lines a rounding apart (LS tile 136: 100 unowned at the nose). Each such vertex — a block vertex the ring
// lacks, on a ring edge (insertOnEdges: the boolean's own two-unit containment), whose block neighbour is that edge's end or on
// that edge too, so the block runs along it — is inserted into the ring, splitting the edge, each half keeping its owner.
// ⛔ A block vertex merely NEAR a ring edge, the block not running along it, is not taken.
// ⭐ THE KERB'S COAST VERTICES ARE THE SHORE CELL'S TOO (Boz's ruling, Zob's read, 2026-10-26). Where the block's edge is a WATER
// edge it is also the shore cell's land side, and every vertex the block (`iA`) carries along a water run — the land-use stamp's
// crossings (A10), the joins where a street meets the water, any ② vertex on ①'s line — must be the cell's vertex as well: one
// it lacked left the coast held with two vertex sets, and `tile − iA − cells` kept the sub-step sliver between them as asphalt
// (Huron +1.5 km asphalt/shore; PTown's refusals, the joins). Each such vertex the cell lacks is BRACKETED by key: walk `iA` from
// it, both ways, to the nearest vertex a shore cell carries; insert it on that cell's stretch between the two by its parameter
// along them. Where only one side reaches a cell vertex c (a join, at the run's end), it goes on the cell edge from c whose
// parameter takes it strictly inside — exactly one, else refuse. KEY-ANCHORED: no containment, no distance. Proves itself:
// every water-run vertex of iA must end in a cell; any that does not REFUSES by name. Returns { tile, added }.
// ⭐ THE ONE CELL EDGE AT A KEY THAT HOLDS THE POINT (Zob's rule, Boz's go, 2026-10-26). Of the two edges of ring `rr` incident to
// vertex `ic` (the bracket's key — selection is anchored there), keep those whose parameter takes `v` strictly inside AND that hold
// it within the boolean's own containment (two grid units, insertOnEdges'); exactly one is returned, none or two is null (the
// caller refuses). ⛔ Not "the far end is on the water run": at a thin cell's corner (the ε strip, its sides 5 mm apart) both
// edges take the point's parameter, and the far-end key picked the wrong one (PTown (204.406, 67.434): 105 mm off; the right
// edge holds it at 0.06 mm). Exported for the planted row.
// the boolean's own containment: the point's parameter strictly inside edge a→b, and within two grid units of its line
const edgeHolds = (a, b, v) => { const P = toClipper(a), Q = toClipper(b), q = toClipper(v), dx = Q.X - P.X, dy = Q.Y - P.Y, L2 = dx * dx + dy * dy
  if (!L2) return false; const t = ((q.X - P.X) * dx + (q.Y - P.Y) * dy) / L2; if (!(t > 0 && t < 1)) return false
  return Math.abs((q.X - P.X) * dy - (q.Y - P.Y) * dx) / Math.sqrt(L2) <= 2 }
export function incidentEdgeHolding(rr, ic, v) {
  const m = rr.length, opts = [[ic, (ic + 1) % m], [(ic - 1 + m) % m, ic]].filter(([u, w]) => edgeHolds(rr[u], rr[w], v))
  return opts.length === 1 ? opts[0] : null
}
export function shareWaterRunIntoShore(tile, who) {
  const K = (v) => { const c = toClipper(v); return c.X + ',' + c.Y }
  // the vertices of iaFull on a water run (either edge stamped WATER_EDGE_SKEL), by key
  const wet = new Map()
  ;(tile.iaFull || []).forEach((r, si) => { const st = tile.iaStamp?.[si]; if (!st) return; const n = r.length
    r.forEach((v, e) => { if (tile.runs?.[st[e]]?.skelId === WATER_EDGE_SKEL || tile.runs?.[st[(e - 1 + n) % n]]?.skelId === WATER_EDGE_SKEL) wet.set(K(v), v) }) })
  const want = []; for (const r of (tile.iA || [])) r.forEach((v, i) => { if (wet.has(K(v))) want.push({ r, i, v }) })
  // ⭐ the walk steps along water EDGES, never wet vertices (Zob, 2026-10-26): an iA edge (a, b) is water when a and b sit on one
  // iaFull ring and every iaFull edge between them, the shorter way, is stamped to the water. A short kerb edge between two
  // joins (a jetty's end) has two wet ends and is not water: a walk across it would bracket across the street.
  const fullAt = new Map(); (tile.iaFull || []).forEach((r, si) => r.forEach((v, e) => { if (!fullAt.has(K(v))) fullAt.set(K(v), [si, e]) }))
  const waterEdge = (a, b) => { const A = fullAt.get(K(a)), B = fullAt.get(K(b)); if (!A || !B || A[0] !== B[0]) return false
    const r = tile.iaFull[A[0]], st = tile.iaStamp?.[A[0]], n = r.length; if (!st) return false
    const f = (B[1] - A[1] + n) % n, g = (A[1] - B[1] + n) % n, from = f <= g ? A[1] : B[1], len = Math.min(f, g)
    for (let q = 0; q < len; q++) if (tile.runs?.[st[(from + q) % n]]?.skelId !== WATER_EDGE_SKEL) return false
    return len > 0 }
  if (!want.length) return { tile, added: 0 }
  const cells = (tile.inkCells || []).map((c, ci) => ({ c, ci })).filter(x => x.c.cls === 'shore')
  // a face that borders NO ink (a bb corner between the water and the frame) has no shore cell: its ring IS the water line, and
  // the block's water-run vertices must be the RING's, by key (Boz's ruled case: the ring carries the edge). Else refuse.
  if (!cells.length) { const onRing = new Set((tile.ring || []).map(K)), off = want.filter(x => !onRing.has(K(x.v)))
    if (off.length) throw new Error(`[tileGround][shore] ⛔ ${who}: the block carries ${off.length} vertex(es) on a water run (e.g. (${off[0].v.map(c => c.toFixed(3)).join(', ')})) that neither a shore cell (the tile has none) nor the tile ring carries. Refusing.`)
    return { tile, added: 0 } }
  const rings = cells.map(x => x.c.rings.map(r => r.slice()))
  const keyAt = () => { const m = new Map(); rings.forEach((R, a) => R.forEach((r, b) => r.forEach((v, c) => { if (!m.has(K(v))) m.set(K(v), [a, b]) }))); return m }
  let at = keyAt(), added = 0, far = 0, farMax = 0
  const param = (P, A, B) => { const p = toClipper(P), a = toClipper(A), b = toClipper(B), dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy; return L2 ? ((p.X - a.X) * dx + (p.Y - a.Y) * dy) / L2 : NaN }
  for (const { r, i, v } of want) { if (at.has(K(v))) continue
    const n = r.length, walk = (dir) => { for (let s = 1; s < n; s++) { const u = r[(i + dir * (s - 1) + n * s) % n], w = r[(i + dir * s + n * s) % n]
      if (!waterEdge(u, w)) return null; if (at.has(K(w))) return w } return null }
    const lo = walk(-1), hi = walk(1)
    let placed = false
    const tryEdge = (rr, u, w) => { const t = param(v, rr[u], rr[w]); if (!(t > 0 && t < 1)) return false; const e = [rr[u], rr[w]]; rr.splice(w === (u + 1) % rr.length ? u + 1 : u, 0, v); return e }
    if (lo && hi && at.get(K(lo))[0] === at.get(K(hi))[0] && at.get(K(lo))[1] === at.get(K(hi))[1]) {
      const [a, b] = at.get(K(lo)), rr = rings[a][b], m = rr.length, ia = rr.findIndex(w => K(w) === K(lo)), ib = rr.findIndex(w => K(w) === K(hi))
      // the way round the cell BY KEY (Zob): the one whose intermediate cell vertices are all on the water run; neither or both refuses
      const fwd = (ib - ia + m) % m, back = (ia - ib + m) % m
      const allWet = (step, len) => { for (let q = 1; q < len; q++) if (!wet.has(K(rr[(ia + step * q + m) % m]))) return false; return true }
      const okF = fwd > 0 && allWet(1, fwd), okB = back > 0 && allWet(-1, back)
      if (!okF && !okB) throw new Error(`[tileGround][shore] ⛔ ${who}: the shore cell's stretch for (${v.map(c => c.toFixed(3)).join(', ')}) is neither way round the cell on the water run, by key. Refusing.`)
      // ⭐ ONE CONTAINMENT RULE (Boz, 2026-10-27, rule (1)): of the sub-edges on the wet way(s) between the bracket keys — BOTH ways
      // when the run is CLOSED (an island's shore cell rings it, wet end to end) — keep those that HOLD the point (t in (0, 1), within
      // insertOnEdges' two-unit containment), as incidentEdgeHolding does at one key; exactly one is placed, none or two refuses
      const cands = []
      for (const [step, len, ok] of [[1, fwd, okF], [-1, back, okB]]) { if (!ok) continue
        for (let q = 0; q < len; q++) { const u = (ia + step * q + m) % m, w = (ia + step * (q + 1) + m) % m; if (edgeHolds(rr[u], rr[w], v)) cands.push({ u, w, step }) } }
      if (cands.length !== 1) throw new Error(`[tileGround][shore] ⛔ ${who}: ${cands.length} shore-cell sub-edges between the bracket keys hold (${v.map(c => c.toFixed(3)).join(', ')}) — want exactly 1${okF && okB ? ' (a closed run: both ways round)' : ''}. Refusing.`)
      { const c = cands[0]; placed = [rr[c.u], rr[c.w]]; rr.splice(c.step > 0 ? c.u + 1 : c.u, 0, v) } }
    else { // one side only (a run's end): the cell edge from that side's vertex that takes the point strictly inside — exactly one
      const c = lo || hi
      if (c) { const [a, b] = at.get(K(c)), rr = rings[a][b], m = rr.length, ic = rr.findIndex(w => K(w) === K(c))
        const e = incidentEdgeHolding(rr, ic, v); if (e) placed = tryEdge(rr, ...e) }
      // ⭐ NO BRACKET KEY AT ALL (Zob, 2026-10-27: Huron's land between motorway-65's and motorway-56's bank ends, a water run whose
      // two ends are both H × water joins): the open sibling of the island's closed run. The same containment, widened from a key's
      // incident edges to every edge of the tile's shore cells: the one edge that HOLDS the point, exactly one, else refuse by name
      else { const cands = []
        rings.forEach((R2, a) => R2.forEach((rr, b) => rr.forEach((q, u) => { const w = (u + 1) % rr.length; if (edgeHolds(q, rr[w], v)) cands.push({ rr, u, w }) })))
        if (cands.length !== 1) throw new Error(`[tileGround][shore] ⛔ ${who}: the block's vertex (${v.map(c => c.toFixed(3)).join(', ')}) on a water run with no bracket key is held by ${cands.length} shore-cell edges (want exactly 1). Refusing.`)
        placed = tryEdge(cands[0].rr, cands[0].u, cands[0].w) } }
    // ⭐ VERIFIED, never chosen, by distance (Zob): the key-chosen edge must hold the point within the boolean's own containment
    // (two grid units, insertOnEdges'); past it refuses. Counted and printed, as nodeRimWithPaint's far / farMax.
    if (placed) { const [P, Q] = placed.map(toClipper), q = toClipper(v), dx = Q.X - P.X, dy = Q.Y - P.Y, d = Math.abs((q.X - P.X) * dy - (q.Y - P.Y) * dx) / Math.hypot(dx, dy)
      if (d > 2) throw new Error(`[tileGround][shore] ⛔ ${who}: the block's vertex (${v.map(c => c.toFixed(3)).join(', ')}) went on a key-chosen shore-cell edge ${d.toFixed(2)} grid units off its line (past the two-unit containment). Refusing.`)
      if (d > Math.SQRT1_2) { far++; farMax = Math.max(farMax, d) } }
    if (!placed) throw new Error(`[tileGround][shore] ⛔ ${who}: the block's vertex (${v.map(c => c.toFixed(3)).join(', ')}) on a water run has no place on a shore cell (bracket ${lo ? 'found' : 'none'} / ${hi ? 'found' : 'none'}): the coast would be held with two vertex sets. Refusing.`)
    added++; at = keyAt() }
  // the proof: every water-run vertex of iA is now a shore cell's
  const miss = want.filter(x => !at.has(K(x.v)))
  if (miss.length) throw new Error(`[tileGround][shore] ⛔ ${who}: ${miss.length} of ${want.length} water-run vertex(es) of the block are on no shore cell after sharing (e.g. (${miss[0].v.map(c => c.toFixed(3)).join(', ')})). Refusing.`)
  let k = 0
  return { tile: { ...tile, inkCells: tile.inkCells.map(c => c.cls === 'shore' ? { ...c, rings: rings[k++] } : c) }, added, far, farMax }
}
// ⛔ A CUT INK-CELL RING GOES TO THE ONE DISC PIECE THAT CONTAINS IT — CONTAINMENT, NEVER THE LARGEST (Boz, 2026-10-26). The
// overlap is the positive-AREA intersection, as the curb's rings are assigned; a ring overlapping zero or two pieces is a
// disagreement between the cut and the pieces, and refuses by name. Exported for the planted rim-tile fixture.
// THE CIRCLE'S CUT OF ONE INK-CELL RING (Zob, 2026-10-26): a ring wholly inside is returned as it is, one wholly outside as
// nothing, and one across is cut with ioPreserveCollinear, so the cut adds rim crossings and removes nothing else. It PROVES it:
// every vertex of the input strictly inside the disc must be a vertex of the output, by key, or it refuses. Exported for the
// planted row.
export function cutCellRing(r0, stamp) {
  const across = differenceRings([r0], [stamp]).length > 0, within = intersectRings([r0], [stamp]).length > 0
  if (!within) return []
  if (!across) return [r0]
  const out = intersectRings([r0], [stamp], { preserveCollinear: true })
  const K = (v) => { const c = toClipper(v); return c.X + ',' + c.Y }, have = new Set(out.flat().map(K))
  const wn = (p, r) => { let w = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if (zj <= p[1]) { if (zi > p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) > 0) w++ } else if (zi <= p[1] && (xi - xj) * (p[1] - zj) - (p[0] - xj) * (zi - zj) < 0) w-- } return w }
  const lost = r0.filter(v => wn(v, stamp) !== 0 && !have.has(K(v)) && !stamp.some(s => K(s) === K(v)))
  if (lost.length) throw new Error(`[tileGround][PROTO⊙] ⛔ the circle's cut of an ink cell ring lost ${lost.length} of its vertices inside the disc (e.g. (${lost[0].map(c => c.toFixed(3)).join(', ')})): the cell and the block would hold that line with two vertex sets. Refusing.`)
  return out
}
export function cellPieceOf(q, pieces) {
  const a = pieces.map(r => intersectRings([q], [r]).reduce((u, x) => u + Math.abs(signedArea(x)), 0)), hit = a.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0)
  if (hit.length !== 1) throw new Error(`[tileGround][PROTO⊙] ⛔ an ink cell ring of a rim tile (at ${q[0]}) overlaps ${hit.length} of its ${pieces.length} disc pieces (want exactly 1). Refusing.`)
  return hit[0]
}
function shareBlockIntoRing(t) {
  if (!t.iA?.length || !t.ring?.length) return { t, added: 0 }
  const K = (v) => { const c = toClipper(v); return c.X + ',' + c.Y }, have = new Set(t.ring.map(K))
  if (!t.iA.some(r => r.some(v => have.has(K(v))))) return { t, added: 0 }   // the block takes none of the ring: nothing to share
  const cand = [], seen = new Set(); for (const r of t.iA) for (const v of r) { const k = K(v); if (!have.has(k) && !seen.has(k)) { seen.add(k); cand.push(v) } }
  const { edgeOf } = insertOnEdges(t.ring, t.ringOwner, cand, () => true), n = t.ring.length, keep = [], took = new Set()
  for (const r of t.iA) r.forEach((v, i) => { const k = K(v), e = edgeOf.get(k); if (e == null || took.has(k)) return
    const ends = new Set([K(t.ring[e]), K(t.ring[(e + 1) % n])])
    if ([r[(i - 1 + r.length) % r.length], r[(i + 1) % r.length]].some(w => ends.has(K(w)) || edgeOf.get(K(w)) === e)) { took.add(k); keep.push(v) } })
  if (!keep.length) return { t, added: 0 }
  const sh = insertOnEdges(t.ring, t.ringOwner, keep, () => true)
  return { t: { ...t, ring: sh.ring, ringOwner: sh.owners }, added: keep.length }
}
// a shape stamped with exactly this stencil, vertex for vertex on the grid: the recorded fact that decides the rim is cut once
// (sectionOpen's finish here, the bake's stencil clip in bake-ground.js). ⛔ Never decided on geometry.
export const sameStamp = (a, b) => a?.length === b?.length && a.every((v, k) => { const p = toClipper(v), q = toClipper(b[k]); return p.X === q.X && p.Y === q.Y })
export function shareRimCrossings(ring, owners, cutBlock, inputBlock, stamp) {
  const K = (v) => { const c = toClipper(v); return c.X + ',' + c.Y }, known = new Set([...inputBlock.flat(), ...stamp].map(K)), have = new Set(ring.map(K))
  const minted = []; for (const r of cutBlock) for (const v of r) { const k = K(v); if (!known.has(k) && !have.has(k)) { minted.push(v); have.add(k) } }
  if (!minted.length) return { ring, owners, added: 0 }
  const sh = insertOnEdges(ring, owners, minted, (k) => owners[k]?.kind === 'rim')
  if (sh.missed.length) { const v = sh.missed[0]; throw new Error(`[tileGround][PROTO⊙] ⛔ the disc cut minted a block crossing at (${v[0].toFixed(3)}, ${v[1].toFixed(3)}) on no rim edge of its tile ring — the ring and the block disagree about the rim. Refusing.`) }
  return { ring: sh.ring, owners: sh.owners, added: minted.length }
}
// ⭐ THE PAINT'S RIM CROSSINGS ARE THE BLOCK'S AND THE RING'S (BRIEF-the-rim-is-cut-once follow-on (2), Boz 2026-10-21). Each
// paint operand cut by the block crosses the block's rim edge at a point the lattice rounds on its own; rounded INTO the
// ring, the band's rim kinks in and leaves a wedge no one paints (HPDM tile 49: 7.7 mm along an oblique ray, sub-mm across;
// HPDM 964 such vertices, 606 inward). Every vertex the paint minted on a rim edge of the tile ring (in neither the ring nor
// the block) is inserted into the ring's rim edge and the block's edge that holds it, so the paint's rim is a piece of both
// rims. ⛔ LIVE, never frozen: the paint follows authoring, and the shape is fill-free (the wall) — the noded ring and block
// are the painter's OUTPUT (`rim`), which the asphalt, the block and the deformer's 'beyond' read. ⛔ One the block holds on
// no edge throws. ▶ node checks/claims-the-rim-is-cut-once.mjs
function nodeRimWithPaint(st, paint, nodePaint) {
  if (!st.ringOwner?.some(o => o?.kind === 'rim')) return null
  const K = (v) => { const c = toClipper(v); return c.X + ',' + c.Y }, have = new Set([...st.ring, ...(st.iA || []).flat()].map(K))
  const rimEdge = (k) => st.ringOwner[k]?.kind === 'rim'
  const pts = []; for (const r of paint) for (const v of r) { const k = K(v); if (have.has(k)) continue; have.add(k); pts.push(v) }
  const onRing = insertOnEdges(st.ring, st.ringOwner, pts, rimEdge), minted = pts.filter(v => !onRing.missed.includes(v))
  // ⭐ EVERY TILE WITH A RIM EDGE HAS AN ENTRY, minted or not (Zob placed it, Boz ruled, 2026-10-21): it is the rim's positive
  // name, read by the kerb's finder and the deformer. ⛔ An absent entry used to mean "nothing minted" as well as "no rim",
  // and LS lost 185 m of named rim that way; now it means only a tile with no rim edge.
  if (!minted.length) return { ring: st.ring, owners: st.ringOwner, block: st.iA || [], added: 0, far: 0, farMax: 0 }
  const block = (st.iA || []).map(r => { const x = insertOnEdges(r, null, minted, () => true); return x }), placed = new Set()
  for (const x of block) for (const v of minted) if (!x.missed.includes(v)) placed.add(v)
  const lost = minted.filter(v => !placed.has(v))
  if (lost.length) throw new Error(`[tileGround][rim] ⛔ the paint minted a rim crossing at (${lost[0][0].toFixed(3)}, ${lost[0][1].toFixed(3)}) that no edge of its block holds — the paint and the block disagree about the rim. Refusing.`)
  // ⭐ …and every painted piece takes them too: a crossing one class minted lies on a stretch of rim another class's edge spans,
  // so noding only the ring kinked it away from that edge (measured, LS tile 38: a 1.1 mm lot slice the ring's kink opened)
  nodePaint((r) => insertOnEdges(r, null, minted, () => true).ring)
  // ⚠️ COUNTED, NEVER SILENT (Boz, 2026-10-21): a crossing placed farther off the TILE RING'S rim edge than one rounding (√2/2
  // grid step) bends that rim by as much. Accepted, because leaving it un-noded brings the wedge back; why a crossing sits past
  // the single-rounding bound is CAUSE NOT ESTABLISHED. ▶ the pour prints the count. (Counted on the ring only; the block and
  // the paint pieces take the same points.)
  const far = onRing.off.filter(d => d > Math.SQRT1_2)
  return { ring: onRing.ring, owners: onRing.owners, block: block.map(x => x.ring), added: minted.length, far: far.length, farMax: far.length ? Math.max(...far) / SCALE : 0 }
}
export function cutByStamp(st, own, sp = null) {
  if (!own?.length) return own
  sp ||= stampParts(st)
  if (sp.whole) return own
  const out = []
  for (const lu of sp.classes) out.push(...intersectRings(own, sp.regionsOf(lu)))
  warnOutside(sp, own, 'walk/curb paint')
  return out
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
// ⭐⭐⭐ WHY A CORNER WAS NOT EASED — WIRED 2026-09-08. It was DECLARED here and referenced NOWHERE
// ELSE, so every skip below was a bare `continue`: the construction knew its own reason and never
// said it. That is the silent-decline shape this repo keeps finding, in the one place a corner is
// decided — and it cost a session inferring predicates from outside the function that the function
// was already evaluating. ⛔ DISCLOSURE ONLY: no branch changes, no geometry moves.
// ⭐ `noR` is the one that earns this: `isCorner_` is `R_[i] > 1e-9 && turn >= FILLET_TURN_TOL`, so a
// vertex whose authored radius resolves to ZERO is not a corner AT ALL — it fails the first test and
// is indistinguishable, from outside, from a vertex that simply does not turn. Those are opposite
// facts and they must never share a silence.
const easeSkips = { noR: 0, straight: 0, straightWithR: 0, reversal: 0, degenerateLeg: 0, zeroSetback: 0, legClamped: 0, eased: 0, pairClamped: 0, noseCapped: 0, noseSpike: 0, noseNarrow: 0 }
// ⭐ `pairClamped` / `easePairSites` — two NAMED corners (each eased at its own ① vertex) on one shared leg too short for
// both: each is bounded by half that leg, so both come out below their R. Ruled behaviour (a corner takes the R its leg
// allows), disclosed because the pair reads as one squeezed corner (JH, 2026-10-17: r 0.260 + 0.045 where one 4.5 m arc was).
const easePairSites = []
// `noseCapped` / `noseSpike` / `noseNarrow` + `easeNoseSites` — the nose (see easeContour): a pair cut back to the minimum
// curbed width and capped · a pair folded back past 180° (a spike, not cut) · a pair narrower than that width to the next corner.
const easeNoseSites = []
export function easeSkipsTake() { const o = { ...easeSkips, pairSites: easePairSites.splice(0), noseSites: easeNoseSites.splice(0) }; for (const k in easeSkips) easeSkips[k] = 0; return o }
const EASE_ARC_TOL = 0.01            // m — the sagitta a tessellated arc may miss by (= `derive.js`'s ARC_TOL)
// `out` (optional) collects the ACHIEVED arc per eased corner — {i, V, R, C, r, tA, tB}. This is
// the corner TRUTH the authoring handle rides: `SURVEY §4` — "the ONE corner truth the magenta
// handle reads (no re-derivation)". ⛔ Without it the handle sits on the LEGACY fillet while the
// drawn curb is ②'s eased arc, and the operator's dial moves a corner that is not on screen.
// ⭐⭐⭐ AND IT RETURNS `arc` — WHICH OUTPUT VERTEX BELONGS TO WHICH CORNER'S ARC.
// ⛔ THIS IS THE CORNER'S EXTENT, AND IT IS THE ONE PLACE THAT KNOWS IT. The consumer used to
// recover it by matching the frozen fillet's TANGENT COORDINATES back onto the contour across a
// boolean — `A15`'s forbidden proximity recovery, wearing a 1 mm grid hash — and it reached only
// part of the corners (▶ `node checks/claims-the-corner-extent-is-carried.mjs`, which reports the
// share on any town). ⭐ Identity CARRIED through, never recovered afterward (`RIBBONS §1`).
function easeContour(ring, rAt, labs = null, arcsOut = null, vtx = null, nose = null, turnAtSrc = null) {
  let n = ring.length
  if (n < 3) return { ring, labs, arc: ring.map(() => null), vtx }
  const seg = (a, b) => { const dx = b[0]-a[0], dz = b[1]-a[1]; const L = Math.hypot(dx, dz); return { L, d: L > 1e-12 ? [dx/L, dz/L] : [0, 0] } }
  let R_ = new Array(n); for (let i = 0; i < n; i++) R_[i] = Math.max(0, rAt(i) || 0)
  let eLen, turnAt_, isCorner_, legBack, legFwd
  const measure = () => {
  eLen = new Array(n)
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
  turnAt_ = new Array(n)
  for (let i = 0; i < n; i++) {
    const A = seg(ring[(i - 1 + n) % n], ring[i]), B = seg(ring[i], ring[(i + 1) % n])
    turnAt_[i] = Math.atan2(Math.abs(A.d[0] * B.d[1] - A.d[1] * B.d[0]), A.d[0] * B.d[0] + A.d[1] * B.d[1])
    // ⭐ a vertex struck from a ① sub-ink CLUSTER turns as its cluster does (`subInkClusters`, radians, null off a cluster):
    // the offset keeps the short edge, so its own turn is only part of the corner (12° + 12° is one 24° corner)
    const tc = turnAtSrc && vtx?.[i] != null ? turnAtSrc(vtx[i]) : null
    if (tc != null) turnAt_[i] = tc
  }
  isCorner_ = new Array(n)
  for (let i = 0; i < n; i++) isCorner_[i] = R_[i] > 1e-9 && turnAt_[i] >= FILLET_TURN_TOL
  legBack = new Array(n).fill(0); legFwd = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    let L = 0
    for (let k = 1; k <= n; k++) { const j = (i - k + n) % n; L += eLen[j]; if (isCorner_[j]) break }
    legBack[i] = L
    L = 0
    for (let k = 0; k < n; k++) { const j = (i + k) % n; L += eLen[j]; if (isCorner_[(j + 1) % n]) break }
    legFwd[i] = L
  }
  }
  measure()
  // walk `dist` along the ring from vertex `from` (dir −1 back, +1 forward) → the point there, and the edge it lies on
  const walkAt = (from, dir, dist) => {
    let left = dist, j = from
    for (let k = 0; k < n; k++) {
      const eIdx = dir < 0 ? (j - 1 + n) % n : j
      const L = eLen[eIdx]
      const a = ring[j], b = ring[dir < 0 ? eIdx : (j + 1) % n]
      if (L >= left) { const t = L > 1e-12 ? left / L : 0; return { p: [a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t], e: eIdx } }
      left -= L; j = dir < 0 ? (j - 1 + n) % n : (j + 1) % n
    }
    return { p: ring[j], e: j }
  }
  const walk = (from, dir, dist) => walkAt(from, dir, dist).p

  // ── THE NOSE — a curbed feature ENDS where the block narrows to the minimum curbed width (Jacob, 2026-10-17: "end and
  // round like everything else"). `nose.w` is that width, read by finding id at pour (`curbedMinWidth`). Two named corners on
  // one leg shorter than w, both turning toward the solid, are the two sides of a point the curb cannot be built to: the ring
  // is cut back to where the block is w wide — the cut from a point on the leg behind the first corner to the nearest point
  // of the leg after the second — and that cut is the end. Below it the curb is gone (`RIBBONS §1`: a feature that cannot
  // exist goes to zero there). The end that remains is a dead-end CAP by the existing rule: TWO ordinary corners, both
  // eased once by the loop below, at r = w/2 (⛔ [U] q-curbed-nose-radius — derived, no source states it).
  // ⛔ NOT a merged corner and NOT a second rounding: the cut moves where the two corners are, and the one ease rounds them.
  // Only a POINT is cut: the two turns (and the samples between) sum past 90°, so the end's interior angle is acute.
  // A pair whose turns sum past 180° folds back on itself (the end WIDENS outward): a spike, reported and not cut. A pair
  // whose block stays narrower than w all the way back to the next corner has no place to end: reported and not cut.
  // Assumes the ring's solid is on its left (Clipper's output orientation, outer and hole alike).
  const capped = new Set()          // the ring points a nose cut made: their pair is the cap, not a squeezed pair
  if (nose) {
    const w = nose.w, judged = new Set()
    const turnS = (k) => { const P = ring[(k - 1 + n) % n], V = ring[k], N = ring[(k + 1) % n]
      return Math.atan2((V[0]-P[0]) * (N[1]-V[1]) - (V[1]-P[1]) * (N[0]-V[0]), (V[0]-P[0]) * (N[0]-V[0]) + (V[1]-P[1]) * (N[1]-V[1])) }
    for (let guard = 0; guard <= n; guard++) {
      let hit = null
      for (let i = 0; i < n && !hit; i++) {
        if (!isCorner_[i] || capped.has(ring[i]) || judged.has(ring[i]) || !(legFwd[i] < w)) continue
        let j = (i + 1) % n; while (j !== i && !isCorner_[j]) j = (j + 1) % n
        if (j === i || capped.has(ring[j]) || !(turnS(i) > 0 && turnS(j) > 0)) continue
        let S = 0; for (let k = i; ; k = (k + 1) % n) { S += turnS(k); if (k === j) break }
        hit = { i, j, S }
      }
      if (!hit) break
      const { i, j, S } = hit, site = { a: ring[i], b: ring[j], leg: legFwd[i], turnDeg: S * 180 / Math.PI }
      judged.add(ring[i])
      // ⭐ a POINT is an end whose interior angle is acute (the needle check's own definition): turns summing to 90° or less
      // are one ordinary corner drawn across a short leg, not a point — left to the ease, as every corner is
      if (!(S > Math.PI / 2)) continue
      if (S > Math.PI) { easeSkips.noseSpike++; easeNoseSites.push({ kind: 'spike', ...site }); continue }
      // the leg after j, to the next corner: the nearest point on it to Q
      const after = []; for (let k = j, L = 0; L < legFwd[j] - 1e-12; k = (k + 1) % n) { after.push(k); L += eLen[k] }
      const cut = (p) => { const Q = walkAt(i, -1, p); let best = null
        for (const k of after) { const a = ring[k], b = ring[(k + 1) % n], dx = b[0]-a[0], dz = b[1]-a[1], L2 = dx*dx + dz*dz
          const t = L2 ? Math.max(0, Math.min(1, ((Q.p[0]-a[0]) * dx + (Q.p[1]-a[1]) * dz) / L2)) : 0, q = [a[0] + t*dx, a[1] + t*dz], d = Math.hypot(q[0]-Q.p[0], q[1]-Q.p[1])
          if (!best || d < best.d) best = { p: q, e: k, t, d } }
        return { Q, best } }
      const pMax = legBack[i] - 1e-6, far = cut(pMax)
      if (!(far.best?.d >= w) || (far.best.e === after.at(-1) && far.best.t >= 1)) { easeSkips.noseNarrow++; easeNoseSites.push({ kind: 'narrow', ...site }); continue }
      let lo = 0, hi = pMax
      for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (cut(mid).best.d >= w) hi = mid; else lo = mid }
      const { Q, best } = cut(hi), e1 = Q.e, e2 = best.e
      // keep ring[e2+1 … e1]; between ring[e1] and ring[e2+1] the tip is replaced by the cut Q1 → Q2
      const drop = new Set(); for (let k = (e1 + 1) % n; ; k = (k + 1) % n) { drop.add(k); if (k === e2) break }
      const Q1 = Q.p, Q2 = best.p, R2 = [], L2 = [], V2 = [], r2 = []
      for (let k = 0; k < n; k++) { if (drop.has(k)) continue
        R2.push(ring[k]); L2.push(labs ? labs[k] : null); V2.push(vtx ? vtx[k] : null); r2.push(R_[k])
        if (k === e1) { R2.push(Q1, Q2); L2.push(labs ? labs[i] : null, labs ? labs[e2] : null); V2.push(vtx ? vtx[i] : null, vtx ? vtx[j] : null); r2.push(w / 2, w / 2) } }
      ring = R2; labs = labs ? L2 : null; vtx = vtx ? V2 : null; R_ = r2; n = ring.length
      capped.add(Q1); capped.add(Q2); easeSkips.noseCapped++; easeNoseSites.push({ kind: 'capped', ...site, cut: [Q1, Q2] })
      measure()
    }
  }

  // ── PASS 1 — plan every corner, and which samples its arc swallows ──────────────────────────
  // ⛔ TWO PASSES, DELIBERATELY. A corner's arc reaches BACKWARD as well as forward, so the samples
  // it replaces include ones already emitted if this is done in a single walk. Planning first is
  // what makes the span honest instead of one-sided.
  const plan = new Map()          // corner index → { arc points, labels }
  const covered = new Set()
  const clampFwd = new Map(), clampBack = new Set()   // eased corners bounded by half their forward / backward leg
  for (let i = 0; i < n; i++) {
    // ⛔ Plan a corner only where there IS one — a curve sample is passed through, exactly as
    // `filletRing` passes it through. Rounding an 18° vertex is invisible and it costs its
    // neighbours their legs.
    const R = R_[i]
    if (!isCorner_[i]) {
      // ⛔ TWO DIFFERENT FACTS, AND THEY LOOKED IDENTICAL FROM OUTSIDE: a vertex that does not turn
      // is a curve sample (correct, expected); a vertex that TURNS and has no radius is a corner
      // whose authored R did not resolve — a lost corner, and the operator gets no ADA pad there.
      if (turnAt_[i] >= FILLET_TURN_TOL) easeSkips.noR++
      // ⭐⭐⭐ THE THIRD FACT IN THIS SILENCE: a vertex that HAS an authored radius and is skipped
      // for not turning — on the OFFSET ring. ① ruled it a corner (that is why R resolved), the
      // offset ring says it is straight, and the ease walks the offset ring. ⛔ If this is non-zero
      // the two rings disagree about what a corner is, and ① is the authority by ruling
      // (`RIBBONS §1`: read the corner off ①, never off ②).
      else if (R_[i] > 1e-9) easeSkips.straightWithR++
      else easeSkips.straight++
      continue
    }
    const P = ring[(i - 1 + n) % n], V = ring[i], N = ring[(i + 1) % n]
    const A = seg(P, V), B = seg(V, N)
    if (!(A.L > 1e-9) || !(B.L > 1e-9)) { easeSkips.degenerateLeg++; continue }
    const cross = A.d[0]*B.d[1] - A.d[1]*B.d[0], dot = A.d[0]*B.d[0] + A.d[1]*B.d[1]
    const theta = Math.atan2(Math.abs(cross), dot)
    if (!(theta > 1e-6)) { easeSkips.straight++; continue }
    if (theta > Math.PI - 1e-6) { easeSkips.reversal++; continue }
    const want = R * Math.tan(theta / 2)
    const s = Math.min(want, legBack[i] / 2, legFwd[i] / 2)
    if (!(s > 1e-9)) { easeSkips.zeroSetback++; continue }
    // ⭐ NOT a skip — the corner IS eased, at less than the authored R because its own leg bounds it
    // (the topological bound, `RIBBONS §1`). Counted so a shrunken corner is never mistaken for an
    // absent one, and never for an achieved authored radius either.
    if (s < want - 1e-9) { easeSkips.legClamped++
      if (vtx?.[i] != null && s >= legFwd[i] / 2 - 1e-9) clampFwd.set(i, V)
      if (vtx?.[i] != null && s >= legBack[i] / 2 - 1e-9) clampBack.add(i) }
    easeSkips.eased++
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
      // `asked` = the radius this corner was given; `leg` = the leg that bounded it when the ease drew less (else null)
      const leg = s < want - 1e-9 ? (s >= legBack[i] / 2 - 1e-9 ? legBack[i] : legFwd[i]) : null
      arcsOut.push({ i, V, R: Reff, C: [T1[0] + nA[0]*Reff, T1[1] + nA[1]*Reff], r: Reff, tA: T1, tB: T2, src: vtx ? vtx[i] : undefined, asked: R, leg })
    }
  }

  // a pair: corner i bounded by its forward leg, and the next corner along that leg bounded by the same leg from behind
  for (const [i, V] of clampFwd) { let j = (i + 1) % n; while (j !== i && !isCorner_[j]) j = (j + 1) % n
    if (j !== i && clampBack.has(j) && !(capped.has(V) && capped.has(ring[j]))) { easeSkips.pairClamped++; easePairSites.push({ a: V, b: ring[j], leg: legFwd[i], R: [R_[i], R_[j]] }) } }

  // ── PASS 2 — emit ──────────────────────────────────────────────────────────────────────────
  const out = [], outL = [], outA = [], outV = []
  for (let i = 0; i < n; i++) {
    const pl = plan.get(i)
    // ⭐ every point of this corner's arc is stamped with the corner's own index, so a consumer
    // reads "these edges are one corner" instead of measuring for it.
    if (pl) { for (let k = 0; k < pl.pts.length; k++) { out.push(pl.pts[k]); outL.push(k < pl.pts.length / 2 ? pl.lIn : pl.lOut); outA.push(i); outV.push(vtx ? vtx[i] : null) } ; continue }
    if (covered.has(i)) continue
    out.push(ring[i]); outL.push(labs ? labs[i] : null); outA.push(null); outV.push(vtx ? vtx[i] : null)
  }
  const ok = out.length >= 3
  return { ring: ok ? out : ring, labs: labs ? (ok ? outL : labs) : null, arc: ok ? outA : ring.map(() => null), vtx: vtx ? (ok ? outV : vtx) : null }
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
// Pure ring/key helpers, module scope, shared by the painters below.
const tipKey = (p) => Math.round(p[0] * SCALE) + ',' + Math.round(p[1] * SCALE)
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

// [F — EDGE OF MAP] The skelId ①'s rim edges carry (the disc ring stroked into the mint). It resolves to NO street:
// no curb or sidewalk on the map edge, land use floods to the boundary.
export const BOUNDARY_EDGE_SKEL = '__boundary__'
// ⭐⭐⭐ THE COAST IS INK, AND THAT IS WHAT MAKES IT UNLIKE THE RIM (Jacob, 2026-09-20:
// "we see the difference between land and water, and the geometry creates the water field
// and on the other side (land-ward side) closes the rest of the LU polygons, especially
// the dead-ends").
// ⛔ `__boundary__` is the DISC — a render knob (radius, the Look's edge fade, aesthetic padding, all
// live-editable), which is exactly why `RIBBONS §1` forbids it from deciding block geometry.
// A SHORELINE IS GROUND TRUTH. `ROADMAP H-4`: "this should be EASIER than a man-made
// feature, because a shoreline is absolute and permanent(ish) where a curb is authored and
// negotiable." A block that runs to the water genuinely ends there.
// ⇒ So the coast is STROKED INTO ① like any chain, and `frame − ink` then yields the WATER
// FIELD on one side and closed land faces on the other — including, at last, a closed face
// for a dead-end that runs at the water, which a graph walk can never close on its own
// (`PREBAKE §4.0`: all 50 LS dead-end tips are zero-width slits).
// ⛔ IT IS STILL NOT A STREET: no coupler, no baseMeasure, no band, no ADA, no cap. It closes
// faces and is drawn as the edge between land and water; nothing offsets a curb from it.
export const WATER_EDGE_SKEL = '__water__'
// ⭐ THE HIGHWAY CLASSES, ONE SET (Zob, 2026-10-27: the mint's and buildTileGround's were two literals that could drift): a
// grade-separated chain of these is swept as H (`sweepHighway`), and its span over the water is H's (`highwayBridges`)
export const HIGHWAY_CLASSES = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link'])
// the owner of an edge the H difference drew (buildTileGround) — a kit PSEUDO-owner, like the two above: no street
export const HWY_SKEL = '__highway__'
// ⭐ THE KIT'S PSEUDO-OWNERS, BY NAME: the owners of an edge no street drew. The road paint skips exactly these (Zob, 2026-10-25):
// ⛔ never "no marks record" — that is a skip by ABSENCE, and a stale skelId, a dropped street or a re-keyed typo would lose its
// paint silently. Any other owner without a marks record refuses.
export const PSEUDO_OWNERS = new Set([BOUNDARY_EDGE_SKEL, WATER_EDGE_SKEL, HWY_SKEL])

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
const VALLEY_LO = 0.25, VALLEY_HI = 0.75   // the bimodal valley span (the ~92 ambiguous run-sides)
// ⛔⛔ A CLAMPED ZERO IS NOT A SURVEYED ZERO. `skeleton.js`'s `fromSurveyDist` pins the asphalt
// flush when the lanes/AASHTO seed will not fit inside a MEASURED sidewalk position, and the
// treelawn is crushed to exactly 0 as the residue. Thresholding that 0 answers "the city says no
// treelawn here" — and this Y/N is a MATERIAL decision (`SECTION §3.1`: which strip is grass),
// not a width. ⭐ The suspect number is the ASPHALT, not the treelawn: the clamp fires *because*
// the guess did not fit the measurement. `tlClamped` says the value is UNKNOWN, so the side falls
// back to the standard verdict instead of inheriting a guess's residue as evidence.
// ⛔ Nothing is redistributed and no width moves — every width is an operator handle and the
// override is the product. This changes only what the glean is allowed to CONCLUDE.
// ▶ `node checks/claims-the-survey-reaches-the-measure.mjs <scene>` · LS 83 of 301 sides.
const gleanGap = (measure, side) => {
  const sd = measure?.[side]
  if (sd?.tlClamped) return true          // unknown, not N — the standard sidewalk-eligible default
  return Math.max(0, Number.isFinite(sd?.treelawn) ? sd.treelawn : 0) >= TREELAWN_YN_THRESHOLD
}
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
// best-effort default (gleaned-Y ? the local row's treelawn : 0; its sidewalk). Exported so
// the FILL stroke (sectionPass) and the authoring-handle placement (Measure
// overlay) read the SAME resolution — if they read different depths they
// diverge, which was the root of both handle symptoms (don't match + don't
// respond). Pure data-in/data-out: no chain handle, the wall holds.
// ⭐ MONO-WIDTH, STRIPS SWAP — NOT COLLAPSE (Jacob 2026-06-10). The ribbon is two
// strips of EQUAL width; the gleaned treelawn Y/N is a MATERIAL decision (which
// strip is grass vs walk), NOT a width. A sidewalk-only edge is "sidewalk then
// LU/lawn" — the strips swap materials, they never collapse one to zero. So BOTH
// widths default to the LOCAL class row (`streetClass.js#LOCAL_SECTION`, 5 ft each — the kit's one home, uniform for
// every street until classifier step 7 makes the painter read each street's own class row), and the
// ribbon total is uniform whether the edge is Y or N. `hasTL` carries the
// surveyed Y/N to drive the strip ORDERING / default materials downstream.
// ⭐ `pedRealm:false` on the side (an expressway — skeleton.js `isExpressway`) makes
// the DEFAULT zero, not the standard; the operator's override still wins.
export function resolvePedDepths(baseMeasure, side, custom = null) {
  const none = baseMeasure?.[side]?.pedRealm === false
  const tl = Number.isFinite(custom?.treelawn) ? Math.max(0, custom.treelawn) : (none ? 0 : LOCAL_SECTION.treelawn)
  const sw = Number.isFinite(custom?.sidewalk) ? Math.max(0, custom.sidewalk) : (none ? 0 : LOCAL_SECTION.sidewalk)
  return { tl, sw, hasTL: none ? false : gleanTreelawn(baseMeasure, side) }
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



// ── THE WALL · sectionPassTile ─────────────────────────────────────────────
// The per-RUN painter, for a frozen tile that carries no stamp inquiry (`sectionOpen` routes every stamped tile to
// `sectionPassProtoTile`). Its parameters carry ONLY the frozen tile + design params (cw, stripMat, its own
// blockCustoms slice) — there is NO lexical handle on the chain graph, so it CANNOT reach back. That impossibility
// is the wall. Every helper below is module-level + pure. Block-local Section (BlockGeometryV2Debug) recomputes
// ONE tile on a drag and reuses the rest from cache. No cross-tile reads — corners/through-nodes are detected from
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
    const { ring, iA, vertR, tl, sw, roundTips, bluntTips, runs } = st
    const lu = OWN_LU   // the tile's own land use; re-keyed to each piece's class at return (`rekeyByPiece`)
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
        let shallow = shallowByT.get(c.T)
        if (!shallow) {
          shallow = (c.T >= TLmax + SWmax - 1e-9)
            ? bandRem
            : differenceRings(bandRem, ringAt(c.T))
          shallowByT.set(c.T, shallow)
        }
        // margin = c.trim (asphalt-hw + R) extends the sector up each leg to the
        // leg slab's pulled-back end, closing the leg↔corner seam (the LU notch).
        const sector = [arcSectorPoly(best.C, best.r, best.tA, best.tB, sectorDepth, c.trim)]
        const pad = intersectRings(shallow, sector)
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
  return { Wacc, tlByLu: rekeyByPiece(st, tlByLu), luByLu: rekeyByPiece(st, luByLu) }
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
// THE WALL HOLDS, and by the same signature rule as `sectionPassTile`: the parameters are the frozen
// tile + design scalars + `blockCustoms` (design intent keyed by frozen identity). No streets, no
// chains, no measures, no centerlines. `run.baseMeasure` is surveyed DATA frozen across the wall,
// not chain geometry — the ruled distinction (`SURVEY §5`).

// ⭐⭐ ONE OWNER'S RESOLVED CROSS-SECTION — THE ONE RULE (Boz, 2026-10-20: "one rule, two callers").
// `run` = { skelId, side, segOrd, baseMeasure, hwy }: the frozen BASE measure by skelId, plus the operator's
// override, street-keyed (`blockCustoms[skelId][side][segOrd]`). The live build (`buildTileGround`'s
// `protoMeasureOf`, owners + `protoBase`), the frozen painter (a `shape.json` run) and every instrument that
// asks what the PAINT reads call this, so none of them can resolve a width the paint does not.
// ⛔ THE SHIPPED RESOLVER, NOT THE RAW FIELD — `measure.treelawn` is the authored override ONLY
// (median 0 across the map); the depth actually painted comes from `resolvePedDepths`. Reading
// the raw field is a real, repeated error here: it once left three quarters of the map with no
// ped band, and it manufactured a phantom 3.00 m envelope gap during this ticket.
// ⛔ A highway takes no authoring (`r-highway-no-authoring`): `run.hwy` refuses the override (the shape pass
// prints each refusal by name).
// ⭐⭐ THE STRIPS ARE SWAPPABLE, AND THE SWAP IS THE OPERATOR'S (Jacob: "adjustable and swappable
// monowidth"). The gleaned `hasTL` supplies only the DEFAULT arrangement (`SECTION §3.1`: treelawn-Y
// reads grass→walk, N reads walk→lawn); `blockCustoms[…].materials` is the ctrl-click override on top
// (`§3.2`). Both strips to 'LU' is the OPEN FIELD — a material state, never an absence.
export function resolveProtoMeasure(run, blockCustoms, curbWidth) {
  if (!run) return null
  const c = run.hwy ? null : (blockCustoms?.[run.skelId]?.[run.side]?.[run.segOrd] || null)
  const mz = run.baseMeasure
  const base = mz?.[run.side]?.pavementHW
  const hw = (c && Number.isFinite(c.pavementHW)) ? Math.max(0, c.pavementHW) : base
  const d = resolvePedDepths(mz, run.side, c)
  // the parking lane's depth inside the carriageway (the kerb → the parking edge): the authored slot, else the pour's seed
  // (`measure[side].parking`). Read ONLY by the parking edge line; it never reaches pavementHW. A pour before the field
  // carries none (`null`), and the paint refuses by name rather than read it as 0.
  const pk = (c && Number.isFinite(c.parking)) ? Math.max(0, c.parking) : mz?.[run.side]?.parking
  return {
    pavementHW: Number.isFinite(hw) ? hw : null,
    parking: Number.isFinite(pk) ? pk : null,
    curb: curbWidth,
    treelawn: d.tl, sidewalk: d.sw, hasTL: !!d.hasTL,
    matOuter: c?.materials?.outer ?? (d.hasTL ? 'LU' : 'SW'),
    matInner: c?.materials?.inner ?? (d.hasTL ? 'SW' : 'LU'),
  }
}
// ⭐⭐ THE ROAD'S PAINT, STRUCK FROM THE SEALED SHAPE (BRIEF-the-ink-is-owned-by-its-labels §3.3/§3a/§3b, 2026-10-25). Two
// sources, both frozen, neither a chain:
//   · the CENTRE STRIPE is the sealed centreline's ribbon (`protopolygon.centrelines`, the line ① was struck from), in the
//     kind its street's `marks` selected (`streetMarkings.js`), and it STOPS AT INTERSECTIONS (Jacob, 2026-10-25: "I think I
//     would be ok to stop lines at intersections"): it is kept only where BOTH sides of its street have frontage — the
//     corridor each kerb LEG reaches across the carriageway (the leg extruded toward the street by its own resolved
//     pavementHW). A leg is a maximal span of ②'s kerb (`iaFull`) owned by one run (`iaStamp`), no arc and no cap, so
//     a corner arc ends it: the stripe stops where the curb turns, on the far side of a T too, by identity.
//   · the EDGE LINES are struck from those same legs, toward the street: yellow on the LEFT of a one-way roadway, white
//     on its RIGHT (mutcd-11r1 §3B.09), at the look's inset from the kerb face, or at the parking lane's depth where the
//     side has one (the parking edge, white unless the side's edge is yellow). A leg ends at its arc, so a line stops at
//     every approach and runs on through a T's far side, by construction (§3B.11 ¶07–08); ① has no driveways (¶09).
// ⛔ Nothing here is searched or recovered: the street of a line is its run's or its centreline's label; the depth is
// the run's resolved measure (`resolveProtoMeasure`, the one rule ② reads). → { stripe, edgeline, 'edgeline:yellow' }
// rings, and a census. ⛔ No centreline record, a street with no `marks`, or a parking depth the pour never sealed REFUSES.
// the road's paint cut to the disc, for a viewer (the Designer); the bake cuts the rim once itself (`clipAllToStencil`)
export const clipPaintToStencil = (rings, stencil) => (stencil && stencil.length >= 3 ? intersectRings(rings, [stencil]) : rings)
// the winding number of (x, z) about a ring of [x, z]
const windingXZ = (r, x, z) => { let w = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]
    if (zj <= z) { if (zi > z && (xi - xj) * (z - zj) - (x - xj) * (zi - zj) > 0) w++ } else if (zi <= z && (xi - xj) * (z - zj) - (x - xj) * (zi - zj) < 0) w-- }
  return w }
// the paint's MITER LIMIT: an offset vertex is mitred while cos(half its turn) is at least this, else the line splits there
// (a turn past 120°). Exported so a check reads the limit, never restates it.
export const MITER_MIN_COS = 0.5
export function roadMarkings({ tiles, centrelines, marksOf, measureOfRun, look }) {
  if (!Array.isArray(centrelines)) throw new Error('[tileGround][paint] ⛔ the protopolygon carries no sealed centreline (`centrelines`) — this town was poured before the road paint read it. Re-pour; the stripe never falls back to the chains.')
  const W = look.line, out = { stripe: [], edgeline: [], 'edgeline:yellow': [] }
  const census = { stripeRuns: {}, legs: 0, edgeLegs: { yellow: 0, white: 0, parking: 0 }, sharpSplits: 0, reflexTrims: 0, noMarks: new Set(), noStreet: new Set(), notStreet: new Set() }
  // a run owned by one of the kit's PSEUDO-owners (the frame, the coast, the highway difference: PSEUDO_OWNERS, by name) carries
  // no paint; ANY other owner with no marks record refuses — a street before streetMarkings, a stale skelId, a dropped street
  const marks = (id) => { if (PSEUDO_OWNERS.has(id)) { census.notStreet.add(id); return null } const M = marksOf(id); if (M === undefined) census.noStreet.add(id); else if (!M) census.noMarks.add(id); return M ?? null }
  // ── the kerb legs ──
  const legsOf = new Map()   // skelId → { left: [legs], right: [legs] }
  for (const t of tiles) {
    const rings = t.iaFull || []
    rings.forEach((ring, si) => {
      const n = ring?.length || 0; if (n < 3) return
      const st = t.iaStamp?.[si], A = t.iaArc?.[si], cap = t.iaCap?.[si]
      if (!st) return
      const runOf = (e) => { if (cap?.[e] != null) return null; if (A && A[e] != null && A[e] === A[(e + 1) % n]) return null; return st[e] ?? null }
      // the region lies on one side of every ring of the contour: read which, once, off the ring's longest edge
      let best = 0, bl = -1
      for (let e = 0; e < n; e++) { const a = ring[e], b = ring[(e + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L > bl) { bl = L; best = e } }
      const a = ring[best], b = ring[(best + 1) % n], ux = (b[0] - a[0]) / bl, uz = (b[1] - a[1]) / bl, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2
      const probe = Math.min(0.01, bl / 4), inRegion = (x, z) => rings.reduce((w, r) => w + windingXZ(r, x, z), 0) !== 0
      const lIn = inRegion(mx - uz * probe, mz + ux * probe), rIn = inRegion(mx + uz * probe, mz - ux * probe)
      if (lIn === rIn) throw new Error(`[tileGround][paint] ⛔ kerb ring ${si} of a tile: the region is on ${lIn ? 'both' : 'neither'} side(s) of its longest edge at (${mx.toFixed(3)}, ${mz.toFixed(3)}) — no outward side to strike the paint toward. Refusing.`)
      // the region (the block, inside its curb) is on the side the probe found it; the street is on the OTHER side. ⛔ This was
      // inverted (the probe of 2026-10-25): every leg struck its paint INTO the block, so no corridor met and no stripe was drawn
      const toward = lIn ? 1 : -1   // +1: the street is on the edge's RIGHT (the block on its left); −1: on its left
      let start = -1
      for (let e = 0; e < n; e++) if (runOf(e) != null && runOf((e - 1 + n) % n) !== runOf(e)) { start = e; break }
      if (start < 0) return       // no leg ends on this ring (one run all round, or none): no frontage to stop at
      for (let k = 0, e = start; k < n;) {
        const r = runOf(e); if (r == null) { e = (e + 1) % n; k++; continue }
        const e0 = e, pts = [ring[e]]
        while (k < n && runOf(e) === r) { pts.push(ring[(e + 1) % n]); e = (e + 1) % n; k++ }
        const run = t.runs?.[r]; if (!run?.skelId) continue
        census.legs++
        const L = legsOf.get(run.skelId) || legsOf.set(run.skelId, { left: [], right: [] }).get(run.skelId)
        // the kerb edges either side of the leg (the one arriving at its first vertex, the one leaving its last): a line struck
        // from the leg stops short of them where they lean back over it (reflexTrim)
        const dirOf = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return l ? [dx / l, dz / l] : null }
        L[run.side]?.push({ pts, out: toward, run, before: dirOf(ring[(e0 - 1 + n) % n], ring[e0]), after: dirOf(ring[e], ring[(e + 1) % n]) })
      }
    })
  }
  // an open polyline offset toward the street by d (miter; a vertex turning past 120°, MITER_MIN_COS, splits the line, counted)
  const offsetBy = (pts, out, d) => {
    const nrm = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); return [out * (b[1] - a[1]) / L, -out * (b[0] - a[0]) / L] }
    const pieces = [[]]
    for (let i = 0; i < pts.length; i++) {
      const n0 = i > 0 ? nrm(pts[i - 1], pts[i]) : null, n1 = i < pts.length - 1 ? nrm(pts[i], pts[i + 1]) : null
      if (n0 && n1) { const m = [n0[0] + n1[0], n0[1] + n1[1]], ml = Math.hypot(m[0], m[1]), c = (m[0] * n0[0] + m[1] * n0[1]) / ml
        if (c < MITER_MIN_COS) { census.sharpSplits++; pieces[pieces.length - 1].push([pts[i][0] + n0[0] * d, pts[i][1] + n0[1] * d]); pieces.push([[pts[i][0] + n1[0] * d, pts[i][1] + n1[1] * d]]); continue }
        pieces[pieces.length - 1].push([pts[i][0] + m[0] / ml / c * d, pts[i][1] + m[1] / ml / c * d]) }
      else { const q = n0 || n1; pieces[pieces.length - 1].push([pts[i][0] + q[0] * d, pts[i][1] + q[1] * d]) }
    }
    return pieces.filter(p => p.length >= 2)
  }
  const along = (P) => { const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return s }
  // a polyline's sub-polylines over [a, b] of its arc length
  const cut = (P, S, a, b) => { const o = []; for (let i = 0; i < P.length - 1; i++) { const s0 = S[i], s1 = S[i + 1]; if (s1 <= a || s0 >= b) continue
    const at = (s) => { const t = (s - s0) / (s1 - s0); return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t] }
    if (!o.length) o.push(at(Math.max(a, s0))); o.push(s1 <= b ? P[i + 1] : at(b)) } return o }
  // ⭐ A LINE STOPS AT A REFLEX KERB CORNER (Boz, 2026-10-26: LS's 5 parking-line ends lay 5 mm–18 cm inside the next block).
  // Where the kerb edge beyond a leg's end steps into the street (toward the line) and leans back over the leg, a line at depth
  // d meets it d·(−n·u)/(n·ν) before the corner (u the leg's direction there, ν its normal toward the street, n the next kerb
  // edge's): the leg is cut back by that, at the line's FAR depth, so no part of the line crosses the kerb. Derived from the
  // line's own depth and the corner, never typed; counted. The same at the leg's start, against the edge arriving there.
  const reflexTrim = (g, dFar) => {
    const P = g.pts, nrmOf = (u) => [g.out * u[1], -g.out * u[0]]
    // `out`: the leg's direction away from its corner (into the leg is −out); `nu`: the leg's own normal toward the street;
    // `m`: the corner's other kerb edge, leaving the corner. It crosses the line where it heads streetward (m·ν > 0) and leans
    // back over the leg (m·out > 0)
    const backBy = (out, nu, m) => { if (!m) return 0; const mn = m[0] * nu[0] + m[1] * nu[1], mo = m[0] * out[0] + m[1] * out[1]
      return mn > 0 && mo > 0 ? dFar * mo / mn : 0 }
    const unit = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [dx / l, dz / l] }
    const uEnd = unit(P[P.length - 2], P[P.length - 1]), uStart = unit(P[0], P[1])
    // at the end, away from the corner is back along the leg (−uEnd) and the edge leaving the corner is `after`; at the start,
    // away from the corner is forward (uStart) and the edge leaving the corner, walked from it, is `before` reversed
    const tEnd = backBy([-uEnd[0], -uEnd[1]], nrmOf(uEnd), g.after)
    const tStart = g.before ? backBy(uStart, nrmOf(uStart), [-g.before[0], -g.before[1]]) : 0
    if (!tEnd && !tStart) return P
    census.reflexTrims += (tEnd ? 1 : 0) + (tStart ? 1 : 0)
    const S = along(P), len = S[S.length - 1]
    return tStart + tEnd < len ? cut(P, S, tStart, len - tEnd) : null
  }
  const band = (pts, out, d1, d2) => { const A = offsetBy(pts, out, d1), B = offsetBy(pts, out, d2)
    if (A.length !== B.length) return []
    return A.map((a, i) => [...a, ...B[i].slice().reverse()]).filter(r => Math.abs(signedArea(r)) > 0) }
  // ── the edge lines ──
  for (const [id, L] of legsOf) {
    const M = marks(id); if (!M || M.excluded) continue
    for (const side of ['left', 'right']) for (const g of L[side]) {
      const m = measureOfRun(g.run)
      if (!m) continue
      if (m.parking == null) throw new Error(`[tileGround][paint] ⛔ ${id}|${side}|${g.run.segOrd} carries no parking depth (measure.${side}.parking) — the pour predates the field. Re-pour; a missing depth is never read as no parking lane.`)
      const edge = M.edges?.kind?.[side] || null, park = m.parking > 0 && m.parking < (m.pavementHW || 0)
      if (!edge && !park) continue
      const kind = edge === 'yellow' ? 'yellow' : edge ? 'white' : 'parking'
      const d = park ? m.parking - W / 2 : look.edgeInset
      census.edgeLegs[park && !edge ? 'parking' : kind]++
      const P = reflexTrim(g, d + W); if (!P || P.length < 2) continue
      out[kind === 'yellow' ? 'edgeline:yellow' : 'edgeline'].push(...band(P, g.out, d, d + W))
    }
  }
  // ── the centre stripe ──
  const corridor = new Map()   // skelId → the region both sides' legs reach across the carriageway
  const corridorOf = (id) => {
    if (corridor.has(id)) return corridor.get(id)
    const L = legsOf.get(id), reach = (legs) => unionRings(legs.flatMap(g => { const m = measureOfRun(g.run); return m?.pavementHW > 0 ? band(g.pts, g.out, -W, m.pavementHW + 2 * W + look.gap) : [] }))
    const c = L && L.left.length && L.right.length ? intersectRings(reach(L.left), reach(L.right)) : []
    corridor.set(id, c); return c
  }
  const lineAt = (P, off, dashed) => {        // a line of width W centred `off` to the polyline's right (stroke order)
    const pieces = dashed ? (() => { const S = along(P), o = []; for (let s = 0; s < S[S.length - 1]; s += look.dash + look.space) o.push(cut(P, S, s, s + look.dash)); return o.filter(q => q.length >= 2) })() : [P]
    return pieces.flatMap(q => band(q, 1, off - W / 2, off + W / 2))
  }
  for (const C of centrelines) for (const r of C.runs) {
    const M = marks(r.skelId); if (!M || M.excluded) continue
    const kind = M.centre?.kind; census.stripeRuns[kind] = (census.stripeRuns[kind] || 0) + 1
    if (!kind || kind === 'none') continue
    const P = C.points.slice(r.from, r.to + 1).concat(C.closed && r.to === C.points.length ? [C.points[0]] : [])
    if (P.length < 2) continue
    const half = look.gap / 2 + W / 2
    // `solid` names a side in the STREET's point order; the stroke may run the chain reversed (`dir` −1)
    const solidRight = (M.centre.solid === 'right') === (r.dir > 0)
    const rings = kind === 'broken' ? lineAt(P, 0, true)
      : kind === 'double-solid' ? [...lineAt(P, half, false), ...lineAt(P, -half, false)]
      : [...lineAt(P, half, !solidRight), ...lineAt(P, -half, solidRight)]
    const c = corridorOf(r.skelId)
    if (c.length) out.stripe.push(...intersectRings(rings, c))
  }
  const list = (o) => Object.entries(o).map(([k, v]) => `${v} ${k}`).join(' · ')
  console.log(`[tileGround][paint] owners that are no street (no paint): ${[...census.notStreet].join(' · ') || 'none'} · centre runs by kind: ${list(census.stripeRuns) || 'none'} · stripe ${out.stripe.length} ring(s), cut to where both sides have frontage · ${census.legs} kerb leg(s) · edge lines on ${list(census.edgeLegs)} leg(s) · ${census.sharpSplits} sharp vertex split(s) · ${census.reflexTrims} line end(s) cut back at a reflex kerb corner`)
  if (census.noStreet.size) throw new Error(`[tileGround][paint] ⛔ ${census.noStreet.size} kerb owner(s) are neither a street of the pour nor a kit pseudo-owner (PSEUDO_OWNERS): ${[...census.noStreet].slice(0, 6).join(' · ')} — a stale skelId, a street dropped from ribbons.streets, or a re-key. Nothing is skipped for want of a record.`)
  if (census.noMarks.size) throw new Error(`[tileGround][paint] ⛔ ${census.noMarks.size} street(s) carry no selected paint (\`marks\`): ${[...census.noMarks].slice(0, 6).join(' · ')} — the pour predates streetMarkings. Re-pour.`)
  return out
}

// A run the highway owns (H-3), read off the frozen `hwy` stamp — the SAME set the shape pass differenced
// against H. ⛔ Not `material: 'highway'`: an at-grade two-way ramp (ruling a) has that material and is a
// street, with its curb.
const isHighwayRun = (run) => !!run?.hwy

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

// ⭐⭐ IS A STREET MET AT THIS CORNER? — THE LEGS DECIDE (`BRIEF-corner-ramps-and-kerb §0a`; Jacob, 2026-10-06:
// "LS was made with a mentality that a corner was a result of the legs which made it"). Every ease is a corner and
// gets its pad (`SECTION §4`); whether it also gets curb cuts and crosswalks is read off its TWO LEGS — the runs
// that own the edges either side of its arc, carried on the frozen stamp (`iaStamp` → `runs`):
//   two DIFFERENT roads  → junction
//   the SAME road        → bend (pad only)
//   a flank with no run  → UNKNOWN, with its reason — never folded into "bend"
// "Same road" is `RIBBONS §3.3`'s ruled test: same iff EITHER `roadId` OR `throughId` agrees. ⛔ Not the name and not
// the ordinal-stripped skelId — two unnamed streets (`residential-70`, `residential-73`) stay two roads.
// ⛔ It replaces a junction DEGREE re-derived from the chains in the mint (`3589f711`), which `EXTENT-DESIGN §4.1`
// forbids ("carry it, never re-derive it") and which counted a divided road's carriageways joining as a junction.
export function sameRoad(a, b) {
  return (a?.roadId != null && a.roadId === b?.roadId) || (a?.throughId != null && a.throughId === b?.throughId)
}
export function classifyCornerLegs(a, b) {
  if (!a || !b) return { kind: 'unknown' }
  return sameRoad(a, b) ? { kind: 'bend' } : { kind: 'junction' }
}

// ══ THE CURB CUTS — POSITIONS ON A JUNCTION CORNER'S ARC (`BRIEF-corner-ramps-and-kerb §0a`) ══════════════════════
// ⭐ The pad is unchanged: concrete tangent to tangent, reaching the kerb (`SECTION §4`). A curb cut only marks WHERE
// along that arc the kerb drops, and paints its detectable-warning strip there. ⛔ It is a SLICE of the band the
// pad already is — `band(ins(cw), ins(cw + warningDepth))`, bounded along the arc and kept on the walk — never a
// constructed primitive (`RIBBONS §1` invariant 1).
// ⭐ Only a corner a street MEETS gets one (`iaJunction`); a bend keeps its pad and gets none; an UNKNOWN corner
// gets none and is counted as unknown, never as a bend.
// ⭐ The style, finest first: the operator, on THIS corner — `cut` in its one entry of `cornerCornerRadiusOverrides`, keyed
// by the arc's own corner key (`st.iaArcKey`, the radius dial's key; Jacob, 2026-10-07: every corner authorable on its
// own) — then the RECORDED cuts landed on the arc (`st.curbCutEvidence`, `styleFromEvidence`;
// unreadable is counted and falls through) — then the town's frozen norm (`st.curbCutNorm`, `cartograph/curb-cut-norm.mjs`). The
// dimensions are always the norm's: an authored style on a town whose norm gives none cannot be drawn, and is
// counted (`noDims`), never filled in with a kit constant.
//   diagonal      — one curb cut centred on the arc
//   perpendicular — two, one at each tangent, each within its own half of the arc
// ⛔ A curb cut wider than the room it has takes the room it has and is counted (`short`).
// ══ THE FROZEN CURB, INDEXED — every tile's `iaFull` edge with what it IS (arc span position, junction, owner) ═════
// ⭐ One index for every question asked of the curb by a LINE: where a recorded cut lands (`landCurbCutEvidence`) and
// where a square crosswalk meets each kerb (`crosswalksSquareAcross`). `firstHit(P, Q, skipRing)` = the first edge met
// (`skipRing` = `ringOf(tile, si)`)
// walking P→Q (never a nearest search); `owned(e, S, notSide)` = the edge fronts chain S on a side other than `notSide`
// — an arc edge by its junction's legs, a leg edge by its own frozen stamp. `reach` = the drawing's own extent, so
// "along its own line, unbounded" needs no constant. Memoised per tile array (Section re-merges on every drag).
const _curbIndexMemo = new WeakMap()
export function curbEdgeIndex(tiles) {
  if (_curbIndexMemo.has(tiles)) return _curbIndexMemo.get(tiles)
  const G = 20, grid = new Map(), edges = [], ringId = new Map(), ringEdges = []
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  // ⛔ The disc cut makes several tiles of one block and every piece carries the SAME uncut `iaFull` (by design — see
  // the cut). A ring is indexed ONCE, by identity, and a caller skips its own ring by that identity: skipping by tile
  // index let a line meet its own kerb again on the twin piece, at 0 m.
  tiles.forEach((t, ti) => (t?.iaFull || []).forEach((ring, si) => {
    if (ringId.has(ring)) return
    ringId.set(ring, ringId.size)
    const n = ring.length, arc = t.iaArc?.[si], mark = t.iaCorner?.[si]
    const lic = new Set(); if (arc) for (let q = 0; q < n; q++) if (arc[q] != null && mark?.[q]) lic.add(arc[q])
    const inArc = (q) => !!arc && arc[q] != null && arc[q] === arc[(q + 1) % n] && lic.has(arc[q])
    const rec = []
    for (let q = 0; q < n; q++) { const a = ring[q], b = ring[(q + 1) % n]
      rec.push({ a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]), inArc: inArc(q), ti, si, q, ring: ringId.get(ring) })
      minX = Math.min(minX, a[0]); maxX = Math.max(maxX, a[0]); minZ = Math.min(minZ, a[1]); maxZ = Math.max(maxZ, a[1]) }
    for (let q = 0; q < n; q++) {                     // each arc span: running position + total length
      if (!rec[q].inArc || rec[(q - 1 + n) % n].inArc) continue
      const span = []; for (let i = q, c = 0; c < n && rec[i].inArc; c++, i = (i + 1) % n) span.push(i)
      let s = 0; for (const i of span) { rec[i].s0 = s; s += rec[i].len }
      for (const i of span) { rec[i].L = s; rec[i].arc = arc[q]; rec[i].jx = t.iaJunction?.[si]?.[q] }
    }
    ringEdges.push(rec)
    for (const e of rec) { edges.push(e)
      for (let x = Math.floor(Math.min(e.a[0], e.b[0]) / G); x <= Math.floor(Math.max(e.a[0], e.b[0]) / G); x++)
        for (let z = Math.floor(Math.min(e.a[1], e.b[1]) / G); z <= Math.floor(Math.max(e.a[1], e.b[1]) / G); z++)
          (grid.get(`${x},${z}`) || grid.set(`${x},${z}`, []).get(`${x},${z}`)).push(edges.length - 1) }
  }))
  // walks the grid cells the segment crosses IN ORDER (Amanatides–Woo) and stops once the best hit lies before the
  // current cell's exit — so a line extended across the whole drawing costs what its first few cells cost
  const firstHit = (P, Q, skipRing = null) => {
    const r = [Q[0] - P[0], Q[1] - P[1]]
    let cx = Math.floor(P[0] / G), cz = Math.floor(P[1] / G)
    const ex = Math.floor(Q[0] / G), ez = Math.floor(Q[1] / G)
    const sx = Math.sign(r[0]), sz = Math.sign(r[1])
    const dX = sx ? Math.abs(G / r[0]) : Infinity, dZ = sz ? Math.abs(G / r[1]) : Infinity
    let tX = sx ? ((sx > 0 ? (cx + 1) * G : cx * G) - P[0]) / r[0] : Infinity
    let tZ = sz ? ((sz > 0 ? (cz + 1) * G : cz * G) - P[1]) / r[1] : Infinity
    let best = null
    const seen = new Set()
    for (let guard = 0; guard < 1e7; guard++) {
      for (const id of grid.get(`${cx},${cz}`) || []) { if (seen.has(id)) continue; seen.add(id); const e = edges[id]
        if (skipRing != null && e.ring === skipRing) continue
        const s = [e.b[0] - e.a[0], e.b[1] - e.a[1]], den = r[0] * s[1] - r[1] * s[0]
        if (Math.abs(den) < 1e-12) continue
        const d = [e.a[0] - P[0], e.a[1] - P[1]], t = (d[0] * s[1] - d[1] * s[0]) / den, u = (d[0] * r[1] - d[1] * r[0]) / den
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, u, e, at: [P[0] + r[0] * t, P[1] + r[1] * t] } }
      if (best && best.t <= Math.min(tX, tZ)) break        // nothing in a later cell can be nearer
      if (cx === ex && cz === ez) break
      if (tX < tZ) { if (tX > 1) break; cx += sx; tX += dX } else { if (tZ > 1) break; cz += sz; tZ += dZ }
    }
    return best
  }
  const owned = (e, S, notSide) => {
    const T = tiles[e.ti]
    if (e.inArc) return Number.isInteger(e.jx) && (T.junctions?.[e.jx]?.legs || []).some(l => l?.skelId === S && l.side !== notSide)
    const R = T.runs?.[T.iaStamp?.[e.si]?.[e.q]]
    return !!R && R.skelId === S && R.side !== notSide
  }
  const ringOf = (ti, si) => ringId.get(tiles[ti]?.iaFull?.[si])
  const X = { edges, ringEdges, firstHit, owned, ringOf, reach: Math.hypot(maxX - minX, maxZ - minZ) || 0 }
  _curbIndexMemo.set(tiles, X)
  return X
}

// ══ THE RECORDED CUTS, LANDED ON THE FROZEN CURB (`cartograph/curb-cut-evidence.mjs`) ══════════════════════════
// ⭐ Each record's `ray` runs from the crossed road's centreline node out to the recorded kerb point. It is walked, then
// extended along its OWN last segment, to the FIRST frozen curb edge it meets across every tile — the record's own
// line, never a nearest-ring search. ⭐ The landing is kept only if the edge lies in a licensed arc (the painter's `inC`
// rule) of a JUNCTION corner one of whose legs IS the crossed road — ownership, so no reach constant is needed.
// Stamped on the tile as `curbCutEvidence: [{ si, arc, jx, f, kind, source, osmId, crossed }]`, `f` = position along the arc span
// (0 → 1 in contour order). Run before the disc cut, so every piece of a cut block carries its block's landings.
// ⛔ Every record that does not land is counted by cause: noHit · offArc · notJunction · notOwner.
export function landCurbCutEvidence(tiles, evidence) {
  const census = { records: 0, landed: 0, noHit: 0, offArc: 0, notJunction: 0, notOwner: 0 }
  if (!evidence?.fetched) return { census, fetched: false }
  const { firstHit, reach } = curbEdgeIndex(tiles)
  for (const R of evidence.records) {
    census.records++
    const ray = R.ray || []
    let hit = null
    for (let i = 0; i + 1 < ray.length && !hit; i++) hit = firstHit(ray[i], ray[i + 1])
    if (!hit && ray.length >= 2) { const A = ray[ray.length - 2], B = ray[ray.length - 1], l = Math.hypot(B[0] - A[0], B[1] - A[1])
      if (l > 0) hit = firstHit(B, [B[0] + (B[0] - A[0]) / l * reach, B[1] + (B[1] - A[1]) / l * reach]) }
    if (!hit) { census.noHit++; continue }
    const e = hit.e
    if (!e.inArc) { census.offArc++; continue }
    if (!Number.isInteger(e.jx)) { census.notJunction++; continue }
    const legs = tiles[e.ti].junctions?.[e.jx]?.legs || []
    if (!legs.some(l => R.crossed.includes(l?.skelId))) { census.notOwner++; continue }
    census.landed++
    const t = tiles[e.ti]
    ;(t.curbCutEvidence ||= []).push({ si: e.si, arc: e.arc, jx: e.jx, f: (e.s0 + hit.u * e.len) / e.L, kind: R.kind, source: R.source, osmId: R.osmId, crossed: R.crossed })
  }
  return { census, fetched: true }
}

// ══ THE RECORDED CROSSINGS, LANDED (`cartograph/curb-cut-evidence.mjs#buildCrosswalkEvidence`) ═════════════════════
// ⭐ Each crossing's two rays (its road node → each end) walk to the first frozen curb they meet, extended along their
// own line, and each landing must front the crossed street (ownership). The two must land on OPPOSITE sides of it.
// Each END is stamped on the tile whose ring it met: `crosswalkEnds: [{ osmId, S, side, si, arc, kind, at }]`, where
// `kind` is 'arc' (inside a licensed arc span) · 'nearTangent' (the leg edge touching an arc — counted, never widened
// into the arc, Boz 2026-10-06) · 'leg'. Before the disc cut, so every piece of a block carries its block's ends.
// ⛔ Counted by cause: noHit · notOwned · sameSide.
export function landCrosswalkEvidence(tiles, evidence) {
  const census = { records: 0, landed: 0, noHit: 0, notOwned: 0, sameSide: 0, ends: { arc: 0, nearTangent: 0, leg: 0 } }
  if (!evidence?.records) return { census }
  const X = curbEdgeIndex(tiles)
  const sideOf = (e, S) => { const T = tiles[e.ti]
    if (e.inArc) return Number.isInteger(e.jx) ? (T.junctions?.[e.jx]?.legs || []).find(l => l?.skelId === S)?.side ?? null : null
    const R = T.runs?.[T.iaStamp?.[e.si]?.[e.q]]; return R?.skelId === S ? R.side : null }
  const kindOf = (e) => { if (e.inArc) return 'arc'
    const R = X.ringEdges[e.ring], n = R.length
    return (R[(e.q + 1) % n].inArc || R[(e.q - 1 + n) % n].inArc) ? 'nearTangent' : 'leg' }
  for (const R of evidence.records) {
    census.records++
    const ends = []
    for (const ray of R.rays) {
      let hit = null
      for (let i = 0; i + 1 < ray.length && !hit; i++) hit = X.firstHit(ray[i], ray[i + 1])
      if (!hit && ray.length >= 2) { const A = ray[ray.length - 2], B = ray[ray.length - 1], l = Math.hypot(B[0] - A[0], B[1] - A[1])
        if (l > 0) hit = X.firstHit(B, [B[0] + (B[0] - A[0]) / l * X.reach, B[1] + (B[1] - A[1]) / l * X.reach]) }
      if (!hit) break
      const S = R.crossed.find(c => sideOf(hit.e, c) != null)
      if (S == null) { ends.push(null); break }
      ends.push({ e: hit.e, at: hit.at, S, side: sideOf(hit.e, S) })
    }
    if (ends.length < 2 && !ends.includes(null)) { census.noHit++; continue }
    if (ends.includes(null)) { census.notOwned++; continue }
    if (ends[0].S !== ends[1].S || ends[0].side === ends[1].side) { census.sameSide++; continue }
    census.landed++
    for (const x of ends) { const k = kindOf(x.e); census.ends[k]++
      ;(tiles[x.e.ti].crosswalkEnds ||= []).push({ osmId: R.osmId, S: x.S, side: x.side, si: x.e.si, arc: x.e.inArc ? x.e.arc : null, kind: k, at: x.at }) }
  }
  return { census }
}

// ⭐ ONE CORNER'S STYLE FROM ITS LANDINGS (`§0a` item 8), position as a fraction of the arc's own span:
//   a drop in the middle third only ⇒ diagonal · drops in both outer thirds and none in the middle ⇒ perpendicular ·
//   only `raised` ⇒ none · anything else (one end only, a drop in the middle AND an end, a kind not on the list)
//   ⇒ unreadable, counted, never guessed.
const KERB_DROP = new Set(['lowered', 'flush', 'no']), KERB_UP = new Set(['raised'])
export function styleFromEvidence(landings) {
  if (landings.some(x => !KERB_DROP.has(x.kind) && !KERB_UP.has(x.kind))) return 'unreadable'
  const drops = landings.filter(x => KERB_DROP.has(x.kind))
  if (!drops.length) return 'none'
  const mid = drops.filter(x => x.f >= 1 / 3 && x.f <= 2 / 3).length, lo = drops.filter(x => x.f < 1 / 3).length, hi = drops.filter(x => x.f > 2 / 3).length
  if (mid && !lo && !hi) return 'diagonal'
  if (!mid && lo && hi) return 'perpendicular'
  return 'unreadable'
}

const CURB_CUT_STYLE_SET = new Set(['none', 'diagonal', 'perpendicular'])
function curbCutsOnJunctionCorners(st, parts, inC, cornerOverrides, cw, band, perpGeom) {
  const tally = { notCorner: 0, junction: 0, bend: 0, unknown: 0, curbCuts: 0, perpWedgeLawn: 0, perpWedgeConcrete: 0, perpOneSidedLawn: 0, perpNoLanding: 0, unreadable: 0, contradicted: 0, noSource: 0, noNorm: 0, noDims: 0, invalid: 0, short: 0, bySource: {} }
  const recs = [], masks = [], contradicted = [], corners = [], perpArcs = new Set(), perpCorners = []
  const norm = st.curbCutNorm || null
  let maxD = 0
  for (const p of parts) {
    const ring = p.ring, n = ring.length, jxA = st.iaJunction?.[p.si]
    if (!st.iaArc?.[p.si]) continue
    const isC = (i) => inC.has(`${p.ri}|${i}`)
    const eL = (i) => { const a = ring[i], b = ring[(i + 1) % n]; return Math.hypot(b[0] - a[0], b[1] - a[1]) }
    for (let q = 0; q < n; q++) {
      if (!isC(q) || isC((q - 1 + n) % n)) continue                 // q starts an arc span
      let e = q; for (let k = 0; k < n && isC((e + 1) % n); k++) e = (e + 1) % n
      const j = jxA ? jxA[q] : undefined
      if (j === 'bend') { tally.bend++; continue }
      if (!Number.isInteger(j)) { tally.unknown++; continue }
      const before = (q - 1 + n) % n, after = (e + 1) % n
      const arcId = st.iaArc[p.si][q], mid = ring[(q + Math.floor(((e - q + n) % n + 1) / 2)) % n]
      tally.junction++
      // the operator's style for THIS corner, by its own key
      const key = st.iaArcKey?.[p.si]?.[arcId] ?? null, authored = key ? cutOf(cornerOverrides?.[key]) : null
      // ⭐ WHAT THE CORNER DRAWS UNAUTHORED — the recorded cuts landed on THIS arc at the freeze (`landCurbCutEvidence`),
      // else the town's norm; unreadable evidence falls to the norm. No side effects: the corner record shows it either way.
      const unauthored = (() => {
        const ev = (st.curbCutEvidence || []).filter(x => x.si === p.si && x.arc === arcId)
        const es = ev.length ? styleFromEvidence(ev) : null
        let contra = null
        if (es === 'unreadable') {
          // ⭐ PARTIAL EVIDENCE THAT CONTRADICTS THE NORM (Boz, 2026-10-06): its own bucket, its corners printed — the
          // norm is drawn all the same. A signal for the operator to override, never a licence to guess.
          const drops = ev.filter(x => KERB_DROP.has(x.kind)), mi = drops.some(x => x.f >= 1 / 3 && x.f <= 2 / 3), en = drops.some(x => x.f < 1 / 3 || x.f > 2 / 3)
          const ns = norm?.style
          if ((ns === 'diagonal' && en) || (ns === 'perpendicular' && mi && !en) || (ns === 'none' && drops.length)) contra = { norm: ns, drops: drops.map(x => Math.round(x.f * 100) / 100) }
        }
        if (es && es !== 'unreadable') return { style: es, source: ev[0].source, unreadable: false, contra }
        if (norm) return { style: norm.style, source: norm.source, unreadable: es === 'unreadable', contra }
        return null
      })()
      corners.push({ si: p.si, arc: arcId, junction: j, at: mid, key, authored,
                     unauthored: unauthored && { style: unauthored.style, source: unauthored.source }, contradicted: unauthored?.contra ?? null })
      let style, source
      if (authored != null) { style = authored; source = 'authored' }
      else {
        if (!unauthored) { tally.noNorm++; continue }
        if (unauthored.unreadable) tally.unreadable++
        if (unauthored.contra) { tally.contradicted++; contradicted.push({ si: p.si, arc: arcId, at: mid, ...unauthored.contra }) }
        style = unauthored.style; source = unauthored.source
      }
      tally.bySource[source] = (tally.bySource[source] || 0) + 1
      if (!CURB_CUT_STYLE_SET.has(style)) { tally.invalid++; continue }
      if (style === 'none') { if (source === norm?.source && source !== 'authored') tally.noSource++; continue }
      const w = norm?.width, d = norm?.warningDepth
      if (!(w > 0 && d > 0)) { tally.noDims++; continue }
      maxD = Math.max(maxD, d)
      // the arc as a polyline from tangent to tangent, with its arc length
      const pts = [], cum = [0]
      for (let k = 0, i = q; k < n; k++, i = (i + 1) % n) { pts.push(ring[i]); if (i === (e + 1) % n) break
        cum.push(cum[cum.length - 1] + eL(i)) }
      const L = cum[cum.length - 1]
      const at = (s) => { let k = 1; while (k < cum.length - 1 && cum[k] < s) k++
        const t = (s - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1), A = pts[k - 1], B = pts[k]
        return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t] }
      // ⭐ which crossing each curb cut serves — the leg it sits beside (`junctions[].legs` is [arriving, leaving] in
      // this contour's order). A crosswalk leaves a curb cut ACROSS the street that leg fronts.
      // `dir` — the crossed street's direction HERE, read off that leg's own curb edge beside the arc (the edge
      // arriving for legs[0], leaving for legs[1]); a crosswalk runs square to it (`crosswalksSquareAcross`).
      const legs = st.junctions?.[j]?.legs || []
      const edgeDir = (i) => { const A = ring[i], B = ring[(i + 1) % n], l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; return [(B[0] - A[0]) / l, (B[1] - A[1]) / l] }
      const srv = (a2, b2, i) => (a2 && b2) ? [{ leg: a2, other: b2, dir: edgeDir(i) }] : []
      // ⭐ PERPENDICULAR CORNER: each leg's walk runs STRAIGHT on and ends at the kerb — the OTHER leg's kerb: the walk
      // along street A carries on across street B. So the cut near tangent A is where leg B's walk lands (it serves the
      // crossing of street A). The cut IS that walk's end, so it is not drawn here: the corner hands the painter which
      // leg's walk ends where (`perpCorners[].cuts`), and the painter reads the cut off the drawn walk (`sectionPassProtoTile`).
      // A diagonal cut is { sub: its kerb sub-polyline, serves }.
      const cutsHere = []
      if (style === 'diagonal') {
        const s0 = Math.max(0, L / 2 - w / 2), s1 = Math.min(L, L / 2 + w / 2)
        if (s1 - s0 < w - 1e-6) tally.short++
        const sub = [at(s0)]; for (let k = 1; k < cum.length - 1; k++) if (cum[k] > s0 && cum[k] < s1) sub.push(pts[k]); sub.push(at(s1))
        if (s1 - s0 > 1e-6) cutsHere.push({ sub, serves: [...srv(legs[0], legs[1], before), ...srv(legs[1], legs[0], after)] })
      } else {
        const g = perpGeom(p, q, e, before, after)
        const rec = corners[corners.length - 1]
        if (!g) { tally.perpNoLanding += 2; rec.noLanding = 2 }
        else {
          rec.wedge = g.lawn ? 'lawn' : 'concrete'; rec.wedgeAt = g.wedgeAt; if (g.lawn) tally.perpWedgeLawn++; else tally.perpWedgeConcrete++; if (g.oneSided) tally.perpOneSidedLawn++
          perpArcs.add(`${p.ri}|${arcId}`); rec.arcPts = pts                 // the arc, tangent to tangent: the checks judge the paint along it
          // [0] the `after` leg's walk, landing near tangent A (it crosses street A); [1] the `before` leg's, near tangent B
          const base = { si: p.si, arc: st.iaArc[p.si][q], junction: j, node: st.junctions?.[j]?.node ?? null, style, source, arcLen: L }
          perpCorners.push({ ri: p.ri, q, e, before, after, w, corner: rec,
            cuts: [{ ...base, serves: srv(legs[0], legs[1], before) }, { ...base, serves: srv(legs[1], legs[0], after) }] })
        }
      }
      for (const { sub, serves } of cutsHere) {
        if (sub.length < 2) continue
        const ext = cw + d + 0.5, nrm = (i) => { const A = sub[Math.max(0, i - 1)], B = sub[Math.min(sub.length - 1, i + 1)]
          const dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l] }
        const out = sub.map((P, i) => { const v = nrm(i); return [P[0] + v[0] * ext, P[1] + v[1] * ext] })
        const inn = sub.map((P, i) => { const v = nrm(i); return [P[0] - v[0] * ext, P[1] - v[1] * ext] })
        masks.push([...out, ...inn.reverse()])
        const subLen = sub.slice(1).reduce((t, P2, i) => t + Math.hypot(P2[0] - sub[i][0], P2[1] - sub[i][1]), 0)
        const c = (() => { let r = subLen / 2; for (let i = 1; i < sub.length; i++) { const l2 = Math.hypot(sub[i][0] - sub[i - 1][0], sub[i][1] - sub[i - 1][1])
          if (r <= l2 || i === sub.length - 1) { const t = l2 ? Math.min(1, r / l2) : 0; return [sub[i - 1][0] + (sub[i][0] - sub[i - 1][0]) * t, sub[i - 1][1] + (sub[i][1] - sub[i - 1][1]) * t] } r -= l2 } return sub[0] })()
        // ⭐ the kerb face this cut drops along (`face`, its chord) and which way the block lies (`inward`) — the
        // raised kerb's ramp reads both (`bake-ground.js`). Inward = the side of the cut's own midpoint that is block.
        const A = sub[0], B = sub[sub.length - 1], lAB = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, nn = [-(B[1] - A[1]) / lAB, (B[0] - A[0]) / lAB]
        const dl = 1e-3 * lAB, inBlock = (P) => pointInRing(P[0], P[1], ring) !== !!p.hole
        const inward = inBlock([c[0] + nn[0] * dl, c[1] + nn[1] * dl]) ? nn : [-nn[0], -nn[1]]
        recs.push({ si: p.si, arc: st.iaArc[p.si][q], junction: j, node: st.junctions?.[j]?.node ?? null, style, source,
                    at: c, arcLen: L, serves, face: [A, B], inward })
        tally.curbCuts++
      }
    }
  }
  // the strips are cut against the finished walk (sectionPassProtoTile), so the painter hands back its masks and the slab
  // depth, not finished strips — and, for the perpendicular corners, the FACTS the band reads: which arcs carry no band of
  // their own (`perpArcs`) and each corner's two leg edges either side of its arc (`perpCorners`)
  return { masks, maxD, recs, tally, contradicted, corners, perpArcs, perpCorners }
}

// ⭐⭐ THE BANDS, CUT BY THEIR OWNERS — `tile.bandPieces` (Screed, 2026-10-17; option A, Boz). Each band (curb · walk · lawn) is
// cut into pieces that each have ONE owner span (a run, an arc or a cap of the contour, split again where its stamp run
// changes), and nothing is decided by nearness:
//   · a band lies between two LABELLED offsets of the one contour (curb: the contour → cw; walk: walkFrom → walkTo; lawn:
//     cw → WB). Every edge of both carries the span it was struck from (`offsetRingByRects`' own stamp).
//   · a span's CELL is its run on the outer offset, the seam to the inner offset at the same span change, its run on the
//     inner offset back, and the seam home. Neighbouring cells share their seam, so they tile the region between the two.
//     A span with no run on the inner offset gives a triangle; a span with no run on EITHER contributes no piece there —
//     its ground is the neighbours' (Boz, 2026-10-18), counted by name, never refused.
//   · a perpendicular corner's own ground (`perpRects`: each leg's extension, each cut, a one-pad's hull) is not an offset: it
//     enters the rects (below) as the rect of the owner it was built with, so the crossing is both legs' and the hull the arc's.
// A piece = band ∩ cell, then the disc cut (`inBlock`) and the land-use split (the stamp parts), so it is keyed as painted.
// Owner = { ri (a locator only), span, skelId, side, segOrd, depths: { cw, walkFrom, walkTo, WB }, edges: [{ si, e }] (depths on the tile's edgeDepths) } — the identity quartet of the span's stamp run (a dead-end
// cap's: the cap's own, `caps`), the same record `tile.ringOwner` and the ink carry. Seams: { cls, a, b (owner keys), aSpan, bSpan, sameChain, line }.
function bandPiecesOfTile({ st, parts, runs, stamps, inBlock, sp, L0, LV_cw, LV_wf, LV_wt, LV_WB, curb, walk, env, perpRects = {}, perpUnbuilt = {} }) {
  const census = { cells: 0, gapOuter: 0, gapByPair: {}, gapInner: 0, gapSeams: 0, goneBoth: [], goneBothN: 0, noAnchor: 0, noInner: 0, noInnerM2: 0, innerShared: 0, innerSplit: 0, necks: 0, innerUnbounded: 0, onlyOnInner: 0, noOwner: 0, byRects: {}, byRectsM2: {}, byRectsWide: 0, refused: 0, refusedM2: 0, refusedPerp: 0, refusedPerpM2: 0, perpLegBare: perpUnbuilt.bare || 0, perpLegNoSub: perpUnbuilt.noSub || 0, perpLegNoStamp: perpUnbuilt.noStamp || 0, perpLegNoStrike: perpUnbuilt.noStrike || 0, refusedAt: [], refusedNear: [], byRectsLost: 0, byRectsLostM2: 0, byRectsLostBy: {}, perpFaceRecs: [0, 0, 0], perpFaceTags: 0, perpFaceSliverTags: 0 }
  const perpFaces = new Map()   // a perpendicular record → its painted faces (`cut`)
  // a run's or an arc's owner is its stamp run; a dead-end cap's is the cap's own (`iaCap` → `caps`, the cap is an end coupler)
  const ownerOf = (span) => { if (span == null) return null; const [h, t] = span.split('/'), R = h[0] === 'c' ? st.caps?.[+h.slice(1)] : Number.isFinite(+t) ? runs[+t] : null
    return R ? { skelId: R.skelId, side: R.side, segOrd: R.segOrd } : null }
  const keyOf = (o) => o ? `${o.skelId}|${o.side}|${o.segOrd}` : null
  // runs of equal label along a ring (cyclic): [{ span, i0, i1 }] — edges i0..i1, vertices i0..i1+1
  const runsOf = (labs) => { const n = labs.length; if (!n) return []
    let s0 = 0; while (s0 < n && labs[(s0 - 1 + n) % n] === labs[s0]) { s0++; if (s0 === n) return [{ span: labs[0], i0: 0, i1: n - 1, whole: true }] }
    const out = []; for (let k = 0; k < n; k++) { const i = (s0 + k) % n; if (k === 0 || labs[i] !== labs[(i - 1 + n) % n]) out.push({ span: labs[i], i0: i, i1: i }); else out[out.length - 1].i1 = i }
    return out }
  const verts = (ring, i0, i1) => { const n = ring.length, v = []; for (let i = i0; ; i = (i + 1) % n) { v.push(ring[i]); if (i === (i1 + 1) % n) break; if (v.length > n + 1) break } return v }
  // the cells between two labelled levels, per contour part. ⭐ The two levels' runs are ALIGNED IN ORDER (the longest common
  // subsequence of their span labels, anchored at a span each carries once), never looked up by label: an offset's edge is
  // struck from whichever rect it lies on, so where two depths step a level can read X · Y · X for a few mm (measured HPDM
  // 2026-10-18: ~500–870 such runs per level, median 5 mm), and the same span change then occurs twice on one level and once
  // on the other. A MATCHED run's cell is its run on both levels between the seams at its ends. An unmatched run between two
  // matches FANS to the neighbouring match's point on the other level only when that match is its OWN span (a re-entry);
  // ⛔ otherwise it makes no cell (Boz, 2026-10-18): such a fan's apex is ANOTHER span's point, and on HPDM every one of the
  // 11 owners with no depth was that ground, 0.38–2.10 m from the other span's edges and 2.15–49 m from its own
  // (scratch/ground-budget/lattice-r1/emitter-depthless.mjs). Its ground is left over, to the rects (below).
  // Each cell names the seam to the NEXT cell round the ring (`seamEnd`, `next`) — none across ground left to the rects.
  // weighted by LENGTH (the shorter of the two runs, in metres), so a span's long run pairs with its long run and a few-mm
  // flicker is what is left over, never the other way round
  const lcs = (A, B, wA, wB) => { const n = A.length, m = B.length, D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1))
    const w = (i, j) => A[i] === B[j] ? Math.min(wA[i], wB[j]) + 1e-9 : -1
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) D[i][j] = Math.max(D[i + 1][j], D[i][j + 1], w(i, j) >= 0 ? D[i + 1][j + 1] + w(i, j) : -1)
    const pr = []; for (let i = 0, j = 0; i < n && j < m;) { const W = w(i, j); if (W >= 0 && D[i][j] === D[i + 1][j + 1] + W) { pr.push([i, j]); i++; j++ } else if (D[i + 1][j] >= D[i][j + 1]) i++; else j++ }
    return pr }
  const runLen = (r, x) => { let L = 0; for (let i = x.i0; ; i = (i + 1) % r.length) { const a = r[i], b = r[(i + 1) % r.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); if (i === x.i1 || L > 1e9) break } return L }
  const rot = (a, k) => [...a.slice(k), ...a.slice(0, k)]
  const align = (orr, irr, or_, ir_) => { // cyclic: rotate both to a span each carries exactly once, then a linear LCS
    const cnt = (rr) => rr.reduce((m, x) => m.set(x.span, (m.get(x.span) || 0) + 1), new Map()), co = cnt(orr), ci = cnt(irr)
    const anchor = orr.findIndex(x => co.get(x.span) === 1 && ci.get(x.span) === 1)
    if (anchor < 0) census.noAnchor++
    const a0 = Math.max(0, anchor), b0 = anchor < 0 ? 0 : irr.findIndex(x => x.span === orr[a0].span)
    const O = rot(orr.map((x, i) => i), a0), I = rot(irr.map((x, j) => j), b0)
    return lcs(O.map(i => orr[i].span), I.map(j => irr[j].span), O.map(i => runLen(or_, orr[i])), I.map(j => runLen(ir_, irr[j]))).map(([p, q]) => [O[p], I[q]]) }
  const inFrac = (A, B) => { const st = Math.max(1, Math.floor(A.length / 16)); let n = 0, k = 0; for (let i = 0; i < A.length; i += st) { k++; if (pointInRing(A[i][0], A[i][1], B)) n++ } return n / k }
  const nested = (a, b) => inFrac(b, a) >= 0.5 || inFrac(a, b) >= 0.5
  const cellsBetween = (O, I, depth) => {
    const out = []
    O.per.forEach((po, k) => { const pi = I.per[k], p = po.p, all = new Set(p.dspan), Ospans = new Set(), Ispans = new Set()
      const inner = (pi?.rings || []).map((r, ri) => ({ ring: r, rr: runsOf(pi.labs[ri]) })), usedI = new Set()
      for (const x of inner) for (const y of x.rr) Ispans.add(y.span)
      po.rings.forEach((r, ri) => { const rr = runsOf(po.labs[ri]); for (const x of rr) Ospans.add(x.span)
        if (rr.length === 1) { // one span the whole way round: its cell is the whole region between the levels here
          out.push({ span: rr[0].span, ri: p.ri, poly: null, whole: { outer: r, inner: pi?.rings || [] }, kind: 'whole' }); census.cells++; return }
        // the inner ring this outer ring bounds: the one whose runs align with most of its own (a level that split is counted)
        // ⭐ only an inner ring this one CONTAINS, or that contains it (a hole part's levels grow outward), bounds a band with it:
        // a level that split into an island and a main ring would otherwise pair the island with the main ring's far side.
        // Where the inner level split in TWO (the band's full depth meets itself in a neck), the outer ring aligns with each
        // inner ring it nests and the matches are merged in its own order; one outer run claimed by two is kept by the ring
        // with more matches.
        const cand = []; for (const [q, x] of inner.entries()) { if (!x.rr.length || !nested(r, x.ring)) continue; const pr = align(rr, x.rr, r, x.ring); if (pr.length) cand.push({ q, x, pr }) }
        if (!cand.length) { census.noInner++; census.noInnerM2 += Math.abs(signedArea(r)); rr.forEach(x => out.push({ span: x.span, ri: p.ri, poly: verts(r, x.i0, x.i1), kind: 'no inner' })); census.cells += rr.length; return }
        cand.sort((a, b) => b.pr.length - a.pr.length); const claim = new Map()
        for (const c of cand) { if (usedI.has(c.q)) census.innerShared++; usedI.add(c.q); for (const [i, j] of c.pr) if (!claim.has(i)) claim.set(i, { c, j }) }
        if (cand.length > 1) census.innerSplit++
        const pr = [...claim.entries()].sort((a, b) => a[0] - b[0]).map(([i, v]) => ({ i, j: v.j, X: v.c.x })), M = pr.length
        const oS = (i) => r[rr[i].i0], oE = (i) => r[(rr[i].i1 + 1) % r.length], iS = (X, j) => X.ring[X.rr[j].i0], iE = (X, j) => X.ring[(X.rr[j].i1 + 1) % X.ring.length]
        const ring = []                                  // the cells in order round the ring, each with its closing seam to the next
        for (let m = 0; m < M; m++) {
          const { i, j, X } = pr[m], { i: i2, j: j2, X: X2 } = pr[(m + 1) % M], ir = X.ring, irr = X.rr
          ring.push({ span: rr[i].span, poly: [...verts(r, rr[i].i0, rr[i].i1), ...verts(ir, irr[j].i0, irr[j].i1).reverse()], seamEnd: [oE(i), iE(X, j)], kind: 'pair', at: [rr[i].i0, rr[i].i1, irr[j].i0, irr[j].i1] })
          const c0 = iE(X, j), o1 = oS(i2), same = X === X2  // the gap: outer runs i+1 … i2−1, inner runs j+1 … j2−1 (one inner ring)
          const gO = []; for (let a = (i + 1) % rr.length; a !== i2; a = (a + 1) % rr.length) gO.push(a)
          const gI = []; if (same) for (let b = (j + 1) % irr.length; b !== j2; b = (b + 1) % irr.length) gI.push(b)
          if (!same) census.necks++
          // ⭐ A FAN IS KEPT ONLY INSIDE ITS OWN SPAN, BY LABEL (Boz's ruling, 2026-10-18): an outer gap run fans to the previous
          // match's inner end (c0, span rr[i]), an inner gap run to the next match's outer start (o1, span rr[i2]) — so a fan whose
          // span IS that match's (a re-entry: the X·Y·X flicker) stays in its own band; any other would cross into another
          // span's, and its ground is left to the rects
          const keepO = (a) => rr[a].span === rr[i].span, keepI = (b) => irr[b].span === rr[i2].span
          census.gapOuter += gO.filter(a => !keepO(a)).length; census.gapInner += gI.filter(b => !keepI(b)).length
          for (const a of gO) if (!keepO(a) && !Ispans.has(rr[a].span)) { const kp = `${keyOf(ownerOf(rr[(a - 1 + rr.length) % rr.length].span)) ?? '-'} | ${keyOf(ownerOf(rr[(a + 1) % rr.length].span)) ?? '-'}`; census.gapByPair[kp] = (census.gapByPair[kp] || 0) + 1 }
          const whole = gO.every(keepO) && gI.every(keepI)   // every run in the gap has its own fan: the cells still tile it
          for (const a of gO) if (keepO(a)) ring.push({ span: rr[a].span, poly: [...verts(r, rr[a].i0, rr[a].i1), c0], seamEnd: whole ? [oE(a), c0] : null, kind: 'outer fan', at: [rr[a].i0, rr[a].i1] })
          if (whole && gI.length) ring[ring.length - 1].seamEnd = [o1, c0]
          for (const b of gI) if (keepI(b)) ring.push({ span: irr[b].span, poly: [o1, ...verts(ir, irr[b].i0, irr[b].i1).reverse()], seamEnd: whole ? [o1, iE(X, b)] : null, kind: 'inner fan', at: [irr[b].i0, irr[b].i1] })
          // the seam to the next match is a segment only when the cells tile the gap (a neck's is not a segment either); where a
          // dropped fan's ground lies between, the pair's and the kept fans' seams are not drawn
          if (!whole) { census.gapSeams++; for (let q = ring.length - 1; q >= 0 && ring[q].kind !== 'pair'; q--) ring[q].seamEnd = null; const pq = ring.findLastIndex(c => c.kind === 'pair'); if (pq >= 0) ring[pq].seamEnd = null }
          else ring[ring.length - 1].seamEnd = same ? [o1, iS(X, j2)] : null
        }
        ring.forEach((c, q) => { out.push({ ...c, ri: p.ri, next: ring[(q + 1) % ring.length].span }); census.cells++ }) })
      inner.forEach((x, q) => { if (!usedI.has(q) && x.rr.length) census.innerUnbounded++ })
      for (const s of Ispans) if (!Ospans.has(s)) census.onlyOnInner++
      for (const s of all) if (!Ospans.has(s) && !Ispans.has(s)) { census.goneBothN++
        if (census.goneBoth.length < 12) census.goneBoth.push(`${s} (${keyOf(ownerOf(s)) ?? 'no owner'}) has no width at ${depth}`) } })
    return out }
  const luSplit = (rings) => { if (!rings.length) return []; const r = inBlock(rings); if (!r.length) return []
    if (sp.whole) return [{ key: sp.classes[0], rings: r }]
    return sp.classes.map(lu => ({ key: lu, rings: intersectRings(r, sp.regionsOf(lu)) })).filter(x => x.rings.length) }
  const pieces = [], seams = []
  // a piece names its OWNERS — one, or (ground in two spans' rects, a join's two edges) exactly the spans that hold it
  const emit = (cls, rings, spans, ri, why = null, from = null) => { const owners = spans.map(span => { const o = ownerOf(span); if (!o) census.noOwner++
      return { ri, span, ...(o || { skelId: null, side: null, segOrd: null }) } })
    for (const x of luSplit(rings)) pieces.push({ cls, key: x.key, rings: x.rings, owners, ...(why ? { why } : {}), ...(from ? { from } : {}) }) }
  const ar = (rs) => rs.reduce((t, r) => t + Math.abs(signedArea(r)), 0)
  const bb = (rs) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const r of rs) for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] }
  const meets = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
  // ⭐⭐ THE GROUND NO CELL HOLDS ALONE (Boz's ruling, 2026-10-18). Where a cell's piece overlaps another's, or no cell reaches
  // (a NECK, where the band's full depth meets itself because the block is narrower than two depths · an ISLAND, an outer
  // ring with no inner one), the ground goes to the spans whose OWN rects hold it — the inner level's per-edge bands and
  // joins, exactly as `offsetRingByRects` struck them (`stamp.clips`), never a second construction and never nearness:
  //   (a) in one span's band only → that span · (b) in two or more spans' bands → ONE piece owned by exactly those spans,
  //   as a crossing of the ink is (the class is the band's either way; the height blends over owners) · (c) in no band but
  //   the join at ONE ① vertex → the two edges that meet there · ⛔ anything else is REFUSED by name.
  //   ⭐ each region is built from the RECTS ALONE and only then met with the band, so neighbouring faces share one boundary.
  //   The rects are the offset's FLOAT lines and the band's inner edge is Clipper's rounding of their union, so what the
  //   exact pass leaves along that edge (sub-mm, measured) is asked again with each rect grown by TOL (two grid steps) — the
  //   reach `offsetRingByRects` itself gives a line that holds an edge. ⚠️ Snapping the rects to the grid instead was
  //   measured WORSE on HPDM (608 fragment rings, 2.27 m², against 256 and 0.23 m²): a snapped rect is a second rounding of
  //   the same line.
  //   ⭐ a perpendicular corner's own rects (`X`, `perpRects[cls]`) join the bands as their builders' (each `spans`), exactly
  //   as a clip does: an extension is its leg's band run on, so it holds ground as that band's rect would.
  const byRects = (cls, L, I, grow = 0, X = []) => {
    const clips = [...(I?.per || []).flatMap(x => x.clips || []), ...X.flatMap(x => x.rings.map(poly => ({ poly, spans: x.spans, join: null })))].filter(c => c.poly.length >= 3), Lb = bb(L)
    const near = clips.filter(c => meets(bb([c.poly]), Lb)), bands = new Map(), joins = new Map()
    for (const c of near) { const poly = grow ? offsetRings([c.poly], grow, 'miter')[0] : c.poly; if (!(poly?.length >= 3)) continue
      if (c.join == null) for (const s of c.spans) (bands.get(s) || bands.set(s, []).get(s)).push(poly)
      else { const J0 = joins.get(c.join) || joins.set(c.join, { spans: c.spans, polys: [], d: [] }).get(c.join); J0.polys.push(poly); if (c.d) J0.d.push(c.d) } }
    const U = [...bands.entries()].map(([s, ps]) => ({ s, R: unionRings(ps) })).filter(x => x.R.length && intersectRings(L, x.R).length)
    const faces = [], k = U.length
    if (k > 12) { census.byRectsWide++; return { faces: [], left: L } }
    // the arrangement of the spans' bands: every non-empty subset T is the region in exactly T's bands, from the rects alone
    for (let m = 1; m < (1 << k); m++) { let g = null; const T = []
      for (let q = 0; q < k && (g === null || g.length); q++) if (m & (1 << q)) { T.push(U[q].s); g = g === null ? U[q].R : intersectRings(g, U[q].R) }
      if (!g?.length) continue
      const out = U.filter((_, q) => !(m & (1 << q))).flatMap(x => x.R); if (out.length) g = differenceRings(g, out)
      const f = g.length ? intersectRings(L, g) : []
      if (f.length && ar(f) > 0) faces.push({ spans: T, rings: f, why: T.length > 1 ? 'shared' : 'one rect' }) }
    const allR = U.flatMap(x => x.R), J = [...joins.entries()].map(([v, x]) => ({ v, spans: x.spans, d: x.d, R: unionRings(x.polys) }))
    for (const j of J) { const others = [...allR, ...J.filter(y => y !== j).flatMap(y => y.R)], g = others.length ? differenceRings(j.R, others) : j.R
      const f = g.length ? intersectRings(L, g) : []; if (f.length && ar(f) > 0) faces.push({ spans: j.spans, rings: f, why: 'join', src: { kind: 'join', join: j.v, d: j.d } }) }
    const everyR = [...allR, ...J.flatMap(y => y.R)], left = everyR.length ? differenceRings(L, everyR) : L
    // ground in a clip but in no face (two or more joins and no rect): counted, so it is never lost silently
    const got = faces.flatMap(f => f.rings), lost = differenceRings(L, [...got, ...left]); if (lost.length && ar(lost) > 0) { census.byRectsLost++; census.byRectsLostM2 += ar(lost)
      // …and whether the joins over it AGREE on their spans (a disclosure for Boz's ruling; nothing decides by it)
      const over = J.filter(j => { const x = intersectRings(lost, j.R); return x.length && ar(x) > 0 }), sets = new Set(over.map(j => [...j.spans].sort().join('+')))
      const k = over.length < 2 ? 'fewer than two joins' : sets.size === 1 ? 'agree' : 'disagree'; census.byRectsLostBy[k] = (census.byRectsLostBy[k] || 0) + ar(lost) }
    return { faces, left } }
  const cut = (cls, B, cells, I = null) => { if (!B.length) return
    const X = (perpRects[cls] || []).filter(x => x.spans.length), Xb = X.map(x => ({ x, b: bb(x.rings) }))
    const raw = []
    for (const c of cells) { const reg = c.whole ? (c.whole.inner.length ? xorRegion(c.whole.outer, c.whole.inner) : [c.whole.outer]) : (c.poly.length >= 3 ? [c.poly] : [])
      const r = reg.length ? intersectRings(B, reg) : []; if (r.length && ar(r) > 0) raw.push({ c, r, b: bb(r) })
      if (c.seamEnd) { const L = clipLine(c.seamEnd, B); if (L.length) { const a = ownerOf(c.span), b = ownerOf(c.next)
        seams.push({ cls, a: keyOf(a), b: keyOf(b), aSpan: c.span, bSpan: c.next, sameChain: !!(a && b && a.skelId === b.skelId), line: L }) } } }
    // a cell holds alone only the part of it no other cell, and no other span's perpendicular rect, overlaps: that ground is
    // asked of the rects, where it is shared (Jacob, 2026-10-20)
    const own = raw.map((x, i) => { const o = [...raw.filter((y, j) => j !== i && meets(x.b, y.b)).map(y => y.r).flat(),
        ...Xb.filter(y => !y.x.spans.includes(x.c.span) && meets(x.b, y.b)).flatMap(y => y.x.rings)]
      return o.length ? differenceRings(x.r, unionRings(o)) : x.r })
    raw.forEach((x, i) => { if (own[i].length) emit(cls, own[i], [x.c.span], x.c.ri, null, { kind: x.c.kind, at: x.c.at ?? null }) })
    // only what is painted counts: the disc cut first (a piece is cut by it anyway), then each connected part on its own
    const held = own.flat(), L0 = held.length ? differenceRings(B, unionRings(held)) : B, L = L0.length ? inBlock(L0) : []
    if (!L.length || !(ar(L) > 1e-6)) return
    const ri = cells[0]?.ri ?? null, left = []
    const partsOf = (rs) => { if (!rs.length) return []; const sg = Math.sign(signedArea(rs.reduce((m, q) => Math.abs(signedArea(q)) > Math.abs(signedArea(m)) ? q : m)))
      return rs.filter(r => signedArea(r) * sg > 0).map(o => intersectRings(rs, [o])).filter(c => c.length && ar(c) > 0) }
    // ⭐ the perpendicular corners' own ground is arranged ON ITS OWN, component by component, with only the rects that meet
    // it: added to a block-wide component (an island's whole walk), its legs' spans pushed the arrangement past its width
    // guard and the whole component was refused (HPDM tile 65, 29,668 m²). The rest of the component is arranged as before.
    const PGu = X.length ? unionRings(X.flatMap(x => x.rings)) : []
    const comps = []
    for (const comp of partsOf(L)) { if (!PGu.length) { comps.push({ comp, X: [] }); continue }
      const off = differenceRings(comp, PGu); for (const c of partsOf(off)) comps.push({ comp: c, X: [] })
      for (const c of partsOf(intersectRings(comp, PGu))) { const b = bb(c); comps.push({ comp: c, X: Xb.filter(y => meets(b, y.b)).map(y => y.x) }) } }
    // what the exact pass leaves (sub-mm, along the rects' edges) is asked again within TOL part by part, with the perpendicular
    // rects that meet each part: rounding the union of those rects leaves such slivers on BOTH sides of its edge
    const Xnear = (rs) => { const b = bb(rs); return Xb.filter(y => meets(b, y.b)).map(y => y.x) }
    // ⭐ a face arranged WITH perpendicular rects is that corner's ground as PAINTED (Clipper's rounding, the band's own
    // edges): it is handed to the deformer as the region of each record that built it (`perpFaces`), so the height code's
    // leg test reads the very rings its band test reads. ⛔ Never the float rect: a vertex on the rounded band edge fell up
    // to 0.5 mm outside it, and no ray reaches past the tangent (HPDM, 74 unowned, 2026-10-21). A record built the face when
    // its span is one the face carries AND its own rect, at the reach the face was arranged with (`grow`), holds ground of
    // it: two legs on one run share a span, so the span alone gave a face to the wrong leg (37 of 235 on four HPDM tiles).
    // A face two such records built is each one's less the ground only the OTHERS' rects hold: their overlap is both legs',
    // as the rects' is, and the face's outer edge stays the painted one.
    const tag = (f, Xs, grow) => { const rectOf = (x) => grow ? x.rings.flatMap(r => offsetRings([r], grow, 'miter')) : x.rings
      const ov = new Map(Xs.filter(x => x.spans.some(s => f.spans.includes(s))).map(x => [x, ar(intersectRings(f.rings, rectOf(x)))])), recs = [...ov.keys()].filter(x => ov.get(x) > 0)
      // a tag whose overlap is under the face's perimeter × the reach is a sliver of the grown rect, not the face (Zob, counted)
      if (grow) { const per = f.rings.reduce((t, r) => t + r.reduce((u, p, k) => u + Math.hypot(r[(k + 1) % r.length][0] - p[0], r[(k + 1) % r.length][1] - p[1]), 0), 0)
        for (const x of recs) { census.perpFaceTags++; if (ov.get(x) < per * grow) census.perpFaceSliverTags++ } } else census.perpFaceTags += recs.length
      for (const x of recs) { const others = recs.filter(y => y !== x).flatMap(rectOf), only = others.length ? differenceRings(unionRings(others), rectOf(x)) : []
        const g = only.length ? differenceRings(f.rings, only) : f.rings; if (g.length && ar(g) > 0) (perpFaces.get(x) || perpFaces.set(x, []).get(x)).push(...g) }
      if (Xs.length) census.perpFaceRecs[Math.min(recs.length, 2)]++ }
    for (const { comp, X: Xc } of comps) {
      const R0 = byRects(cls, comp, I, 0, Xc), R1 = { faces: [], left: [] }
      for (const f of R0.faces) tag(f, Xc, 0)
      if (R0.left.length && ar(R0.left) > 0) for (const c of (X.length ? partsOf(R0.left) : [R0.left])) { const Xs = X.length ? Xnear(c) : Xc, r = byRects(cls, c, I, 2 / SCALE, Xs); for (const f of r.faces) tag(f, Xs, 2 / SCALE); R1.faces.push(...r.faces); R1.left.push(...r.left) }
      left.push(...R1.left)
      for (const f of [...R0.faces, ...R1.faces.map(f => ({ ...f, why: f.why + ' (within TOL)' }))]) { emit(cls, f.rings, f.spans, ri, f.why, f.src ?? null); census.byRects[f.why] = (census.byRects[f.why] || 0) + 1; census.byRectsM2[f.why] = (census.byRectsM2[f.why] || 0) + ar(f.rings) } }
    // a refused region names the rects and joins within 2 m of it — a REPORTING reach for the trace (Boz, 2026-10-18): it
    // is printed and NEVER feeds a decision; nothing reads `refusedNear` but the trace
    if (ar(left) > 0 && census.refusedNear.length < 12) { const lb = bb(left), g = 2, box = [lb[0] - g, lb[1] - g, lb[2] + g, lb[3] + g]
      const drops = (I?.per || []).flatMap(x => (x.dropped || []).map(r => ({ r, areaMin: x.areaMin }))), inDrop = drops.filter(d => intersectRings(left, [d.r]).length && ar(intersectRings(left, [d.r])) > 0)
      census.refusedNear.push({ cls, m2: ar(left), at: [(lb[0] + lb[2]) / 2, (lb[1] + lb[3]) / 2], inDropped: inDrop.map(d => ({ m2: Math.abs(signedArea(d.r)), areaMin: d.areaMin, covered: ar(intersectRings(left, [d.r])) })),
        clips: (I?.per || []).flatMap(x => x.clips || []).filter(c => c.poly.length >= 3 && meets(bb([c.poly]), box)).map(c => ({ spans: c.spans, join: c.join, d: c.d ?? null })) }) }
    // the part of it a perpendicular corner's own rects cover (`perpRects`, by construction) is named as that: its residue
    const lm = ar(left); if (lm > 0) { const PG = (perpRects[cls] || []).flatMap(x => x.rings), lp = PG.length ? intersectRings(left, unionRings(PG)) : [], pm = lp.length ? ar(lp) : 0
      census.refused++; census.refusedM2 += lm; if (pm > 0) { census.refusedPerp++; census.refusedPerpM2 += pm }
      if (census.refusedAt.length < 8) { const [x0, z0, x1, z1] = bb(left); census.refusedAt.push(`${cls}${pm > 0 ? ` (perpendicular corner ground with no owner, ${pm.toFixed(3)} m² of it)` : ''} ${lm.toFixed(3)} m² at (${((x0 + x1) / 2).toFixed(2)}, ${((z0 + z1) / 2).toFixed(2)})`) } } }
  const xorRegion = (outer, inner) => { const A = Math.abs(signedArea(outer)), Bi = inner.reduce((t, r) => t + Math.abs(signedArea(r)), 0)
    return A >= Bi ? differenceRings([outer], inner) : differenceRings(inner, [outer]) }
  cut('curb', curb, cellsBetween(L0, LV_cw, 'the curb'), LV_cw)
  cut('walk', walk, cellsBetween(LV_wf, LV_wt, 'the walk'), LV_wt)
  const lawn = env.length ? (walk.length ? differenceRings(env, walk) : env) : []
  cut('lawn', lawn, cellsBetween(LV_cw, LV_WB, 'the lawn'), LV_WB)
  // ⭐ EACH OWNER'S DEPTHS AND EDGES, BY ITS LABEL (Boz, for Screed's band blend, 2026-10-18; §6a — identity, never a
  // by-distance find): an owner IS a span — a TILE-wide label (runs, arcs and caps index the tile's own lists; `ri` is only a
  // locator) — so its edges are every source edge, in any contour part, carrying its span — `o.edges` = [{ si, e }], the `iaFull` ring and edge, on which the tile's `edgeDepths` give the depth AT a point —
  // and `o.depths` = per level the [least, greatest] depth those edges were struck at (`offsetRingByRects`' `stamp.edgeDepths`,
  // a zero depth included, never recomputed). null = the span strikes nothing at that level. A multi-owner piece carries one
  // set per owner. (This replaced a box reach — each edge's box grown by its deepest depth, met against the piece — which
  // bound nothing to a piece whose label is honest but lies past that reach.)
  const LEVELS = { cw: LV_cw, walkFrom: LV_wf, walkTo: LV_wt, WB: LV_WB }
  const byEdge = new Map()   // part.ri:e → { ri, si, e, a, b, span, depths }
  for (const [k, LV] of Object.entries(LEVELS)) for (const x of LV?.per || []) for (const e of x.edges || []) { const key = x.p.ri + ':' + e.e
    const r = byEdge.get(key) || byEdge.set(key, { ri: x.p.ri, si: x.p.si, e: x.p.dsrc[e.e], a: e.a, b: e.b, span: e.span, depths: {} }).get(key)
    r.depths[k] = [e.d[0], e.d[1]] }
  const ownEdges = new Map(); for (const r of byEdge.values()) (ownEdges.get(r.span) || ownEdges.set(r.span, []).get(r.span)).push(r)
  for (const q of pieces) for (const o of q.owners) { const E = ownEdges.get(o.span) || [], dep = {}
    for (const k of Object.keys(LEVELS)) { let lo = Infinity, hi = -Infinity
      for (const r of E) if (r.depths[k]) { lo = Math.min(lo, ...r.depths[k]); hi = Math.max(hi, ...r.depths[k]) }
      dep[k] = lo <= hi ? [lo, hi] : null }
    o.depths = dep
    const seen = new Set(); o.edges = []
    for (const r of E) { const k = r.si + ':' + r.e; if (!seen.has(k)) { seen.add(k); o.edges.push({ si: r.si, e: r.e }) } } }
  // ⭐ THE TILE'S OWN RECORD (Screed, 2026-10-18: one record, read twice — the band blend and the absorption along ②):
  // edgeDepths[si][e] for EVERY `iaFull` edge = { level: [[t, depth], …] }, breakpoints along the edge (t 0 → 1) exactly as
  // struck, so a taper's break inside one ② edge is kept; null where the edge strikes nothing at that level.
  const edgeDepths = (st.iaFull || []).map(r => r.map(() => null))
  for (const r of byEdge.values()) { const ring = st.iaFull?.[r.si]; if (!ring || r.e == null) continue
    const A = ring[r.e], B = ring[(r.e + 1) % ring.length], dx = B[0] - A[0], dz = B[1] - A[1], L2 = dx * dx + dz * dz || 1
    const tOf = (p) => Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / L2))
    const rec = edgeDepths[r.si][r.e] || (edgeDepths[r.si][r.e] = { cw: [], walkFrom: [], walkTo: [], WB: [] })
    for (const k of Object.keys(LEVELS)) if (r.depths[k]) rec[k].push([tOf(r.a), r.depths[k][0]], [tOf(r.b), r.depths[k][1]]) }
  for (const ring of edgeDepths) for (const rec of ring) if (rec) for (const k of Object.keys(LEVELS)) {
    const pts = rec[k].sort((u, v) => u[0] - v[0] || u[1] - v[1]); rec[k] = pts.length ? pts.filter((q, i) => !i || q[0] !== pts[i - 1][0] || q[1] !== pts[i - 1][1]) : null }
  return { pieces, seams, census, edgeDepths, perpFaces: new Map([...perpFaces].map(([x, rs]) => [x, unionRings(rs)])) }
}
// an open segment clipped to a region (Clipper, the lattice's grid) → the polylines inside it
function clipLine(seg, region) {
  const c = new clipperLib.Clipper(), tree = new clipperLib.PolyTree(), C = (r) => r.map(([x, z]) => ({ X: Math.round(x * SCALE), Y: Math.round(z * SCALE) }))
  c.AddPath(C(seg), clipperLib.PolyType.ptSubject, false); c.AddPaths(region.filter(r => r?.length >= 3).map(C), clipperLib.PolyType.ptClip, true)
  c.Execute(clipperLib.ClipType.ctIntersection, tree, clipperLib.PolyFillType.pftNonZero, clipperLib.PolyFillType.pftNonZero)
  return clipperLib.Clipper.OpenPathsFromPolyTree(tree).map(p => p.map(q => [q.X / SCALE, q.Y / SCALE]))
}

export function sectionPassProtoTile(st, cw, stripMat, blockCustoms = null, cornerOverrides = null, { pieces: wantPieces = false, notCorners = null } = {}) {
  const dump0 = { rows: sectionDump.rows.length, ramp: sectionDump.ramp.length }   // a repaint (`notCorners`) replaces this pass's dump
  // ⭐ TWO CONTOURS, TWO QUESTIONS. `iaFull` + `iaStamp` answer "what depth HERE" — uncut, so the
  // per-point correspondence is intact. The cut `iA` answers "where is the block" after the disc
  // was stamped. Strike off the first, CUT with the second: a rim band is a clean cut through a
  // finished band, never a band that turned a corner to follow the rim.
  const iA = st.iaFull || [], stamps = st.iaStamp || [], runs = st.runs || []
  // ⭐ a tile that paints nothing still names its rim (`nodeRimWithPaint`, nothing minted): every rim-edged tile carries an entry
  const emptyRim = nodeRimWithPaint(st, [], () => {})
  const empty = { Wacc: [], tlByLu: {}, luByLu: {}, curb: [], ...(emptyRim ? { rim: emptyRim } : {}) }
  if (!iA.length) return empty
  // ⛔ A CUT THAT LEFT NO BLOCK PAINTS NOTHING. The disc can cut a tile's block away entirely and keep the tile (its ring
  // still meets the disc); `inBlock` used to read an EMPTY `iA` as "no clip" and struck the whole uncut contour — on
  // hipointedemun 226,843 + 36,107 m² of land use on tiles 174 and 243, which `rekeyByPiece` then had to drop and report.
  if (Array.isArray(st.iA) && !st.iA.length) return empty
  const inBlock = (rings) => (st.iA?.length && rings.length) ? intersectRings(rings, st.iA) : rings
  const key = OWN_LU   // re-keyed to each piece's own class at every return (`rekeyByPiece`)
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
  // a cap's own section, once per cap: its owner (`caps[c]`) with the base measure of a run of its own chain on this tile.
  // ⛔ An owner whose chain has no run here cannot be measured: counted and returned (`capUnmeasured`), never defaulted.
  const capM = new Map(); let capUnmeasured = 0
  const capMeasure = (c) => { if (capM.has(c)) return capM.get(c)
    const cap = st.caps?.[c], base = cap ? (runs.find(r => r.skelId === cap.skelId)?.baseMeasure ?? null) : null
    const m = base ? resolveProtoMeasure({ ...cap, baseMeasure: base }, blockCustoms, cw) : null; if (!m) capUnmeasured++
    capM.set(c, m); return m }
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
        // ⭐ A DEAD-END CAP'S EDGES CARRY NO RUN — they resolve to THE CAP'S OWN SECTION (`SECTION §6.3`, LANDED 2026-07-22, restored
        // here 2026-10-18: "the bulb has NO halves … ONE cross-section — the cap's own … the bulb goes whole to the cap owner").
        // The owner is `caps[iaCap]`, measured like any run (`resolveProtoMeasure`) off the `baseMeasure` its own chain's runs carry.
        // ⛔ Before this a cap edge read THE OPEN FIELD and its walk went to the curb (▶ checks/claims-a-cap-carries-one-section.mjs).
        if (!byRun.size) { for (let k = 0; k < len; k++) { const q = (s0 + k) % n, c = st.iaCap?.[p.si]?.[q]
          legArr.set(`${ri}|${q}`, c == null ? null : capMeasure(c)) } continue }
        const authored = (r) => !!blockCustoms?.[runs[r].skelId]?.[runs[r].side]?.[runs[r].segOrd]
        let win = null, best = -1, winAuth = false
        for (const [r, L] of byRun) { const au = authored(r)
          if ((au && !winAuth) || (au === winAuth && L > best)) { best = L; win = r; winAuth = au } }
        const mm = resolveProtoMeasure(runs[win], blockCustoms, cw)
        for (let k = 0; k < len; k++) legArr.set(`${ri}|${(s0 + k) % n}`, mm)
        const ok = resKey(stp[s0]); feArcs++
        if (ok != null) { if (seenOwner.has(ok)) feRepeat++; else seenOwner.add(ok) }
      }
    }
  }
  if (capUnmeasured) console.warn(`[tileGround][SECTION] ⛔ ${capUnmeasured} dead-end cap(s) on this tile whose owner's chain has no run here to measure — the cap draws THE OPEN FIELD (no walk): ${(st.caps || []).filter((_, c) => capM.get(c) === null).map(o => `${o?.skelId}|${o?.side}|${o?.segOrd}`).join(' · ')}`)
  // ⭐ EVERY per-point read goes through the LEG's single resolution (`SECTION §3.3` step 1).
  // ⭐ H-3 step 4: a JR's town frontage is concrete on both strips; a verge is bare on every edge.
  const M = (ri, i) => { const m = legArr.get(`${ri}|${i}`) ?? null
    return (m && st.blockClass === 'jr') ? { ...m, matOuter: 'SW', matInner: 'SW' } : m }
  // ⭐ A SHORE EDGE IS NOT A STREET (`RIBBONS §1`: "no coupler, no baseMeasure, no band … it closes
  // faces; nothing offsets a curb from it"). It carries no measure, so `resolvePedDepths` handed it the
  // STANDARD treelawn + sidewalk — a curb, a walk and a lawn traced along 96% of both coasts (Jacob,
  // 2026-09-26: "no sidewalk on the shore"). Read by IDENTITY, the `__water__` stamp: a real street
  // along the water is its own chain and keeps its walk.
  const shoreAt = (p, e) => { const r = (stamps[p.si] || [])[e]; return r != null && runs[r]?.skelId === WATER_EDGE_SKEL }
  const bareAt = (p, e) => { if (st.blockClass === 'verge') return true
    const r = (stamps[p.si] || [])[e]; return (r != null && isHighwayRun(runs[r])) || shoreAt(p, e) }

  // ── THE MONO-WIDTH ENVELOPE — one number for the whole block, over every point it has.
  // `RIBBONS §1` invariant 4, and it is SACROSANCT: the outer depth is uniform per block (that is
  // what gives the clean concentric corner); only the DIVIDER and the MATERIALS vary per point.
  // ⭐ Resolved LIVE, so authoring an edge deeper grows the whole block's band — the behaviour
  // `SECTION §7` lists under "preserve, all already working".
  let WBnom = 0
  for (const p of parts) for (let i = 0; i < p.ring.length; i++) {
    if (shoreAt(p, i)) continue   // the shore's depths are the unmeasured default; never the block's envelope
    const m = M(p.ri, i); if (m) WBnom = Math.max(WBnom, cw + (m.treelawn || 0) + (m.sidewalk || 0))
  }

  // ⛔ NO STAMP IN THESE CALLS. `offsetRingVariable` GATES ITS UNION ON THE STAMP — with one it
  // runs `unionRingLabelled`, without it `unionRings` — so asking for labels CHANGES THE
  // GEOMETRY. Same call shape as the producer's `ins`, deliberately, so the two agree.
  const ins = (pick) => {
    const o = [], h = []
    for (const p of parts) {
      const rs = offsetRingByRects(p.ring, pick(p), p.hole, null, null, { water: p.ring.map((_, e) => shoreAt(p, e)) })
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
  // ⭐ the open field is the REGION ITSELF (`curbOuter`), never an offset of it by 0: the offset's lattice merge drops a sliver
  // ring, and the drop is a hole in the ground (measured on HPDM's verge tile 36: 0.30 m², the sky through it)
  if (WB < cw) {
    const luByLu = rekeyByPiece(st, { [key]: inBlock(curbOuter) })
    // ⭐ an open field on the rim names its rim too (`nodeRimWithPaint`): every rim-edged tile carries an entry
    const rim = nodeRimWithPaint(st, Object.values(luByLu).flat(), (node) => { for (const lu of Object.keys(luByLu)) luByLu[lu] = luByLu[lu].map(node) })
    return { Wacc: [], tlByLu: {}, luByLu, curb: [], capped, openField: true, feArcs, feRepeat, ...(rim ? { rim } : {}) }
  }

  // ── THE ARRANGEMENT, PER POINT. Two strips always — they SWAP, they never collapse (`§3.1`) —
  // so the inner one takes the rest of the envelope. ⛔ The depth belongs to the STRIP, not to the
  // material's name. Identical ladder to the producer's, so the two can be gated against each other.
  const lim = Math.max(0, WB - cw)
  const arrOf = (m) => stripLadder(m, lim)
  // two ladders draw the same strips when their depths agree (an owner change that changes nothing on the ground)
  const sameLadder = (a, b) => { if (a === b) return true; if (!a || !b) return false
    const x = arrOf(a), y = arrOf(b); return x.walkFrom === y.walkFrom && x.walkTo === y.walkTo && x.lawnFrom === y.lawnFrom && x.lawnTo === y.lawnTo }

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
  // missing" — one defect, one cure. ▶ `node checks/claims-sidewalk-is-one-band.mjs`
  // ══ THE CORNER — READ, NOT MEASURED. `iaCorner` LOCATES IT; `iaArc` IS ITS EXTENT ═══════════
  // ⭐⭐⭐ TWO FACTS, TWO SOURCES, BOTH CARRIED ONTO THE CONTOUR. Nothing here derives, matches,
  // thresholds or declines:
  //   `iaCorner[q]` — the ease made an arc here (`EC.arc != null`): ① TURNS, so it is a corner
  //                   (`SECTION §4` rule 6). The owner-change conjunction was retired 2026-09-08.
  //   `iaArc[q]`    — which corner's eased arc this vertex lies in, stamped BY the ease that made
  //                   it (`easeContour`). The one place that knows, asked instead of guessed.
  // ⇒ an arc is a maximal run of one `iaArc` value. Whether it takes the pad is its class (a junction does, a BEND does
  // not — the walk and lawn bend through; the operator's per-corner flag overrules either, Jacob 2026-10-07): see `inC`.
  // Whether a STREET meets the corner (ramps, crosswalks) is the frozen `iaJunction` (`classifyCornerLegs`).
  //
  // ⛔⛔ WHAT THIS REPLACES, AND IT WAS THE LAST RECOVERY IN THE PAINTER. The extent came from
  // `st.fillets`' tangent COORDINATES matched back onto the contour through a 1 mm grid hash —
  // `A15`'s proximity recovery, the same shape that killed the nearest-fe match and the
  // walk-ordinal coupler, done across a boolean that is allowed to move a point. Its own comment
  // conceded the far class: "a tangent 10 cm off the contour is NOT on it, and those still miss."
  // ⭐ MEASURED, and the miss is not a tail: it reached under two thirds of LS's corners, so a
  // third of them had NO extent — one edge to change depth over, i.e. the chevron.
  // ▶ `node checks/claims-the-corner-extent-is-carried.mjs <scene>` — re-run it, never quote it.
  // ⇒ `fillets` and `vertR` are now read by NO consumer on this path. They stay FROZEN because
  // Survey's corner handle rides them (`SECTION §4`'s freeze list); the FILL does not.
  //
  // ⛔⛔ AND THE CORNER HAS NO CROSS-SECTION OF ITS OWN. `cMin`, `conMax` and the pad depths that
  // stood here are GONE, not moved: the corner gets NOTHING (`RIBBONS §1` invariant 1 — "never a
  // separately-constructed primitive… same materials, SAME DEPTHS, bent around an arc"). All this
  // map carries is WHERE the corner is. It comes out flush concrete because the leg's grass has
  // already gone to zero by the time it arrives — an OUTCOME, not a rule about the corner.
  const inC = new Map()                  // `${ri}|${edge}` → this edge lies inside a licensed arc
  // ⭐ THE PAD IS LICENSED BY THE CORNER'S CLASS, AND THE OPERATOR MAY OVERRULE IT (Jacob, 2026-10-07): a junction
  // carries a pad, a BEND does not — the walk and lawn bend through — and the corner's own entry in
  // `cornerCornerRadiusOverrides` (by `iaArcKey`, the radius dial's key) says otherwise: `corner: false` ("not a
  // corner") or `corner: true` ("a corner here"). Every marked arc is recorded, padded or not, so the marker can undo it.
  const cornerArcs = []
  if (cornerOverrides && !st.iaArcKey && !_staleArcKeyWarned && Object.values(cornerOverrides).some(v => cornerFlagOf(v) != null)) {
    _staleArcKeyWarned = true
    console.warn("[tileGround][SECTION] ⛔ this artifact carries no `iaArcKey` (poured before corners were keyed) — the operator's corner flags (not a corner / a corner here) cannot reach the pads until a re-pour.")
  }
  for (const p of parts) {
    const n = p.ring.length
    const arc = st.iaArc?.[p.si], mark = st.iaCorner?.[p.si]
    if (!arc) continue                   // no ease on this ring (a square corner, or a lost stamp)
    const licensed = new Set(), marked = new Map()
    for (let q = 0; q < n; q++) if (arc[q] != null && mark?.[q] && !marked.has(arc[q])) marked.set(arc[q], q)
    for (const [u, q] of marked) {
      const jx = st.iaJunction?.[p.si]?.[q], kind = Number.isInteger(jx) ? 'junction' : (jx === 'bend' || jx === 'nostreet') ? jx : 'unknown'
      const key = st.iaArcKey?.[p.si]?.[u] ?? null, flag = key ? cornerFlagOf(cornerOverrides?.[key]) : null
      // a bend, a no-street corner, or a junction no walk ends in the road at (`notCorners`): none by default
      const nc = kind === 'junction' && !!notCorners?.has(`${p.si}|${u}`)
      const pad = flag ?? ((kind === 'junction' && !nc) || kind === 'unknown')
      if (pad) licensed.add(u)
      // the arc, tangent to tangent (every vertex it labels, first to last): the checks judge the band along it
      let f0 = q; for (let k = 0; k < n && arc[(f0 - 1 + n) % n] === u; k++) f0 = (f0 - 1 + n) % n
      const arcPts = []; for (let k = 0, i = f0; k < n && arc[i] === u; k++, i = (i + 1) % n) arcPts.push(p.ring[i])
      cornerArcs.push({ si: p.si, arc: u, kind, key, flag, pad, at: p.ring[q], arcPts, ...(nc ? { notCorner: true } : {}) })
    }
    for (let q = 0; q < n; q++) {
      const u = arc[q], v = arc[(q + 1) % n]
      if (u != null && u === v && licensed.has(u)) inC.set(`${p.ri}|${q}`, true)
    }
  }

  // ══ THE PERPENDICULAR CORNER — NO BEND, ONLY STRAIGHT EXTENSION THRU (Jacob, 2026-10-18; `SECTION §6.1`) ══════════════
  // Each leg's walk runs STRAIGHT ON past its tangent to the kerb, which is its landing and its cut; the two walks meet in a
  // plain L at the block corner; only the CURB rounds; the rest keeps the leg's outer strip, with no pad. A leg with no lawn
  // has its walk at the kerb already. ⭐ No constructed primitive (`RIBBONS §1` invariant 1): the extension is the leg's OWN
  // band — the rect `offsetRingByRects` strikes for its last ② edge, at that edge's own depths — continued along that edge's
  // own direction and clipped by ② (`legExt`, below). The arc carries no band at all (`perpArcs`): its walk and envelope are
  // empty there, so the leg's band and the extension are the only ground between the curb and the land use.
  // `perpGeom` reads the corner's lawn facts and a probe point for the apex (`wedgeAt`, for the checks). It does not place
  // the cut: the cut is the walk's own end, read off the drawn extension below (`ends`).
  // ⛔ REMOVED 2026-10-18: plan (2)'s RADIAL landings — the landing split in the densify (`dland`) that started the walk
  // at the kerb on the landing span, normal to the ARC, so its sides pointed at the arc's centre — and its bent legs
  // (where both legs carried a lawn, their bands bent through the arc). ⛔ REMOVED 2026-10-17: the 10-07 corner SECTOR,
  // its strip RECTs and the re-fill. ⛔ REMOVED 2026-10-18 (Jacob: "they should line up with the sidewalks themselves"):
  // `perpGeom`'s own solve of where each walk meets the kerb (`contact`, against the ring, from the ladder's depths) and
  // the norm-width piece centred on it (`cutOf`) — a second computation of the drawn walk's end, which sat beside it.
  // ▶ node checks/claims-a-perpendicular-landing-runs-straight-on.mjs <scene>
  const deep = cw + lim
  const perpGeom = (p, q, e, before, after) => {
    const ring = p.ring, n = ring.length
    const mA = M(p.ri, before), mB = M(p.ri, after)
    if (!mA || !mB) return null
    const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l] }
    const dirOf = (i) => unit([ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1]])
    const inBlk = (P) => pointInRing(P[0], P[1], ring) !== !!p.hole
    const inwardOf = (i, d) => { const a = ring[i], b = ring[(i + 1) % n], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      const dl = 1e-3 * (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1), nn = [-d[1], d[0]]
      return inBlk([m[0] + nn[0] * dl, m[1] + nn[1] * dl]) ? nn : [-nn[0], -nn[1]] }
    const A = ring[q], B = ring[(e + 1) % n]
    const nA = inwardOf(before, dirOf(before)), nB = inwardOf(after, dirOf(after))
    const lA = arrOf(mA), lB = arrOf(mB)
    const K = []; for (let k = 0, i = q; k < n; k++, i = (i + 1) % n) { K.push(ring[i]); if (i === (e + 1) % n) break }   // the arc
    // `wedgeAt` (a PROBE for the checks, not paint): the wedge's inner corner, just short of where both walks start — kept
    // when it lies in the block within the band's depth of this corner's kerb (it has room for a wedge), null when the two
    // walks cross at the apex and leave none
    const wedgeAt = (() => { const a1 = cw + lA.walkFrom - 0.1, b1 = cw + lB.walkFrom - 0.1, det = nA[0] * nB[1] - nA[1] * nB[0]
      if (Math.abs(det) < 1e-6) return null
      const r1 = a1 + A[0] * nA[0] + A[1] * nA[1], r2 = b1 + B[0] * nB[0] + B[1] * nB[1]
      const P = [(r1 * nB[1] - r2 * nA[1]) / det, (nA[0] * r2 - nB[0] * r1) / det]
      let dK = Infinity; for (let k = 1; k < K.length; k++) { const U = K[k - 1], V = K[k], dx = V[0] - U[0], dz = V[1] - U[1], L2 = dx * dx + dz * dz
        const t = L2 ? Math.max(0, Math.min(1, ((P[0] - U[0]) * dx + (P[1] - U[1]) * dz) / L2)) : 0; dK = Math.min(dK, Math.hypot(P[0] - U[0] - t * dx, P[1] - U[1] - t * dz)) }
      return inBlk(P) && dK <= deep ? P : null })()
    return { lawn: !!(mA.hasTL && mB.hasTL), oneSided: !!mA.hasTL !== !!mB.hasTL, wedgeAt }
  }
  const R = curbCutsOnJunctionCorners(st, parts, inC, cornerOverrides, cw, band, perpGeom)
  // ⭐ NOT A CORNER (the first pass found no walk ends in the road there): unlicensed above, so the corner pass never visits it
  // and its arc draws the ordinary band, bent — disclosed here, by corner, for the checks and the pour's count
  for (const a of cornerArcs) if (a.notCorner) { R.tally.notCorner++; R.corners.push({ si: a.si, arc: a.arc, at: a.at, notCorner: true }) }
  // ⭐ THE PAD'S EDGES: every licensed arc but a perpendicular corner's — there is no pad and no band on its arc (no leg
  // ramp into it either); the legs' own bands, extended, are the corner
  const perpAt = (ri, i) => { const pp = parts[ri], A = pp ? st.iaArc?.[pp.si] : null, id = A?.[i]
    return id != null && id === A[(i + 1) % A.length] && R.perpArcs.has(`${ri}|${id}`) }     // an ARC EDGE: both ends in it
  const padC = new Map([...inC].filter(([k]) => { const [ri, i] = k.split('|').map(Number); return !perpAt(ri, i) }))

  // ══ ONE ARC, ONE DEPTH — `§6.1` step 4's `cMin`, restored as a STAMP ═════════════════════════
  // ⛔⛔ THE DEFECT, IN THE OPERATOR'S WORDS: *"There's not supposed to be a hard edge angle in the
  // middle of the corner!"* (Jacob, 2026-09-08). An arc's OWNER CHANGES at its middle — that is
  // what makes it a corner — so with no depth of its own, each half of the arc takes its own leg's
  // cross-section and the two meet at a STEP, mid-arc. `RIBBONS §1` invariant 1 says the opposite
  // in as many words: the same cross-section persists into the corner, *"same materials, SAME
  // DEPTHS, bent around an arc."*
  // ⭐⭐ AND `min` IS NOT A CHOICE I MADE — IT IS MEASURED OFF THE SHIPPED SLAB, the map whose
  // corners were correct: the corner's walk runs kerb → the SHALLOWER leg's concrete depth, about
  // 5:1 over the deeper one, in all three arrangements.
  // ▶ `node scratch/_fx-slab-corner-spec.mjs <slabdir>` — reads the artifact, restates nothing.
  // ⛔ NOT A CONSTRUCTED PRIMITIVE (invariant 1) and not a decline: one depth is resolved for the
  // arc and the same four offsets draw it, which is the whole difference between a stamp and the
  // walk painter's bid.
  // ⭐⭐⭐ THE LEGS DECIDE THE CORNER (Jacob, 2026-09-08) — BOTH EDGES OF IT, NOT ONE.
  // The arc already resolved its INNER edge from its legs (`cMin`). Its OUTER edge was hardwired
  // to the kerb, and that was the one place a leg did not get to decide anything: at TL↔TL the two
  // legs AGREE that the grass is at the kerb, and the arc overrode them both and paved it.
  // ⛔ `RIBBONS §1` invariant 1 is the authority — "the same cross-section persists from
  // straight-spans into the corner, SAME MATERIALS, SAME DEPTHS, bent around an arc." A corner
  // that overrides its legs is a cross-section of its own, which invariant 1 forbids in as many
  // words, and the override is why the whole TL↔TL arc came out as one concrete blanket.
  // ⭐ AND IT IS STILL `min`, ON THE SAME PRINCIPLE AS `cMin`: the shallower leg wins, so SW↔SW
  // and SW↔TL resolve 0 exactly as before and are BYTE-IDENTICAL. Only TL↔TL, where both legs
  // are set back, resolves non-zero — which is the one case Jacob reports missing.
  const arcMin = new Map()                    // `${ri}|arcId` → cMin for that whole arc (INNER)
  const arcFrom = new Map()                   // `${ri}|arcId` → the arc's own OUTER edge
  for (const p of parts) {
    const arc = st.iaArc?.[p.si]; if (!arc) continue
    for (let q = 0; q < p.ring.length; q++) {
      if (!padC.has(`${p.ri}|${q}`)) continue
      const id = arc[q]; if (id == null) continue
      const m = M(p.ri, q); if (!m) continue
      const l = arrOf(m), conD = l.inWalk ? lim : l.dOut       // §6.1 step 4's `conD`, per leg
      const key = `${p.ri}|${id}`, cur = arcMin.get(key)
      if (cur == null || conD < cur) arcMin.set(key, conD)
      const curF = arcFrom.get(key)
      if (curF == null || l.walkFrom < curF) arcFrom.set(key, l.walkFrom)
    }
  }

  // ══ THE SLOPE NEEDS VERTICES ON THE LEG, SO PUT THEM THERE ═══════════════════════════════════
  // ⛔ VOCABULARY (Jacob, 2026-09-08): "The Ramp is the ADA pad, and the Slope is the sidewalk
  // angling to meet the inner silhouette of the mono-width." They are the band's TWO EDGES — the
  // RAMP is the OUTER edge reaching the kerb (`walkFromD`), the SLOPE is the INNER edge reaching
  // the arc's `cMin` (`walkToD`). What needs vertices on the leg is the SLOPE.
  // ⚠️ `rampLen` below is named for the wrong one: it is the SLOPE's run. Left as-is because it is
  // load-bearing in both painters — read it as `slopeLen`. Full table: `SECTION §4`.
  // ⭐⭐⭐ THE MISSING HALF, BUILT. *(Jacob: "now add the vertices on the leg.")* `SECTION §4`'s RAMP
  // entry and this file's own comment both filed it: "the honest home for it is a per-vertex ramp,
  // which needs vertices inserted along the leg that the frozen contour does not have."
  //
  // ⛔ WHY IT WAS IMPOSSIBLE WITHOUT THIS. Depth is per-EDGE. ~three quarters of ①'s contour
  // vertices sit inside the eased corner arcs, where the depth must be CONSTANT, and the straight
  // leg gets a MEDIAN OF ONE long edge per frontage. One edge is one place to put a value, so the
  // corner's depth change could only ever be a STEP — the 1.5 m jog at every corner on the map.
  // ▶ `SECTION_DUMP=1 node checks/claims-the-ramp-has-room.mjs`
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
    const isC = (i) => padC.has(`${p.ri}|${i}`)
    // ⭐⭐⭐ A LEG ENDS IN EXACTLY TWO PLACES AND THEY ARE ONE TEST — a PADDED arc's TANGENT, and a change of LADDER (the two
    // edges' strips at different depths), on an arc or off one. ⛔ A change of LABEL whose ladders draw the same strips ends
    // nothing, and neither does a corner the ease made no pad at (a square or declined corner): it is the band bent, exactly
    // as an UNPADDED arc (a bend, a corner the operator unmarked) is (`RIBBONS §1` invariant 1). Boz, 2026-10-25, revising his
    // 2026-10-22 ruling: PTown's stable-path-0 → stable-path-1 dipped to the kerb at a same-ladder label change, and a cut at
    // ①'s declined corner only ever drew a seam (two legs abutting along the band's own depth). `iaCorner` is not read
    // here — it marks EVERY vertex of every eased arc, tangents included, so it ended a leg at each one: a lawn sawtooth and
    // both legs tapering into every bend (Loess, 2026-10-18; ▶ node checks/claims-a-bend-bends-the-band.mjs). Inside a padded arc that test was never reached; outside one it was only ever wrong. ⛔ NO GATE ON THE TWO DEPTHS: "the two depths decide the FORM, never WHETHER"
    // (`SECTION §4`, THE RAMP). Where nothing travels the ramp is zero-length and draws nothing —
    // subsumed, as an outcome.
    // ⛔⛔ THIS IS WHAT RETIRES THE ADDITIVE QUAD. A separately-constructed polygon used to be
    // struck at a frontage change, probed against both normals for the one with more area, and
    // unioned into the walk — a primitive glued at a joint, which `RIBBONS §1` invariant 1 forbids
    // in those words, and a guess (the area probe) standing where a fact belongs. It existed only
    // because the taper fired at corners and nowhere else. It fires everywhere a leg ends now, so
    // the quad has no job: ONE construction, three outcomes, no case split.
    const end = (v) => {
      const back = (v - 1 + n) % n
      if (perpAt(p.ri, back) || perpAt(p.ri, v)) return false        // a perpendicular corner: the leg runs straight on
      if (isC(back) !== isC(v)) return true                          // the arc's tangent
      if (isC(v)) return false                                       // inside it, nothing ends
      // ⭐ only a change of DEPTHS ends a leg (Boz, 2026-10-18, Jacob: "sidewalk meets sidewalk continues smoothly"): an owner
      // change whose ladder draws the same strips at the same depths is no seam, so the band bends straight through it
      return !sameLadder(M(p.ri, back), M(p.ri, v))
    }
    // ⭐⭐⭐ WHICH ARC IS THIS LEG RAMPING INTO — and it is the piece the port dropped.
    // `§6.1` step 5's slid quad ends at `pt(0, cMin)`: the inner edge's TARGET is the arc's own
    // resolved depth, not the leg's width. That distinction IS the three configs —
    //   TL↔SW  cMin = the kerb-side leg's walk  ⇒ the inner edge travels, the strip slides
    //   TL↔TL  cMin = lim (both legs concrete to full depth) ⇒ it does NOT travel; only the
    //          grass goes, which is the table's "ADA pad below, no slope"
    // ⛔ So this is not a gate on the two depths (`§4`: they decide the FORM, never WHETHER) —
    // the ramp fires on every leg end exactly as before; it is the same lerp, and TL↔TL simply
    // has nowhere to go. Assuming the target was the leg's own width made TL↔TL slide and cost
    // HPDM 1228 → 4906 steps while LS improved: town #2 punishing an LS-shaped guess.
    const arcAt = (v, table) => {
      const back = (v - 1 + n) % n
      const e = isC(back) ? back : (isC(v) ? v : -1)
      if (e < 0) return null                        // a frontage change with no corner: no target
      const id = st.iaArc?.[p.si]?.[e]
      if (id == null) return null
      const c = table.get(`${p.ri}|${id}`)
      return c == null ? null : c
    }
    const arcC = (v) => arcAt(v, arcMin)
    // ⛔ The OUTER target defaults to the kerb where there is no arc, which is what a frontage
    // change already did — this keeps that class byte-identical rather than quietly re-ruling it.
    const arcF = (v) => arcAt(v, arcFrom) ?? 0
    // ⛔⛔ TWO TARGETS, TWO ARRAYS. A band has two edges and they ramp toward DIFFERENT arc values —
    // the inner toward `cMin`, the outer toward the arc's own `arcFrom`. Carrying one array for
    // both made the outer edge chase the INNER target, which the corner-continuity gate caught as
    // 211 steps on LS / 773 on HPDM. ⭐ The gate earned its keep on the very next edit after it
    // was widened to see both edges.
    const out = [], src = [], kS = [], kE = [], cS = [], cE = [], fS = [], fE = []
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n]
      const cB = arcC(i), cF = arcC((i + 1) % n)
      const fB = arcAt(i, arcFrom), fF = arcAt((i + 1) % n, arcFrom)
      // A target matters only where `k` is 0 — at k = 1 the lerp returns the leg's own depth
      // whatever the target is — so an end that is not ramping carries null and cannot influence.
      const push = (pt, s0, k0, k1) => { out.push(pt); src.push(s0); kS.push(k0); kE.push(k1)
        cS.push(k0 === 1 ? null : cB); cE.push(k1 === 1 ? null : cF)
        fS.push(k0 === 1 ? null : fB); fE.push(k1 === 1 ? null : fF) }
      if (isC(i)) { push(a, i, 0, 0); continue }     // inside the corner: flush to the kerb, flat
      const backC = end(i), fwdC = end((i + 1) % n)
      const m = M(p.ri, i), l = m ? arrOf(m) : null
      // ⭐ WHAT THE BAND MUST CROSS — measured against where the ARC actually is, never assumed to
      // be the kerb. At TL↔TL the arc sits at the legs' own divider, so there is nothing to cross
      // and the ramp is zero-length: SUBSUMED, exactly as SW↔SW is, as an OUTCOME.
      // ⛔ Not a gate on the two depths (`SECTION §4`): the ramp still fires at every leg end.
      // ⛔⛔ AND IT IS THE MAX OVER BOTH EDGES. A ramp sized from one edge is too short for the
      // other, and "too short" means the vertices are never inserted and that edge steps instead —
      // which is the same one-edged blindness in the CONSTRUCTION that the gate had in the
      // MEASUREMENT. Sizing it from `dOut` alone cost HPDM 59 extra leg↔leg steps.
      const v = backC ? i : (i + 1) % n
      const tF = l ? Math.abs(l.walkFrom - (arcAt(v, arcFrom) ?? 0)) : 0
      const tT = l ? Math.abs(l.walkTo   - (arcAt(v, arcMin) ?? l.walkTo)) : 0
      // ⛔ AND THE LEG'S OWN STRIP IS A FLOOR. At a frontage change there is no arc to target, so
      // both targets collapse and a kerb-side leg would compute zero travel — no vertices, and the
      // arrangement steps against its neighbour instead. `dOut` is the leg's own outer strip, not
      // a constant: "every leg end gets a ramp with room for its own strip." Dropping it cost
      // HPDM 574 → 633 leg↔leg steps, isolated by putting it back.
      const travel = Math.max(tF, tT, l ? l.dOut : 0)
      const rampLen = travel * 2
      const L = Math.hypot(b[0] - a[0], b[1] - a[1])
      if ((!backC && !fwdC) || !(travel > 1e-6)) { push(a, i, 1, 1); continue }
      const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      // ⛔⛔ A LEG SHORTER THAN ITS RAMP TAKES THE LEG IT HAS. Refusing the split was the residue:
      // the remaining steps sat overwhelmingly on short block faces, where the ramp did not fit and
      // the depth went back to jumping. ⭐ Shrinking to the leg's own extent hardwires NOTHING — it
      // is the leg's length — and it is the ruled behaviour, not a clamp: a feature that cannot fit
      // "goes to ZERO there". A shorter leg gets a steeper ramp, which is what a short block face
      // looks like on the ground.
      // ⛔ Two ends on one edge each get at most HALF of it, so two ramps cannot overrun each other
      // — the same topological bound `easeContour` uses for a corner's own legs.
      const room = (backC && fwdC) ? L / 2 : L
      const r2 = Math.min(rampLen, room)
      if (!(r2 > 1e-6)) { rampShort++; push(a, i, 0, 0); continue }
      if (backC && fwdC) {
        push(a, i, 0, 1); push(at(r2 / L), i, 1, 1); push(at(1 - r2 / L), i, 1, 0)
      } else if (backC) {
        push(a, i, 0, 1); push(at(r2 / L), i, 1, 1)
      } else {
        push(a, i, 1, 1); push(at(1 - r2 / L), i, 1, 0)
      }
    }
    p.dring = out; p.dsrc = src; p.dkS = kS; p.dkE = kE; p.dcS = cS; p.dcE = cE; p.dfS = fS; p.dfE = fE
  }
  // ⭐⭐ ONE OFFSET FAMILY (`RIBBONS §1`, `SECTION §3`: the ribbon is monowidth, its strips are SLICES of it). Every
  // depth line the band is cut along — the ped band's outer edge (`pedOuter`), the walk's two edges, the LU's inner
  // edge (`luIn`), the curb-cut slab — is THIS offset of the densified ring, so a line two strips share is drawn once.
  // ⛔ `pedOuter` and `luIn` used to be offsets of the UNdensified ring, on the claim that a constant depth over
  // collinear extra vertices is the same curve and "cannot disagree at a boolean". Measured false at the lattice
  // (HPDM, 2026-10-14): two offset runs of one line land up to 1 mm apart, and `env − walk` kept the gap as 1,009
  // treelawn rings thinner than the lattice — which the paint stack then had to resolve.
  // ▶ scratch/ground-budget/flatten-r1/slv.mjs counts them (0 is the gate).
  // A pick here is per DENSIFIED vertex; a per-edge property of the source ring reads `p.dsrc[j]`, its source edge.
  // ⭐ EVERY OFFSET HERE IS LABELLED — each edge it draws names the SPAN (owner run · arc · cap, and the stamp run) of the
  // contour edge it was struck from, read off the offset's own stamp (`offsetRingByRects`), never matched back by nearness.
  // The bands are painted from these same rings, so the band pieces (`bandPiecesOfTile`) cut exactly what is painted.
  // ⚠️ Measured against the unlabelled offset (2026-10-18): identical on HPDM; 6 offsets on PTown (worst 0.0025 m²) and 2 on
  // JH (0.0001 m²) differ, where the labelled self-union resolves a touch differently. The paint follows the labelled one.
  // ⛔ `iaArc` is per VERTEX, `iaStamp` and `iaCap` per EDGE (i → i+1): an edge is an ARC's only when both its ends lie in that
  // arc (`perpAt`, `inC`, the deformer's `isArcEdge`). Read off the start vertex alone, the edge leaving an arc took the arc's
  // span and a leg starting where another arc ends took that one's (Mitre, 2026-10-20: LS 710 of 15,934 edges, Huron 1,651 of
  // 55,175), so a leg and its arc shared one key. One key for one leg (Jacob, 2026-10-20): a leg edge is keyed by its run.
  const spanOfSrc = (si, e) => { const A = st.iaArc?.[si], c = st.iaCap?.[si]?.[e], r = (stamps[si] || [])[e]
    const a = A && A[e] != null && A[e] === A[(e + 1) % A.length] ? A[e] : null
    return (c != null ? 'c' + c : a != null ? 'a' + a : r != null ? 'r' + r : '-') + '/' + (r ?? '-') }
  for (const p of parts) p.dspan = p.dring.map((_, j) => spanOfSrc(p.si, p.dsrc[j]))
  // ⭐ A ZERO-DEPTH OFFSET IS THE RING (Boz, 2026-10-20). Where every depth on a part is 0 (a VERGE: bare on every edge),
  // the line IS the region boundary — the part's own `ring`, exactly the ring `curbOuter` is built from — never an offset
  // computed off the densified ring. ⛔ That offset fell up to 0.6 mm short of the region at the lattice, and the gap was
  // painted as CURB on bare verges (Huron 13/61/139/142/145, JH 439; mean width ≤ 0.3 mm). A part with ANY nonzero
  // depth is offset as before. ▶ node checks/claims-verge-bare.mjs
  const insDL = (pick) => {
    const o = [], h = [], per = []
    for (const p of parts) {
      const pk = pick(p)
      if (p.dring.every((_, j) => !(pk(j) > 0))) {
        ;(p.hole ? h : o).push(p.ring)
        per.push({ p, rings: [p.ring], labs: [p.ring.map((_, e) => spanOfSrc(p.si, e))], clips: [], edges: [], dropped: [], areaMin: null })
        continue
      }
      const S = {}, rs = offsetRingByRects(p.dring, pk, p.hole, S, null, { water: p.dring.map((_, j) => shoreAt(p, p.dsrc[j])) }, (e) => p.dspan[e])
      ;(p.hole ? h : o).push(...rs)
      per.push({ p, rings: rs, labs: rs.map((r, ri) => (S.edgeLabels?.[ri] || r.map(() => null)).map(e => (e == null ? null : p.dspan[e]))),
        clips: (S.clips || []).map(c => ({ poly: c.poly, spans: [...new Set(c.e.map(e => p.dspan[e]))], join: c.v != null ? `${p.ri}:${c.v}` : null, ...(c.d ? { d: c.d } : {}) })),
        edges: (S.edgeDepths || []).map(x => ({ e: x.e, span: p.dspan[x.e], a: x.a, b: x.b, d: x.d, line: x.line, dir: x.dir })), dropped: S.dropped || [], areaMin: S.areaMin })
    }
    return { rings: (o.length && h.length) ? differenceRings(o, h) : o, per }
  }
  const insD = (pick) => insDL(pick).rings

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
    //   `node checks/claims-swap-reaches-the-paint.mjs` writes `{outer:'SW', inner:'LU'}`, which
    //   IS the default on a treelawn-N edge, so it scores a no-op as a dead gesture and overstates
    //   the class ~3× (1088 slots/75.6% against 1195 slots/27.5% painted both ways).
    // ⭐ AND THE GRASS STOPPING IS THE LAWN'S OUTER EDGE, NOT A FOURTH DEPTH: where the lawn is
    // the OUTER strip its start is pushed to the envelope, which inverts its span to nothing.
    // ⭐ `j` indexes the DENSIFIED ring; `src[j]` is the ① edge it came from, so the leg's resolved
    // measure and its authored slot are unchanged. `k` is the divider's taper: 1 on the open leg,
    // 0 inside the corner, and RAMPING across the edges the densifier just made room on. A pair is
    // returned only where the two ends differ, so every unchanged edge stays a scalar and the
    // common path is byte-identical.
    // ⭐⭐⭐ THE TAPER HAPPENS TO THE LEG AND NOT THE CORNER. *(Jacob, 2026-09-07, twice — the second
    // time in capitals, because I had done it to the corner anyway.)*
    // ⛔⛔ THE CORNER GETS NOTHING. No cross-section of its own, no pad depth, no override. It comes
    // out flush concrete simply BECAUSE THE LEG'S GRASS HAS ALREADY GONE TO ZERO by the time it
    // arrives — the ADA ramp is flush to the kerb through the whole ramp, and that is a consequence
    // of the leg, not a rule about the corner.
    // ⭐ AND THAT IS `RIBBONS §1` INVARIANT 1 SATISFIED RATHER THAN WORKED AROUND: "the corner is
    // the band BENT — a slice of the same continuous concentric offsets, NEVER a separately-
    // constructed primitive… same materials, SAME DEPTHS, bent around an arc." Nothing is
    // constructed at the corner and nothing decides anything there. `§6.1` step 3 (the street edge
    // of a corner is concrete ALWAYS) is then an OUTCOME, not a second rule that has to agree.
    // ⛔ WHAT I HAD, AND IT WAS WRONG: `k` interpolated between a CORNER cross-section (concrete to
    // `cMin`) and the leg's. That is a cross-section belonging to the corner — the primitive
    // invariant 1 forbids, spelled as a depth. I added it after "the slope is happening inside the
    // ramp area", read as "the pad needs its own cross-section". It needed the opposite: the pad
    // needs NO cross-section, and the slope needed to be entirely the leg's.
    // ⭐ `k` scales ONE thing — the OUTER STRIP'S WIDTH on the leg: 1 on the open leg, 0 where it
    // meets the corner, ramping across the edges the densifier made room on. So a kerb-side walk
    // (`outWalk`) is untouched, which is why SW↔SW is "subsumed"; a set-back walk has its grass
    // taper out and reaches the kerb by the corner, which is TL↔TL's "ADA pad below" and SW↔TL's
    // slope, both falling out of the one multiplier with no case split.
    const kS = p.dkS, kE = p.dkE, src = p.dsrc, cSa = p.dcS, cEa = p.dcE, fSa = p.dfS, fEa = p.dfE
    // ⛔ `c` is the INNER target (`cMin`), `a` the OUTER (`arcFrom`). Never one array for both.
    // ⭐ A DEPTH THAT IS THE ENVELOPE IS THE ENVELOPE — by derivation, never by arithmetic (Boz, 2026-10-25). A strip that runs
    // to the envelope reads `lim` (= WB − cw), and cw + (WB − cw) is not WB in floats (1 ulp off in ~4% of pairs), so the walk's
    // inner line and the land use's (LV_WB, struck AT WB) were two depths, and every `===` downstream (sameLadder, the
    // joins' depth tests) could read one line as two. The datum is cw, the envelope WB: those two values, never a sum.
    const at = (v) => (v === lim ? WB : cw + v)
    const span = (j, f) => {
      const l = L(src[j]), a = f(l, kS[j], cSa[j], fSa[j]), b = f(l, kE[j], cEa[j], fEa[j])
      return a === b ? at(a) : [at(a), at(b)]
    }
    // ⭐⭐⭐ THE SLIDE — `§6.1` step 5's `slidQuad`, both of whose edges travel. The port kept only
    // the outer one, so the walk WIDENED along the leg instead of sliding and then met the arc at a
    // step of exactly `lim − cMin`. ▶ MEASURED before the restore: 376 steps on LS, 1228 on HPDM,
    // median = p90 = max = 1.50 m — a dead-constant jump is an arithmetic identity, not a tail.
    // ⛔ ONE MULTIPLIER STILL. `k` is the same scalar; it now moves the STRIP rather than one of its
    // edges. Nothing is constructed at the corner and the arc still resolves one depth for itself
    // (`RIBBONS §1` invariant 1) — the leg simply ARRIVES at that depth instead of stepping onto it.
    // on the open leg (k = 1) the strip IS the leg's own depth — the value itself, not `t + (d − t)·1`, which can miss it by an ulp
    const wFrom = (l, k, _c, a) => { const t = a == null ? 0 : a; return k === 1 ? l.walkFrom : t + (l.walkFrom - t) * k }
    const wTo   = (l, k, c) => (c == null || k === 1 ? l.walkTo : c + (l.walkTo - c) * k)
    // ⭐ Inside a licensed arc every edge answers with the ARC'S one depth, so the contour carries
    // no step across the corner: the band is BENT, not two bands meeting. Off an arc this returns
    // undefined and the leg is untouched — the leg keeps its own cross-section and its own ramp.
    const cAt = (j) => { const e = src[j], id = st.iaArc?.[p.si]?.[e]
      return (id != null && padC.has(`${p.ri}|${e}`)) ? arcMin.get(`${p.ri}|${id}`) : undefined }
    const fAt = (j) => { const e = src[j], id = st.iaArc?.[p.si]?.[e]
      return (id != null && padC.has(`${p.ri}|${e}`)) ? (arcFrom.get(`${p.ri}|${id}`) ?? 0) : undefined }
    return {
      // ⛔ THE TAPER SCALES THE OUTER STRIP'S WIDTH, so it only bites where the walk is SET BACK.
      // A kerb-side walk is already at the street and the corner changes nothing about it — which
      // is why SW↔SW is "subsumed" and why it must stay untouched here.
      // ⭐ `§6.1` step 4 at an arc: concrete from the kerb to `cMin`, and the lawn is a ZERO span —
      // deeper than `cMin` is PARCEL, never a treelawn bent round the kerb (step 3).
      // ⭐⭐⭐ THE PAD IS THE SIDEWALK CONTINUING TO THE KERB ACROSS THE TREELAWN, AND IT IS MADE
      // FROM THE TANGENTS *(Jacob, 2026-09-08)*. So the arc's outer edge IS the kerb — the walk
      // fills through — and that is not the arc overriding its legs: it is the ADA ramp, the
      // sidewalk's access to the street, which the legs' own cross-section cannot provide.
      // ⛔ Made FROM THE TANGENTS ⇒ its extent is exactly the arc, "coexistent with the arc".
      // Never longer: the leg's taper is what used to carry it `rampLen` up both legs and eat the
      // treelawn well past the corner, which is what read as one blanket.
      // ⭐ a PERPENDICULAR corner's arc carries NO band: the walk there is empty (`perpAt`), and the legs' own bands,
      // extended straight on (`legExt`), are the corner
      walkFromD: (j) => (perpAt(p.ri, src[j]) || cAt(j) != null ? cw : span(j, wFrom)),
      walkToD:   (j) => { if (perpAt(p.ri, src[j])) return cw; const c = cAt(j); return c == null ? span(j, wTo) : cw + c },
    }
  }
  if (sectionDump.on) for (const p of parts) for (let i = 0; i < p.ring.length; i++) {
    const m = M(p.ri, i), l = stripLadder(m || {}, lim), r = (stamps[p.si] || [])[i]
    sectionDump.rows.push({ ri: p.ri, si: p.si, i, lu: key, cw, lim, corner: padC.has(`${p.ri}|${i}`) || null,
      owner: r == null ? null : `${runs[r].skelId}|${runs[r].side}|${runs[r].segOrd}`,
      resolved: m ? `${m.matOuter}/${m.matInner}` : null, tl: m?.treelawn ?? null, sw: m?.sidewalk ?? null,
      hasTL: m?.hasTL ?? null, outWalk: l.outWalk, inWalk: l.inWalk, dOut: l.dOut,
      walk: [l.walkFrom, l.walkTo], lawn: [l.lawnFrom, l.lawnTo] })
  }
  // ⭐ H-3: a highway-owned edge is BARE — every depth 0, so the land use runs to H's edge.
  const bareMk = (p) => { const g = mk(p), src = p.dsrc
    return Object.fromEntries(Object.entries(g).map(([k, f]) => [k, (j) => (bareAt(p, src[j]) ? 0 : f(j))])) }
  const F = new Map(parts.map(p => [p, bareMk(p)]))
  // ⛔ THE RAMP LIVES ON THE DENSIFIED RING, so a check reading the ORIGINAL edges cannot see it and
  // would report the very step it was built to remove. Disclose the densified spans — the depths the
  // offset is actually handed — so the gate measures continuity where continuity is decided.
  if (sectionDump.on) for (const p of parts) {
    const g = F.get(p), S = (v) => Array.isArray(v) ? v[0] : v, E = (v) => Array.isArray(v) ? v[1] : v
    for (let j = 0; j < p.dring.length; j++) {
      const a = p.dring[j], b = p.dring[(j + 1) % p.dring.length]
      const w = g.walkFromD(j), wt = g.walkToD(j)
      // ⛔ BOTH EDGES. Disclosing only `walkFrom` made the ramp gate blind to a step in the
      // walk's INNER boundary — it reported 0 discontinuities while the band pinched at every
      // mixed corner. A band has two edges and a gate that watches one of them is a fallback.
      sectionDump.ramp.push({ ri: p.ri, j, src: p.dsrc[j], kS: p.dkS[j], kE: p.dkE[j],
        inArc: padC.has(`${p.ri}|${p.dsrc[j]}`) || null, perp: perpAt(p.ri, p.dsrc[j]) || null,
        walkFrom: [S(w) - cw, E(w) - cw], walkTo: [S(wt) - cw, E(wt) - cw],
        len: Math.hypot(b[0] - a[0], b[1] - a[1]) })
    }
  }
  const LV_cw = insDL((p) => (j) => (bareAt(p, p.dsrc[j]) ? 0 : cw)), pedOuter = LV_cw.rings
  // ⛔⛔ THE SLIDE IS UNIONED IN — NEVER CUT AND ADDED BACK ALONG THE SAME EDGE. Clipper is
  // integer-space (1 mm); a difference followed by a union on the same boundary leaves the two
  // halves as separate polygon records that merely touch, so the band reads as broken while its
  // area is unchanged. Measured: cutting the corner out and painting it back cost the acceptance
  // 79 → 54 on geometry that was a strict SUPERSET of the original. The stamp above needs no cut
  // at all — the arc is drawn by the same four offsets as the legs — and this is the one piece
  // that is genuinely additional.
  const LV_wf = insDL(p => F.get(p).walkFromD), LV_wt = insDL(p => F.get(p).walkToD), W = band(LV_wf.rings, LV_wt.rings)
  // ⛔⛔ NOTHING IS UNIONED IN AND NOTHING IS CUT OUT. Every boundary below is a whole-contour
  // offset of the SAME curve, so there are no pieces, nothing to join, and no join to open — which
  // is `RIBBONS §1`'s "a seam is UNCONSTRUCTIBLE rather than merely unlikely", now true of the
  // corner as well as the leg. The additive slide that stood here was the last piece that was not
  // an offset of the contour.
  // ⭐ A PARTITION, NOT AN AREA MASK (Jacob, 2026-09-25: "holes patched"). The lawn and the deep tail were two more
  // separately-offset bands, and where the walk and the lawn swap order at a corner tangent their boundaries stepped
  // differently — a triangle painted by NOBODY, the sky showing through. They are ONE material, the block's own colour
  // (`SECTION` rule 3), so they are painted as "the band the walk is not": the ped envelope (curb-inner → WB) minus the
  // walk, with the walk clipped to that envelope. curb ∪ walk ∪ lawn ∪ LU = the block by construction; it also ends the
  // lawn's overlap with the walk. ▶ node checks/claims-the-ground-covers-every-block.mjs
  // a perpendicular corner's arc carries no envelope either: the land use's edge there is the legs' own, extended (below)
  const LV_WB = insDL((p) => (j) => (bareAt(p, p.dsrc[j]) ? 0 : perpAt(p.ri, p.dsrc[j]) ? cw : WB)), luIn0 = LV_WB.rings
  // ⭐⭐ THE PERPENDICULAR CORNER'S GROUND IS ITS LEGS' OWN BANDS, RUN STRAIGHT ON (`SECTION §6.1`). For each leg, the rect
  // `offsetRingByRects` strikes for its last ② edge — that edge's line, its normal, the leg's own depths — continued along
  // the edge's own direction past the tangent — starting AT the very end vertices that rect drew (`legExt`, carried from the
  // strike), where the walk's own cut ends it (`cutPast`), so the two meet on shared vertices and no line is drawn twice —
  // and clipped by ② (`pedOuter`). Two of them per leg: its WALK, and its whole envelope
  // (curb-inner → WB). The two walks cross in the L; the envelopes' union is the corner's ped ground, square at the land
  // use; `env − walk` is the lawn, as everywhere. ⛔ No new depth, angle or shape: the same rect, longer.
  const endOf = (v) => (Array.isArray(v) ? v[1] : v), startOf = (v) => (Array.isArray(v) ? v[0] : v)
  // the leg edge's frame at its tangent: T the tangent, f on past it, nr `offsetRingByRects`' own normal (depth grows along it)
  const legFrame = (p, i, atEnd) => {
    const ring = p.ring, n = ring.length, a = ring[i], b = ring[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (!(len > 1e-9)) return null
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], ccw = (signedArea(p.dring) > 0) !== !!p.hole
    return { T: atEnd ? b : a, f: atEnd ? u : [-u[0], -u[1]], nr: ccw ? [-u[1], u[0]] : [u[1], -u[0]], len }
  }
  // ⭐⭐ THE LEG'S BAND, CONTINUED — CARRIED FROM ITS STRIKE, NEVER RE-DERIVED (Boz's ruling, 2026-10-25, on Kerf's capture at
  // HPDM block 556). Between two LEVELS (two `insDL` strikes): each side is that level's struck curb line for the leg's end
  // densified edge `j` (`stamp.edgeDepths[j].line`: the very points its clip has), and one far point `s` on past the line's end
  // along the strike's own direction. Over the leg the extension IS the band's struck vertices, so the two round identically and
  // the union cancels them exactly; the far segment runs where no other construction draws. ⛔ It was rebuilt from the SOURCE
  // edge (`legFrame`) and overlapped the leg by a free 0.5 m: one line struck twice, its corners rounding apart by 0.1–0.25 mm,
  // and the lawn between them a 0.017 mm ring the flatten refused. ⇒ `back` is gone, and with it every overlap.
  // ⛔ NO OVERLAP (Boz's ruling (A), 2026-10-26): the extension STARTS at the two struck end vertices and abuts the leg there.
  // Overlapping it over edge j's band repainted the whole struck line wherever the ring had trimmed that band (PTown: one
  // 305 m segment beside the ring's own vertices, 71 m drawn twice) — "identical area" holds only where the band is kept whole.
  // The walk's cut (`walkCut`) is built through the same struck vertices, so the leg's walk ends exactly where this begins.
  const struckAt = (lv, p, j) => { const r = lv.per.find(x => x.p === p), e = r?.edges[j]
    return e && e.e === j && e.line ? e : null }
  const carried = (lv, p, j, atEnd, s) => { const e = struckAt(lv, p, j); if (!e) return null
    const L = e.line, end = atEnd ? L[L.length - 1] : L[0], sg = atEnd ? 1 : -1
    return { e, at: (t) => [end[0] + e.dir[0] * t * sg, end[1] + e.dir[1] * t * sg], dEnd: atEnd ? e.d[1] : e.d[0] } }
  const legExt = (p, j, atEnd, lvA, lvB, Lx) => {
    const A = carried(lvA, p, j, atEnd), B = carried(lvB, p, j, atEnd)
    if (!A || !B || !(B.dEnd > A.dEnd)) return null
    const r = [A.at(0), A.at(Lx), B.at(Lx), B.at(0)]                 // at(0) IS the struck end vertex (the same float point)
    return signedArea(r) > 0 ? r : r.reverse()
  }
  // the walk's cut past one leg's tangent: everything beyond the line through that leg's two struck WALK end vertices (`LV_wf`,
  // `LV_wt`), reaching D either side of the band and D on — so W is cut exactly at the vertices its extension starts from
  const cutPast = (p, j, atEnd, D) => {
    const A = carried(LV_wf, p, j, atEnd), B = carried(LV_wt, p, j, atEnd)
    if (!A || !B) return null
    const a = A.at(0), b = B.at(0), ux = b[0] - a[0], uz = b[1] - a[1], ul = Math.hypot(ux, uz)
    if (!(ul > 0)) return null
    const u = [ux / ul, uz / ul], f = [A.at(1)[0] - a[0], A.at(1)[1] - a[1]]
    const o = [a[0] - u[0] * D, a[1] - u[1] * D], i = [b[0] + u[0] * D, b[1] + u[1] * D]
    const r = [o, a, b, i, [i[0] + f[0] * D, i[1] + f[1] * D], [o[0] + f[0] * D, o[1] + f[1] * D]]
    return signedArea(r) > 0 ? r : r.reverse()
  }
  // ⛔ THE LEGS' BANDS ARE CUT AT THEIR TANGENTS, past which the extensions carry them. Where a band's depth drops to the
  // arc's none, `offsetRingByRects` joins the two by a slanted wedge — a thin triangle of walk past the tangent, its side
  // ~5–25° off the leg (seen: hairlines across the lawn). `walkCut` is the ground past BOTH tangents: the two legs' own
  // rects from their tangents on, intersected — so neither leg's band behind its own tangent is ever touched.
  // ⭐ EACH EXTENSION CARRIES ITS OWNER FROM CONSTRUCTION (Jacob, 2026-10-20): the run of the leg edge it is struck from,
  // `runs[stamps[p.si][i]]` (the run `iaJunction`'s legs read), keyed as that edge's own cell is (`spanOfSrc`: one key for one
  // leg). ⛔ Never found by distance. A leg that builds no extension is counted (`perpUnbuilt`), never skipped silently.
  const walkX = [], envX0 = [], walkCut = [], ends = [], perpUnbuilt = { bare: 0, noSub: 0, noStamp: 0, noStrike: 0 }
  const runSpan = (t) => (t == null ? null : 'r' + t + '/' + t)
  for (const c of R.perpCorners) {
    const p = parts[c.ri]; if (!p?.dring) continue
    const g = F.get(p), n = p.ring.length, tA = p.ring[c.q], tB = p.ring[(c.e + 1) % n]
    const Lx = Math.hypot(tB[0] - tA[0], tB[1] - tA[1]) + cw + WB + 1
    const js = (i) => p.dsrc.map((s2, j) => (s2 === i ? j : -1)).filter(j => j >= 0)
    const ck = `${p.si}|${st.iaArc[p.si][c.q]}`
    for (const [i, atEnd, cut] of [[c.before, true, c.cuts[1]], [c.after, false, c.cuts[0]]]) {
      if (bareAt(p, i)) { perpUnbuilt.bare++; continue }
      const jj = js(i); if (!jj.length) { perpUnbuilt.noSub++; continue }
      const j = atEnd ? jj[jj.length - 1] : jj[0], pick = atEnd ? endOf : startOf
      const d0 = pick(g.walkFromD(j)), d1 = pick(g.walkToD(j))
      const w = legExt(p, j, atEnd, LV_wf, LV_wt, Lx), e2 = legExt(p, j, atEnd, LV_cw, LV_WB, Lx)
      if (!w && !e2 && !struckAt(LV_wt, p, j)) perpUnbuilt.noStrike++     // the leg's edge struck nothing to carry: counted, never re-derived
      const stamp = stamps[p.si]?.[i] ?? null, leg = { si: p.si, i, atEnd, stamp, span: runSpan(stamp), corner: ck }
      if (stamp == null && (w || e2)) perpUnbuilt.noStamp++
      if (w) walkX.push({ ...leg, ring: w }); if (e2) envX0.push({ ...leg, ring: e2 })
      if (w) { c.corner.walks = (c.corner.walks || 0) + 1; ends.push({ c, cut, p, i, j, atEnd, d0, d1, Lx, leg }) }   // walks and ramps, per corner, for the checks
    }
    const jOf = (i, atEnd) => { const jj = js(i); return jj.length ? (atEnd ? jj[jj.length - 1] : jj[0]) : null }
    const D = WB + Lx, jA = jOf(c.before, true), jB = jOf(c.after, false)
    const kA = jA == null ? null : cutPast(p, jA, true, D), kB = jB == null ? null : cutPast(p, jB, false, D)
    if (kA && kB) walkCut.push(...intersectRings([kA], [kB]))
  }
  const envX = envX0.length && pedOuter.length ? intersectRings(unionRings(envX0.map(x => x.ring)), pedOuter) : []
  const luIn = envX.length ? differenceRings(luIn0, envX) : luIn0
  const env = envX.length ? unionRings([...band(pedOuter, luIn0), ...envX]) : band(pedOuter, luIn0)
  const W2 = walkX.length ? unionRings([...(walkCut.length ? differenceRings(W, unionRings(walkCut)) : W), ...walkX.map(x => x.ring)]) : W
  // ⭐ THE WALK IS THE BAND — the legs' and, at a perpendicular corner, their straight continuations; nothing is re-filled
  const Wp = env.length && W2.length ? intersectRings(W2, env) : []
  // ⭐⭐ A CURB CUT IS A SIMPLE SHAPE (Jacob, 2026-10-18: "the ramp should be a geometrically simple shape, that's the point of
  // it"; "the ramps need to be extensions of the sidewalks"; "curb shouldn't cut ramp"; "diagonal has to go to street too").
  // Nothing but its own construction shapes it — no walk, curb, lawn or land-use paint clips it; what lies inside it IS the
  // cut, curb included, and the ground there gives way to it.
  //   perpendicular  the WALK'S OWN EXTENSION, a quadrilateral with one curved side: its SIDES the walk's two outer side
  //                  lines run straight on; its FRONT the road edge (② `p.ring`, the curb's road face), its own curve; its
  //                  BACK one line square to the walk, `warningDepth` back from where the walk's side line that reaches the
  //                  road FIRST meets it — so it spans the walk's full width at the kerb. One ramp per crossing (`f-prowag-curb-ramp-per-crosswalk`, R203.6.1.1), each
  //                  "contained wholly within the width of the crosswalk it serves". Two on one arc with nothing but walk or
  //                  curb between them along the road edge are ONE PAD — the hull of the two and the road edge between them —
  //                  PROWAG's blended transition, whose running slope is capped at 5 % (`f-prowag-curb-ramp-geometry`), the
  //                  kerb build's to honour. Where lawn or land use reaches the curb between them, two.
  //   diagonal       the road edge offset inward by `warningDepth`, between two points centred on the arc the norm's width
  //                  apart (the corner pass's `masks`): a band of constant depth through the curb to the street.
  // A walk narrower than the norm width is counted short, never widened. ⛔ A walk with fewer than two of its lines reaching
  // the road within the corner's reach (`Lx`) has no cut, counted. The ramp's kerb FACE (`kerbLift`) is where its two side
  // lines meet the road edge.
  // ⛔ REMOVED 2026-10-18: the perpendicular cut as a slab from the curb's inner edge clipped by the walk (it stopped at the
  // curb and notched united ramps), as the walk's band within the warning depth ALONG the walk of the curb's inner edge (a
  // long tail into the walk on an oblique landing), and as a band along the road edge (thin arc strips; not the walk's).
  const D = R.maxD
  const firstCross = (rings, Fr, d, s0, sMax) => { let best = Infinity
    const P0 = [Fr.T[0] + Fr.nr[0] * d, Fr.T[1] + Fr.nr[1] * d]
    for (const ring of rings) for (let k = 0, n = ring.length; k < n; k++) { const U = ring[k], V = ring[(k + 1) % n], ex = V[0] - U[0], ez = V[1] - U[1]
      const den = Fr.f[0] * ez - Fr.f[1] * ex; if (Math.abs(den) < 1e-12) continue
      const wx = U[0] - P0[0], wz = U[1] - P0[1], s2 = (wx * ez - wz * ex) / den, t = (wx * Fr.f[1] - wz * Fr.f[0]) / den
      if (t >= -1e-9 && t <= 1 + 1e-9 && s2 >= s0 - 1e-3 && s2 <= sMax && s2 < best) best = s2 }
    return best === Infinity ? null : best }
  // the road edge between two of its points, the shorter way round: a ring's own vertices, with the two points as its ends
  const subAlong = (ring, A, B) => { const n = ring.length, cum = [0]
    for (let k = 1; k <= n; k++) cum.push(cum[k - 1] + Math.hypot(ring[k % n][0] - ring[k - 1][0], ring[k % n][1] - ring[k - 1][1]))
    const L = cum[n], pos = (P) => { let best = null
      for (let k = 0; k < n; k++) { const U = ring[k], V = ring[(k + 1) % n], dx = V[0] - U[0], dz = V[1] - U[1], L2 = dx * dx + dz * dz
        const t = L2 ? Math.max(0, Math.min(1, ((P[0] - U[0]) * dx + (P[1] - U[1]) * dz) / L2)) : 0, d = Math.hypot(P[0] - U[0] - t * dx, P[1] - U[1] - t * dz)
        if (!best || d < best.d) best = { d, s: cum[k] + t * Math.sqrt(L2) } } return best.s }
    let a = pos(A), b = pos(B), P = A, Q = B
    if (((b - a + L) % L) > L / 2) { [a, b] = [b, a]; [P, Q] = [Q, P] }
    const out = [P]; for (let k = 0; k < 2 * n; k++) { const s2 = cum[k % n] + (k >= n ? L : 0); if (s2 > a + 1e-6 && s2 < (b < a ? b + L : b) - 1e-6) out.push(ring[k % n]) }
    out.push(Q); return out }
  // a band mask over a sub-polyline of the road edge: reaching `ext` either side of it, its ends normal to the edge there
  const maskOf = (sub, ext) => { const nrm = (i) => { const A = sub[Math.max(0, i - 1)], B = sub[Math.min(sub.length - 1, i + 1)]
      const dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l] }
    const out = sub.map((P, i) => { const v = nrm(i); return [P[0] + v[0] * ext, P[1] + v[1] * ext] })
    const inn = sub.map((P, i) => { const v = nrm(i); return [P[0] - v[0] * ext, P[1] - v[1] * ext] })
    return [...out, ...inn.reverse()] }
  // `perpPieces` the cuts' ground as painted; `perpOwn` the same ground with its owners, for the band pieces: each quad its
  // own leg's, a one-pad's hull beyond the two quads the corner's ARC's (Jacob, 2026-10-20) — the spans of the arc's own edges
  const perpPieces = [], ramps = [], perpOwn = []
  const arcSpans = (c) => { const p = parts[c.ri], n = p.ring.length, out = new Set()
    for (let k = c.q; ; k = (k + 1) % n) { out.add(spanOfSrc(p.si, k)); if (k === c.e) break } return [...out] }
  const hullOf = (P) => { P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    const lo = [], up = []; for (const q of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q) }
    for (const q of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q) }
    return lo.slice(0, -1).concat(up.slice(0, -1)) }
  for (const x of ends) {
    const Fr = legFrame(x.p, x.i, x.atEnd)
    // where the walk reaches the road: its two outer side lines (and its middle), each followed 2 mm INSIDE the walk (a walk
    // with no lawn has its kerb-side line ON ② up to the tangent) out of ② and on to the road edge
    const ds = [x.d0 + 2e-3, (x.d0 + x.d1) / 2, x.d1 - 2e-3]
    const ks = ds.map(d => { const e = firstCross(pedOuter, Fr, d, 0, x.Lx); return e == null ? null : firstCross([x.p.ring], Fr, d, e, x.Lx) })
    const hits = ks.map((k, i) => k == null ? null : [Fr.T[0] + Fr.f[0] * k + Fr.nr[0] * ds[i], Fr.T[1] + Fr.f[1] * k + Fr.nr[1] * ds[i]])
    const got = hits.filter(Boolean)
    if (got.length < 2) { R.tally.perpNoLanding++; x.c.corner.noLanding = (x.c.corner.noLanding || 0) + 1; continue }
    if (got.length < hits.length) R.tally.perpPartLanding = (R.tally.perpPartLanding || 0) + 1
    if (x.d1 - x.d0 < x.c.w - 1e-6) R.tally.short++
    const A = got[0], B = got[got.length - 1]                    // the outermost lines that reach it
    // the quadrilateral: the walk's band from its BACK — D behind where the side line that reaches the road FIRST meets it, so
    // every line of the walk has at least D of ramp and it spans the walk's full width at the kerb (Boz's ruling, 2026-10-18:
    // full width; square landings are unchanged, oblique ones deeper) — to past where the last one meets it, kept to the
    // block, so its front is the road edge itself, through the curb
    const kk = ks.filter(k => k != null), kFirst = Math.min(...kk), sF = Math.max(...kk) + 1e-2
    // ⭐ its two sides are the walk's own struck lines carried on (`carried`), measured from the tangent as `Fr` measures
    const A0 = carried(LV_wf, x.p, x.j, x.atEnd), B0 = carried(LV_wt, x.p, x.j, x.atEnd)
    const sOf = (C) => { const L = C.e.line, end = x.atEnd ? L[L.length - 1] : L[0]; return (end[0] - Fr.T[0]) * Fr.f[0] + (end[1] - Fr.T[1]) * Fr.f[1] }
    const s0 = Math.max(kFirst - D, -Fr.len), rect = A0 && B0 && B0.dEnd > A0.dEnd ? (() => { const r = [A0.at(s0 - sOf(A0)), A0.at(sF - sOf(A0)), B0.at(sF - sOf(B0)), B0.at(s0 - sOf(B0))]
      return signedArea(r) > 0 ? r : r.reverse() })() : null
    const quad = rect && curbOuter.length ? intersectRings([rect], curbOuter) : []
    if (!quad.length) { R.tally.perpNoLanding++; x.c.corner.noLanding = (x.c.corner.noLanding || 0) + 1; continue }
    ramps.push({ c: x.c, p: x.p, A, B, quad, leg: x.leg })
    const along = [-Fr.f[0], -Fr.f[1]]
    const lAB = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, nn = [-(B[1] - A[1]) / lAB, (B[0] - A[0]) / lAB]
    const inward = nn[0] * along[0] + nn[1] * along[1] > 0 ? nn : [-nn[0], -nn[1]]   // the block lies back along the walk
    R.recs.push({ ...x.cut, at: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], face: [A, B], inward, along })
    R.tally.curbCuts++; x.c.corner.ramps = (x.c.corner.ramps || 0) + 1
  }
  // ⭐⭐ A CORNER IS WHERE A WALK ENDS IN THE ROAD (Jacob, 2026-10-18: "if the rule is the sidewalk has to terminate in asphalt,
  // sidewalks that terminate in each other don't draw a corner"). A perpendicular junction none of whose walks landed is not a
  // corner: the tile is painted again with those arcs as the ordinary band, bent (one more pass, only on such a tile).
  // ▶ node checks/claims-a-perpendicular-landing-runs-straight-on.mjs <scene> (the bent-band row)
  if (!notCorners) { const nc = new Set()
    for (const c of R.perpCorners) if (!(c.corner.ramps > 0)) nc.add(`${c.corner.si}|${c.corner.arc}`)
    if (nc.size) { sectionDump.rows.length = dump0.rows; sectionDump.ramp.length = dump0.ramp; return sectionPassProtoTile(st, cw, stripMat, blockCustoms, cornerOverrides, { pieces: wantPieces, notCorners: nc }) } }
  // ⭐ TWO RAMPS ON ONE ARC ARE ONE PAD when nothing but walk or curb lies between them along the road edge, at the band's
  // depth (Boz's ruling, 2026-10-18, on Jacob's "should be one continuous ramp pad"): one band from the outer end of the first
  // to the outer end of the second. Where lawn or land use reaches the curb between them (a corner with a lawn wedge), two.
  // Read from the paint this pass has already laid (`env − Wp` the lawn, `luIn` the land use), never from a distance.
  const roadBand = (R.masks.length || ramps.length) ? band(curbOuter, insD(() => () => D)) : []   // the diagonal's, and the pad test's
  const lawnLu = ramps.length ? [...(Wp.length ? differenceRings(env, Wp) : env), ...luIn] : []
  const byCorner = new Map(); for (const r of ramps) (byCorner.get(r.c) || byCorner.set(r.c, []).get(r.c)).push(r)
  for (const [c, rs] of byCorner) {
    if (rs.length === 2 && rs[0].p === rs[1].p) {
      // the nearest ends of the two are the gap; the other two are the pad's outer ends
      const ends2 = [[0, 'A'], [0, 'B'], [1, 'A'], [1, 'B']]
      let best = null
      for (const [i, ki] of ends2.slice(0, 2)) for (const [j, kj] of ends2.slice(2)) { const P = rs[i][ki], Q = rs[j][kj], d = Math.hypot(P[0] - Q[0], P[1] - Q[1])
        if (!best || d < best.d) best = { d, P, Q, oP: rs[i][ki === 'A' ? 'B' : 'A'], oQ: rs[j][kj === 'A' ? 'B' : 'A'] } }
      const gapMask = maskOf(subAlong(rs[0].p.ring, best.P, best.Q), cw + D + 0.5)
      const gap = roadBand.length ? intersectRings(roadBand, [gapMask]) : []
      const between = gap.length && lawnLu.length ? intersectRings(lawnLu, gap) : []
      const a = between.reduce((t, r) => { let s2 = 0; for (let i = 0; i < r.length; i++) { const P = r[i], Q = r[(i + 1) % r.length]; s2 += P[0] * Q[1] - Q[0] * P[1] } return t + Math.abs(s2) / 2 }, 0)
      if (a < 1e-4) {
        const H = hullOf([...rs[0].quad.flat(), ...rs[1].quad.flat(), ...subAlong(rs[0].p.ring, best.P, best.Q)])
        const pad = intersectRings([H], curbOuter), hull = pad.length ? differenceRings(pad, unionRings([...rs[0].quad, ...rs[1].quad])) : []
        perpPieces.push(...pad); c.corner.pad = 'one'; R.tally.perpOnePad = (R.tally.perpOnePad || 0) + 1
        for (const r of rs) perpOwn.push({ ...r.leg, kind: 'ramp', rings: r.quad })
        if (hull.length) perpOwn.push({ kind: 'hull', si: rs[0].p.si, corner: rs[0].leg.corner, spans: arcSpans(c), rings: hull })
        continue }
      c.corner.pad = 'two'
    }
    for (const r of rs) { perpPieces.push(...r.quad); perpOwn.push({ ...r.leg, kind: 'ramp', rings: r.quad }) }
  }
  // the diagonal band: the road edge to D inside it, under its masks; the ground every cut covers gives way to it, and the
  // walk takes it in
  const allMasks = R.masks
  const diag = roadBand.length && allMasks.length ? intersectRings(roadBand, unionRings(allMasks)) : []
  const strips = perpPieces.length ? unionRings([...diag, ...perpPieces]) : diag
  const less = (rs) => strips.length && rs.length ? differenceRings(rs, strips) : rs
  const sp = stampParts(st)   // the land-use stamp, laid once over every strip below
  // ⭐ THE BANDS, CUT BY THEIR OWNERS (`bandPiecesOfTile`) — asked for only by ① the producer (the bake), never by Survey
  // A perpendicular corner's own ground lies past every leg's cell: each leg's extension (its walk, and its envelope for the
  // lawn), each cut, and a one-pad's hull. Each goes in among the RECTS as the rect of the owner it was built with (`perpRects`,
  // `spans`), so ground no cell holds is its builder's, ground in two of them (the crossing) is both legs', and ground inside
  // another span's cell is shared, by the existing rule. ⛔ Never matched by distance.
  const Wall = strips.length ? unionRings([...Wp, ...strips]) : Wp
  const own1 = (x, kind) => ({ kind, si: x.si, i: x.i, atEnd: x.atEnd, corner: x.corner, spans: x.span ? [x.span] : [], rings: [x.ring] })
  const perpRects = { walk: [...walkX.map(x => own1(x, 'ext')), ...perpOwn.map(x => ({ kind: x.kind, si: x.si, i: x.i, atEnd: x.atEnd, corner: x.corner, spans: x.spans || (x.span ? [x.span] : []), rings: x.rings }))],
    lawn: envX0.map(x => own1(x, 'ext')) }
  const BP = wantPieces ? bandPiecesOfTile({ st, parts, runs, stamps, inBlock, sp,
    L0: { per: parts.map(p => ({ p, rings: [p.dring], labs: [p.dspan] })) }, LV_cw, LV_wf, LV_wt, LV_WB,
    curb: less(band(curbOuter, pedOuter)), walk: Wall, env, perpRects, perpUnbuilt }) : null
  const paint = {
    curbCut: cutByStamp(st, inBlock(strips), sp),
    Wacc:   cutByStamp(st, inBlock(Wall), sp),
    tlByLu: rekeyByPiece(st, { [key]: inBlock(less(Wp.length ? differenceRings(env, Wp) : env)) }, sp),
    luByLu: rekeyByPiece(st, { [key]: inBlock(less(luIn)) }, sp),
    curb:   cutByStamp(st, inBlock(less(band(curbOuter, pedOuter))), sp),
  }
  const flatLu = (o) => Object.values(o || {}).flat()
  const rim = nodeRimWithPaint(st, [...paint.curbCut, ...paint.Wacc, ...flatLu(paint.tlByLu), ...flatLu(paint.luByLu), ...paint.curb], (node) => {
    for (const k of ['curbCut', 'Wacc', 'curb']) paint[k] = paint[k].map(node)
    for (const k of ['tlByLu', 'luByLu']) for (const lu of Object.keys(paint[k] || {})) paint[k][lu] = paint[k][lu].map(node)
    if (BP) for (const [x, rs] of BP.perpFaces) BP.perpFaces.set(x, rs.map(node)) })   // the leg's faces meet the noded paint on its own vertices
  return {
    ...(BP ? { bandPieces: BP.pieces, bandSeams: BP.seams, bandCensus: BP.census, bandEdgeDepths: BP.edgeDepths,
      bandPerp: Object.entries(perpRects).flatMap(([cls, xs]) => xs.map(x => ({ cls, ...x, faces: BP.perpFaces.get(x) || [] }))) } : {}),
    ...paint, curbCutRecs: R.recs, curbCutTally: R.tally, curbCutContradicted: R.contradicted, curbCutCorners: R.corners, cornerArcs,
    ...(rim ? { rim } : {}),
    capped,
    feArcs, feRepeat, capUnmeasured,
  }
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
// (iA − iC), asphalt silhouette (ring − iA), and the ped FILL (or the tile's own bands).
// Chain-free: parameters carry only the artifact
// + design params (cw, stripMat, an optional boundary stencil polygon) — there
// is NO handle on streets / chains / measures / ribbons, so a Section surface
// rendering through here physically cannot re-derive the shape. It reads ONLY frozen
// fields. Accepts shapeTiles built in-memory OR loaded from shape.json.
// ⭐ One value per module instantiation. A reload re-evaluates this file, so a new nonce falls out
// — no version to bump, nothing to remember, and it cannot drift from the code it identifies.
const BUILD_NONCE = Math.random().toString(36).slice(2)
let _staleArcKeyWarned = false
let _staleBandsWarned = false
// ══ CROSSWALKS — SQUARE ACROSS THE STREET, CENTRED ON THE CUT THAT SERVES THEM (`BRIEF-corner-ramps-and-kerb §0a` item 9) ═
// ⭐ A curb cut serves the crossing of the leg it sits beside (`serves`, with `dir` — that street's direction off its
// own curb edge). Its crosswalk runs SQUARE to that street, from kerb to kerb, and ENDS where it meets each kerb
// (Jacob, 2026-10-05). Station: centred on the cut (Boz, 2026-10-06), so a diagonal corner's apex cut lands inside
// it by construction; a PAIR (the cut across the street at the SAME junction node, beside the SAME chain, on its
// OTHER side — identity, as before) is centred on the mean of the two cuts' stations and drawn once.
// ⭐ Each end is where the square line meets the frozen curb (`curbEdgeIndex`), kept only if that edge fronts the
// crossed street on the expected side — ownership, no reach constant.
// ⭐ A T'S FAR KERB: no corner across the street at this node fronts the crossed chain, so the line lands on a straight
// kerb. The norm decides (`farKerb`): 'none' ⇒ no crosswalk, counted · 'cut' ⇒ a curb cut there (a slice of the walk,
// sized by the curb-cut norm) and the crosswalk to it.
// ⭐ The paint is the norm's: one style for all, or `byCorner` — the paint FOLLOWS THE CORNER's resolved cut style. A
// pair whose two corners resolved differently is COUNTED (`styleDisagrees`), never picked.
// `pairs`: [cut, cut across | null (a T's far kerb), chain, near end, far end, street direction, station from 'cut' | 'crossing'].
// ⛔ Everything that draws nothing is counted by cause; nothing is resolved by nearness (`A15`).
function crosswalksSquareAcross(recs, tiles, norm, cutNorm, cw, walk) {
  const tally = { crosswalks: 0, pairs: 0, farKerbCut: 0, farKerbNone: 0, farKerbNoDims: 0, farKerbStyleAmbiguous: 0,
    farCornerNoCut: 0, ambiguous: 0, noNode: 0, noFarKerb: 0, apexesApart: 0, apartAt: [], endsNotOwned: 0, byEvidence: 0, evidenceAmbiguous: 0, evidenceEndsNotOwned: 0, evidenceApexOutside: 0, evidenceApexOutsideAt: [], styleDisagrees: 0, noCurbCut: 0, byPaint: {},
    style: norm?.style ?? null, source: norm?.source ?? null, passed: norm?.passed ?? null }
  const rings = [], cutMasks = [], farCuts = [], pairs = []
  let cuts = []
  if (!norm || norm.style === 'none') return { rings, cuts, farCuts, pairs, tally }
  if (!recs.length) { tally.noCurbCut = 1; return { rings, cuts, farCuts, pairs, tally } }
  const X = curbEdgeIndex(tiles), far = X.reach
  // every corner at a node, by the chain + side it fronts: does a corner exist across the street at all?
  const cornerAt = new Set()
  tiles.forEach(t => (t?.junctions || []).forEach(j => { if (j?.node != null) for (const l of j.legs || []) if (l) cornerAt.add(`${j.node}|${l.skelId}|${l.side}`) }))
  const otherSide = (side) => side === 'left' ? 'right' : side === 'right' ? 'left' : null
  const E = []
  recs.forEach((r, ri) => { for (const sv of (r.serves || [])) {
    if (r.node == null) { tally.noNode++; continue }
    E.push({ ri, r, sv, S: sv.leg.skelId, side: sv.leg.side }) } })
  const paintOf = (style) => norm.style === 'byCorner' ? norm.byCorner[style] : norm
  const quad = (O, u, v, a0, a1, b0, b1) => [[O[0] + u[0] * a0 + v[0] * b0, O[1] + u[1] * a0 + v[1] * b0], [O[0] + u[0] * a1 + v[0] * b0, O[1] + u[1] * a1 + v[1] * b0],
                                            [O[0] + u[0] * a1 + v[0] * b1, O[1] + u[1] * a1 + v[1] * b1], [O[0] + u[0] * a0 + v[0] * b1, O[1] + u[1] * a0 + v[1] * b1]]
  const paint = (A, B, P) => {
    const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz); if (!(L > 1e-6)) return
    const u = [dx / L, dz / L], v = [-u[1], u[0]], h = P.width / 2, ln = P.line
    if (P.style === 'lines') { rings.push(quad(A, u, v, 0, L, h - ln, h)); rings.push(quad(A, u, v, 0, L, -h, -h + ln)) }
    else for (let t = 0; t + ln <= L + 1e-9; t += 2 * ln) rings.push(quad(A, u, v, t, t + ln, -h, h))
    tally.crosswalks++; tally.byPaint[P.style] = (tally.byPaint[P.style] || 0) + 1
  }
  // the street side of a cut: the perpendicular whose first kerb across fronts the crossed chain on its other side
  const across = (e) => { const P = e.r.at, d = e.sv.dir, own = X.ringOf(e.r.tile, e.r.si)
    for (const n of [[d[1], -d[0]], [-d[1], d[0]]]) { const h = X.firstHit(P, [P[0] + n[0] * far, P[1] + n[1] * far], own)
      if (h && X.owned(h.e, e.S, e.side)) return { n, h } }
    return null }
  const byNode = new Map(); for (const e of E) (byNode.get(e.r.node) || byNode.set(e.r.node, []).get(e.r.node)).push(e)
  // ⭐ the RECORDED crossings (`landCrosswalkEvidence`): by street, each with its two ends on the frozen curb. A crossing
  // whose ends sit in the serving corner's arc (and, for a pair, in its partner's) gives the crosswalk's STATION.
  const crossings = new Map()
  tiles.forEach((t, ti) => (t?.crosswalkEnds || []).forEach(x => {
    const c = crossings.get(x.osmId) || crossings.set(x.osmId, { S: x.S, ends: new Map() }).get(x.osmId)
    c.ends.set(x.side, { ...x, ring: X.ringOf(ti, x.si) }) }))
  const crossingsOn = new Map(); for (const c of crossings.values()) (crossingsOn.get(c.S) || crossingsOn.set(c.S, []).get(c.S)).push(c)
  const evOf = (e, test) => { const r = []
    for (const c of crossingsOn.get(e.S) || []) {
      const mine = c.ends.get(e.side), theirs = c.ends.get(otherSide(e.side))
      if (mine && theirs && mine.kind === 'arc' && mine.ring === X.ringOf(e.r.tile, e.r.si) && mine.arc === e.r.arc && test(theirs)) r.push([mine.at, theirs.at]) }
    if (r.length > 1) tally.evidenceAmbiguous++
    return r.length === 1 ? r[0] : null }
  // ⛔ RULED (Jacob's item 9, via Boz 2026-10-06): a recorded station is used only if the crosswalk it centres still
  // holds the serving cut(s) — "the apex ramp lands inside it". Otherwise cut-centred, counted, its corner printed.
  const holds = (ev, d, cutsAt, W) => { const a = ((ev[0][0] + ev[1][0]) / 2) * d[0] + ((ev[0][1] + ev[1][1]) / 2) * d[1]
    return cutsAt.every(P => Math.abs(P[0] * d[0] + P[1] * d[1] - a) <= W / 2) }
  const refuse = (ev, at, S) => { tally.evidenceApexOutside++; tally.evidenceApexOutsideAt.push({ at, street: S }); return null }
  const seen = new Set()
  for (const e of E) {
    let c = byNode.get(e.r.node).filter(x => x.S === e.S && x.side !== e.side && x.ri !== e.ri)
    if (c.length > 1) c = c.filter(x => x.sv.other.skelId === e.sv.other.skelId && x.sv.other.side === e.sv.other.side)
    if (c.length > 1) { tally.ambiguous++; continue }
    if (c.length === 1) {
      const k = e.ri < c[0].ri ? `${e.ri}|${c[0].ri}` : `${c[0].ri}|${e.ri}`
      if (seen.has(k)) continue
      seen.add(k)
      if (norm.style === 'byCorner' && e.r.style !== c[0].r.style) { tally.styleDisagrees++; continue }
      // centred on the mean of the two cuts' stations along the street, cast both ways to the two kerbs; "across" points
      // at the partner — known by identity, so it needs no cast of its own
      const d = e.sv.dir, P1 = e.r.at, P2 = c[0].r.at
      const n0 = [d[1], -d[0]], n = ((P2[0] - P1[0]) * n0[0] + (P2[1] - P1[1]) * n0[1]) >= 0 ? n0 : [-n0[0], -n0[1]]
      const a1 = P1[0] * d[0] + P1[1] * d[1], a2 = P2[0] * d[0] + P2[1] * d[1], M0 = [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2]
      // ⛔ RULED (Jacob, 2026-10-06): two cuts further apart along the street than the crosswalk is wide cannot both lie
      // inside ONE square crosswalk (a skewed or jogged crossing) — counted, its corners printed, NOT drawn
      if (Math.abs(a1 - a2) > paintOf(e.r.style).width) { tally.apexesApart++; tally.apartAt.push({ at: [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2], street: e.S, gap: Math.round(Math.abs(a1 - a2) * 10) / 10 }); continue }
      const sh = (a1 + a2) / 2 - (M0[0] * d[0] + M0[1] * d[1])
      const ev0 = evOf(e, (x) => x.kind === 'arc' && x.ring === X.ringOf(c[0].r.tile, c[0].r.si) && x.arc === c[0].r.arc)
      const ev = ev0 && (holds(ev0, d, [P1, P2], paintOf(e.r.style).width) ? ev0 : refuse(ev0, P1, e.S))
      const M = ev ? [(ev[0][0] + ev[1][0]) / 2, (ev[0][1] + ev[1][1]) / 2] : [M0[0] + d[0] * sh, M0[1] + d[1] * sh]
      if (ev) tally.byEvidence++
      const hN = X.firstHit(M, [M[0] - n[0] * far, M[1] - n[1] * far]), hF = X.firstHit(M, [M[0] + n[0] * far, M[1] + n[1] * far])
      if (!hN || !hF || !X.owned(hN.e, e.S, otherSide(e.side)) || !X.owned(hF.e, e.S, e.side)) { tally.endsNotOwned++; continue }
      pairs.push([e.ri, c[0].ri, e.S, hN.at, hF.at, d, ev ? 'crossing' : 'cut']); tally.pairs++
      paint(hN.at, hF.at, paintOf(e.r.style))
      continue
    }
    // no cut across: a corner there without one, or a T's far kerb
    const A = across(e)
    if (!A) { tally.noFarKerb++; continue }
    if (cornerAt.has(`${e.r.node}|${e.S}|${otherSide(e.side)}`)) { tally.farCornerNoCut++; continue }
    if (norm.farKerb !== 'cut') { tally.farKerbNone++; continue }
    const w = cutNorm?.width, wd = cutNorm?.warningDepth
    if (!(w > 0 && wd > 0)) { tally.farKerbNoDims++; continue }
    const d = e.sv.dir, n = A.n
    // the recorded crossing, if one leaves this corner's arc for the far kerb, sets the station; else the cut does
    const ev0 = evOf(e, (x) => x.kind !== 'arc')
    const ev = ev0 && (holds(ev0, d, [e.r.at], paintOf(e.r.style).width) ? ev0 : refuse(ev0, e.r.at, e.S))
    let F = A.h.at, N0 = e.r.at
    if (ev) { const M = [(ev[0][0] + ev[1][0]) / 2, (ev[0][1] + ev[1][1]) / 2]
      const hN = X.firstHit(M, [M[0] - n[0] * far, M[1] - n[1] * far]), hF = X.firstHit(M, [M[0] + n[0] * far, M[1] + n[1] * far])
      if (hN && hF && X.owned(hN.e, e.S, otherSide(e.side)) && X.owned(hF.e, e.S, e.side)) { N0 = hN.at; F = hF.at; tally.byEvidence++ }
      else tally.evidenceEndsNotOwned++ }
    // the far cut: a slice of the walk — w along the kerb, from the kerb face through the curb and `warningDepth` in
    const mask = [[F[0] - d[0] * w / 2, F[1] - d[1] * w / 2], [F[0] + d[0] * w / 2, F[1] + d[1] * w / 2],
                  [F[0] + d[0] * w / 2 + n[0] * (cw + wd), F[1] + d[1] * w / 2 + n[1] * (cw + wd)], [F[0] - d[0] * w / 2 + n[0] * (cw + wd), F[1] - d[1] * w / 2 + n[1] * (cw + wd)]]
    cutMasks.push(mask); farCuts.push({ face: [[F[0] - d[0] * w / 2, F[1] - d[1] * w / 2], [F[0] + d[0] * w / 2, F[1] + d[1] * w / 2]], inward: n })
    pairs.push([e.ri, null, e.S, N0, F, d, N0 === e.r.at ? 'cut' : 'crossing']); tally.farKerbCut++
    paint(N0, F, paintOf(e.r.style))
  }
  // ONE intersection for every far-kerb cut: per-cut against the whole town's walk was most of a pour's Clipper time
  if (cutMasks.length && walk.length) cuts = intersectRings(unionRings(cutMasks), walk)
  return { rings, cuts, farCuts, pairs, tally }
}

export function sectionOpen(shapeTiles, cw, stripMat = { outer: 'LU', inner: 'SW' }, stencil = null, blockCustoms = null, cache = null, selectedTileSet = null, cornerOverrides = null, { pieces = false, stampedWith = null } = {}) {
  // Block-local memo. Each tile's FILL + asphalt/curb/block depends ONLY on its
  // own frozen fields, cw, stripMat, and its own blockCustoms slice — so a
  // Section drag (which writes a fresh blockCustoms object every frame but
  // touches one tile's slice) only needs to recompute the edited tile. With a
  // caller-owned `cache` (Map keyed by tile index) the rest reuse cached rings;
  // cache=null is the stateless whole-map path (a cold bake). The global merge
  // still runs every call — cheap (one union per layer vs the per-run offset
  // storm) — and it keeps the output bit-identical to the un-cached pass.
  const tileGeo = (st, i) => {
    // ⛔⛔ THE BUILD NONCE IS PART OF THE KEY, AND IT HAS TO BE. This key held the curb width, the
    // materials and the tile's own overrides — everything the FILL depends on EXCEPT THE CODE THAT
    // DRAWS IT. A hot module reload swaps the painter while this cache, held across the reload,
    // hands back rings computed by the previous one. ⇒ The operator edits nothing, the map is
    // rebuilt, and he is shown the OLD geometry with no indication that is what he is looking at.
    // ⭐ MEASURED COST, and it is why this is not a nicety: four separate corner constructions were
    // put in front of Jacob tonight and reported as "no visible change", one of which moved 744 m²
    // of sidewalk and 3,391 m² of treelawn. Neither of us could tell whether the code had reached
    // the screen, so every one of those verdicts was taken on unknown geometry.
    // ⛔ THIS IS LAYER 0 q2 INSIDE THE AUTHORING SURFACE — a stale artifact that still renders is
    // the canonical silent substitution, and `ORIENTATION` names exactly that shape. The tool must
    // not be able to show a map the current code did not draw.
    // ⭐ and the class of every piece: a land-use override changes the paint's KEY, not its shape.
    // …and the operator's corner flags on THIS tile's arcs (`iaArcKey` → `cornerOverrides`): a flag moves a pad
    const cornerSlice = cornerOverrides ? (st.iaArcKey || []).flatMap(m => Object.values(m || {}).map(k => JSON.stringify(cornerFlagOf(cornerOverrides[k])))).join('') : ''
    const key = BUILD_NONCE + '|' + cw + '|' + stripMat.outer + stripMat.inner + '|' + tileSliceKey(st, blockCustoms) + '|' + tilePieceLus(st).join(',') + '|' + cornerSlice
    if (cache) { const hit = cache.get(i); if (hit && hit.key === key) return hit }
    // ⚠️⚠️ A STALE ARTIFACT PATH — AND IT IS LOUD, BECAUSE A QUIET ONE IS THE WORST CASE HERE.
    // ⛔ The producer no longer emits `bands`; ③'s FILL is struck LIVE off the stamp. So a tile
    // arriving with bands is a `shape.json` frozen BEFORE that flip, and consuming it means the
    // operator is looking at a FILL THAT AUTHORING CANNOT MOVE — a plausible-looking map whose
    // handles do nothing. That is exactly Layer 0 q2, and it would present as "my treelawn edit
    // isn't working" rather than as an error. ⭐ The branch stays because a stale artifact is a
    // REAL state and refusing to draw it would make a re-pour a prerequisite for opening the tool;
    // the DEFECT WAS NEVER THE DRAW, it is the silence — so it says so, once per pass.
    // ▶ The cure is a re-pour. `ORIENTATION §3` (Survey): the browser writes `shape.json` on Survey-exit.
    if (st.bands) {
      if (!_staleBandsWarned) {
        _staleBandsWarned = true
        console.warn('[tileGround][SECTION] ⛔ this artifact carries FROZEN `bands` — it was poured before ③\'s FILL went live. It will DRAW, but the ped FILL cannot respond to authoring: a treelawn or material edit will move 0 m². RE-POUR to author the fill.')
      }
      const b = st.bands
      const bundle = {
        key,
        W: b.sidewalk || [],
        // ⭐ KEYED BY EACH PIECE'S OWN LAND USE (`rekeyByPiece`), exactly as the live painters key —
        // every colour knob and visibility toggle rides these keys, and a private key costs the
        // operator control silently (`bake-ground.js`'s PAINT_ORDER comment: a key no entry consumes
        // "drops silently from the slab — that is exactly how the divided median vanished").
        tlByLu: rekeyByPiece(st, { [OWN_LU]: b.treelawn || [] }),
        luByLu: rekeyByPiece(st, { [OWN_LU]: b.lu || [] }),
        ...bandByClass(differenceRings([st.ring], st.iA || []), st),   // asphalt is still tile − curb, its shore and highway cells apart
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
    if (Array.isArray(st.evidenceByPiece) && !st.evidenceStamped) unstampedWarn()
    const r = hasStampInquiry(st) ? sectionPassProtoTile(st, cw, stripMat, blockCustoms, cornerOverrides, { pieces })
                                  : sectionPassTile(st, cw, stripMat, blockCustoms)
    const iA = st.iA || []
    const bandJoin = st.bandJoin || 'miter'
    const cap = Number.isFinite(st.cap) ? st.cap : (cw + (st.tl || 0) + (st.sw || 0))
    const bundle = {
      key,
      W: r.Wacc, tlByLu: r.tlByLu, luByLu: r.luByLu,
      R: r.curbCut || [], curbCutRecs: r.curbCutRecs || [], curbCutTally: r.curbCutTally || null, curbCutContradicted: r.curbCutContradicted || [],
      curbCutCorners: r.curbCutCorners || [], cornerArcs: r.cornerArcs || [],
      ...bandByClass(differenceRings([r.rim?.ring ?? st.ring], r.rim?.block ?? iA), st),   // asphalt = tile − rounded inner (the painter's noded rim, live), its shore and highway cells apart
      // ⭐ THE CURB IS PART OF THE SAME LADDER when the stamp inquiry built it: `iA − ins(cw)`,
      // a per-point VARIABLE offset. The concentric fallback below is the walk painter's, and it
      // is not the same shape — using it on a stamped tile put 1,820 m² of curb where ③ had none.
      C: r.curb || differenceRings(iA, offsetRings(iA, -Math.min(cw, cap), bandJoin)),
      block: r.rim?.block ?? iA,                                               // block silhouette = the frozen curb ring, noded at the rim
      ...(r.rim ? { rim: { ring: r.rim.ring, owners: r.rim.owners }, rimFar: r.rim.far, rimFarMax: r.rim.farMax } : {}),
      ...(r.bandPieces ? { bandPieces: r.bandPieces, bandSeams: r.bandSeams, bandCensus: r.bandCensus, bandEdgeDepths: r.bandEdgeDepths, bandPerp: r.bandPerp } : {}),
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
  const mkAcc = () => ({ ...Object.fromEntries(Object.keys(PAINTED).map(f => [f, []])), ...Object.fromEntries(Object.keys(PAINTED_BY_LU).map(f => [f, {}])), block: [] })
  const curbCutRecs = [], curbCutTally = {}, curbCutContradicted = [], curbCutCorners = [], cornerArcs = []
  const rest = mkAcc(), bandByTile = [], rimRings = [], rimFar = { n: 0, max: 0, tiles: [] }
  const sel = (selectedTileSet && selectedTileSet.size) ? mkAcc() : null
  // ⭐ THE RIM IS CUT ONCE: A STAMPED SHAPE IS NOT CLIPPED AGAIN (BRIEF-the-rim-is-cut-once follow-on, Boz 2026-10-21). The pour
  // stamps every tile with its disc (`stampedWith`, the pour's own boundaryRing, recorded in shape.json) and the paint is cut
  // to the block inside it, so clipping that paint to the SAME disc here was a second cut at the rim, minting a fresh crossing
  // per class. ⭐ Decided on the recorded fact, never on geometry: a shape stamped with exactly this stencil (vertex for vertex
  // on the grid) is not clipped; one stamped with no disc, or with another, is. ⛔ Not "the ring reaches past the stencil":
  // ring vertices round up to 0.6 mm either side of the chord, so that test fired on half the rim tiles (Zob: HPDM 36/71).
  // The bake and Survey both pass it, so they paint alike. ▶ node checks/claims-the-rim-is-cut-once.mjs
  const hasStencil = !!(stencil && stencil.length >= 3)
  const reclip = hasStencil && !sameStamp(stampedWith, stencil)
  const clip = (rings) => hasStencil && rings.length ? intersectRings(rings, [stencil]) : rings
  for (let i = 0; i < shapeTiles.length; i++) {
    const b = tileGeo(shapeTiles[i], i), cl = reclip ? clip : (r) => r
    if (b.rim) { rimRings[i] = b.rim; rimFar.n += b.rimFar || 0; rimFar.max = Math.max(rimFar.max, b.rimFarMax || 0); if (b.rimFar) rimFar.tiles.push(i) }
    const acc = (sel && selectedTileSet.has(i)) ? sel : rest
    for (const f of Object.keys(PAINTED)) acc[f].push(...cl(b[f] || []))
    acc.block.push(...cl(b.block))
    for (const rr of (b.curbCutRecs || [])) curbCutRecs.push({ tile: i, ...rr })
    for (const c of (b.curbCutContradicted || [])) curbCutContradicted.push({ tile: i, ...c })
    for (const c of (b.curbCutCorners || [])) curbCutCorners.push({ tile: i, ...c })
    for (const c of (b.cornerArcs || [])) cornerArcs.push({ tile: i, ...c })
    for (const [k, v] of Object.entries(b.curbCutTally || {})) {
      if (k === 'bySource') { const o = (curbCutTally.bySource ||= {}); for (const [s2, m] of Object.entries(v)) o[s2] = (o[s2] || 0) + m }
      else curbCutTally[k] = (curbCutTally[k] || 0) + v
    }
    for (const f of Object.keys(PAINTED_BY_LU)) for (const k in b[f]) (acc[f][k] || (acc[f][k] = [])).push(...cl(b[f][k]))
    if (b.bandPieces) bandByTile.push({ tile: i, clipped: cl === clip, pieces: b.bandPieces, seams: b.bandSeams, census: b.bandCensus, edgeDepths: b.bandEdgeDepths, perp: b.bandPerp || [], painted: { curb: b.C || [], walk: b.W || [], lawn: Object.values(b.tlByLu || {}).flat() } })
  }
  const finish = (acc) => {
    const out = {}
    for (const [f, name] of Object.entries(PAINTED)) out[name] = unionRings(acc[f])
    for (const [f, name] of Object.entries(PAINTED_BY_LU)) { out[name] = {}; for (const k of Object.keys(acc[f])) out[name][k] = unionRings(acc[f][k]) }
    out.block = acc.block
    return out
  }
  const out = finish(rest)
  // the band pieces, clipped to the stencil exactly where the painted bands are (a tile whose ring reaches past it)
  if (pieces) out.bandPieces = bandByTile.map(({ clipped, ...t }) => { const cl = clipped ? clip : (r) => r
    return { ...t, painted: Object.fromEntries(Object.entries(t.painted).map(([k, v]) => [k, cl(v)])), pieces: t.pieces.map(q => ({ ...q, rings: cl(q.rings) })).filter(q => q.rings.length), perp: t.perp.map(x => ({ ...x, faces: cl(x.faces || []) })),
      seams: t.seams.map(q => ({ ...q, line: clipped ? q.line.flatMap(l => clipLine(l, [stencil])) : q.line })).filter(q => q.line.length) } })
  out.selected = sel ? finish(sel) : null
  out.rimRings = rimRings   // per tile, the ring noded with its paint's rim crossings (live): the deformer's 'beyond'
  out.rimFar = rimFar       // the rim crossings placed past one rounding off their edge (counted; cause not established)
  out.curbCutRecs = curbCutRecs; out.curbCutTally = curbCutTally; out.curbCutContradicted = curbCutContradicted
  out.curbCutCorners = curbCutCorners   // every junction corner, authorable in Section
  out.cornerArcs = cornerArcs   // every marked corner arc: its class, key, the operator's flag, and whether it carries a pad
  // ⭐ CROSSWALKS are cross-tile — a pair's two curb cuts sit on two blocks — so they are drawn here, over every tile's curb cuts.
  const cutNorm = shapeTiles.find(t => t?.curbCutNorm)?.curbCutNorm ?? null
  const walk = [...out.sidewalk, ...(out.selected?.sidewalk || [])]
  const CWK = crosswalksSquareAcross(curbCutRecs, shapeTiles, cutNorm?.crosswalks ?? null, cutNorm, cw, walk)
  const road = [...out.asphalt, ...(out.selected?.asphalt || [])]
  out.crosswalk = (CWK.rings.length && road.length) ? intersectRings(unionRings(CWK.rings), road) : []
  // a T's far-kerb cuts join the curb-cut layer: the same strip, the same class
  if (CWK.cuts.length) out.curbCut = clip(unionRings([...out.curbCut, ...CWK.cuts]))
  // every drop in the kerb — corner cuts and a T's far-kerb cuts — as { face, inward }, for the raised kerb's ramps
  out.curbCutRamps = [...curbCutRecs.filter(r => r.face).map(r => ({ face: r.face, inward: r.inward })), ...CWK.farCuts]
  out.crosswalkPairs = CWK.pairs; out.crosswalkTally = CWK.tally
  return out
}



/** One corner's authored entry in `cornerCornerRadiusOverrides` → its radius, or null. The entry is a radius (a number) or
 *  `{ r?, corner? }` (Jacob, 2026-10-07: the same map carries "not a corner" / "a corner here"). ⛔ An ABSENT radius is
 *  null, never 0 — R = 0 is authorable and must not coerce out of an absence. */
export function radiusOf(v) {
  const r = (v != null && typeof v === 'object') ? v.r : v
  return r != null && Number.isFinite(+r) ? +r : null
}
/** …and whether it says this arc IS a corner (true), is NOT one (false), or leaves it to the default (null). */
export function cornerFlagOf(v) { return v != null && typeof v === 'object' && typeof v.corner === 'boolean' ? v.corner : null }
/** …and the curb-cut style the operator chose for it (Section's popover), or null. */
export function cutOf(v) { return v != null && typeof v === 'object' && typeof v.cut === 'string' ? v.cut : null }

export function buildTileGround(ribbons, opts = {}) {
  // ⛔ The curb width arrives RESOLVED (the Look's authored value, else the kit's) — the default lives at the design-read
  // layer, never here (Boz ruled 2026-10-20). ▶ checks/claims-a-look-authors-its-curb-width.mjs
  if (!Number.isFinite(opts.curbWidth)) throw new Error(`[tileGround] ⛔ no curbWidth given (${opts.curbWidth}) — pass the width the design reader resolved (authored, else the kit's: lookDesign.mjs#bakeCurbWidth, the store's curbWidthOf); a builder never picks one`)
  const curbWidth = opts.curbWidth
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
  // Per-fe (per-block) asphalt-width overrides. blockCustoms is keyed
  // (skelId → side → segOrd) — the SAME identity the Survey/Measure drag writes.
  // Resolved per tile RUN: asphalt is stroked per run (strokeOpen below), so a
  // per-block pavementHW steps the asphalt edge for that segment; the curb +
  // concentric ped bands (offsets of the asphalt-inner) follow. segOrd is
  // computed on the original chain so it matches the authoring key.
  const blockCustoms = (opts.blockCustoms && typeof opts.blockCustoms === 'object') ? opts.blockCustoms : null
  // A2 / F3 — corner R reads the authored controls: the base is the LOCAL class row's radius (`LOCAL_SECTION.cornerR`,
  // 15 ft — the kit's one home; uniform for every corner until classifier step 7 makes ② read each street's class row)
  // × the global Corners slider (cornerRadiusScale), with per-corner / per-IX overrides resolved per tile vertex (the
  // gold-dot authoring). ⛔ No `opts.cornerR` substitution: no caller passed one, so it was a fallback that always fired.
  const baseR = LOCAL_SECTION.cornerR
  const scale = Number.isFinite(opts.cornerRadiusScale) ? opts.cornerRadiusScale : 1
  const ixOverrides = (opts.cornerRadiusOverrides && typeof opts.cornerRadiusOverrides === 'object') ? opts.cornerRadiusOverrides : null
  const cornerOverrides = (opts.cornerCornerRadiusOverrides && typeof opts.cornerCornerRadiusOverrides === 'object') ? opts.cornerCornerRadiusOverrides : null
  // Override-key helpers — MUST match CornerEditHandles / buildBlockGeometryV2
  // exactly (ixKey = 3-dp point; legKey = `${skelId}:${f|b}`; per-corner key =
  // ixKey|sorted(legA,legB); per-corner wins over per-IX; both pre-scale).
  const ixKeyOf = (p) => `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`
  // M3 — overridable ped-strip materials. Default {outer:'LU', inner:'SW'}
  // (V1.5 model). T3 makes this per-fe (the ctrl-click LU↔SW swap); for now a
  // single model proves the data path. 'LU' → land-use colour, 'SW' → sidewalk.
  const stripMat = {
    outer: opts.stripMaterials?.outer === 'SW' ? 'SW' : 'LU',
    inner: opts.stripMaterials?.inner === 'LU' ? 'LU' : 'SW',
  }

  // M1 — each PIECE's land-use class (`landUseByPiece`): the operator's `blockLandUse` for the block
  // (by bbox blockKey), else the class covering most of the piece among the voted faces, else
  // `underived` by name. ⭐ Faces are wound CCW here once, so the area credit's NonZero booleans
  // cannot cancel a clockwise face against its neighbour.
  const faceList = (ribbons?.faces || []).filter(f => f?.ring?.length >= 3 && f.use).map(f => {
    const ring = signedArea(f.ring) < 0 ? f.ring.slice().reverse() : f.ring
    return { use: f.use, ring, bb: ringBB(ring), area: Math.abs(signedArea(ring)) }
  })
  const blockLandUse = (opts.blockLandUse && typeof opts.blockLandUse === 'object') ? opts.blockLandUse : null
  const overrideFor = (blockRing) => (blockLandUse && blockLandUse[blockKeyFromRing(blockRing)]) || null
  // The land evidence (`ribbons.landEvidence`); null when the pour predates it — then each piece is labelled by the
  // face vote and painted whole, and the painter SAYS so once.
  const landEv = prepareEvidence(ribbons?.landEvidence)
  // label + evidence for one tile's pieces, after its final cut. `groups`: the evidence to cut from — the producer passes the tile's own, STAMPED with its contours (`stampTile`).
  const landOf = (iA, { fixed = null, override = null, groups = landEv }) => {
    if (!landEv) return { luByPiece: landUseByPiece(iA, { faces: faceList, fixed, override }) }
    const whole = fixed || override
    const evidenceByPiece_ = evidenceByPiece(iA, groups, whole ? iA.map(() => true) : null)
    return { luByPiece: labelFromEvidence(iA, evidenceByPiece_, whole), evidenceByPiece: evidenceByPiece_ }
  }

  // Grade-separated roads are excluded from the face graph above. HIGHWAY-class ones are the
  // positive object H (H-3 step 2): each is swept by its own typical section (`sweepHighway`) and
  // routed to the `highway` output. A non-highway grade-separated chain (a bridge, a footbridge)
  // stays a flat stroke at its own measure and is LISTED BY NAME (ruling i). ⛔ No silent skip:
  // a highway with no width, or poured before its section existed, is a named error — the live
  // view still draws a legacy one from its measure, and `bake-ground` refuses to freeze either.
  const Hacc = []
  const hwyDisclosure = { swept: 0, missing: [], legacy: [], tapers: [], gsOther: [], gsMissing: [], handoffs: [], handoffAmbiguous: [] }
  // ⭐ H-3 step 5 — which at-grade street CONTINUES a highway end (end-to-end, e.g. US 6 → an at-grade primary).
  // By IDENTITY of the shared vertex and one-way DIRECTION, never by angle or proximity, and ⛔ never by `ref`
  // (a label for the section, not a key): at a highway END the continuation is the one-way street that STARTS
  // there (at a START, the one that ENDS there); a two-way street qualifies only as the node's sole town chain.
  // A street passing THROUGH the node is a T (a ramp terminal) — H butts there, no taper. Ambiguous ⇒ no taper,
  // printed by name. Its width is the street's own per-side width at that end, WITH the operator's authoring.
  const hk = (p) => { const q = Array.isArray(p) ? p : [p.x, p.z]; return `${(+q[0]).toFixed(3)},${(+q[1]).toFixed(3)}` }
  const segIx = resolveChainSegmentation(streetsOrig)
  const townAt = new Map()                    // node → [{ st, at: 'start'|'end'|'mid' }]
  for (const st of streetsOrig) (st.points || []).forEach((p, i, P) => { const k = hk(p); if (!townAt.has(k)) townAt.set(k, [])
    townAt.get(k).push({ st, at: i === 0 ? 'start' : i === P.length - 1 ? 'end' : 'mid' }) })
  const widthAt = (st, side, which) => {
    const n = st.points.length, ix = [...(segIx.get(st) || [])].filter(i => i > 0 && i < n - 1).length
    const c = blockCustoms?.[st.skelId]?.[side]?.[which === 'start' ? 0 : ix]
    const hw = (c && Number.isFinite(c.pavementHW)) ? c.pavementHW : st.measure?.[side]?.pavementHW
    return Number.isFinite(hw) ? hw : null
  }
  const handoffOf = (s, which) => {
    const node = which === 'end' ? s.points[s.points.length - 1] : s.points[0]
    const at = townAt.get(hk(node)) || []
    const contact = highwayEndContact(at, which)
    if (contact.kind === 'none' || contact.kind === 'butt') return null   // no town street, or a T: a butt
    if (contact.kind === 'ambiguous') { hwyDisclosure.handoffAmbiguous.push(`${s.skelId ?? s.name}.${which} (${at.map(x => x.st.skelId).join(', ')})`); return null }
    const { st, at: stAt, want } = contact, same = stAt === want
    const w = (side) => widthAt(st, same ? side : (side === 'left' ? 'right' : 'left'), stAt)
    const out = { left: w('left'), right: w('right'), street: st.skelId ?? st.name }
    // Any OTHER town chain at the handoff node (huron: the US 6 crossover primary-link-54) is FLAGGED, not ruled.
    const also = at.filter(x => x.st !== st).map(x => x.st.skelId ?? x.st.name)
    hwyDisclosure.handoffs.push(`${s.skelId ?? s.name}.${which} → ${out.street} (L ${out.left?.toFixed?.(2)} · R ${out.right?.toFixed?.(2)} m)${also.length ? ` [also at this node, flagged not ruled: ${also.join(', ')}]` : ''}`)
    return out
  }
  for (const s of gradeSep) {
    const L = s.measure?.left, R = s.measure?.right
    const id = s.skelId ?? s.name
    if (!HIGHWAY_CLASSES.has(s.highway)) {
      const hw = Math.max(L?.pavementHW || 0, R?.pavementHW || 0)
      if (!(hw > 1e-6)) { hwyDisclosure.gsMissing.push(`${id} (${s.highway})`); continue }
      hwyDisclosure.gsOther.push(`${id} (${s.highway})`)
      continue
    }
    if (!L?.section?.taper || !R?.section?.taper) {
      const hw = Math.max(L?.pavementHW || 0, R?.pavementHW || 0)
      if (!(hw > 1e-6)) { hwyDisclosure.missing.push(id); continue }
      hwyDisclosure.legacy.push(id)
      Hacc.push(...strokeOpen(s.points, hw))
      continue
    }
    const sw = sweepHighway(s.points, L.section, R.section, { start: handoffOf(s, 'start'), end: handoffOf(s, 'end') })
    if (!sw) { hwyDisclosure.missing.push(id); continue }
    Hacc.push(sw.ring)
    hwyDisclosure.swept++
    for (const side of ['left', 'right']) for (const t of sw.tapers[side]) hwyDisclosure.tapers.push({ id, side, ...t })
  }
  {
    const D = hwyDisclosure
    console.log(`[tileGround][H] highway polygon H: ${D.swept} highway(s) swept by their section · ${D.tapers.length} taper(s) (12:1, centred [U])${D.tapers.some(t => t.shortened) ? ` — ⚠️ ${D.tapers.filter(t => t.shortened).length} SHORTENED to fit their span: ${D.tapers.filter(t => t.shortened).map(t => `${t.id}.${t.side}@${t.at}`).join(', ')}` : ''}`)
    if (D.missing.length) console.error(`[tileGround][H] ⛔ ${D.missing.length} highway(s) have NO WIDTH and are not drawn: ${D.missing.join(', ')}`)
    if (D.legacy.length) console.error(`[tileGround][H] ⛔ ${D.legacy.length} highway(s) carry no section — poured before H-3; drawn at their old measure until re-poured: ${D.legacy.join(', ')}`)
    if (D.handoffs.length) console.log(`[tileGround][H] end-to-end handoff(s), H tapered to the continuing street (12:1): ${D.handoffs.join(' · ')}`)
    if (D.handoffAmbiguous.length) console.warn(`[tileGround][H] ⚠️ ${D.handoffAmbiguous.length} highway end(s) with an AMBIGUOUS at-grade continuation — butt, no taper: ${D.handoffAmbiguous.join(' · ')}`)
    if (D.gsOther.length) console.log(`[tileGround][H] ${D.gsOther.length} non-highway grade-separated chain(s) drawn as a flat stroke at their own measure (ruling i): ${D.gsOther.join(', ')}`)
    if (D.gsMissing.length) console.error(`[tileGround][H] ⛔ ${D.gsMissing.length} non-highway grade-separated chain(s) have NO WIDTH and are not drawn: ${D.gsMissing.join(', ')}`)
  }
  // ⭐ H-3 step 3 — ONE EDGE. The union of the sweeps IS the highway's edge; every block beside it is
  // differenced against this same polygon (ruling b: no max(), no second smoothing).
  const Hpoly = unionRings(Hacc)
  const hwySkel = new Set([HWY_SKEL, ...gradeSep.filter(s => HIGHWAY_CLASSES.has(s.highway)).map(s => s.skelId ?? s.name)])
  let protoShapeTiles = null
  let protoNoCurbBlocks = []          // ② blocks whose curb came back empty: their ground, owned (`kind: 'block'` pieces below)
  let protoRimRings = null            // per tile, its ring noded with its paint's own rim crossings (`nodeRimWithPaint`) — live, never frozen
  let protoBandPieces = null          // ③'s bands as owned pieces, per tile (`bandPiecesOfTile`) — the FILL, live, never frozen
  let protoCentrelines = null, protoRunMeasure = null   // the sealed centreline and a run's resolved measure, for the road's paint
  let protoSpans = null, protoWater = null   // ①'s off-grade spans over the water (by identity) and its water rings, for the bridge overlay
  let protoInkPieces = null           // the curbless blocks' ground as owned road pieces (`kind: 'block'`); the ink itself is the tiles' (absorbInk.js)
  let protoNoses = null               // the nose: pairs cut back to the minimum curbed width and capped, and the ones not cut (`easeSkips.nose*`)
  let protoEasePairs = null           // named corner pairs on one leg too short for both eases (`easeSkips.pairClamped`)
  let protoUnlabelled = null          // per ② edge the walk reached with no ① owner (`offsetRingByRects` labelOf, or a boolean)
  let protoJunctionCensus = null      // per corner arc: junction · bend · unknown-by-reason (`classifyCornerLegs`)
  let protoBoundaryRing = null   // ⭐ the circle, carried out so EVERY consumer can stamp with it
  let protoInk = null   // ① itself — its frozen rings + per-edge labels, painted FIRST in the producer below
  let protoSource = null, protoLabels = null, protoRefused = null, protoOwners = null, protoCurb = null, protoCurbGs = null, protoBands = null, protoBandsByBlock = null, protoBlockLabelsOut = null, protoStackCollapse = null, protoAuthoring = null, protoDepthByBlock = null
  // ⭐ ②'s ACHIEVED corner arcs — the handle's ONE truth. Hoisted beside the other proto outputs
  // because the producer swap at the end of the build reads it (`SURVEY §4`: one corner truth).
  const protoCornerSet = []
  const protoArcsByBlock = {}        // BLOCK index → its achieved arcs, in the frozen `fillets` shape
  const protoArcKeyByBlock = {}      // BLOCK index → arc id (into its `easeArcs`) → that corner's key (`protoCornerOf`)
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
  // ⚠️ The one constraint: ε must clear the integer floor of the stage that HOLDS it.
  // Clipper is integer-space and `toClipper` rounds — SCALE=1000 here (1 mm), SCALE=100
  // at prebake (1 cm). Below the floor the object silently ceases to exist.
  // ⭐⭐ ε IS READ OFF THE FROZEN ARTIFACT (`protopolygon.eps`, recorded by the mint), never a literal here (Layer 0 Class D:
  // ② and the pour each carried their own 0.005). A frozen ① with no ε is REFUSED by name; a scene never poured with ①
  // mints live at the kit's one constant (`INK_EPS`, the mint's own default). ⛔ The `opts.protoHW` override is gone.
  const frozenProto = ribbons?.protopolygon
  if (frozenProto?.rings?.length && !(frozenProto.eps > 0)) throw new Error('[tileGround][①] ⛔ the frozen protopolygon carries no ε (`protopolygon.eps`) — the ink\'s half-width is not known, so nothing offset from it can be. Re-pour the scene. Refusing.')
  const PROTO_HW = frozenProto?.rings?.length ? frozenProto.eps : INK_EPS
  let proto = null
  {
    // ⛔ THE NOSE NEEDS THE MINIMUM CURBED WIDTH, READ AT POUR BY FINDING ID (`curbedMinWidth`, streetProfiles.js): a
    // curbed feature ends where the block narrows to it (easeContour). No width ⇒ no end, so the producer refuses.
    const cmw = opts.curbedMinWidth
    if (!(Number.isFinite(cmw?.m) && cmw.m > 0)) throw new Error('[tileGround][PROTO②] ⛔ no `curbedMinWidth` — the nose (where a curbed feature ends) is read from references/registry.json by finding id at pour (`curbedMinWidth(registry, townState(osm))`, streetProfiles.js) and passed in. Refusing to round a point the curb cannot be built to.')
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
    // (`ORIENTATION §3 (the Wall)`, `ROADMAP A02` — the same shape as `shapeFreezeMissing`, deliberately).
    //
    // ⚠️ ε IS PART OF THE IDENTITY OF THE OBJECT, and it is the artifact's own (`PROTO_HW`, above), so there is no
    // second value to disagree with.
    let MP
    if (frozenProto?.rings?.length && frozenProto?.owners?.length) {
      MP = { rings: frozenProto.rings, labels: frozenProto.labels, owners: frozenProto.owners,
             refused: frozenProto.refused || false, chainRings: null, crossings: frozenProto.crossings || null,
             // ⭐ `blocks` = boundary − stroked roads, frozen alongside ①. See the block loop below.
             blocks: frozenProto.blocks || null, blockLabels: frozenProto.blockLabels || null,
             // ⭐ the COMPOUND face — a block's holes travel with it, or it is offset as if solid
             blockHoles: frozenProto.blockHoles || null, blockHoleLabels: frozenProto.blockHoleLabels || null,
             // ⭐ the corner nodes, frozen — so ② never reaches for a chain to key the authored R
             nodes: frozenProto.nodes || null,
             // the sealed centreline (the road's paint); a pour before it carries none, and the paint refuses by name
             centrelines: frozenProto.centrelines || null,
             // the absorbed ink: per face the painted boundary (+ labels), and the cells painted apart from the road
             paint: frozenProto.paint || null, inkCells: frozenProto.inkCells || null,
             boundaryRing: frozenProto.boundaryRing || null,
             // ⛔ CARRIED, NOT RE-DERIVED. A frozen scene that dropped this would lose its
             // waterfront silently — every other field present, the pour looking complete. So an ABSENT field refuses
             // (null still means the mint was given no coast; coastFile.mjs#waterFace reads the same distinction).
             waterRings: (() => { if (frozenProto.waterRings === undefined) throw new Error('[tileGround] ⛔ the frozen ① predates its water face (no waterRings field) — a coastal town would read as no coast. ▶ re-pour'); return frozenProto.waterRings })(),
             // H-3 step 4: the region class per block (verge / jr / block), classified at the mint.
             blockClass: frozenProto.blockClass || null,
             // H-3: the ramp-terminal flares frozen at the mint — drawn into ②'s working copy (`flareWorkingCopy`)
             flares: frozenProto.flares || null,
             // ⛔ the off-grade spans over the water, by identity: an ABSENT field is a pour before the rule (Jacob's (b), 2026-10-27)
             // and refuses, or a bridge over the water would paint as a gap silently
             offGradeSpans: (() => { if (!Array.isArray(frozenProto.offGradeSpans)) throw new Error('[tileGround] ⛔ the frozen ① predates its off-grade spans (no offGradeSpans field) — a bridge over the water would paint as a gap. ▶ re-pour'); return frozenProto.offGradeSpans })() }
      // ⛔ A ① FROZEN BEFORE THE across/cap SPLIT is refused by name: its owners mark a stroke's end edges `cap` only, so this
      // emitter (which declines `across`) would emit them as frontage runs, silently. Re-pour the town.
      if (frozenProto.owners.some(o => o?.cap && !o.across))
        throw new Error(`[tileGround][①] ⛔ this scene's frozen protopolygon was minted before the across/cap split (owners mark \`cap\` without \`across\`) — its stroke ends would be emitted as frontage. Re-pour it (pipeline.js + promote-ribbons).`)
      protoSource = 'frozen'
    } else {
      const why = !frozenProto ? 'this scene carries no frozen protopolygon — it has not been poured since ① landed'
        : 'the frozen protopolygon is present but EMPTY'
      // ⭐ ONE CONSTRUCTION, TWO CALLERS — the live path calls the SAME function prebake does,
      // so a live re-derivation is the same object, not a second implementation of it.
      MP = mintProtopolygon({ streets: streetsOrig, gradeSep, eps: PROTO_HW })
      protoSource = `live: ${why}`
      console.warn(`[tileGround][①] ⛔ NOT the frozen protopolygon — re-derived live. ${why}.`)
    }
    protoOwners = MP.owners
    const R = { rings: MP.rings, labels: MP.labels, refused: MP.refused, crossings: MP.crossings }
    protoInk = { rings: MP.rings, labels: MP.labels }
    protoSpans = MP.offGradeSpans || [], protoWater = MP.waterRings || []
    protoBoundaryRing = MP.boundaryRing || null
    console.log(`[tileGround][①] source: ${protoSource} — ${MP.rings.length} ring(s), ${MP.owners.length} identity stamps, ε=${PROTO_HW} m (network: ${streetsOrig.length} streets + ${gradeSep.length} gradeSeparated)`)
    // ⛔⛔ DISCLOSE THE AUTHORING STATE — the SILENCE is the defect, never the draw.
    // ②③ below read `blockCustoms` twice (the `pavementHW` override in `resolveProtoMeasure`, and the ped
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
    // ▶ node checks/claims-proto-stack-reads-authoring.mjs
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
    // An edge the H difference drew is owned by the highway: bare, no pavement of its own, no ped.
    { const bare = { pavementHW: 0, treelawn: 0, sidewalk: 0, terminal: 'none', pedRealm: false, material: 'highway' }
      protoBase.set(HWY_SKEL, { left: bare, right: { ...bare } }) }
    const isHwyLab = (l) => l != null && hwySkel.has(protoOwners[l]?.skelId)
    let HWY_LAB = null                    // appended to the owners only when a block meets H
    const hwyLab = () => (HWY_LAB ??= protoOwners.push({ skelId: HWY_SKEL, side: 'right', segOrd: 0, gradeSeparated: true, srcIdx: -1, highway: true }) - 1)
    const hwyRefusedCustoms = new Set()
    // ⭐⭐⭐ skelId → the CANONICAL ROAD identity. Supplied because the consumer asks "is this the
    // same ROAD?" and, without an answer, treats every chain cut as a corner.
    // ⛔⛔ `protoRoadKey` EXISTED ONLY IN A COMMENT. Twenty lines downstream a comment states that
    // `roadKey` "is SUPPLIED (it was refused, and that refusal was the bug)" and even records the
    // count it moved — 511 → 593 corners — for a map that is never built and a field never assigned.
    // Measured: `run.roadId` is undefined on ALL 1,190 of LS's ① runs (chain path: 548 of 582 carry
    // it), so `isNameTransition` returns false everywhere and EVERY chain cut mints a corner where
    // the block does not turn. 1,185 minted sites against ①'s 532 stamped corners; 653 of them sit
    // on no corner at all, median 78 m from the nearest. That is the chevron.
    // ⭐ Reading the street table here is legitimate and ruled: this is the PRODUCER, pre-Wall, and
    // `RIBBONS §1` names the mint as "the one place a chain may be read". `§1` also files this
    // exactly — "OWED: the road reasoning still resolves live because ①'s frozen owners carry only
    // `skelId`… `mintProtopolygon` stamps it now but it reaches nothing until a re-pour." This
    // supplies it live so it reaches the paint without waiting for one.
    // ⛔ BOTH UNIONS, AS SCALARS — the downstream comment's own warning, and it is a real trap:
    // storing an object makes every comparison a REFERENCE compare, so every owner change classes
    // as "different roads" and the census reads clean while the map gets worse.
    const protoRoadKey = new Map()       // skelId → { roadId, throughId }, both scalar
    const addRoad = (st) => { const k = st?.skelId ?? st?.name; if (k == null || protoRoadKey.has(k)) return
      protoRoadKey.set(k, { roadId: (st.roadId || st.skelId || st.name) ?? null,
                            throughId: (st.throughId || st.roadId || st.skelId || st.name) ?? null }) }
    streetsOrig.forEach(addRoad); gradeSep.forEach(addRoad)
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
    // ⛔ A highway takes no authoring (`r-highway-no-authoring`): an override on one is REFUSED and
    // printed by name, never applied — the file keeps it. (Differs from the expressway rule on purpose.)
    // ⭐ The value is `resolveProtoMeasure`'s, the one rule the frozen painter and the instruments call too;
    // this is only its cache over the live owners, keyed by label.
    const protoMeasureCache = []
    const protoMeasureOf = (label) => {
      let m = protoMeasureCache[label]
      if (m) return m
      const o = protoOwners[label]
      if (!o) return null
      const hwy = hwySkel.has(o.skelId)
      if (hwy && blockCustoms?.[o.skelId]?.[o.side]?.[o.segOrd]) hwyRefusedCustoms.add(`${o.skelId}|${o.side}|${o.segOrd}`)
      return (protoMeasureCache[label] = resolveProtoMeasure({ skelId: o.skelId, side: o.side, segOrd: o.segOrd, baseMeasure: protoBase.get(o.skelId), hwy }, blockCustoms, curbWidth))
    }
    protoRunMeasure = (run) => resolveProtoMeasure({ skelId: run.skelId, side: run.side, segOrd: run.segOrd, baseMeasure: protoBase.get(run.skelId), hwy: hwySkel.has(run.skelId) }, blockCustoms, curbWidth)
    protoCentrelines = MP.centrelines ?? null
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
    // ⭐ ONE CORNER'S KEY (Jacob, 2026-10-07): `ix|skelA:sideA|skelB:sideB`, the legs sorted. `ix` is the junction's
    // chain-pair node, or — a BEND, one street turning, or two chains with no frozen shared node — the leaving leg's own
    // skeleton vertex (`owner.srcIdx`, read off the owner, never recovered). The SIDES split the two to four corners two chains make at one node, which the
    // chain-pair key (`ix|skelA|skelB`) collapsed into one: a radius dragged on one corner wrote them all.
    // null = not a street corner (the shore, the rim: no skeleton chain) — never authorable, never keyed.
    const protoStreetBySkel = new Map((ribbons?.streets || []).map(s2 => [s2.skelId ?? s2.name, s2]))   // the FROZEN chains `srcIdx` indexes
    // ⭐ IS THIS LEG A STREET — a skeleton chain. The shore (`__water__`) and the disc's rim (`__boundary__`) own curb
    // edges but are no street: a corner they flank is no corner a pedestrian crosses at, and it carries no key.
    const isStreetLeg = (skelId) => protoStreetBySkel.has(skelId)
    const protoCornerOf = (o1, o2) => {
      if (!o1 || !o2) return null
      const pa = `${o1.skelId}:${o1.side}`, pb = `${o2.skelId}:${o2.side}`, [ka, kb] = pa <= pb ? [pa, pb] : [pb, pa]
      const [la, lb] = o1.skelId <= o2.skelId ? [o1.skelId, o2.skelId] : [o2.skelId, o1.skelId]
      // the node two chains share — or, a bend or two chains with no frozen shared node, the leaving leg's own skeleton vertex
      if (!isStreetLeg(o1.skelId) || !isStreetLeg(o2.skelId)) return null
      const ix = (o1.skelId !== o2.skelId && protoPairNode[`${la}|${lb}`]) || protoStreetBySkel.get(o2.skelId)?.points?.[o2.srcIdx]
      return ix ? { key: `${ixKeyOf(ix)}|${ka}|${kb}`, ix, legA: ka, legB: kb } : null
    }
    const protoCornerKey = (o1, o2) => protoCornerOf(o1, o2)?.key ?? null
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
    let protoCornerN = 0, protoCornerNoNode = 0, protoCornerBend = 0
    // ⭐ per corner ARC (not per vertex): junction · bend · unknown-by-reason. Printed per pour, and on the result.
    const protoJxCensus = { arcs: 0, junction: 0, bend: 0, nostreet: 0, unknown: 0, why: {} }
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
    // ⭐⭐⭐ WHY R RESOLVED TO ZERO — wired 2026-09-08, alongside `easeSkips`. R = 0 does not mean
    // "a corner with no rounding": `isCorner_` requires R > 0, so a zero here DELETES the corner.
    // Four different facts shared that one silence; they are separated and counted now.
    const protoRZero = { water: 0, noOwner: 0, belowTol: 0, smoothBend: 0, clusterMember: 0, noSrc: 0, fromRAt: 0, foldLost: 0, foldLostCorner: 0 }
    const protoTaper = { n: 0, steep: [], overlap: 0 }   // width-step tapers built this pour (`taperWorkingCopy`)
    // the ramp-terminal flares drawn this pour (`flareWorkingCopy`) — Sets, because a flare is tried on every ring
    const flareDisclosure = { drawn: new Set(), noRun: new Set(), misattributed: new Set(), received: new Set(), truncated: new Set() }
    const protoRAt = (labs, i, n, hwHere = 0, turnHere = null) => {
      const a = protoOwners[labs[(i - 1 + n) % n]], b = protoOwners[labs[i]]
      // ⛔⛔ NO OWNER ⇒ NO RADIUS ⇒ `isCorner_` IS FALSE ⇒ THE CORNER DOES NOT EXIST. Counted since
      // 2026-09-08: this is a corner lost to LOST PROVENANCE, not to geometry, and it had been
      // indistinguishable from a straight run. ⭐ Measured on LS, every ① owner carries a non-null
      // `skelId`, so this fires only when the LABEL is missing — the union re-resolved that vertex.
      if (!a || !b || a.skelId == null || b.skelId == null) { protoRZero.noOwner++; return 0 }
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
      if (turnDeg < FILLET_TURN_TOL * 180 / Math.PI) { protoRZero.belowTol++; return 0 }
      // ⭐ LEGITIMATE BY RULING, and counted so it cannot be confused with the line above it: both
      // handles are continuous and the turn is gentle, so the SKELETON's own bezier already eased
      // this bend — INVARIANT 2, nothing rounds twice. ⛔ A corner refused here is correct; a corner
      // refused for `noOwner` is not. They were one silence.
      if (!(a.hard || b.hard) && turnDeg < PROTO_HARD_TURN) { protoRZero.smoothBend++; return 0 }
      protoCornerN++
      const key = a.skelId < b.skelId ? `${a.skelId}|${b.skelId}` : `${b.skelId}|${a.skelId}`
      // ⛔ A BEND HAS NO PAIR, AND THAT IS NOT A FAILURE. Where one street turns, both sides of the
      // corner are the SAME chain, so there is no chain-pair node to look up — the corner is real
      // and takes the class seed. Counted separately from a genuinely AMBIGUOUS pair (two chains
      // sharing more than one vertex), which is a failure and must not hide inside the same number.
      // ⭐ THE 3-TIER DIAL, IN ②'s OWN KEY SPACE: per-corner → per-IX → the class seed × the operator's scale. The
      // per-corner key is `protoCornerKey` — the node (or a bend's own skeleton vertex) and the two LEGS with their
      // SIDES — the same key `protoCornerSet` stamps, so what the handle writes is what ② reads, for ONE corner.
      // ⛔ The legacy key flavours each leg with a tile-edge `f|b` flag a contour vertex cannot carry: a Look
      // authored against THAT key space does not resolve here — counted and warned, never silently ignored.
      const co = radiusOf(cornerOverrides?.[protoCornerKey(a, b)])
      if (co != null) return Math.max(0, co) * scale
      const node = a.skelId === b.skelId ? null : protoPairNode[key]
      if (!node) { if (a.skelId === b.skelId) protoCornerBend++; else protoCornerNoNode++; return baseR * scale }
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
    // ⭐ BLOCK index → the depth each ① edge was ACTUALLY offset by (outer + holes), recorded as the
    // offset asks for it — never recomputed, so a check reads the construction's own number instead of
    // restating `mkDepth` — plus the block's ② rings. Build RESULT only: nothing here is frozen into a
    // tile, so every artifact is byte-identical. ▶ node checks/claims-the-curb-never-enters-the-road.mjs
    const depthByBlock = {}
    protoDepthByBlock = depthByBlock
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
      let protoHwyBlocks = 0, protoHwyRefused = 0
      let noWidth = 0, compoundFaces = 0, compoundUnlabelled = 0
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
        // ⭐ H-3 step 4: the block's frozen class (verge / jr / block — classified at the mint).
        const blockCls = (protoUseBlocks && MP.blockClass?.[k]) || 'block'
        const mkDepth = (L) => (i) => {
          // ⭐ A VERGE's span edge (a street on a bridge between two highway runs) is a STREET EDGE: the drawing is flat and
          // the span is drawn, so it takes its own roadway's depth below, like any street (Boz, 2026-10-21; LS Mississippi's
          // west half was painted verge to its centreline). The verge begins at the carriageway's edge, still bare (`bareAt`).
          // ⭐ H-3: a highway-owned edge is offset to a depth STRICTLY INSIDE H, and the difference below then
          // draws the edge exactly on H's boundary. Any depth in (0, the section's narrowest span) is inside
          // H; both ends of that interval are degenerate, so the MIDPOINT is taken — the one furthest from
          // both. ⚠️ A construction parameter, disclosed in the H line of every pour; it never reaches the
          // drawn edge, which is H's. Measured on huron (check 3, off-H highway-owned vertices in the disc):
          //   0            → 1, but it is 298 m of primary-103 LABELLED motorway-36 — the depth jump beside
          //                  the street makes the offset's self-union hand the street edge the highway's
          //                  owner, and the painter would leave that street bare;
          //   narrowest    → 11 (the offset coincides with H's edge, and overshoots it at chain ends);
          //   half of it   → 1, at 0.05 m, on a 0.13 m sliver at the motorway-11 × motorway-link-62 gore.
          if (isHwyLab(L[i])) {
            const o = protoOwners[L[i]], sd = protoBase.get(o.skelId)?.[o.side]
            const spans = (sd?.section?.spans || []).map(x => x.hw).filter(Number.isFinite)
            const hw = spans.length ? Math.min(...spans) : sd?.pavementHW
            return Number.isFinite(hw) ? Math.max(0, hw / 2 - PROTO_HW) : 0
          }
          const m = protoMeasureOf(L[i])
          if (!m) return 0
          const hw = m.pavementHW                     // ⛔ resolved off the frozen IDENTITY
          if (!(hw > 0)) { noWidth++; return 0 }
          return Math.max(0, hw - PROTO_HW)         // ① already sits ε off the centreline
        }
        const depthOf = mkDepth(labs)
        const depthAt = (i) => depthOf(i)
        // ⭐ the turn at each ① vertex, its CLUSTER's net turn (`subInkClusters`): ONE answer read by the taper's width-step
        // test, the corner test (`protoRAt`), the ease's own corner test and the fold-spur diagnostic below
        const CL = subInkClusters(ring, PROTO_HW), clTurn = (i) => CL.turn[i] * Math.PI / 180
        // ⭐ the ring ② actually offsets: ① plus the width-step tapers' split points (`taperWorkingCopy`)
        const WC0 = taperWorkingCopy(ring, depthOf, (i) => protoOwners[labs[i]], protoTaper, (i) => isHwyLab(labs[i]), clTurn)
        const WC = MP.flares?.length ? flareWorkingCopy(WC0, MP.flares, (e) => protoOwners[labs[e]], (j, E) => protoMeasureOf(labs[E[j]])?.pavementHW ?? 0, flareDisclosure) : WC0
        const depthRec = { ring: WC.ring, depth: new Array(WC.ring.length).fill(null), holes: [] }
        depthByBlock[k] = depthRec
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
        // ⭐ THE STAMP IS THE CORRESPONDENCE, AND IT ALREADY EXISTS (`A10-③`, `WL`): each ②
        // vertex records which ① ring vertex it was struck from, so the node identity survives
        // the offset without being re-derived from ②'s geometry.
        const st = {}
        // ⭐⭐⭐ THE CORNER IS KNOWN ON ①, NOT ON ②: a corner is a ① vertex where ① TURNS (`SECTION` rule 6; ② eases
        // the turn away). So resolve R per ① VERTEX (`protoRAt`, by the turn) and carry it across the offset on the stamp.
        // ⛔ CARRIED, NOT RECOVERED: a ② vertex is a corner iff the ① vertex it was struck FROM is.
        // ⛔⛔ EASE-BEFORE-OFFSET WAS TRIED AND REVERTED, 2026-09-06 — READ THIS BEFORE REBUILDING IT.
        // Easing ① at R + the pavement half-width and then offsetting looks right on paper (the
        // offset of a rounded contour is concentric, INVARIANT 1) and it is WRONG in practice: the
        // ease radius becomes ~12.5 m, its setback ~12.5 m, and on any leg shorter than that the
        // arcs of two neighbouring corners overrun each other and the following offset FOLDS.
        // Jacob, on the render: "whatever you just did messed up a bunch of corners" — crossed
        // spikes at the intersections. ⛔ Do not re-derive it; the setback, not the concept, is what
        // fails, and it fails on exactly the blocks a city has most of.
        // the corner test reads the cluster's net turn too (so it can catch a `hard: false` the geometry contradicts, see
        // `protoRAt`), and a cluster's other vertices take no corner
        // ⛔ H-3: a highway has no curb return — a corner where a town edge meets a highway edge is SHARP.
        // ⛔ THE COAST HAS NO CURB RETURN EITHER (Boz, 2026-10-26, Zob's read): a ① vertex either of whose edges is the WATER's
        // (`WATER_EDGE_SKEL`, by identity) is SHARP, street × coast included. ①'s coast is the high-water mark, and a fillet
        // there moved the coast line itself: ② re-struck it as a second near-copy (Huron tile 24, up to 0.39 units off ①, crossing
        // it), which the asphalt, the land use and the shore then read apart (claims-no-edge-is-drawn-twice). Counted apart.
        const touchesH = labs.some(isHwyLab) || (protoBlockHoleLabels?.[k] || []).some(L => L.some(isHwyLab))
        const isWaterLab = (l) => l != null && protoOwners[l]?.skelId === WATER_EDGE_SKEL
        const rSrc = ring.map((_, i) => (isWaterLab(labs[i]) || isWaterLab(labs[(i - 1 + ring.length) % ring.length]))
          ? (protoRZero.water++, 0)
          : (touchesH && (isHwyLab(labs[i]) || isHwyLab(labs[(i - 1 + ring.length) % ring.length])))
          ? 0 : !CL.carrier[i] ? (protoRZero.clusterMember++, 0) : protoRAt(labs, i, ring.length, depthAt(i), CL.turn[i]))
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
        // ⛔⛔ THE LAST HOP, AND IT IS WHERE THE CORNERS GO. `srcIdx` is the ① vertex this offset
        // point was struck from; a point the offset or its self-union MINTED has none, so `easeAt`
        // returns 0 — and R = 0 is not "a corner with no rounding", it fails `isCorner_` and the
        // corner CEASES TO EXIST. Counted since 2026-09-08 because it was silent, and because it is
        // a different fact from `protoRAt` deciding a vertex is genuinely not a corner.
        // ⭐⭐⭐ ② IS ① MINUS EVERY EDGE'S DEPTH BAND (`offsetRingByRects`) — where the block is narrower
        // than its curbs the curb goes to ZERO there, by construction. A null source is now a vertex that is
        // NOT a ① corner (a width step, or where two non-adjacent bands met) and is left sharp, as ruled.
        const rings2 = offsetRingByRects(WC.ring, (j) => (depthRec.depth[j] = WC.depth[j]), false, st,
                                          (srcIdx) => { if (srcIdx == null) { protoRZero.noSrc++; return 0 }
                                                        const r = rSrc[srcIdx] || 0; if (!r) protoRZero.fromRAt++; return r }, { ...WC, water: WC.e.map(e => protoOwners[labs[e]]?.skelId === WATER_EDGE_SKEL) },
                                          (e) => { const o = protoOwners[labs[e]]; return o ? `${o.skelId}|${o.side}|${o.segOrd}` : null }, { w: opts.curbedMinWidth.m },
                                          (srcIdx) => (CL.inCluster[srcIdx] ? clTurn(srcIdx) : null))
        // ⭐ per-vertex ① OWNER for each offset ring — `st.labels` maps an offset vertex back to
        // the ① ring vertex it was struck from, so this is one hop off the carried stamp.
        if (st.foldDropped) protoRZero.foldLost += st.foldDropped
        // ⭐ of the ① vertices the fold-spur pass dropped, how many were CORNERS? That is the half
        // that costs the operator something; dropping a reversal on a straight run costs nothing.
        if (st.foldLostLabels) for (const v of st.foldLostLabels)
          if (v != null && v < ring.length && CL.carrier[v] && CL.turn[v] >= FILLET_TURN_TOL * 180 / Math.PI) protoRZero.foldLostCorner++
        let outRings = rings2
        // ⭐ each ② edge names the ① edge it lies on, carried through the boolean — one hop to its owner
        let outLabs = rings2.map((rg, ri) => (st.edgeLabels?.[ri] || rg.map(() => null)).map(e => (e == null ? null : labs[e])))
        let outR = rings2.map((rg, ri) => { const src = st.labels?.[ri]; return rg.map((_, i) => (src && src[i] != null ? (rSrc[src[i]] || 0) : 0)) })
        // ⭐⭐⭐ THE CORNER'S EXTENT, CARRIED OFF THE EASE ITSELF. `st.arcMask[ri][i]` names the
        // corner each contour vertex belongs to — the one thing ②'s eased geometry cannot be asked
        // for afterwards, because it eases a 90° turn into ~12 vertices of 7.5° and every one of
        // them looks like a curve sample.
        let outArc = rings2.map((rg, ri) => st.arcMask?.[ri] || rg.map(() => null))
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
            const hDepthOf = mkDepth(holeLabs[hi])
            const CLh = subInkClusters(holes[hi], PROTO_HW)
            const HW0 = taperWorkingCopy(holes[hi], hDepthOf, (i) => protoOwners[holeLabs[hi][i]], protoTaper, (i) => isHwyLab(holeLabs[hi][i]), (i) => CLh.turn[i] * Math.PI / 180)
            const HW = MP.flares?.length ? flareWorkingCopy(HW0, MP.flares, (e) => protoOwners[holeLabs[hi][e]], (j, E) => protoMeasureOf(holeLabs[hi][E[j]])?.pavementHW ?? 0, flareDisclosure) : HW0
            const hRec = { ring: HW.ring, depth: new Array(HW.ring.length).fill(null) }
            depthRec.holes.push(hRec)
            const hOff = offsetRingByRects(HW.ring, (j) => (hRec.depth[j] = HW.depth[j]), true, hSt, null, { ...HW, water: HW.e.map(e => protoOwners[holeLabs[hi][e]]?.skelId === WATER_EDGE_SKEL) },
              (e) => { const o = protoOwners[holeLabs[hi][e]]; return o ? `${o.skelId}|${o.side}|${o.segOrd}` : null })
            for (let ri = 0; ri < hOff.length; ri++) {
              hRings.push(hOff[ri])
              hLabs.push((hSt.edgeLabels?.[ri] || hOff[ri].map(() => null)).map(e => (e == null ? null : holeLabs[hi][e])))
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
            // ⛔ THE EXTENT GOES WITH THE STAMP — a compound face's vertex correspondence does not
            // survive the hole subtraction, so its corners have no extent either. Null, never a
            // guess; the shortfall is already counted as `compoundNoEase`.
            outArc = B.rings.map(rg => rg.map(() => null))
          }
          compoundFaces++
        }
        // ⭐⭐ H-3 STEP 3 — ONE EDGE. A block beside a highway is its ② ring MINUS H: the highway-owned
        // edges were offset by 0 (`mkDepth`), so this difference is what puts them ON H's boundary —
        // the same polygon the highway is drawn from, never a second offset of the centreline (ruling
        // b). The corner metadata rides the boolean on the OPT-IN payload channel (Jacob, "B"): a town
        // corner keeps its eased radius and arc; a vertex H drew is owned by `__highway__`, R 0; a
        // minted crossing is R 0 (the sharp town↔highway corner). ⛔ Only blocks that touch a highway
        // take this path — every other block is byte-identical. ⚠️ A compound face's corners are
        // already lost at the hole subtraction above; the channel could carry those too (later).
        if (touchesH && Hpoly.length && outRings.length) {
          const hl = hwyLab()
          const B = booleanLabelled(clipperLib.ClipType.ctDifference, outRings, outLabs,
            Hpoly, Hpoly.map(r => r.map(() => hl)), true, false,
            { subject: outRings.map((rg, ri) => rg.map((_, i) => ({ R: outR[ri]?.[i] || 0, arc: outArc[ri]?.[i] ?? null }))),
              clip: Hpoly.map(r => r.map(() => ({ R: 0, arc: null }))) })
          if (B.refused) protoHwyRefused++
          outRings = B.rings
          outLabs = B.labels || B.rings.map(rg => rg.map(() => null))
          outR = B.payloads.map(pl => pl.map(v => v?.R || 0))
          outArc = B.payloads.map(pl => pl.map(v => v?.arc ?? null))
          protoHwyBlocks++
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
          // ⭐ ON THE LATTICE HERE, ONCE (`onLattice`): every consumer of this ring — the frozen `iA` and `iaFull`, the runs,
          // the land-use stamp, the circle — reads the same lattice contour, so no later cut is the one that rounds it.
          const eL = outLabs[ri], eN = outRings[ri].length
          const eased = { ring: onLattice(outRings[ri], `block ${k} ring ${ri}`), labs: eL }
          // ⭐⭐ THE CORNER TRUTH, FROM ②. `SURVEY §4`: one corner truth, read by the handle, never
          // re-derived. ⛔ Under ① the legacy `cornerFillets`/`cornerSet` describe arcs that are NOT
          // on screen — they come from the chain shape pass — so the handle would drag a corner the
          // operator cannot see. These replace them (below) when ① is the producer.
          // ⭐ ONE CORNER, ONE KEY (`protoCornerOf`): two chains' corner is named at their shared pair node, a same-chain one (a bend,
          // a cap shoulder) at the leaving leg's skeleton vertex `points[o2.srcIdx]` — a cap's sits where its last span starts.
          // Per arc id (`protoArcKeyByBlock` → `iaArcKey`; ids index `st.easeArcs`). ▶ scratch/footprint-census/arc-key-collisions.mjs
          // ⭐ FROZEN PER BLOCK — `SECTION §6.1`: the bent corner is `arcSectorPoly` off the frozen `fillets`.
          if (ri === 0) (st.easeArcs || []).forEach((a, u) => {
            const si = a.src, nB = ring.length
            const o1 = protoOwners[labs[(si - 1 + nB) % nB]], o2 = protoOwners[labs[si]]
            if (!o1 || !o2) return
            const fil = { apex: a.V, C: a.C, r: a.r, tA: a.tA, tB: a.tB }
            const cc = protoCornerOf(o1, o2)
            if (cc) { protoCornerSet.push({ key: cc.key, V: cc.ix, legA: cc.legA, legB: cc.legB, kind: cc.legA.split(':')[0] === cc.legB.split(':')[0] ? 'bend' : 'junction', vertR: a.R, fillet: fil, asked: a.asked, leg: a.leg })
                      ;(protoArcKeyByBlock[k] ||= new Map()).set(u, cc.key) }
            ;(protoArcsByBlock[k] ||= []).push(fil)
          })
          protoCurb.push(eased.ring); protoCurbGs.push(isGs)
          // ⭐ the curb, with each vertex's ① label — this is what ③ insets FROM
          ;(easedByBlock[k] ||= []).push({ ring: eased.ring, labs: eased.labs || outLabs[ri], arc: outArc[ri] })
          ;(depthByBlock[k].curb ||= []).push(eased.ring)
        }
      }
      // ⛔ LOUD, not silent: an edge with no resolvable authored width would erode by ZERO and
      // leave the curb sitting on the centreline — a plausible-looking wrong map.
      // ⭐ THE WIDTH-STEP TAPERS, disclosed: how many, and every one the leg was too short for (Jacob: option A — the
      // taper takes the whole leg, steeper, and says so)
      if (protoTaper.n) console.log(`[tileGround][PROTO②] width steps: ${protoTaper.n} tapered at ${TAPER_RATE}:1 on the wider block`)
      if (MP.flares?.length) {
        const D = flareDisclosure, notDrawn = [...MP.flares].filter(f => ![...D.drawn].some(x => x.startsWith(`${f.hwy}.${f.end} ${f.corner} `)) && ![...D.received].some(x => x.startsWith(`${f.hwy}.${f.end} ${f.corner} `)))
        console.log(`[tileGround][H-3 flare] ${D.drawn.size} of ${MP.flares.length} frozen flare(s) drawn into the town street (10:1, [U])${D.drawn.size ? ': ' + [...D.drawn].join(' · ') : ''}`)
        if (D.received.size) console.log(`[tileGround][H-3 flare] received by the authored width, not drawn: ${[...D.received].join(' · ')}`)
        // a flare is tried on every ring its street borders: it is DRAWN if any ring drew it; otherwise report only its
        // closest refusal (the other rings are simply other blocks along the same span)
        const key = (x) => x.split(':')[0], drawnK = new Set([...D.drawn, ...D.received].map(x => key(x).replace(/ \(the authored.*$/, '')))
        const refused = new Map(); for (const x of D.misattributed) { const k = key(x); if (drawnK.has(k)) continue
          const d = +(/starts ([\d.]+) m/.exec(x)?.[1] ?? Infinity); if (!refused.has(k) || d < refused.get(k).d) refused.set(k, { d, x }) }
        if (refused.size) console.warn(`[tileGround][H-3 flare] ⛔ NOT DRAWN — ① gives the node's edge along the leg another label: ${[...refused.values()].map(r => r.x).join(' · ')}`)
        if (D.truncated.size) console.warn(`[tileGround][H-3 flare] ⛔ TRUNCATED at the span end: ${[...D.truncated].join(' · ')}`)
        const lost = notDrawn.filter(f => ![...refused.keys()].some(k => k.startsWith(`${f.hwy}.${f.end} ${f.corner} `)))
        if (lost.length) console.warn(`[tileGround][H-3 flare] ⛔ ${lost.length} flare(s) found NO ① run carrying their street: ${lost.map(f => `${f.hwy}.${f.end} → ${f.street} ${f.side}/${f.segOrd}`).join(' · ')}`)
      }
      if (protoTaper.steep.length) console.warn(`[tileGround][PROTO②] ⛔ ${protoTaper.steep.length} width-step taper(s) STEEPER than ${TAPER_RATE}:1 — the wider leg is shorter than the taper, so it takes the whole leg: ` +
        protoTaper.steep.slice(0, 6).map(t => `(${t.at[0].toFixed(1)}, ${t.at[1].toFixed(1)}) ${t.rate.toFixed(1)}:1`).join(' · ') + (protoTaper.steep.length > 6 ? ` … +${protoTaper.steep.length - 6}` : ''))
      if (protoTaper.overlap) console.warn(`[tileGround][PROTO②] ⛔ ${protoTaper.overlap} edge(s) carry TWO tapers (a short leg between two width steps) — the narrower of the two is drawn.`)
      if (noWidth) console.warn(`[tileGround][PROTO②] ${noWidth} edge(s) had NO resolvable authored width and were offset by 0 — the curb sits on the centreline there.`)
      console.log(`[tileGround][PROTO②] curb from the proto: ${protoCurb.length} ring(s) offset per-edge at the authored pavementHW`)
      console.log(`[tileGround][PROTO②] corner ease: ${protoCornerN} corner(s) found by OWNER CHANGE (carried identity, never an angle), R=${baseR}×${scale} m` +
        (protoTipRound || protoTipBlunt ? ` · dead-end tips: ${protoTipRound} ROUND (eased at the half-width) · ${protoTipBlunt} BLUNT (R=0)` : '') +
        (protoCornerBend ? ` · ${protoCornerBend} are a street BENDING (broken handles, no chain pair — the class seed is correct there)` : '') +
        (protoCornerNoNode ? ` — ⚠️ ${protoCornerNoNode} had an AMBIGUOUS chain pair (two chains sharing more than one vertex) and took the class seed; a per-IX override cannot reach them` : ''))
      { const legacy = Object.keys(cornerOverrides || {}).filter(k => /\|[^|]+:[fb]\|[^|]+:[fb]$/.test(k))
        if (legacy.length) console.warn(`[tileGround][PROTO②] ⛔ ${legacy.length} per-corner entr${legacy.length === 1 ? 'y is' : 'ies are'} in the LEGACY key form (leg f/b flags) — nothing reads ${legacy.length === 1 ? 'it' : 'them'}; migrate to the corner key (ix|skel:side|skel:side): ${legacy.slice(0, 6).join(' · ')}`)
        // ⭐ AN AUTHORED CORNER THIS POUR NO LONGER HAS (Boz, 2026-10-18): a current-form key naming no corner of ② — a re-pour
        // moved its node or renamed a leg — reaches nothing. Printed, every one, by name and value; never refused: re-aiming
        // it is the operator's. ▶ node checks/claims-every-authored-corner-resolves.mjs
        const have = new Set(protoCornerSet.map(c => c.key)), orphan = Object.entries(cornerOverrides || {}).filter(([k]) => !legacy.includes(k) && !have.has(k))
        if (orphan.length) console.warn(`[tileGround][PROTO②] ⛔ ${orphan.length} authored corner entr${orphan.length === 1 ? 'y names' : 'ies name'} NO corner of this pour — ${orphan.length === 1 ? 'it reaches' : 'they reach'} nothing until re-aimed: ${orphan.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(' · ')}`)
        // ⭐ AN AUTHORED RADIUS THE LEG CANNOT HOLD (Boz, 2026-10-20): the corner still bends — the operator asked for more than
        // the leg allows, and the geometry wins (the product) — but it is said PER CORNER: the key, the radius asked, the radius
        // drawn, the bounding leg. An unauthored corner clamped the same way stays a count (below).
        // ▶ node checks/claims-every-authored-corner-resolves.mjs (its synthetic row)
        const clampedAuthored = protoCornerSet.filter(c => c.leg != null && radiusOf(cornerOverrides?.[c.key]) != null)
        for (const c of clampedAuthored) console.warn(`[tileGround][PROTO②] ⚠️ authored corner ${c.key}: asked R ${c.asked.toFixed(2)} m, drawn R ${c.vertR.toFixed(2)} m — bounded by its leg (${c.leg.toFixed(2)} m; a corner may not ease past half its leg)`) }
      // ⭐⭐⭐ THE EASE NOW SAYS WHY IT DECLINED A CORNER — wired 2026-09-08 (`easeSkips`, declared
      // and unreferenced since it was written). ⛔ `noR` is the line to read: those vertices TURN
      // past `FILLET_TURN_TOL` and were still not corners, because `isCorner_` also requires
      // R > 0 — so an authored radius that fails to resolve removes the corner ENTIRELY, and from
      // outside the function it is indistinguishable from a straight run. A missing corner is a
      // MISSING ADA RAMP (`RIBBONS §1`), so it may not be silent.
      // ⚠️ Counts are cumulative since the last read and are RESET by reading them, so this is this
      // pour's tally only if nothing else eased in between.
      // ⭐ and WHY the radius was zero, which is the layer under `easeSkips.noR`.
      if (protoRZero.noSrc) console.warn(`[tileGround][PROTO②] ⛔⛔ ${protoRZero.noSrc} offset vertex/vertices carry NO ① SOURCE INDEX ⇒ easeAt returns 0 ⇒ \`isCorner_\` false ⇒ THE CORNER CEASES TO EXIST. These were MINTED by the offset or its self-union and have no provenance to resolve a radius through. ⛔ Not a shape without a corner — a corner without an identity.`)
      if (protoRZero.noOwner) console.warn(`[tileGround][PROTO②] ⛔ ${protoRZero.noOwner} vertex/vertices had NO ① OWNER on an adjacent edge ⇒ R=0 ⇒ NOT A CORNER. Provenance lost in the union, not a shape without a corner. ⛔ These are the ADA pads the operator does not get.`)
      console.warn(`[tileGround][PROTO②] R=0, by ① vertex: ${protoRZero.water} on the coast (sharp, the high-water mark) · ${protoRZero.belowTol} below the turn tolerance (curve samples) · ${protoRZero.smoothBend} gentle bends the SKELETON already eased (INVARIANT 2) · ${protoTipBlunt} blunt cap apexes · ${protoRZero.clusterMember} sub-ink cluster member(s), whose cluster turns at another vertex · ${protoRZero.noOwner} no owner · ${protoRZero.noSrc} no source index.`)
      // ⭐⭐⭐ THE RECONCILIATION, AND IT IS THE WHOLE ANSWER TO "WHY noR": the ease asks for R at
      // OFFSET-ring vertices, `protoRAt` decides it at ① vertices, and the two rings do not agree
      // about which vertices turn. A vertex ① passes through as a curve sample can turn past the
      // tolerance once offset — so the ease sees a corner-shaped vertex whose radius was already,
      // and correctly, zero. ⛔ That is NOT the same population as "a corner ① turns at and ② never
      // built", and conflating the two overstates the defect. Measure the defect on ①'s ring
      // (`claims-every-turn-in-the-protopolygon-gets-an-arc`), never on this counter.
      console.warn(`[tileGround][PROTO②] ① source vertices dropped by the FOLD-SPUR pass (a contour REVERSAL, dropped deliberately): ${protoRZero.foldLost}, of which ${protoRZero.foldLostCorner} were ① CORNERS (turn past the tolerance) — anything flattened beyond these was flattened by the UNION resolving an OVERLAP.`)
      console.warn(`[tileGround][PROTO②] easeAt asked at an offset vertex and got 0 from a VALID ① source: ${protoRZero.fromRAt} — i.e. ① had already ruled that vertex not a corner.`)
      {
        const sk = easeSkipsTake()
        const lost = sk.noR + sk.reversal + sk.degenerateLeg + sk.zeroSetback
        if (lost) console.warn(`[tileGround][PROTO②] ⛔ ${lost} corner(s) the ease DECLINED — noR ${sk.noR} (turns past the tolerance but its radius resolved to 0 ⇒ not a corner at all) · reversal ${sk.reversal} · degenerate leg ${sk.degenerateLeg} · zero setback ${sk.zeroSetback}. ⛔ Each is a corner the operator does not get.`)
        protoEasePairs = { count: sk.pairClamped, at: sk.pairSites }
        const cmw = opts.curbedMinWidth, ns = sk.noseSites
        protoNoses = { w: cmw.m, sources: cmw.sources, capped: sk.noseCapped, spike: sk.noseSpike, narrow: sk.noseNarrow, at: ns }
        console.warn(`[tileGround][PROTO②] the nose: a curbed feature ends where the block narrows to ${cmw.m.toFixed(3)} m (${cmw.label}) and is capped at r = ${(cmw.m / 2).toFixed(3)} m ([U] q-curbed-nose-radius) — ${sk.noseCapped} capped · ${sk.noseSpike} folded back past 180° (a SPIKE, not cut) · ${sk.noseNarrow} narrower than that to the next corner (no place to end, not cut)${ns.find(x => x.kind !== 'capped') ? `. First not cut at (${ns.find(x => x.kind !== 'capped').a.map(c => c.toFixed(2)).join(', ')})` : ''}.`)
        if (sk.pairClamped) console.warn(`[tileGround][PROTO②] ⚠️ ${sk.pairClamped} PAIR(S) of named corners share one leg too short for both — each eased below its R, so the pair reads as one squeezed corner. First at (${sk.pairSites[0].a.map(c => c.toFixed(2)).join(', ')}) ↔ (${sk.pairSites[0].b.map(c => c.toFixed(2)).join(', ')}), leg ${sk.pairSites[0].leg.toFixed(2)} m.`)
        if (sk.legClamped) console.warn(`[tileGround][PROTO②] ⚠️ ${sk.legClamped} corner(s) eased BELOW their radius — bounded by their own leg, not by a budget. Not absent, but not the asked dimension either (the AUTHORED ones are named, each, above).`)
        if (sk.straightWithR) console.warn(`[tileGround][PROTO②] ⛔⛔ ${sk.straightWithR} vertex/vertices CARRY AN AUTHORED RADIUS and were skipped as STRAIGHT — ① ruled them corners, the OFFSET ring says they do not turn, and the ease walks the offset ring. ① is the authority (\`RIBBONS §1\`). These are corners lost to a disagreement between two rings.`)
        console.warn(`[tileGround][PROTO②] ease: ${sk.eased} corner(s) built · ${sk.straight} vertex/vertices passed through as curve samples.`)
      }
      if (labelCarryLost.lost) console.warn(`[tileGround][PROTO②] ⛔ ${labelCarryLost.lost} contour point(s) lie over MORE THAN ONE ① edge — the union minted or collapsed them. Attributed to the LONGEST ① edge they span, which is the FILL's own tie-break, not a guess at a single owner.`)
      console.log(`[tileGround][H] one edge: ${protoHwyBlocks} block(s) beside a highway differenced against H (corner metadata carried)${protoHwyRefused ? ` — ⛔ ${protoHwyRefused} came back with NO owner labels (their ped cannot resolve per edge)` : ''}${hwyRefusedCustoms.size ? ` · ⛔ ${hwyRefusedCustoms.size} authored override(s) on a highway REFUSED (r-highway-no-authoring), kept in the file: ${[...hwyRefusedCustoms].join(', ')}` : ''}`)
      if (compoundNoEase) console.warn(`[tileGround][PROTO②] ⛔ ${compoundNoEase} compound face(s) went through SHARP — the vertex correspondence does not survive the hole subtraction, so their corners carry no authored radius.`)
      if (compoundFaces) console.log(`[tileGround][PROTO②] ${compoundFaces} compound face(s) — outer eroded inward, holes dilated into the face, subtracted as one object`)
      if (compoundUnlabelled) console.warn(`[tileGround][PROTO②] ⛔ ${compoundUnlabelled} compound face(s) lost their ① identity across the hole subtraction — ③ cannot resolve a per-edge depth on them.`)
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
      // ⛔⛔ AND IT WAS NOT RETURNED UNTIL 2026-09-08 — built, correct, and unreachable, so a probe
      // could count 183 hairline rings on LS and could NOT say whose they were. That is the comment
      // above filed as done while half of it was unbuilt: the carrying happened, the handing over
      // did not. Declared in the outer scope now, assigned here, unchanged otherwise.
      protoBandsByBlock = {}
      // ⭐ THE BLOCK'S IDENTITY, IN THE SAME INDEX SPACE AS ITS BANDS — `protoOwners[labs[i]]` gives
      // block k's frontage owners directly, so a consumer never has to recover block → ① ring by
      // containment. That recovery is what `:7295` forbids, and without this it was the only route:
      // it left 6 blocks in NO ① ring and 12 sharing one on LS (35 and 62 on HPDM) — blocks whose
      // class simply could not be stated.
      // ⛔⛔ THE RESOLVED ARRAY, NOT THE RAW VARIABLE. `protoBlockLabels` is null on the holes path
      // and the loop below silently reads `R.labels` instead; handing back the raw one would give a
      // consumer `null` while the emit used something else — a silent substitution AT THE HANDOVER,
      // which is the defect class this file spends most of its comments on. Hand over what was
      // actually indexed.
      protoBlockLabelsOut = (protoBlockLabels || R.labels)
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
        // the water identity ② struck this ring with (`offsetRingByRects`' water join), so ③'s flood and guard build ②'s corner
        const waterOfLabs = (L, n) => Array.from({ length: n }, (_, i) => protoOwners[L?.[i]]?.skelId === WATER_EDGE_SKEL)
        const hwOfLabs = (L) => (i) => { const m = protoMeasureOf(L[i]); return m?.pavementHW > 0 ? Math.max(0, m.pavementHW - PROTO_HW) : 0 }
        // the block region at an extra inward depth `d` past the authored pavement half-width
        const blockAt = (d) => {
          const outs = offsetRingByRects(ring, (i) => hwAt(i) + d, false, null, null, { water: waterOfLabs(labs, ring.length) })
          if (!bHoles.length || !outs.length) return outs
          const hls = []
          for (let hi = 0; hi < bHoles.length; hi++) {
            const hw = hwOfLabs(bHoleLabs[hi])
            hls.push(...offsetRingByRects(bHoles[hi], (i) => hw(i) + d, true, null, null, { water: waterOfLabs(bHoleLabs[hi], bHoles[hi].length) }))
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
          // ⭐ H-3 step 4: a JR's town-street frontage is CONCRETE on both strips (the channelisation the
          // signals sit on — ruling g); a VERGE is bare on every edge.
          const bCls = (protoUseBlocks && MP.blockClass?.[k]) || 'block'
          const L = (i) => { const m = (EC.labs[i] == null ? null : protoMeasureOf(EC.labs[i])) || {}
            return stripLadder(bCls === 'jr' ? { ...m, matOuter: 'SW', matInner: 'SW' } : m, lim) }
          // ⭐ H-3: a highway-owned edge is BARE — no curb, no ped band, and the land use runs to H's edge
          // (every depth 0), so the drawing closes against the highway with no strip left unpainted.
          const bare = (i) => bCls === 'verge' || isHwyLab(EC.labs[i])
          const at = (f) => (i) => (bare(i) ? 0 : cw + L(i)[f])
          return {
            ring: EC.ring, water: EC.ring.map((_, i) => protoOwners[EC.labs[i]]?.skelId === WATER_EDGE_SKEL),
            pedFrom: (i) => (bare(i) ? 0 : cw), luFrom: (i) => (bare(i) ? 0 : WB),
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
            const rs = offsetRingByRects(p.ring, pick(p), p.hole, null, null, { water: p.water })
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
        const pedOuter = ins(p => p.pedFrom)
        if (pedOuter.length > outerParts.length) severed++
        const luEdge = ins(p => p.luFrom)
        // ⭐ PROTO_DUMP=1 — the discriminating measurement for the fat-band class, INERT when unset.
        // Two diseases look identical from a thickness histogram and have different cures:
        //   VANISHING PIECE — a block that PINCHES splits under a deeper inset and the sliver falls
        //     below the offset's area floor; the deeper set has FEWER pieces, that lobe is
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
      {
        protoShapeTiles = []
        const ringOwnerOf = (o) => !o ? null : o.water ? { kind: 'water' } : o.skelId === '__boundary__' ? { kind: 'rim' }
          : { skelId: o.skelId, side: o.side, segOrd: o.segOrd, ...(o.gradeSeparated ? { gradeSeparated: true } : {}) }
        // ⛔ A ② EDGE WITH NO ① OWNER carries no run and no cap, so nothing downstream can say whose curb it is (the ground
        // reads no height there). Counted where the walk reads it, with its site, never filled in. ▶ checks/claims-every-curb-edge-has-its-owner.mjs
        protoUnlabelled = { edges: 0, noOwner: 0, at: [] }
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
          // ⭐ THE BLOCK GOES, THE GROUND STAYS (Boz, 2026-10-17): "if the curbs touch, there's no block" drops the BLOCK,
          // not the ground. It is ROAD — its bounding streets' asphalt meeting — and it is carried with its own ① ring-edge
          // owners, read off the frozen labels here, never recovered later. Emitted beside the ink (`kind: 'block'`).
          if (!mine.length) { protoNoCurb++; protoNoCurbArea += Math.abs(signedArea(ring))
            // per labelled ① edge (outer + holes): its ends and its owner — the piece keeps only the owners whose edge
            // survives onto ITS boundary (the stencil and H cut edges away; an owner with none left has no line here)
            const edges = [], add = (rg, ls) => rg.forEach((a, i) => { const o = protoOwners[ls?.[i]]; if (!o || o.skelId === '__boundary__') return
              edges.push({ a, b: rg[(i + 1) % rg.length], key: o.water ? 'water' : o.skelId, own: o.water ? { kind: 'water' } : o.skelId, hwy: hwySkel.has(o.skelId) }) })
            // its ground is its PAINTED face (absorbInk.js): the ink it owns absorbed, its edges the splice's labels
            const PC = MP.paint?.[k]
            if (!PC?.outer?.length) throw new Error(`[tileGround][①] ⛔ curbless block ${k} has no painted face (protopolygon.paint) — a pour before the ink was absorbed. Re-pour.`)
            add(PC.outer, PC.outerLabels); (PC.holes || []).forEach((h, hi) => add(h, PC.holeLabels?.[hi]))
            protoNoCurbBlocks.push({ k, ring: PC.outer, holes: PC.holes || [], edges })
            continue }
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
              // ⛔⛔⛔ AND THE CONJUNCTION IS GONE, 2026-09-08 (Jacob): **"THE PROTOPOLYGON DOES NOT
              // INCLUDE NODES."** The sentence that justified it — "a street that BENDS mid-block
              // turns without any INTERSECTION" — is a CHAIN-WORLD sentence. An intersection is a
              // graph concept; ① has no nodes and no intersections, only a contour that turns. The
              // worry imported a chain concern into a shape and then vetoed the shape with it.
              // ⛔ ITS SAFETY ARGUMENT WAS BACKWARDS FOR A KIT. "It can only remove a pad, never
              // invent one, which is what makes it safe on a town nobody has seen" is blind to
              // false NEGATIVES — and a removed corner is a MISSING ADA RAMP on exactly that town.
              // ▶ MEASURED before removal: of the arcs the ease actually made, the label REFUSED
              //   LS 580 of 1058 (54.8%) · HPDM 3035 of 6350 (47.8%) — and the refused arcs carry
              //   the SAME median turn as the licensed ones, 90°. Square street corners, vetoed by
              //   a chain label. The operator found two of them by eye in places every gate called
              //   green, and neither could respond to authoring because nothing was there to
              //   respond. ▶ `node checks/claims-the-ease-is-the-corner.mjs <scene>`
              // ⇒ THE EASE IS THE CORNER TEST. Where the contour turns past `FILLET_TURN_TOL` the
              // ease made an arc, and that arc IS the corner — no label, no conjunction, and no
              // conditional ("the corner is what it is, where it is").
              // ▶ MEASURED on ①'s own ring, both towns: LS 39 of 1283 owner changes (3.0%) and
              //   HPDM 269 of 5527 (4.9%) sit where ① DOES NOT TURN. They are exactly the ones no
              //   fillet rounds — nothing turns, so nothing was rounded — so downstream they fell
              //   to "the extent is the one edge the owners meet across", and on ① a straight
              //   frontage is ONE EDGE: median 32.8 m and up to 223 m on LS, 494 m on HPDM, painted
              //   as a curb ramp. ⭐ Town #2 carries it ~6× harder, the kit's signature.
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
          // ⭐ `iaCap` — per ② vertex, the dead-end CAP that owns its edge: an index into the tile's `caps` (skelId · side ·
          // segOrd), else null. The cap is an END COUPLER of its own chain, not frontage, so it is never a run; its owner is
          // carried here so a reader that needs the chain at the tip (the ground's height) reads it, never recovers it.
          const caps = [], capIx = new Map(), iaCap = mine.map(EC => new Array(EC.ring.length).fill(null))
          // ⭐ CARRIED, NOT RE-DERIVED. Every ② vertex already holds the ① EDGE it was struck from,
          // so "is this a corner?" is "did the OWNER change between this vertex and the last?" — a
          // question about ①'s identity, asked on ②'s contour without ever measuring ②'s geometry.
          // ⛔ Reading it off ②'s shape is reading the ROUNDING: ② eases a 90° corner into ~12
          // vertices of 7.5°, so a turn test finds ZERO corners on a rectangle.
          const iaCorner = mine.map(EC => {
            const n2 = EC.ring.length
            const o = (i) => (EC.labs?.[i] != null ? (ownAt.get(EC.labs[i]) ?? null) : null)
            // ⭐⭐⭐ THE EASE IS THE CORNER, AND IT IS THE EASE'S OWN PER-VERTEX STAMP THAT SAYS SO.
            // Where the contour turned past `FILLET_TURN_TOL` the ease made an arc; that arc IS the
            // corner. No label, no conjunction, no conditional.
            // ⛔⛔ AND IT MUST BE READ OFF `EC.arc`, never off a set of turning LABELS: a label spans a whole ① edge, so a
            // label test marks EVERY ② vertex on that frontage once its owner turns anywhere. `end()` reads `iaCorner` to
            // end a leg, so each one inserts a ramp: LS went to 10,606 marked vertices of 14,651 (72.4%, from 3.6%) and the operator's eye caught
            // sawtooth notches mid-block — "weird geometry everywhere; looks like contour nodes."
            // ⭐⭐ THE LESSON, AND IT IS THE ONE TO CARRY: the owner-change half was doing TWO jobs —
            // wrongly answering WHETHER, and necessarily supplying WHERE. Deleting a term that
            // carries a second, unnamed job deletes that job too. `EC.arc` supplies the locality
            // honestly, because the ease stamped it at the moment it made the arc.
            void o
            return EC.ring.map((_, i) => (EC.arc?.[i] ?? null) != null)
          })
          // per ② contour vertex: is this ①'s corner? ⛔ Emitted as a FACT of the shape, so the
          // consumer never has to ask the eased geometry a question it cannot answer.
          for (let ri = 0; ri < mine.length; ri++) {
            const EC = mine[ri]
            const first = runs.length          // where this ring's runs begin, for the wrap merge
            let cur = null
            for (let i = 0; i < EC.ring.length; i++) {
              const o = EC.labs[i] == null ? null : protoOwners[EC.labs[i]]
              // ⭐ ONE WATER IS ONE RUN, SIDE-BLIND (Boz's ruling, Zob's read of every reader, 2026-10-27): ①'s coast-ink owners
              // carry a side and the bare water ring's (wIdx) is minted 'right', so a face that touches both would split one shore
              // into two runs, and a needle tip retraced across them was two owners at one retrace (PTown's spit). A deck's
              // water stays its own (`|deck${k}`); the run's side is written null. ▶ checks/claims-a-coast-finer-than-its-trace-is-not-drawn.mjs
              const isWater = o?.skelId === WATER_EDGE_SKEL
              const key = !o ? null : isWater ? `${WATER_EDGE_SKEL}${o.deck != null ? `|deck${o.deck}` : ''}`
                : `${o.skelId}|${o.side}|${o.segOrd}${o.deck != null ? `|deck${o.deck}` : ''}`
              if (!key) { if (EC.labs[i] == null) { protoUnlabelled.edges++; protoUnlabelled.at.push({ block: k, ring: ri, p: EC.ring[i], q: EC.ring[(i + 1) % EC.ring.length] }) } else protoUnlabelled.noOwner++
                cur = null; continue }
              // ⛔ A CAP EDGE IS NOT FRONTAGE: it runs ACROSS the ribbon, so as a run it would answer "which side is
              // the water on" with a segment perpendicular to the shore. It ENDS the run (the leg stops where it
              // stops in the world). The record keeps its identity for the tip ease; only the RUN declines it.
              if (o.across) {
                // ⭐ A CAP RECORD KNOWS ITS END AND ITS TIP (BRIEF-the-disc-is-one-source §2a): `capEnd` and the ① tip point
                // (the chain's end, stamped at the mint), so the Measure tool's cap handle reads the frozen shape and never
                // the chain. ⛔ A cap without its end is refused; an `across` edge that is no cap (a coast's end) owns no record.
                if (o.cap) { if (!o.tipEnd || !o.tip) throw new Error(`[tileGround][PROTO②] ⛔ a cap owner (${o.skelId} ${o.side}) carries no ${!o.tipEnd ? 'capEnd (tipEnd)' : 'tip point'} — the mint stamps both with the cap; refusing`)
                  if (!capIx.has(key)) capIx.set(key, caps.push({ skelId: o.skelId, side: o.side, segOrd: o.segOrd, capEnd: o.tipEnd, tip: o.tip }) - 1)
                  iaCap[ri][i] = capIx.get(key) }
                cur = null; continue }
              // ⭐ `baseMeasure` — the MEASURED cross-section for this street side. `SECTION §3.1`:
              // treelawn Y/N is "gleaned from data", and `resolvePedDepths(baseMeasure, side, custom)`
              // is the one depth truth the FILL and the handle both read. Surveyed DATA keyed by
              // frozen identity, not chain geometry — it crosses the wall by the ruled rule.
              if (!cur || cur.key !== key) { const rk = protoRoadKey.get(o.skelId) || null
                cur = { key, skelId: o.skelId, side: isWater ? null : o.side, segOrd: o.segOrd, poly: [],
                // ⭐ SUPPLIED, NOT REFUSED — see `protoRoadKey` at the mint. Without these the
                // consumer cannot ask "same road?" and every chain cut becomes a corner.
                roadId: rk?.roadId ?? null, throughId: rk?.throughId ?? null,
                // ⭐ ROAD-continuous ped, per-chain everything else. `roadKey` is SUPPLIED (it was
                // refused, and that refusal was the bug): a consumer must be able to ask "is this
                // the same road" without asking the chain graph.
                // ⛔ BOTH UNIONS, as VALUES. `protoRoadKey` holds `{roadId, throughId}`; storing the
                // object here made every comparison a reference compare, so every owner change
                // classed as "different roads" and the node census silently read clean. Caught by
                // the count MOVING THE WRONG WAY (511 → 593 corners) — an invariant that improves
                // when you did not touch it is the tell.
                baseMeasure: protoBase.get(o.skelId) || null,
                // ⭐ H-3: the frozen fact that this run is the HIGHWAY's (the same set the shape pass
                // differenced against H) — the painter makes it bare. Only on highway runs, so every
                // other tile's artifact is byte-identical.
                ...(hwySkel.has(o.skelId) ? { hwy: true } : {}),
                // ⭐ a deck's edge: water, with its deck's identity (the index in map.json's streetDecks), so a shore reader leaves it out
                ...(o.deck != null ? { deck: o.deck } : {}) }; runs.push(cur) }
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
          // ⭐⭐ THE TILE'S RING IS ITS PAINTED FACE — the face with the ε ink it owns absorbed (absorbInk.js, at the mint's
          // exit): neighbours meet on the centreline exactly, with no slit between them. ② above offset the UN-absorbed face
          // (`protoBlockRings`), so iaFull/iaStamp/runs — the authoring keys — are untouched by construction (Boz, A(i)).
          // ⛔ No painted face for this block is a pour before the absorption: refused by name, never the face substituted.
          const P = MP.paint?.[k]
          if (!P?.outer?.length) throw new Error(`[tileGround][①] ⛔ block ${k} has no painted face (protopolygon.paint) — this town was poured before the ink was absorbed. Re-pour; the tile never falls back to the un-absorbed face.`)
          // the cells this face absorbed that the ground paints APART from the road, classed by their owning label
          // (Zob's (a)): a water owner's is the land's SHORE, a highway's is the highway's (left to H, unpainted here)
          const inkCells = (MP.inkCells || []).filter(c => c.group === k).map(c => {
            const os = c.labels.map(l => protoOwners[l]).filter(Boolean)
            return { rings: c.rings, cls: os.some(o => o.water) ? 'shore' : os.some(o => hwySkel.has(o.skelId)) ? 'highway' : null } }).filter(c => c.cls)
          protoShapeTiles.push({
            ring: P.outer, iA: mine.map(EC => EC.ring), ...(inkCells.length ? { inkCells } : {}),
            // ⭐ `ringOwner` — per painted ring edge (vertex i → i+1), its OWNER, off the labels the splice carried (`protoOwners`):
            // { skelId, side, segOrd, gradeSeparated? } · { kind: 'water' } · { kind: 'rim' }. The road side reads its line from
            // it. Carried through the disc cut below by the labelled boolean, never matched back.
            ringOwner: P.outerLabels.map(l => ringOwnerOf(protoOwners[l])),
            // ⭐⭐⭐ THE FILL IS NO LONGER FROZEN — `SECTION §4`'s keystone, finally kept: freeze the
            // SILHOUETTE, author the FILL live. `bands` used to sit here and `sectionOpen`
            // short-circuited on it, so an authored treelawn moved this artifact 0 m². The tile now
            // freezes the STAMP (`iaStamp` + `iaFull`) and `sectionPassProtoTile` re-strikes ③'s own
            // ladder past the wall, per contour POINT — no walk, no runs to stroke, no corner to
            // decline. ⭐ Jacob: "we don't do a WALK anymore… there are no nodes there now."
            // ▶ node checks/claims-proto-fill-is-live.mjs — band within 0.1% of what the frozen
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
            // ⭐ `iaArc` — per contour vertex, WHICH CORNER'S ARC it lies in (null on a leg). ①'s
            // corner LOCATES the treatment (`iaCorner`); this is only its EXTENT, and it is read
            // off the ease that made it rather than matched back onto the contour afterwards.
            runs: runs2, iaStamp, iaCap, caps, iaCorner, iaFull: mine.map(EC => EC.ring),
            iaArc: mine.map(EC => EC.arc || EC.ring.map(() => null)),
            // ⭐ the town's curb-cut norm, frozen with its rung (`cartograph/curb-cut-norm.mjs`); null = poured before it.
            curbCutNorm: ribbons?.curbCutNorm ?? null,
            // ⭐ `iaJunction` — per contour vertex of a corner arc: an index into `junctions` (a street meets here:
            // its two legs, arriving then leaving in this contour's order, and the node they meet at), 'bend' (the
            // legs are one road), 'nostreet' (a flank is the shore or the rim — no street, so no pad and no cut), or null
            // (not an arc, or UNKNOWN — counted by reason at the pour).
            // THE LEGS DECIDE (`classifyCornerLegs`), read off this tile's own frozen stamp. The node is the mint's
            // frozen chain-pair vertex (`nodes[legA|legB]`, the corner-radius key): the CENTRELINE point the two
            // chains share, so every corner at one crossing carries the same one and a crosswalk can pair across
            // the street on it. ⛔ No frozen node (none, or refused as ambiguous) ⇒ `node: null` — the corner keeps
            // its curb cuts and its crosswalk goes unpaired, counted. `BRIEF-corner-ramps-and-kerb §0a`.
            ...(() => {
              const junctions = [], at = new Map()
              const ring = MP.boundaryRing || null
              const outsideDisc = (p) => { if (!ring?.length) return false; let inside = false
                for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]
                  if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) inside = !inside }
                return !inside }
              // ⭐ `iaArcKey` — per ring, arc → ONE CORNER'S KEY: the radius dial's own, recorded per arc where the corner was
              // eased (`protoArcKeyByBlock`), never re-derived here. Section reads the operator's corner entry by it.
              const iaArcKey = []
              const iaJunction = mine.map((EC, ri) => {
                const arc = EC.arc || [], n2 = EC.ring.length, stp = iaStamp[ri] || []
                const span = new Map()
                for (let i = 0; i < n2; i++) { const u = arc[i]; if (u == null) continue
                  const f = span.get(u) || {}; if (arc[(i - 1 + n2) % n2] !== u) f.first = i; if (arc[(i + 1) % n2] !== u) f.last = i; span.set(u, f) }
                // a flank with no run: WHY — a dead-end cap edge (ends a run by construction), the rim, or unowned
                const whyNull = (e) => { const l = EC.labs?.[e], o = l == null ? null : protoOwners[l]
                  if (o?.cap) return 'capEdge'
                  if (o?.across) return 'acrossEdge'   // a stroke's end edge that is no cap (a coast's end)
                  const A = EC.ring[e], B = EC.ring[(e + 1) % n2]
                  if (outsideDisc([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2])) return 'rim'
                  return l == null ? 'unlabelled' : 'other' }
                const leg = (r) => r == null ? null : { skelId: runs2[r].skelId, side: runs2[r].side, roadId: runs2[r].roadId ?? null, throughId: runs2[r].throughId ?? null }
                const byArc = new Map(), keyOf = (iaArcKey[ri] = {})
                for (const [u, f] of span) {
                  const kk = protoArcKeyByBlock[k]?.get(u); if (kk) keyOf[u] = kk
                  if (f.first == null || f.last == null) { byArc.set(u, null); protoJxCensus.arcs++; protoJxCensus.unknown++; protoJxCensus.why.noFlank = (protoJxCensus.why.noFlank || 0) + 1; continue }
                  const eb = (f.first - 1 + n2) % n2, ea = f.last
                  const A = leg(stp[eb]), B = leg(stp[ea])
                  // ⛔ a flank that is no STREET (the shore, the rim) makes no junction and no bend: 'nostreet' — no pad, no cut
                  if ((A && !isStreetLeg(A.skelId)) || (B && !isStreetLeg(B.skelId))) { protoJxCensus.arcs++; protoJxCensus.nostreet = (protoJxCensus.nostreet || 0) + 1; byArc.set(u, 'nostreet'); continue }
                  const c = classifyCornerLegs(A, B)
                  protoJxCensus.arcs++; protoJxCensus[c.kind]++
                  if (c.kind === 'unknown') { for (const w of [A ? null : whyNull(eb), B ? null : whyNull(ea)]) if (w) protoJxCensus.why[w] = (protoJxCensus.why[w] || 0) + 1; byArc.set(u, null); continue }
                  if (c.kind === 'bend') { byArc.set(u, 'bend'); continue }
                  const pk = A.skelId < B.skelId ? `${A.skelId}|${B.skelId}` : `${B.skelId}|${A.skelId}`
                  const P = protoPairNode[pk], node = P ? `${(+P[0]).toFixed(3)},${(+P[1]).toFixed(3)}` : null
                  if (!node) protoJxCensus.junctionNoNode = (protoJxCensus.junctionNoNode || 0) + 1
                  const key = `${node}|${A.skelId}|${A.side}|${B.skelId}|${B.side}`
                  if (!at.has(key)) { at.set(key, junctions.length); junctions.push({ node, legs: [A, B] }) }
                  byArc.set(u, at.get(key))
                }
                return EC.ring.map((_, i) => arc[i] == null ? null : (byArc.get(arc[i]) ?? null))
              })
              return { iaJunction, junctions, iaArcKey }
            })(),
            // ⭐ The land use is SUPPLIED per piece (`luByPiece`), but only once the disc has cut the
            // tile — see after the cut. Carried until then: the block's own ruling and its override.
            // ⭐ H-3 step 4: a verge and a JR's remainder are land use `verge` — no land-use choice.
            _luSeed: { fixed: ((protoUseBlocks && MP.blockClass?.[k]) === 'verge' || (protoUseBlocks && MP.blockClass?.[k]) === 'jr') ? 'verge' : null,
                       override: overrideFor(ring) },
            ...((protoUseBlocks && MP.blockClass?.[k] && MP.blockClass[k] !== 'block') ? { blockClass: MP.blockClass[k] } : {}),
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
        // ⭐ THE RECORDED CUTS, LANDED — on WHOLE blocks, before the cut, so every piece carries its block's landings.
        {
          const E = ribbons?.curbCutEvidence
          if (!E) console.warn(`[tileGround][curb cuts] ⛔ no kerb evidence frozen in this pour (poured before the evidence rung) — re-pour.`)
          else if (!E.fetched) console.warn(`[tileGround][curb cuts] ⛔ kerb evidence NOT FETCHED (${E.file}) — every corner falls to the norm.`)
          else { const c = landCurbCutEvidence(protoShapeTiles, E).census
            console.log(`[tileGround][curb cuts] kerb evidence: ${c.landed} of ${c.records} record(s) landed on a junction corner owned by the road they cross · ${c.noHit} met no curb · ${c.offArc} landed off any arc · ${c.notJunction} on a bend/unknown corner · ${c.notOwner} on a corner the crossed road is not a leg of`) }
        }
        {
          const CX = ribbons?.crosswalkEvidence
          if (!CX) console.warn(`[tileGround][crosswalks] ⛔ no crossing evidence frozen in this pour (poured before it) — re-pour.`)
          else { const c = landCrosswalkEvidence(protoShapeTiles, CX).census
            console.log(`[tileGround][crosswalks] crossing evidence: ${c.landed} of ${c.records} crossing(s) landed on both kerbs of the street they cross (ends: ${c.ends.arc} on a corner arc · ${c.ends.nearTangent} on the leg edge touching an arc · ${c.ends.leg} on a leg) · ${c.noHit} met no curb · ${c.notOwned} met a kerb of another street · ${c.sameSide} both ends on one side`) }
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
        // ⭐ THE LAND-USE STAMP, BEFORE THE CIRCLE (`stampTile`): the raw evidence is noded with the UNCUT contours, so
        // every crossing on a block edge is a vertex the contour and the evidence share; the circle then cuts the stamped
        // contour and makes the rim edges alone. ⛔ Stamped after the cut, a crossing landed on a RIM edge of iA that the
        // tile ring did not carry (HPDM 2026-10-14: a 0.4 mm kink, an asphalt spike, the flatten refused). The evidence it
        // was noded with rides the tile to the land-use cut below (`_evGroups`).
        // ⭐ THE CURB IS TRIMMED TO ITS FACE FIRST, so the stamp nodes the curb the tile keeps. ⛔ The face trim used to ride
        // the circle's `iA ∩ piece`: on a tile whose ring runs inside its curb by under 1 mm, the cut iA took the RING's edge
        // there and every crossing stamped into the curb on it was dropped (Huron 53 of 60, PTown 96 of 104 one-sided).
        // ⭐ A trim that cuts nothing leaves iA AS IT IS (the same contour as iaFull, not Clipper's re-emitted copy of it); one that
        // cuts writes its crossings into iaFull too (`shareIntoFull`). Its other new vertices are the ring's own, where the ring
        // runs inside the curb.
        let stamped = 0, added = 0, sharedIntoFull = 0, sharedIntoRing = 0, sharedIntoShore = 0, shoreFar = 0, shoreFarMax = 0; const byPair = {}
        const keyOf = (v) => { const c = toClipper(v); return c.X + ',' + c.Y }
        protoShapeTiles = protoShapeTiles.map(t => { if (!t.iA?.length || !differenceRings(t.iA, [t.ring]).length) return t
          const iA = intersectRings(t.iA, [t.ring]), have = new Set([...(t.iaFull || []).flat(), ...t.ring].map(keyOf))
          const pts = []; for (const r of iA) for (const v of r) { const k = keyOf(v); if (!have.has(k)) { have.add(k); pts.push(v) } }
          sharedIntoFull += pts.length
          const sh = shareBlockIntoRing({ ...shareIntoFull(t, pts, `the face trim, tile at ${t.ring[0].map(c => c.toFixed(1)).join(', ')}`), iA }); sharedIntoRing += sh.added
          return sh.t })
        if (landEv) protoShapeTiles = protoShapeTiles.map(t => { const { fixed, override } = t._luSeed
          if (fixed || override) return t
          const { tile, groups, counts } = stampTile(t, landEv)
          for (const k in counts) byPair[k] = (byPair[k] || 0) + counts[k]
          stamped++; added += tile.iaFull.reduce((u, r, i) => u + r.length - t.iaFull[i].length, 0)
          // the stamp's crossings on a stretch where the block follows the ring go into the ring too
          const sh = shareBlockIntoRing(tile); sharedIntoRing += sh.added
          return { ...sh.t, _evGroups: groups } })
        // every tile, stamped or not: the block's vertices on a water run go into its shore cell (joins have no stamp)
        protoShapeTiles = protoShapeTiles.map(t => { const ss = shareWaterRunIntoShore(t, `tile at ${t.ring[0].map(c => c.toFixed(1)).join(', ')}`); sharedIntoShore += ss.added
          shoreFar += ss.far || 0; shoreFarMax = Math.max(shoreFarMax, ss.farMax || 0); return ss.tile })
        const stamp = MP.boundaryRing
        if (stamp?.length > 2) {
          const before = protoShapeTiles.length; let rimShared = 0, cellRimShared = 0, cellsOutside = 0
          const cut = (rings) => { const o = intersectRings(rings || [], [stamp]); return o?.length ? o : [] }
          const kept = []
          // ⭐ the RING is cut by the disc, and each output edge takes the owner of the OPERAND edge it lies on: one of the
          // tile's own ① edges (its `ringOwner`), or the disc's (`rim`). Containment on the integer grid the boolean ran on
          // (2 units, `booleanLabelled`'s own containment rule) — the operands of this cut, never other geometry (A15).
          // ⛔ Not the boolean's per-vertex label: a vertex names the edge leaving it in the INPUT's order, Clipper writes
          // its own orientation, and a vertex the cut makes inherits from the next one — measured one edge out on HPDM
          // 1,263 + 35 edges, JH 71. An edge on no operand edge, or on two with different owners, stays null and the guard
          // below refuses it.
          const cutOwned = (t) => {
            const rings = intersectRings([t.ring], [stamp]), C = (v) => toClipper(v)
            const onSeg = (q, a, b) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy; if (!L2) return q.X === a.X && q.Y === a.Y
              const L = Math.sqrt(L2), u = (q.X - a.X) * dx + (q.Y - a.Y) * dy; return u >= -2 * L && u <= L2 + 2 * L && Math.abs((q.X - a.X) * dy - (q.Y - a.Y) * dx) / L <= 2 }
            const S = t.ring.map(C), D = stamp.map(C), K = (q) => q.X + ',' + q.Y, exact = new Map()
            // an output edge that IS one of the ring's own edges (both ends, on the grid, either way round) is that edge —
            // asked first, because at a tip a 5 mm edge lies within the grid tolerance of its neighbour too
            S.forEach((q, j) => { const r = S[(j + 1) % S.length]; for (const k of [K(q) + '>' + K(r), K(r) + '>' + K(q)]) exact.set(k, exact.has(k) && exact.get(k) !== j ? -1 : j) })
            const at = new Map(); S.forEach((q, j) => at.set(K(q), at.has(K(q)) ? -1 : j))
            const owners = rings.map(rg => rg.map((v, i) => { const a = C(v), b = C(rg[(i + 1) % rg.length]), got = new Set(), ow = []
              const x = exact.get(K(a) + '>' + K(b)); if (x != null && x >= 0) return t.ringOwner[x]
              // both ends are ring vertices but the cut dropped the ones between (Clipper removes a sub-mm loop: PTown's
              // coast, three 5 mm edges): the edge is that run of ring edges, the shorter way, if they share ONE owner
              const ia = at.get(K(a)), ib = at.get(K(b))
              if (ia != null && ib != null && ia >= 0 && ib >= 0) { const m = S.length, f = (ib - ia + m) % m, r = (ia - ib + m) % m
                const run = f <= r ? Array.from({ length: f }, (_, k) => (ia + k) % m) : Array.from({ length: r }, (_, k) => (ib + k) % m)
                const os = new Set(run.map(j => JSON.stringify(t.ringOwner[j]))); if (run.length && os.size === 1) return t.ringOwner[run[0]] }
              for (let j = 0; j < S.length; j++) if (onSeg(a, S[j], S[(j + 1) % S.length]) && onSeg(b, S[j], S[(j + 1) % S.length])) { const o = t.ringOwner[j]; const k = JSON.stringify(o); if (!got.has(k)) { got.add(k); ow.push(o) } }
              if (!ow.length) for (let j = 0; j < D.length; j++) if (onSeg(a, D[j], D[(j + 1) % D.length]) && onSeg(b, D[j], D[(j + 1) % D.length])) { ow.push({ kind: 'rim' }); break }
              return ow.length === 1 ? ow[0] : null }))
            return { rings, owners } }
          for (const t of protoShapeTiles) {
            const { rings: ring, owners: ringOwners } = cutOwned(t)
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
            // ⭐ THE CIRCLE CUTS THE CURB BY THE CIRCLE ALONE. iA is already its face's (trimmed before the stamp), so a
            // tile wholly inside the disc is not cut at all, and a rim tile's curb is `iA ∩ disc`; each ring of that goes
            // to the piece it lies in (by area, never by nearness). ⛔ Cut by the PIECE, the curb took the piece's face edge
            // wherever the two coincide, and dropped the crossings stamped there (Huron tile 24, PTown tile 1).
            // ⛔ `iaFull`/`iaStamp` still pass through UNCUT, by the design stated above: they answer "what depth HERE",
            // which the cut must not disturb.
            const inside = !differenceRings([t.ring], [stamp]).length
            const curb = inside ? (t.iA || []) : cut(t.iA)
            // ⭐ the crossings the circle minted in the block go into the struck contour too, BEFORE the pieces: every piece's
            // iaFull is the block's, and takes all of them (`shareIntoFull`; minted = in neither the input block nor the stamp)
            if (!inside) { const known = new Set([...(t.iA || []).flat(), ...stamp, ...(t.iaFull || []).flat()].map(keyOf)), pts = []
              for (const r of curb) for (const v of r) { const k = keyOf(v); if (!known.has(k)) { known.add(k); pts.push(v) } }
              sharedIntoFull += pts.length
              Object.assign(t, shareIntoFull(t, pts, `the circle, tile at ${t.ring[0].map(c => c.toFixed(1)).join(', ')}`)) }
            const mine = ring.map(() => [])
            if (ring.length === 1) mine[0] = curb
            else for (const c of curb) {
              const a = ring.map(r => intersectRings([c], [r]).reduce((u, q) => u + Math.abs(signedArea(q)), 0))
              const best = a.indexOf(Math.max(...a))
              if (!(a[best] > 0)) throw new Error(`[tileGround][PROTO⊙] ⛔ a curb ring of a rim tile lies in none of its ${ring.length} disc pieces (at ${c[0]}). Refusing.`)
              mine[best].push(c) }
            // ⭐ THE INK CELLS ARE CUT BY THE CIRCLE TOO (Zob, 2026-10-26; measured off the frozen cells: Huron 1 shore ring across
            // the disc and 1 wholly outside, PTown 2 across). ⛔ They passed through uncut, so every piece of a rim tile carried the
            // WHOLE block's cells, a shore cell painted past the disc once per piece, and the asphalt's rim crossing on a cell edge
            // was the asphalt's alone (the curb's twin bug, above). Each cell ring is cut by the disc and goes to the piece it lies
            // in, by containment (it overlaps exactly one piece, else refuses); the crossings the cut minted go into the piece's ring (rim edges, shareRimCrossings,
            // which refuses one on no rim edge) and into its block where an edge holds them, so the asphalt and the cell meet at
            // one point on the rim.
            // ⛔ ONLY A RING THAT CROSSES THE DISC IS CUT, AND THE CUT KEEPS COLLINEAR VERTICES (Zob, 2026-10-26): Clipper drops an
            // exactly-collinear vertex by default, which would take the vertices shareWaterRunIntoShore just put on a cell's straight
            // land edge (and ①'s collinear owner changes) while iA keeps them: two vertex sets again. A ring wholly inside goes to
            // its piece as it is; one wholly outside is dropped (counted); one across is cut with ioPreserveCollinear, so the cut adds
            // the rim crossings and removes nothing else.
            const cellsIn = t.inkCells || []
            const cellsOf = ring.map(() => cellsIn.map(c => ({ ...c, rings: [] })))
            if (inside || !cellsIn.length) cellsIn.forEach((c, j) => { cellsOf[0][j] = c })
            else cellsIn.forEach((c, j) => { for (const r0 of c.rings) {
              const out = cutCellRing(r0, stamp); if (!out.length) { cellsOutside++; continue }
              for (const q of out) cellsOf[cellPieceOf(q, ring)][j].rings.push(q) } })
            ring.forEach((r, i) => { if (!inside) { const sh = shareRimCrossings(r, ringOwners[i], mine[i], t.iA || [], stamp); r = sh.ring; ringOwners[i] = sh.owners; rimShared += sh.added }
              let iAi = mine[i]
              const cells = (inside || !cellsIn.length) ? (i === 0 ? cellsIn : []) : cellsOf[i].filter(c => c.rings.length)
              if (!inside && cells.length) { const flat = cells.flatMap(c => c.rings), input = cellsIn.flatMap(c => c.rings)
                const sc = shareRimCrossings(r, ringOwners[i], flat, input, stamp); r = sc.ring; ringOwners[i] = sc.owners; rimShared += sc.added; cellRimShared += sc.added
                const have = new Set(iAi.flat().map(keyOf)), known = new Set([...input.flat(), ...stamp].map(keyOf)), pts = []
                for (const q of flat) for (const v of q) { const k = keyOf(v); if (!known.has(k) && !have.has(k)) { have.add(k); pts.push(v) } }
                if (pts.length) iAi = iAi.map(q => insertOnEdges(q, null, pts, () => true).ring) }
              kept.push({ ...t, ring: r, ringOwner: ringOwners[i], iA: iAi, ...(cells.length ? { inkCells: cells } : { inkCells: undefined }),
              fillets: (t.fillets || []).filter(f => inDisc(f.apex)) }) })
          }
          protoShapeTiles = kept
          console.log(`[tileGround][PROTO⊙] ${rimShared} rim crossing(s) the block's disc cut minted, written into the tile ring (shared, never rounded twice) · ${cellRimShared} of them the ink cells' (cut by the circle too; ${cellsOutside} cell ring(s) wholly outside the disc dropped)`)
          console.log(`[tileGround][PROTO⊙] ${sharedIntoFull} block crossing(s) the face trim and the circle minted, written into the struck contour (iaFull): ② is one ring`)
          console.log(`[tileGround][PROTO⊙] ${sharedIntoRing} block vertex(es) where the block follows the ring (the face trim's and the stamp's crossings there), written into the tile ring`)
          console.log(`[tileGround][PROTO⊙] ${sharedIntoShore} block vertex(es) on a water run (stamp crossings, joins), written into the tile's shore cell (shareWaterRunIntoShore) · ${shoreFar} placed past one rounding off their edge (max ${(shoreFarMax / SCALE * 1000).toFixed(3)} mm)`)
          console.log(`[tileGround][PROTO⊙] stamped the circle LAST, on the finished geometry: ${before} tile(s) → ${kept.length}. Bands are CUT at the rim, never bent to follow it.`)
        } else {
          console.log(`[tileGround][PROTO⊙] ⛔ NO boundary in this pour — the circle was NOT stamped. The artifact is the WHOLE frame; do not read a rim from it.`)
        }
        // ⛔⛔ COUNTED SINCE IT WAS WRITTEN, REPORTED BY NOBODY — and when I first wired this warn I
        // put it in the ② epilogue, which runs BEFORE the runs are built. It printed 0 and I believed
        // it. An instrument that reports a count taken before the count exists is the same defect as
        // no instrument at all, and worse, because it reads as evidence.
        if (protoShortRuns) console.warn(`[tileGround][PROTO②] ⛔ ${protoShortRuns} run(s) of a single vertex were DROPPED — their contour carries NO stamp, so nothing paints there and a handle over it has nothing to drag.`)
        // ⭐⭐ LAND USE PER PIECE, ON THE FINAL CUT. Before the cut a rim block is one tile; after it,
        // several — and each piece of each takes its OWN class (`landUseByPiece`). ⛔ Voting before
        // the cut is what handed every disc piece, and every piece of a split block, one answer.
        // ⭐ The pieces are cut into the evidence the tile was STAMPED with (above, before the circle), so the frozen
        // iA, iaFull and the evidence parts share every crossing.
        for (let n = 0; n < protoShapeTiles.length; n++) {
          const t = protoShapeTiles[n], { fixed, override } = t._luSeed
          if (landEv && !(fixed || override) && !t._evGroups) throw new Error('[tileGround][stamp] ⛔ a tile reached the land-use cut UNSTAMPED — its class boundaries would meet the block off its line. Refusing.')
          const t2 = protoShapeTiles[n] = { ...t, ...landOf(t.iA, { fixed, override, groups: t._evGroups || landEv }), ...(landEv ? { evidenceStamped: true } : {}) }
          delete t2._luSeed; delete t2._evGroups
        }
        // ⛔ EVERY PER-VERTEX ARRAY KEEPS iaFull's SHAPE, RING BY RING. A pass that edits iaFull (the land-use stamp inserts
        // crossings) must carry every array indexed parallel to it, or each vertex after an insertion reads its neighbour's
        // entry: the merge of the cap's owner (iaCap) with the stamp left 335 HPDM vertices heightless and 3 reading another
        // chain's cap (2026-10-17). The arrays are READ OFF THE TILE — its own `ia*` keys holding one array per ring — never
        // listed here, so a parallel array added later is held to the same shape. Refused at the producer, where it is made.
        for (const [n, t] of protoShapeTiles.entries()) { const F = t.iaFull || []
          for (const [key, v] of Object.entries(t)) {
            if (key === 'iaFull' || !/^ia[A-Z]/.test(key) || !Array.isArray(v) || !v.every(r => r == null || Array.isArray(r))) continue
            const bad = v.length !== F.length ? -1 : v.findIndex((r, ri) => r != null && r.length !== F[ri].length)
            if (bad !== -1 || v.length !== F.length) throw new Error(`[tileGround][PROTO⇢artifact] ⛔ tile ${n} (ring at ${t.ring?.[0]?.map(c => c.toFixed(1)).join(', ')}): \`${key}\` ${v.length !== F.length ? `has ${v.length} ring(s), iaFull ${F.length}` : `ring ${bad} has ${v[bad].length} entries, iaFull ${F[bad].length}`} — a pass edited iaFull without carrying it. Refusing.`) } }
        // ⛔ AND `ringOwner` KEEPS THE RING's: one owner per ① ring edge, never null — the road side reads its line from it.
        for (const [n, t] of protoShapeTiles.entries()) { const O = t.ringOwner, at = `tile ${n} (ring at ${t.ring?.[0]?.map(c => c.toFixed(1)).join(', ')})`
          if (!Array.isArray(O) || O.length !== t.ring.length) throw new Error(`[tileGround][PROTO⇢artifact] ⛔ ${at}: \`ringOwner\` has ${O?.length ?? 'no'} entries, ring ${t.ring.length} — a pass edited the ring without carrying its owners. Refusing.`)
          const e = O.findIndex(o => o == null)
          if (e >= 0) throw new Error(`[tileGround][PROTO⇢artifact] ⛔ ${at}: ① edge ${e} (${t.ring[e].map(c => c.toFixed(3)).join(', ')} → ${t.ring[(e + 1) % t.ring.length].map(c => c.toFixed(3)).join(', ')}) has NO OWNER — the road there has no line. Refusing.`) }
        if (landEv) console.log(`[tileGround][stamp] the land-use stamp written into ${stamped} tile(s): ${added} crossing vertex(es) added to iaFull, shared with the evidence parts · the noding by ring (← insertions by origin, ✂ antennas removed): ${Object.entries(byPair).sort().map(([k, n]) => `${k} ${n}`).join(', ') || 'none'} · the evidence's disjointness: ▶ node checks/claims-the-land-is-painted-by-its-evidence.mjs`)
        console.log(`[tileGround][PROTO⇢artifact] ${protoShapeTiles.length} tile(s) produced from ①②③ — this is the SHAPE the consumer will freeze`)
        protoJunctionCensus = protoJxCensus
        if (protoUnlabelled.edges || protoUnlabelled.noOwner) console.warn(`[tileGround][PROTO②] ⛔ ${protoUnlabelled.edges} ② edge(s) took NO ① owner${protoUnlabelled.noOwner ? ` · ${protoUnlabelled.noOwner} name an owner ① does not have` : ''} — no run and no cap, so no height. First at (${protoUnlabelled.at[0]?.p.map(c => c.toFixed(3)).join(', ')}).`)
        {
          const J = protoJxCensus, why = Object.entries(J.why).map(([w, k]) => `${k} ${w}`).join(' · ')
          console.log(`[tileGround][PROTO②] corner legs: ${J.arcs} arc(s) · ${J.junction} JUNCTION (two roads meet: curb cuts + crosswalks) · ${J.bend} BEND (one road: no pad unless authored) · ${J.nostreet || 0} NO STREET (a shore or rim flank: no pad, no cut)`)
          if (J.junctionNoNode) console.warn(`[tileGround][PROTO②] ${J.junctionNoNode} junction corner(s) whose two chains have no frozen shared node — curb cuts stand, their crosswalks go UNPAIRED.`)
          if (J.unknown) console.warn(`[tileGround][PROTO②] ⛔ ${J.unknown} corner(s) have a leg with NO run on the stamp (flanks: ${why}) — pad kept, no curb cut, and NOT a bend. \`capEdge\` = the dead-end mouth class (ROADMAP A0/A10).`)
        }
        if (protoNoCurb) console.warn(`[tileGround][PROTO②] ⛔ ${protoNoCurb} block(s) yielded NO curb ring and have no tile (${protoNoCurbArea.toFixed(0)} m² of ① block area). Their curbs meet, so there is no block between them — RULED CORRECT (\`RIBBONS §1\`) — but the GROUND stays: as ① the producer, it is emitted as owned road pieces beside the ink (\`kind: 'block'\`), or left to the highway where H covers it.`)
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

  // ⭐⭐⭐ ①②③ IS THE PRODUCER OF EVERY LAYER EITHER TOOL DRAWS (`ORIENTATION §3`) — Survey live, and Section and the bake
  // from the frozen artifact, which is `protoShapeTiles` itself. `sectionOpen` consumes a tile that CARRIES ITS BANDS as-is
  // and unions them into exactly these layers. (The pre-① chain shape pass that ran beside this on every build and was
  // then overwritten is deleted, 2026-10-20: cartograph/_archive/BRIEF-retire-the-legacy-shape-pass-LANDED-2026-10-20.md.)
  // ⛔ `highway` is not produced here: grade-separated roads are their own sweeps (H, above), ① carries them as INK, and ②
  // builds no highway curb.
  // ⛔ REFUSES rather than falling back (Layer 0 q2).
  if (!protoShapeTiles?.length) throw new Error('[tileGround] ①②③ produced NO tiles — there is no map to hand back. Refusing.')
  // ⭐⭐⭐ THE CORNER RADIUS IS FROZEN BY THE DATAWALL (Jacob, 2026-09-06): the truth the handle rides is the arc that is
  // DRAWN — ②'s achieved arcs. ⛔ None is a refusal by name, never an empty dial and never another construction's corners.
  if (!protoCornerSet.length) throw new Error('[tileGround][①] ⛔ ② produced NO corner arcs — the corner handles would ride nothing that is drawn. Refusing.')
  const cornerFillets = {}, cornerSet = []
  for (const c of protoCornerSet) { cornerFillets[c.key] = c.fillet; cornerSet.push(c) }
  console.log(`[tileGround][①⇢LIVE] corner truth swapped to ②'s achieved arcs: ${protoCornerSet.length} corner(s); the handle rides the curb that is drawn.`)
  const S = sectionOpen(protoShapeTiles, curbWidth, stripMat, stencil, blockCustoms, null, null, cornerOverrides, { pieces: opts.bandPieces === true, stampedWith: protoBoundaryRing })
  // ⛔ THE BAND PIECES ARE CUT ONLY ON ASK (`opts.bandPieces: true`) — BRIEF-the-ground-stands-on-one-field (Boz, 2026-10-21):
  // the ground reads one height field, so no product path reads a piece; the bake and Survey leave them uncut, and the checks
  // that judge them (`claims-the-bands-are-held-by-their-owners`) ask for them.
  let asphalt = S.asphalt
  const curb = S.curb, sidewalk = S.sidewalk, block = S.block
  let highway = stencil ? intersectRings(Hpoly, [stencil]) : Hpoly
  let bridges = []    // the bridge spans painted over the water: [{ span, street, segOrd, hwy, rings }], `span` its index in ①'s offGradeSpans (`bridgeOverlay`, `highwayBridges`); `hwy` picks its road's paint
  let inkShore = []   // ①'s coast piece, the land's shore surface (painted first, below)
  protoBandPieces = S.bandPieces || []
  protoRimRings = S.rimRings || []
  if (S.rimFar?.n) console.warn(`[tileGround][rim] ⚠️ ${S.rimFar.n} rim crossing(s) inserted farther off the tile ring's rim edge than one rounding (√2/2 grid step), the farthest ${(S.rimFar.max * 1000).toFixed(3)} mm, in ${S.rimFar.tiles.length} tile(s): ${S.rimFar.tiles.slice(0, 8).join(', ')}${S.rimFar.tiles.length > 8 ? ' …' : ''} — accepted (un-noded they reopen the wedge); CAUSE NOT ESTABLISHED`)
  if (protoBandPieces.length) { const C = { cells: 0, gapOuter: 0, gapInner: 0, gapSeams: 0, goneBothN: 0, noAnchor: 0, noInner: 0, noInnerM2: 0, innerShared: 0, innerSplit: 0, necks: 0, innerUnbounded: 0, onlyOnInner: 0, noOwner: 0, byRectsWide: 0, refused: 0, refusedM2: 0, refusedPerp: 0, refusedPerpM2: 0, perpLegBare: 0, perpLegNoSub: 0, perpLegNoStamp: 0, perpLegNoStrike: 0, perpFaceTags: 0, perpFaceSliverTags: 0 }, gone = [], pairs = {}, BR = {}, BRm = {}, refAt = []
    let n = 0, seams = 0, same = 0
    for (const t of protoBandPieces) { n += t.pieces.length; seams += t.seams.length; same += t.seams.filter(q => q.sameChain).length
      for (const k of Object.keys(C)) C[k] += t.census[k] || 0; gone.push(...t.census.goneBoth.map(g => `tile ${t.tile}: ${g}`))
      for (const [k, v] of Object.entries(t.census.byRects)) { BR[k] = (BR[k] || 0) + v; BRm[k] = (BRm[k] || 0) + t.census.byRectsM2[k] }
      refAt.push(...t.census.refusedAt.map(g => `tile ${t.tile} ${g}`))
      for (const [k, v] of Object.entries(t.census.gapByPair)) pairs[k] = (pairs[k] || 0) + v }
    console.log(`[tileGround][①⇢LIVE] band ground no cell holds alone (${C.necks} neck transition(s) · ${C.noInner} island(s), ${C.noInnerM2.toFixed(0)} m² of ring · and where cells overlap), given by the inner level's own rects (\`offsetRingByRects\`' clips): ${Object.keys(BR).sort().map(k => `${k} ${BR[k]} piece(s) ${BRm[k].toFixed(1)} m²`).join(' · ') || 'none'}${C.byRectsWide ? ` · ⛔ ${C.byRectsWide} too wide to arrange (more than 12 spans)` : ''} · perpendicular faces tagged to the records that built them: ${C.perpFaceTags} tag(s), ${C.perpFaceSliverTags} on a sliver of a grown rect only`)
    // ⛔ NAMED, NOT STOPPING: no height reader consumes the band pieces (the ground reads one field). When a reader lands, this throws.
    if (C.refused || C.byRectsWide) console.warn(`[tileGround][①⇢LIVE] ⛔ band pieces: ${C.refused} region(s), ${C.refusedM2.toFixed(3)} m², in no span's rect and no single join — NO OWNER (named, not stopping: nothing reads the pieces)${C.refusedPerp ? `, ${C.refusedPerp} of them (${C.refusedPerpM2.toFixed(3)} m²) a perpendicular corner's own ground (an extension, cut or pad) that its builder's rect does not reach` : ''}: ${refAt.slice(0, 6).join(' · ')}${refAt.length > 6 ? ` … +${refAt.length - 6}` : ''}`)
    const top = Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ×${v}`).join(' · ')
    console.log(`[tileGround][①⇢LIVE] the bands cut by their owners: ${n} piece(s) from ${C.cells} cell(s) · ${seams} seam(s) (${seams - same} where the owner changes · ${same} on one chain) · unmatched runs between two matches, their ground left to the rects: ${C.gapOuter} outer (top pairs of a span with no width on the inner side ${top || '—'}) · ${C.gapInner} inner · ${C.gapSeams} match(es) with no seam to the next, a gap between`)
    // a perpendicular leg that builds no extension is counted, never skipped silently: a bare (highway) edge has no walk to run
    // on; no densified sub-edge or no stamp run is a leg the corner could not build from
    if (C.perpLegBare || C.perpLegNoSub || C.perpLegNoStamp || C.perpLegNoStrike) console.warn(`[tileGround][①⇢LIVE] perpendicular legs with no owned extension: ${C.perpLegBare} bare (no walk) · ${C.perpLegNoSub} with no densified sub-edge · ${C.perpLegNoStamp} with no stamp run (its ground refused) · ${C.perpLegNoStrike} whose end edge struck no line to carry`)
    if (C.goneBothN) console.log(`[tileGround][①⇢LIVE] ${C.goneBothN} span(s) with no width on either side of a band — no piece there; the ground is the neighbours' (Boz, 2026-10-18): ${gone.slice(0, 6).join(' · ')}${gone.length > 6 ? ` … +${gone.length - 6}` : ''}`)
    if (C.noAnchor || C.noInner || C.innerShared || C.innerUnbounded || C.noOwner) console.warn(`[tileGround][①⇢LIVE] ⛔ band pieces: ${C.noAnchor} ring(s) with no span carried once on both levels to align from · ${C.noInner} outer ring(s) with no inner ring to align with (their runs are not closed) · ${C.innerShared} inner ring(s) aligned to two outer rings · ${C.innerUnbounded} inner ring(s) aligned to none · ${C.onlyOnInner} span(s) only on the inner side · ${C.noOwner} piece(s) whose span has no stamp run (no owner) — counted; ▶ checks/claims-the-bands-are-held-by-their-owners.mjs`)
  }
  // ⭐⭐ THE INK IS THE TILES' OWN (BRIEF-the-ink-is-owned-by-its-labels §3, 2026-10-25). ① has area — a 2ε band over every
  // chain — and until now nothing owned it: it was re-stroked as quads and resolved by overlap (`inkByOwner` /
  // `inkPiecesByOwner`, DELETED with this, and the second union of ① with them). It is absorbed at the mint's exit into the
  // face that owns each piece of it (absorbInk.js), so every tile's ring runs to the centreline and the band from it to ②
  // is the tile's: asphalt, or its shore where a water edge owns it, or the highway's where a highway edge does (left to H).
  // ⛔ The coast's water side joins the water (Jacob: "yes, coast slit joins the water") and is no tile's.
  if (!protoInk?.rings?.length) throw new Error('[tileGround][①⇢LIVE] ① is the producer but carries no ink rings — refusing to paint the bands without the piece they close against.')
  {
    const inStencil = (r) => (stencil && stencil.length >= 3) ? intersectRings(r, [stencil]) : r
    inkShore = S.shore || []
    protoInkPieces = []      // the curbless blocks' ground (below): the only owned road pieces outside a tile
    // ⭐ AND THE CURBLESS BLOCKS' GROUND, as road pieces beside the ink: the block minus its holes, minus H (a block under
    // the highway corridor is the HIGHWAY's ground, painted by it — Boz, 2026-10-17), in the stencil. Painted as asphalt.
    // ⛔ AND MINUS THE TILES: a tile's ring carries no holes, so a curbless block nested in another block's hole is already
    // inside that tile's ring, and its road band paints it (HPDM: a 4.0 m² block in tile 182's band). Outside every tile.
    let nb = 0, nbM2 = 0, underH = 0, nbViaH = 0
    const bbOf = (rs) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const r of rs) for (const [x, z] of r) { if (x < a) a = x; if (z < b) b = z; if (x > c) c = x; if (z > d) d = z } return [a, b, c, d] }
    const tBB = protoShapeTiles.map(t => bbOf([t.ring])), meets = (u, v) => u[0] <= v[2] && v[0] <= u[2] && u[1] <= v[3] && v[1] <= u[3]
    for (const b of protoNoCurbBlocks) {
      const reg = b.holes.length ? differenceRings([b.ring], b.holes) : [b.ring], bb = bbOf([b.ring])
      const cut = [...Hpoly, ...protoShapeTiles.filter((_, i) => meets(tBB[i], bb)).map(t => t.ring)]
      const rings = inStencil(cut.length ? differenceRings(reg, cut) : reg), a = Math.abs(rings.reduce((t, r) => t + signedArea(r), 0))
      if (!rings.length || !(a > 0)) { underH++; continue }
      // an owner is the piece's only if one of its ① edges lies ON the piece's boundary (a point along it within 2 grid units)
      const TOL = 2 / SCALE, sd = (p, a, c) => { const dx = c[0] - a[0], dz = c[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
      const own = new Map()
      for (const e of b.edges) { if (own.has(e.key)) continue
        for (let t = 0.05; t < 1; t += 0.1) { const m = [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t]
          if (rings.some(r => r.some((q, i) => sd(m, q, r[(i + 1) % r.length]) <= TOL))) { own.set(e.key, e.own); break } } }
      // ⭐ A SLIVER THAT TOUCHES ONLY H (Boz, 2026-10-18): no ① edge of its own survives onto it, so it is owned by the
      // block's own HIGHWAY-labelled ① edges — H is those edges stroked to width, so the owner is CARRIED (its height
      // follows the highway rule). Only when the piece meets H; no area threshold. (JH block 859: 0.1 m².)
      let viaH = false
      if (!own.size && Hpoly.length && rings.some(r => r.some(q => Hpoly.some(h => h.some((u, i) => sd(q, u, h[(i + 1) % h.length]) <= TOL)))))
        for (const e of b.edges) if (e.hwy && !own.has(e.key)) { own.set(e.key, e.own); viaH = true }
      if (viaH) nbViaH++
      b.owners = [...own.values()]
      if (!b.owners.length) throw new Error(`[tileGround][①⇢LIVE] ⛔ curbless block ${b.k} has ground outside the highway (${a.toFixed(1)} m²) but none of its ① edges names an owner — that road has no line. Refusing.`)
      protoInkPieces.push({ rings, owners: b.owners, kind: 'block' }); asphalt = unionRings([...asphalt, ...rings]); nb++; nbM2 += a
    }
    // ⭐ THE BRIDGES OVER THE WATER, their own paint (`mat:bridge`, Boz's ruling (iv), 2026-10-27): every recorded span's footprint
    // over ①'s water. A span H sweeps is H's sweep ∩ the water, the piece(s) holding the span's own centreline (by identity of the
    // recorded span), moved OUT of the highway's paint; every other span is `bridgeOverlay`'s. Owned road pieces, by street.
    const nonH = bridgeOverlay(protoSpans, protoWater, (street, side, segOrd) => protoRunMeasure({ skelId: street, side, segOrd })?.pavementHW)
    const viaH = highwayBridges(protoSpans, Hpoly, protoWater)
    // ONE entry for EVERY recorded span (the shore pin matches by `span`, the index in offGradeSpans, and refuses a span with none), its rings in the stencil
    bridges = [...nonH, ...viaH].map(b => ({ ...b, rings: inStencil(b.rings) }))
    for (const b of bridges) protoInkPieces.push({ rings: b.rings, owners: [b.street], kind: 'bridge' })
    if (viaH.length) highway = differenceRings(highway, viaH.flatMap(b => b.rings))
    if (protoSpans.length) console.log(`[tileGround][bridges] ${bridges.length} bridge span(s) painted over the water (mat:bridge): ${nonH.length} at their street's measure, ${viaH.length} H's sweep moved out of the highway's paint: ${bridges.map(b => `${b.street}|${b.segOrd}`).join(' · ') || 'none'}`)
    if (protoNoCurbBlocks.length) console.log(`[tileGround][①⇢LIVE] the curbless blocks' ground: ${nb} road piece(s), ${nbM2.toFixed(1)} m², owned by their ① edges (${nbViaH} touching only H, owned by the block's highway edges) · ${underH} wholly under the highway (its ground) or inside a tile`)
    console.log(`[tileGround][①⇢LIVE] the ink is the tiles' own (absorbed at the mint): shore ${Math.abs(inkShore.reduce((t, r) => t + signedArea(r), 0)).toFixed(1)} m² of land's shore from water-owned edges`)
  }
  const curbCut = S.curbCut || [], cornerArcs = S.cornerArcs || [], curbCutRecs = S.curbCutRecs || [], curbCutTally = S.curbCutTally || null, curbCutContradicted = S.curbCutContradicted || [], curbCutCorners = S.curbCutCorners || [], curbCutRamps = S.curbCutRamps || []
  const crosswalk = S.crosswalk || [], crosswalkPairs = S.crosswalkPairs || [], crosswalkTally = S.crosswalkTally || null
  if (crosswalkTally && crosswalkTally.style && crosswalkTally.style !== 'none') {
    const C = crosswalkTally
    console.log(`[tileGround][crosswalks] ${C.crosswalks} crosswalk(s), square across the street (${C.style}${C.style === 'byCorner' ? ': ' + Object.entries(C.byPaint).map(([k, v]) => `${v} ${k}`).join(' · ') : ''}, from ${C.source}) — ${C.pairs} between two cuts · ${C.farKerbCut} to a T's far-kerb cut · ${C.byEvidence} placed by a recorded crossing${C.evidenceAmbiguous ? ` · ${C.evidenceAmbiguous} with several recorded crossings (cut-centred instead)` : ''}${C.evidenceEndsNotOwned ? ` · ${C.evidenceEndsNotOwned} recorded station whose line misses the kerbs (cut-centred instead)` : ''}`)
    if (C.evidenceApexOutside) console.warn(`[tileGround][crosswalks] ${C.evidenceApexOutside} recorded crossing(s) whose station would leave the corner's cut OUTSIDE its crosswalk — cut-centred instead (item 9): ${C.evidenceApexOutsideAt.slice(0, 12).map(a => `${a.street} (${a.at[0].toFixed(0)}, ${a.at[1].toFixed(0)})`).join(' · ')}${C.evidenceApexOutsideAt.length > 12 ? ` … +${C.evidenceApexOutsideAt.length - 12}` : ''}`)
    if (C.noCurbCut) console.warn(`[tileGround][crosswalks] ⛔ the norm asks for crosswalks but NO curb cut is painted — a crosswalk is served by a cut, so there are none.`)
    if (C.farKerbNone) console.warn(`[tileGround][crosswalks] ${C.farKerbNone} crossing(s) land on a T's far kerb and the norm says farKerb 'none' — no crosswalk drawn.`)
    if (C.farKerbNoDims) console.warn(`[tileGround][crosswalks] ⛔ ${C.farKerbNoDims} far-kerb cut(s) asked for, but the curb-cut norm gives no width/warningDepth — not drawn.`)
    if (C.farKerbStyleAmbiguous) console.warn(`[tileGround][crosswalks] ⛔ ${C.farKerbStyleAmbiguous} far-kerb crosswalk(s) whose near corners disagree on style — not drawn, never picked.`)
    if (C.farCornerNoCut) console.warn(`[tileGround][crosswalks] ${C.farCornerNoCut} crossing(s) whose corner across the street has no cut serving it — no crosswalk drawn.`)
    if (C.styleDisagrees) console.warn(`[tileGround][crosswalks] ⛔ ${C.styleDisagrees} pair(s) whose two corners resolved to DIFFERENT styles — the paint follows the corner, so it is not drawn, never picked.`)
    if (C.noFarKerb) console.warn(`[tileGround][crosswalks] ⛔ ${C.noFarKerb} crossing(s) whose square line meets no kerb owned by the street it crosses — not drawn.`)
    if (C.apexesApart) console.warn(`[tileGround][crosswalks] ⛔ ${C.apexesApart} pair(s) whose two cuts sit further apart along the street than one crosswalk is wide — not drawn, awaiting a ruling: ${C.apartAt.slice(0, 12).map(a => `${a.street} (${a.at[0].toFixed(0)}, ${a.at[1].toFixed(0)}) ${a.gap} m`).join(' · ')}${C.apartAt.length > 12 ? ` … +${C.apartAt.length - 12}` : ''}`)
    if (C.endsNotOwned) console.warn(`[tileGround][crosswalks] ⛔ ${C.endsNotOwned} pair(s) whose centred line does not meet both kerbs of the street it crosses — not drawn.`)
    if (C.noNode) console.warn(`[tileGround][crosswalks] ${C.noNode} cut crossing(s) at a junction whose two chains have no frozen shared node — no crosswalk drawn.`)
    if (C.ambiguous) console.warn(`[tileGround][crosswalks] ⛔ ${C.ambiguous} cut crossing(s) with MORE THAN ONE candidate across the street — not drawn, never picked by nearness.`)
  } else if (crosswalkTally) console.log(`[tileGround][crosswalks] none — the crosswalk norm is 'none', from ${crosswalkTally.source ?? 'nothing frozen'}${crosswalkTally.passed?.length ? ` (${crosswalkTally.passed.join(' · ')})` : ''}`)
  if (curbCutTally) {
    const T = curbCutTally, src = Object.entries(T.bySource || {}).map(([k, v]) => `${v} ${k}`).join(' · ')
    console.log(`[tileGround][curb cuts] ${T.junction || 0} junction corner(s) · ${T.curbCuts || 0} curb cut(s) painted · style from: ${src || 'nothing'}`)
    if (T.perpWedgeLawn || T.perpWedgeConcrete) console.log(`[tileGround][curb cuts] perpendicular corners: ${T.perpWedgeLawn} with a lawn wedge at the apex (both legs carry a tree lawn) · ${T.perpWedgeConcrete} concrete (a leg has none — the whole corner is walk), ${T.perpOneSidedLawn} of them with lawn on one leg only`)
    if (T.perpNoLanding) { const m = curbCutCorners.filter(c => c.noLanding)
      console.warn(`[tileGround][curb cuts] ⛔ ${T.perpNoLanding} perpendicular leg(s) whose walk, carried on straight, never meets the kerb — no landing, no cut there: ${m.slice(0, 12).map(c => `(${c.at[0].toFixed(0)}, ${c.at[1].toFixed(0)})${c.noLanding === 2 ? ' both' : ''}`).join(' · ')}${m.length > 12 ? ` … +${m.length - 12}` : ''}`) }
    if (T.noSource) console.warn(`[tileGround][curb cuts] ⛔ ${T.noSource} corners have no curb-cut source — the curb-cut norm in force is 'none' (its rung is printed at the pour) and nothing authored or recorded places one. Their pads stand; no curb cut is marked.`)
    if (T.noNorm) console.warn(`[tileGround][curb cuts] ⛔ ${T.noNorm} junction corner(s) on tiles poured BEFORE the curb-cut norm was frozen — re-pour.`)
    if (T.noDims) console.warn(`[tileGround][curb cuts] ⛔ ${T.noDims} authored curb cut(s) cannot be drawn: the curb-cut norm in force gives no width/warningDepth (cartograph/data/<scene>/norms.json).`)
    if (T.invalid) console.warn(`[tileGround][curb cuts] ⛔ ${T.invalid} authored curb-cut style(s) are not none/diagonal/perpendicular.`)
    if (T.short) console.warn(`[tileGround][curb cuts] ${T.short} curb cut(s) wider than the arc room they have — drawn at the room there is.`)
    if (T.contradicted) console.warn(`[tileGround][curb cuts] ⛔ ${T.contradicted} corner(s): the NORM IS CONTRADICTED BY PARTIAL EVIDENCE — drawn by the norm; override them in Section if the record is right: ${curbCutContradicted.slice(0, 12).map(c => `(${c.at[0].toFixed(0)}, ${c.at[1].toFixed(0)}) norm ${c.norm}, drops at ${c.drops.join('/')}`).join(' · ')}${curbCutContradicted.length > 12 ? ` … +${curbCutContradicted.length - 12}` : ''}`)
    if (T.unreadable) console.warn(`[tileGround][curb cuts] ${T.unreadable} corner(s) whose recorded cuts are UNREADABLE (one end only, middle and end, or an unlisted kerb kind) — counted, and drawn by the norm.`)
  }
  // ⭐ the road's paint (the centre stripe and the edge lines), struck from the sealed shape — the bake and Survey both read it
  const marksBy = new Map((ribbons?.streets || []).map(s => [s.skelId, s.marks ?? null]))
  if (!ribbons?.markingLook) throw new Error('[tileGround][paint] ⛔ the ribbons carry no paint look (`markingLook`) — this town was poured before the road paint. Re-pour.')
  const roadPaint = roadMarkings({ tiles: protoShapeTiles, centrelines: protoCentrelines, marksOf: (id) => marksBy.get(id), measureOfRun: protoRunMeasure, look: ribbons.markingLook })
  const treelawnByLu = { ...S.treelawnByLu }, luByClass = { ...S.luByClass }
  console.log(`[tileGround][①⇢LIVE] every layer Survey draws is now ①②③ through sectionOpen: ${protoShapeTiles.length} tile(s) — asphalt ${asphalt.length} · curb ${curb.length} · sidewalk ${sidewalk.length} · block ${block.length} ring(s) · LU classes ${Object.keys(luByClass).join(', ') || 'none'}. Highway stays a flat stroke.`)
  // ⛔⛔ THE MEDIAN CLASS CANNOT APPEAR, AND THAT MUST BE SAID OUT LOUD. ③ carries no median or
  // loop concept (`LOOP-STREETS §2/§4`); the retired chain carve existed largely FOR those, and a
  // town whose chain path produced a `median` land use produces none here — LS: 20,362 m² → 0.
  // ⭐ A land-use key no entry consumes "drops silently from the slab — that is exactly how the
  // divided median vanished" (`bake-ground.js` PAINT_ORDER). It is not going to vanish silently
  // twice: this is a KNOWN GAP in ③, disclosed per pour, not a fallback and not a fix.
  if (!luByClass.median) console.warn(`[tileGround][①⇢LIVE] ⛔ NO 'median' land use in this pour — ③ carries no median or loop concept. If this town has divided roads, their medians are classed as something else. KNOWN GAP, not a silent success.`)
  // ⭐ `protoBandsByBlock` — WHICH BLOCK each band ring belongs to, keyed by ① block index. It was
  // computed (`:7297`) and never returned, so a probe could see the band rings and not say WHOSE
  // they were: "this map has 183 hairline rings" was answerable, "they are on the medians" was not.
  // ⛔ Identity, not geometry — the same rings `protoBands` already hands back, addressed. Returned
  // 2026-09-08 for the hairline attribution; nothing is recomputed and nothing moves.
  return { roadPaint, protoBoundaryRing, protoRimRings, asphalt, inkShore, highway, bridges, hwyDisclosure, curb, sidewalk, proto, protoLabels, protoRefused, protoCurb, protoCurbGs, protoBands, protoBandsByBlock, protoBlockLabels: protoBlockLabelsOut, protoStackCollapse, protoSource, protoOwners, protoAuthoring, protoDepthByBlock, protoShapeTiles, protoUnlabelled, protoEasePairs, protoNoses, protoInkPieces, protoBandPieces, protoJunctionCensus, curbCut, cornerArcs, curbCutRecs, curbCutTally, curbCutContradicted, curbCutCorners, curbCutRamps, crosswalk, crosswalkPairs, crosswalkTally, treelawnByLu, luByClass, block, cornerFillets, cornerSet }
}
