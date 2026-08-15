// SLICE 2 — CAN THE WALK'S FACES BE FED TO tileGround AS TILES? (Wren, 2026-08-14)
//
// ⛔ READ THIS BEFORE WIRING ANYTHING. Two premises of the "get the walk drawing"
// brief are contradicted by the code, and this probe is the evidence for both.
// It builds the adapter and MEASURES it; it wires nothing and writes nothing.
//
//   node scratch/slice2-tile-adapter-probe.mjs [--ribbons=<path>]
//
// ① THE CONTRACT'S `ring` IS A CENTERLINE POLYGON. THE WALK'S IS AN OFFSET ONE.
//    tilesFromFrozen (tileGround.js:1053) hands `tile.ring` to a pipeline that
//    STROKES the asphalt outward from it by the authored half-width:
//      :3926  d = edgeDepth(runMeasure(run), run.side, cw, 'A')   // half-width
//      :3933  aStads.push(...strokeOpen(sp, d))
//      :3937  aFill = intersectRings(unionRings(aStads), [tile.ring])
//      :2553  A = differenceRings([st.ring], iA)   // asphalt = tile − inset curb
//    ⇒ `tile.ring` is the CENTERLINE face; `iA` is it INSET by pavementHW.
//    The walk's face ring is already displaced by pavementHW (substrateWalk §2).
//    Feeding it in double-offsets EVERY block on the map — not 28 of them.
//    ⛔ That is not a degeneracy showing through; it is the whole map wrong.
//
// ② ring.length === edges.length DOES NOT HOLD FOR A WALK FACE. The contract is
//    one edge per ring VERTEX. A walk face carries one edge per HALF-EDGE, each
//    contributing many vertices. The identity is all there — it just has to be
//    EXPANDED per vertex, not renamed. That part is genuinely small.
//
// ⇒ THE ADAPTER THAT DOES WORK (built and measured below): take the walk's
//   CENTERLINE cycle, not its offset ring. A walk face is a cycle of arcs, and
//   an arc is a run of centreline points — which is exactly the species
//   `tile.ring` already is. Identity stays attached by construction: each ring
//   vertex is emitted BY the half-edge that owns it. Nothing is recovered from
//   geometry. ⚠️ Under this adapter the walk contributes TOPOLOGY (which faces
//   exist, which arcs bound them) and the existing width machinery draws it —
//   so the 28 self-intersecting OFFSET faces do not appear in the render. They
//   are a property of the offset polygon, which this adapter does not feed.
import fs from 'fs'
import { loadScene, banner, ARG } from './_substrate-feed.mjs'

const o = console.log; console.log = () => {}
const { walkSubstrate } = await import('../src/lib/substrateWalk.js')
const { BOUNDARY_EDGE_SKEL, tilesFromFrozen } = await import('../src/lib/tileGround.js')
console.log = o

const S = await loadScene('lafayette-square', ARG('ribbons', null))
banner(S, o)

const R = walkSubstrate({
  streets: S.streets, junctionMap: S.ribbons.junctionMap,
  widthAt: S.widthAtSegOrd, outerRing: S.outerRing, orientation: 'a-to-b',
})

// ── THE ADAPTER ──────────────────────────────────────────────────────────────
// A walk face is a cycle of half-edges. Each half-edge owns an arc — a run of
// ORIGINAL centreline points, [i0..i1], traversed forward when side==='right'
// and backward when side==='left'. Emit those points; the vertex that starts
// each ring segment is owned by the half-edge that emitted it.
// ⛔ The shared node between consecutive arcs is emitted ONCE (it is the same
// coordinate from both sides) — a duplicate vertex would break the
// one-edge-per-vertex contract and inject a zero-length edge.
const byId = new Map(S.streets.map(s => [s.skelId, s]))
function adapt(face, streetIdxOf) {
  const ring = [], edges = []
  for (const e of face.edges) {
    const pts = byId.get(e.skelId)?.points
    if (!pts) return { error: `no chain for ${e.skelId}` }
    const seq = e.side === 'right'
      ? pts.slice(e.i0, e.i1 + 1)
      : pts.slice(e.i0, e.i1 + 1).reverse()
    // drop the LAST point of each arc: it is the next arc's first.
    for (let k = 0; k < seq.length - 1; k++) {
      ring.push([seq[k][0], seq[k][1]])
      const forward = e.side === 'right'
      const si = e.skelId === BOUNDARY_EDGE_SKEL ? -1 : streetIdxOf.get(e.skelId)
      if (si === undefined) return { error: `no streetIdx for ${e.skelId}` }
      edges.push({
        streetIdx: si, forward, side: forward ? 'right' : 'left',
        ...(e.skelId === BOUNDARY_EDGE_SKEL ? { boundary: true } : {}),
      })
    }
  }
  return { ring, edges }
}

const streetIdxOf = new Map()
S.streets.forEach((s, i) => { const k = s?.skelId || s?.name; if (k != null && !streetIdxOf.has(k)) streetIdxOf.set(k, i) })

o(`\n═══ THE ADAPTER — does a walk face satisfy the tilesFromFrozen contract? ═══`)
let ok = 0, bad = 0, errs = new Map()
const adapted = []
for (const f of R.faces) {
  const a = adapt(f, streetIdxOf)
  if (a.error) { bad++; errs.set(a.error, (errs.get(a.error) || 0) + 1); adapted.push(null); continue }
  if (a.ring.length !== a.edges.length) { bad++; errs.set('ring.length !== edges.length', (errs.get('ring.length !== edges.length') || 0) + 1); adapted.push(null); continue }
  if (a.ring.length < 3) { bad++; errs.set('ring < 3 vertices', (errs.get('ring < 3 vertices') || 0) + 1); adapted.push(null); continue }
  ok++; adapted.push(a)
}
o(`  walk faces ................... ${R.faces.length}`)
o(`  satisfy the contract ......... ${ok}   (ring.length === edges.length, ≥3 vertices, every skelId resolves)`)
o(`  do NOT ....................... ${bad}`)
for (const [e, n] of errs) o(`     ${n}× ${e}`)
o(`  ⭐ Identity is EMITTED, never recovered: each ring vertex is pushed by the`)
o(`     half-edge that owns it, carrying its (skelId, side) into (streetIdx, forward).`)

// ── ①, MEASURED RATHER THAN ASSERTED ─────────────────────────────────────────
// How far apart are the two rings? If the walk's offset ring were an acceptable
// `tile.ring`, this would be ~0. It is the authored half-width.
o(`\n═══ ① THE DOUBLE-OFFSET, MEASURED ═══`)
{
  const areaOf = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
  const deltas = []
  for (let i = 0; i < R.faces.length; i++) {
    if (!adapted[i]) continue
    const centre = Math.abs(areaOf(adapted[i].ring)), offset = Math.abs(R.faces[i].area)
    if (centre > 1) deltas.push({ centre, offset, ratio: offset / centre })
  }
  deltas.sort((a, b) => a.ratio - b.ratio)
  const med = deltas[Math.floor(deltas.length / 2)]
  o(`  centreline-ring area vs walk offset-ring area, per face (${deltas.length} faces):`)
  o(`     median offset/centreline ratio ... ${med ? med.ratio.toFixed(3) : '—'}`)
  o(`     min ${deltas[0]?.ratio.toFixed(3)} · max ${deltas[deltas.length - 1]?.ratio.toFixed(3)}`)
  o(`  ⛔ The gap between the two rings IS the authored half-width. Handing the`)
  o(`     OFFSET ring to tileGround makes it stroke asphalt from the CURB line and`)
  o(`     inset the curb again from there — every block on the map, not 28.`)
}

// ── ②, THE SPLIT THE BRIEF ASSERTS ───────────────────────────────────────────
// "interior tiles from the walk, rim tiles from frozen — 70 + 31 = 101."
// ⛔ Measured against the artifact, by CONTAINMENT of a robust interior point.
// Never by centroid: an island is a ring, not a convex blob, and the centroid
// rule already misfiled tile #3 once (RIBBONS §1, gate 1).
o(`\n═══ ② THE 70 + 31 SPLIT, CHECKED AGAINST THE ARTIFACT ═══`)
{
  const frozen = S.ribbons.tiles || []
  const rim = frozen.filter(t => (t.edges || []).some(e => e.skelId === BOUNDARY_EDGE_SKEL))
  const interior = frozen.filter(t => !(t.edges || []).some(e => e.skelId === BOUNDARY_EDGE_SKEL))
  o(`  frozen tiles ................. ${frozen.length}`)
  o(`     carrying a __boundary__ edge (RIM) ... ${rim.length}`)
  o(`     interior ............................. ${interior.length}`)
  o(`  walk faces ................... ${R.faces.length}`)
  o(`  ⛔ ${R.faces.length} + ${rim.length} = ${R.faces.length + rim.length}, not ${frozen.length}. The walk does NOT emit`)
  o(`     one face per interior frozen tile — it emits gussets and medians the`)
  o(`     frozen list has no member for (RIBBONS §1: a median is a BLOCK).`)

  const inRing = (p, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) ins = !ins } return ins }
  const bbox = (r) => { let a = 1e18, b = 1e18, c = -1e18, d = -1e18; for (const p of r) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1] } return [a, b, c, d] }
  const dSeg = (p, a, b) => { const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1; let t = ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - (a[0] + ex * t), p[1] - (a[1] + ez * t)) }
  const dRing = (p, r) => { let m = Infinity; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const d = dSeg(p, r[j], r[i]); if (d < m) m = d } return m }
  const interiorPoint = (r) => {
    const [x0, z0, x1, z1] = bbox(r); let best = null, bd = -1, N = 40
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const p = [x0 + (x1 - x0) * i / N, z0 + (z1 - z0) * j / N]
      if (!inRing(p, r)) continue
      const d = dRing(p, r); if (d > bd) { bd = d; best = p }
    }
    return best
  }
  let matched = 0, unmatched = 0, multi = 0
  const claimedBy = new Map()
  const misses = []
  for (const t of interior) {
    const p = interiorPoint(t.ring); if (!p) continue
    const hits = []
    for (let i = 0; i < adapted.length; i++) if (adapted[i] && inRing(p, adapted[i].ring)) hits.push(i)
    if (!hits.length) { unmatched++; misses.push(t) }
    else { matched++; if (hits.length > 1) multi++; for (const h of hits) claimedBy.set(h, (claimedBy.get(h) || 0) + 1) }
  }
  o(`\n  interior frozen tiles whose interior point lands in a walk face:`)
  o(`     matched ...... ${matched} of ${interior.length}`)
  o(`     unmatched .... ${unmatched}   ⛔ no walk face covers these`)
  o(`     covered by >1 walk face ... ${multi}`)
  o(`  walk faces claiming ≥1 interior frozen tile ... ${claimedBy.size} of ${ok}`)
  o(`  walk faces claiming NONE ...................... ${ok - claimedBy.size}   (gussets/medians/rim-side faces)`)
  // ⭐ NAME THEM. A ruling needs the objects, not the counts.
  const areaOf = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }
  const extras = []
  for (let i = 0; i < adapted.length; i++) if (adapted[i] && !claimedBy.has(i)) extras.push({ i, a: Math.abs(areaOf(adapted[i].ring)), owners: R.faces[i].owners, deg: R.faces[i].degenerate })
  const rimFaces = new Set()
  // ⭐⭐ ARE THE EXTRAS THE RIM TILES THAT CLOSE ON REAL STREETS ALONE?
  // RIBBONS §1 (Tessel, 2026-08-12, scratch/phase0-unclipped-close.mjs): "of the
  // tiles that today carry a __boundary__ edge, the number that close on real
  // streets alone is LS 14/31". If these extras are those tiles, two independent
  // instruments agree and the split is not 70/31 at all.
  {
    let rimHit = 0, rimMiss = 0
    const hitFaces = rimFaces
    for (const t of rim) {
      const p = interiorPoint(t.ring); if (!p) continue
      let found = -1
      for (let i = 0; i < adapted.length; i++) if (adapted[i] && inRing(p, adapted[i].ring)) { found = i; break }
      if (found >= 0) { rimHit++; hitFaces.add(found) } else rimMiss++
    }
    o(`\n  RIM tiles (${rim.length}) whose interior point lands in a walk face: ${rimHit} · not covered: ${rimMiss}`)
    o(`     covered by ${hitFaces.size} distinct walk face(s); ${[...hitFaces].filter(i => !claimedBy.has(i)).length} of them are among the ${extras.length} "extras"`)
    o(`  ⭐ RIBBONS §1 records LS 14 of 31 rim tiles closing on real streets alone`)
    o(`     (phase0-unclipped-close.mjs, a DIFFERENT instrument — extractFaces, not`)
    o(`     this walk). Compare the two numbers above before quoting either.`)
  }
  o(`\n  the ${extras.length} walk face(s) with NO frozen INTERIOR counterpart, by centreline area:`)
  for (const e of extras.sort((a, b) => b.a - a.a)) {
    const tag = rimFaces.has(e.i) ? 'RIM tile (the walk closes it)' : '⭐ NO frozen counterpart AT ALL'
    o(`     ${e.a.toFixed(0).padStart(9)} m²  ${e.deg ? 'DEGENERATE ' : '           '}${tag.padEnd(30)} ${e.owners.slice(0, 3).join(' · ')}${e.owners.length > 3 ? ` … +${e.owners.length - 3}` : ''}`)
  }
  for (const t of misses) {
    const sk = [...new Set((t.edges || []).map(e => e.skelId))]
    o(`  the interior frozen tile NO walk face covers: ${Math.abs(areaOf(t.ring)).toFixed(0)} m², bounded by ${sk.slice(0, 5).join(' · ')}`)
  }
  o(`  ⛔ A disjoint-and-total assertion of "walk interior + frozen rim = 101"`)
  o(`     therefore FAILS as written. What the split needs is a RULING on what a`)
  o(`     walk face that has no frozen counterpart IS — and that is exactly the`)
  o(`     median-is-a-block question. Not mine to decide in an adapter.`)
}

o(`\n═══ WHAT IS SAFE TO SAY ═══`)
o(`  · The adapter is small and it works — on the CENTRELINE ring (${ok}/${R.faces.length} faces).`)
o(`  · Feeding the OFFSET ring is not "28 faces look wrong"; it is every block wrong.`)
o(`  · The interior split is not 70/31 and cannot be asserted disjoint-and-total`)
o(`    without ruling what an unmatched walk face is.`)
o(`  ⛔ Nothing was wired. tileGround.js is untouched. No flag was added.`)
