// SLICE 2 — THE SUBSTRATE WALK. Flag-gated, default OFF, additive only.
//
// RIBBONS §1, RULED 2026-08-12 + the lanes-are-primitive ruling 2026-08-13:
//   "blocks = boundary − stroked roads — but computed as a DIRECTED HALF-EDGE
//    WALK over identity-carrying side-chains, never as an anonymous boolean."
//   "A street IS two directed lane-chains, always — opposite directions, each
//    owning exactly one side and emitting only to its right, joined at every
//    node by a coupler. The datum is the left EDGE of the right lane."
//
// WHY A WALK AND NOT THE BOOLEAN (the whole point, and it is measured):
//   A union cannot represent overlap as anything but ABSENCE. Two carriageways
//   whose strokes overlap merge into one blob and the land between them ceases
//   to exist — no ring, no warning. Measured: the punch-out ERASES 6 of 30
//   isMedian tiles. A walk emits the face between two directed side-chains
//   WHETHER OR NOT THEY CROSS; if authored widths push them past each other the
//   face comes out self-intersecting or negative-area, and that is reported
//   LOUD at the named (skelId, side) pair.
//
// ⛔ THE THINGS THIS FILE MAY NOT CONTAIN, and does not:
//   · NO smoother, simplifier, snap or CLAMP. RIBBONS §1, RULED 2026-08-13:
//     "smoothness is achieved by construction, never by cleanup" — a guard that
//     fires when a construction degenerates and substitutes something plausible
//     is a cleanup patch living inside the construction. Degeneracies here are
//     REPORTED, never repaired and never deleted.
//   · NO identity recovered from ring geometry. Every ring edge carries the
//     (skelId, side, arcIdx) of the half-edge that produced it, by construction.
//   · NO reach into neighborhood_boundary.json. The outer ring arrives as an
//     ARGUMENT. The rim BOUNDS, it does not own: no coupler, no measure, no band.
//   · NO fallback. A missing successor is a named failure, not a guess.
//
// ⚠️ WHAT THIS DOES NOT DO YET — stated so a caller cannot mistake it for done:
//   · WIDTHS ARE THE CALLER'S. Half-width arrives through `widthAt`, and this
//     file still contains NO width resolution of its own — a second widths
//     mechanism next to buildBlockGeometryV2's resolveSide / tileGround's
//     feWidthAt is exactly the parallel-mechanism anti-pattern. What changed
//     2026-08-14: `widthAt` is now handed the ARC (`{arcIdx, i0, i1}`) as well
//     as the vertex, because the producer resolves a custom per RUN — a span
//     with a lower original-index boundary (`tileGround.js:2739 runSegOrd`) —
//     and a bare vertex index cannot express that. The walk supplies the span;
//     the caller still owns the resolution.
//   · THE RIM. Measured 2026-08-12 (Tessel): a walk over the street graph does
//     not close the perimeter — on LS only 14 of 31 rim tiles close on real
//     streets alone. That is WHY the boundary is a stencil. Perimeter faces are
//     therefore NOT produced here; they are counted and reported as an open
//     class. ⛔ Inventing a rim coupler to close them would make the rim a
//     side-chain, which the 2026-08-12 retraction forbids.

export const SUBSTRATE_WALK_DEFAULT = false

const VKEY = (p) => p[0].toFixed(3) + ',' + p[1].toFixed(3)

// measure-RIGHT is (-dz, dx) of the point-order tangent — the convention pinned
// at innerSideSign and used by derive.js `rightDir` and buildBlockGeometryV2
// `computePerps` alike. Kept identical on purpose; a second perp convention here
// would silently mirror every face.
function perpsOf(pts) {
  const n = pts.length
  const out = []
  const degenerate = []
  for (let i = 0; i < n; i++) {
    let nx = 0, nz = 0
    if (i < n - 1) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1]
      const l = Math.hypot(dx, dz)
      if (l > 1e-9) { nx -= dz / l; nz += dx / l }
    }
    if (i > 0) {
      const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1]
      const l = Math.hypot(dx, dz)
      if (l > 1e-9) { nx -= dz / l; nz += dx / l }
    }
    const l = Math.hypot(nx, nz)
    // ⛔ NO FALLBACK. buildBlockGeometryV2:110 returns a CONSTANT [0,1] here.
    // That is a silent substitution in the offset primitive; under this file's
    // rules it is a named failure instead. It fires 0 times on all six scenes
    // today — which is precisely why it must not be allowed to fire quietly.
    if (l < 1e-9) { degenerate.push(i); out.push(null); continue }
    out.push([nx / l, nz / l])
  }
  return { perps: out, degenerate }
}

const signedArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a / 2 }

function segCross(a, b, c, d) {
  const rX = b[0] - a[0], rZ = b[1] - a[1], sX = d[0] - c[0], sZ = d[1] - c[1]
  const den = rX * sZ - rZ * sX
  if (Math.abs(den) < 1e-12) return false
  const t = ((c[0] - a[0]) * sZ - (c[1] - a[1]) * sX) / den
  const u = ((c[0] - a[0]) * rZ - (c[1] - a[1]) * rX) / den
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9
}
function selfCrossings(poly, closed) {
  const n = poly.length
  const lim = closed ? n : n - 1
  let count = 0
  for (let i = 0; i < lim; i++) {
    for (let j = i + 2; j < lim; j++) {
      if (closed && i === 0 && j === lim - 1) continue
      if (segCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) count++
    }
  }
  return count
}

// A "dir" in junctionMap.cornersAdjacent is a RAY LEAVING the node along a chain.
//   end 'start'          → leaves forward from index 0            (alongPO true)
//   end 'end'            → leaves backward from the last index    (alongPO false)
//   end 'through' fwd    → leaves forward from an interior vertex (alongPO true)
//   end 'through' back   → leaves backward from an interior vertex(alongPO false)
// The emitter writes a.side = alongPO ? 'right' : 'left' and, for the OTHER
// member of the pair, b.side = alongPO ? 'left' : 'right' — opposite conventions,
// because the wedge runs CCW from a to b and each member faces it with a
// different side. Both are reproduced here rather than normalised, so this file
// cannot drift from derive.js:4381-4384.
const dirKey = (d) => `${d.chain}|${d.end}|${d.half || '-'}`
const alongPO = (d) => d.end === 'start' || (d.end === 'through' && d.half === 'fwd')

/**
 * @param streets      ribbons.streets — REQUIRED to be the caller's already
 *                     filtered set (grade-sep excluded etc). Not filtered here.
 * @param junctionMap  ribbons.junctionMap — supplies cornersAdjacent, the
 *                     width-INDEPENDENT coupler relation frozen at prebake.
 * @param widthAt      (skelId, side, vertexIndex, arc) => metres, where `arc` is
 *                     `{arcIdx, i0, i1}` in ORIGINAL point indices. The caller
 *                     owns width resolution; see the header.
 * @param outerRing    the stencil, AS AN ARGUMENT. Used only to classify which
 *                     faces are perimeter; never reached for, never painted.
 * @param orientation  'a-to-b' | 'b-to-a' — which member of a coupler pair is
 *                     the successor. Determined by measurement, not guessed;
 *                     the probe reports which one closes faces.
 */
export function walkSubstrate({ streets, junctionMap, widthAt, outerRing = null, orientation = 'a-to-b' }) {
  const failures = []
  const fail = (kind, skelId, side, detail, extra = {}) => failures.push({ kind, skelId, side, detail, ...extra })

  const nodes = new Map()
  for (const n of junctionMap?.nodes || []) nodes.set(n.key || VKEY(n.at), n)

  // ── 1. ARCS. Split each chain at every vertex that is a junction node.
  const arcs = []
  for (const s of streets) {
    const pts = s.points
    if (!pts || pts.length < 2) continue
    const cuts = [0]
    for (let i = 1; i < pts.length - 1; i++) if (nodes.has(VKEY(pts[i]))) cuts.push(i)
    cuts.push(pts.length - 1)
    for (let c = 0; c + 1 < cuts.length; c++) {
      const a = cuts[c], b = cuts[c + 1]
      if (b <= a) continue
      arcs.push({ skelId: s.skelId, arcIdx: c, i0: a, i1: b, pts: pts.slice(a, b + 1), street: s })
    }
  }

  // ── 2. HALF-EDGES. Two per arc: one per side, each traversing so that the
  // side it owns is on its RIGHT. Identity is attached HERE and never re-derived.
  const halves = new Map()
  // ⛔⛔ THE HALF-EDGES THAT NEVER GOT BUILT, KEPT AS THEIR OWN POPULATION.
  // Every arc owes exactly two. When one cannot be constructed it is not
  // "unclaimed" — it is ABSENT, and it silently shrinks the denominator any
  // coverage figure is measured against. That is a completeness check reporting
  // a better number BECAUSE something failed, which is the one thing a detector
  // must never do. Named here so the caller can measure against `arcs × 2`.
  const unbuilt = []
  for (const arc of arcs) {
    for (const side of ['right', 'left']) {
      // side 'right' runs along point order; side 'left' runs against it.
      const walkPts = side === 'right' ? arc.pts : arc.pts.slice().reverse()
      const { perps, degenerate } = perpsOf(walkPts)
      if (degenerate.length) {
        fail('perp-collapse', arc.skelId, side,
          `the point-order tangent vanishes at ${degenerate.length} vertex/vertices — a duplicated centreline vertex. buildBlockGeometryV2:110 substitutes a constant [0,1] here; this reports instead.`,
          { arcIdx: arc.arcIdx, vertices: degenerate })
        unbuilt.push({ skelId: arc.skelId, side, arcIdx: arc.arcIdx, reason: 'perp-collapse' })
        continue
      }
      const span = { arcIdx: arc.arcIdx, i0: arc.i0, i1: arc.i1 }
      const geom = walkPts.map((p, i) => {
        const hw = widthAt(arc.skelId, side, side === 'right' ? arc.i0 + i : arc.i1 - i, span)
        if (!Number.isFinite(hw)) {
          fail('no-width', arc.skelId, side, `widthAt returned ${hw}`, { arcIdx: arc.arcIdx })
          return null
        }
        return [p[0] + perps[i][0] * hw, p[1] + perps[i][1] * hw]
      })
      if (geom.some(g => !g)) { unbuilt.push({ skelId: arc.skelId, side, arcIdx: arc.arcIdx, reason: 'no-width' }); continue }

      // ⛔ NAMED SEPARATELY, AND ON PURPOSE. A one-sided offset that crosses
      // itself is an OFFSET CUSP — the centreline turns tighter than the
      // authored half-width, or carries a duplicated vertex. Measured on LS
      // BEFORE this walk existed: 20 of 152 chains, 16 of the 20 from
      // duplicated vertices. unionRings swallows these today. They are a
      // SKELETON defect surfacing here, NOT the walk failing, and they get
      // their own kind so nobody reads them as one.
      const x = selfCrossings(geom, false)
      if (x) fail('offset-cusp', arc.skelId, side, `the one-sided offset crosses itself ${x}x at half-width — upstream centreline defect, not a walk failure`, { arcIdx: arc.arcIdx, crossings: x })

      const key = `${arc.skelId}|${arc.arcIdx}|${side}`
      halves.set(key, {
        key, skelId: arc.skelId, side, arcIdx: arc.arcIdx, geom,
        fromKey: VKEY(walkPts[0]), toKey: VKEY(walkPts[walkPts.length - 1]),
        street: arc.street, i0: arc.i0, i1: arc.i1,
      })
    }
  }

  // ── 3. SUCCESSOR. Index half-edges by (node they leave, chain, direction).
  // A half-edge LEAVING node N on chain C is aligned with point order iff its
  // side is 'right'. That is exactly a coupler dir's alongPO, so a dir resolves
  // to a departing half-edge without any geometric search.
  const leaving = new Map()   // `${nodeKey}|${chain}|${alongPO}` -> half-edge
  for (const h of halves.values()) leaving.set(`${h.fromKey}|${h.skelId}|${h.side === 'right'}`, h)

  const succ = new Map()
  const unresolved = { both: 0, noInbound: 0, noOutbound: 0, alreadyClaimed: 0, chains: new Set() }
  let pairs = 0
  for (const [nodeKey, n] of nodes) {
    for (const pair of n.cornersAdjacent || []) {
      pairs++
      const [from, to] = orientation === 'a-to-b' ? [pair.a, pair.b] : [pair.b, pair.a]
      // The INBOUND half-edge is the one ARRIVING at N along `from`'s chain from
      // the opposite direction to `from`'s ray. `from` leaves N with alongPO(from);
      // the half-edge arriving at N along that chain therefore departed the far
      // node with the OPPOSITE alignment.
      const inKey = `${nodeKey}|${from.chain}|${!alongPO(from)}`
      const outKey = `${nodeKey}|${to.chain}|${alongPO(to)}`
      const inbound = [...halves.values()].find(h => h.toKey === nodeKey && h.skelId === from.chain && (h.side === 'right') === !alongPO(from))
      const outbound = leaving.get(outKey)
      // ATTRIBUTE, don't just drop. A coupler pair that cannot be resolved to two
      // half-edges is a fact about WHICH side is missing, and that distinction is
      // the difference between a graph hole and a dropped arc.
      if (!inbound && !outbound) { unresolved.both++; continue }
      if (!inbound) { unresolved.noInbound++; unresolved.chains.add(from.chain); continue }
      if (!outbound) { unresolved.noOutbound++; unresolved.chains.add(to.chain); continue }
      if (succ.has(inbound.key)) { unresolved.alreadyClaimed++; continue }
      succ.set(inbound.key, outbound.key)
      void inKey
    }
  }

  // ── 4. WALK. Follow successors from every unvisited half-edge.
  const seen = new Set()
  const faces = []
  const runs = []          // ⭐ EVERY run, closed or not, with WHY it ended.
  let openRuns = 0
  for (const start of halves.values()) {
    if (seen.has(start.key)) continue
    const chain = []
    let cur = start
    let closed = false
    // ⭐⭐ THE TERMINATOR. An unclaimed half-edge is never unclaimed on its own
    // account — it is unclaimed because the RUN it belongs to did not close, and
    // a run ends for exactly one reason. Recording that reason here is what lets
    // a caller partition the unclaimed population into CLASSES instead of
    // counting it. ⛔ Recorded, never acted on: the walk still does not repair.
    let terminator = { kind: 'guard-exhausted' }
    for (let guard = 0; guard < halves.size + 2; guard++) {
      if (seen.has(cur.key)) {
        terminator = { kind: 'successor-already-consumed', at: cur.key, node: cur.fromKey }
        break
      }
      seen.add(cur.key)
      chain.push(cur)
      const nx = succ.get(cur.key)
      if (!nx) {
        // ⛔ LOUD. No successor means the coupler relation has a hole at this
        // node, or the node does not exist at all — a vertex on a curbed chain
        // that no junction node covers. Not a fallback, not a guess. ⛔ The size
        // of that population is a property of the POUR, so it is counted by the
        // probe and never written down here.
        const nd = nodes.get(cur.toKey)
        const reason = !nd ? 'NO JUNCTION NODE EXISTS at this vertex — the coupler relation cannot be total over a node that does not exist'
          : !(nd.cornersAdjacent || []).length ? 'the node exists but carries NO cornersAdjacent'
            : 'the node carries couplers but none resolves to this inbound half-edge (its partner arc may have been dropped upstream)'
        fail('no-successor', cur.skelId, cur.side,
          `arrives at node ${cur.toKey}: ${reason}`,
          { arcIdx: cur.arcIdx, node: cur.toKey, reason: !nd ? 'no-node' : !(nd.cornersAdjacent || []).length ? 'no-couplers' : 'unmatched' })
        terminator = { kind: 'no-successor', node: cur.toKey, reason: !nd ? 'no-node' : !(nd.cornersAdjacent || []).length ? 'no-couplers' : 'unmatched', at: cur.key }
        break
      }
      if (nx === start.key) { closed = true; terminator = { kind: 'closed' }; break }
      cur = halves.get(nx)
      if (!cur) { terminator = { kind: 'successor-missing', at: nx }; break }
    }
    const memberKeys = chain.map(h => h.key)
    if (!closed) { openRuns++; runs.push({ closed: false, memberKeys, terminator }); continue }

    const ring = []
    const edges = []
    for (const h of chain) {
      for (const p of h.geom) ring.push(p)
      // IDENTITY, CARRIED. Every ring edge knows its owner because the
      // half-edge that emitted it did — nothing is recovered afterward.
      edges.push({ key: h.key, skelId: h.skelId, side: h.side, arcIdx: h.arcIdx, i0: h.i0, i1: h.i1, verts: h.geom.length })
    }
    // ⛔ A run that CLOSES but carries fewer than 3 ring vertices emits no face,
    // so its half-edges end up unclaimed while nothing in the failure list says
    // so. Named, so that silence cannot be mistaken for coverage.
    if (ring.length < 3) {
      fail('closed-run-too-short', chain[0].skelId, chain[0].side,
        `the run closes but its ring carries only ${ring.length} vertices — no face is emitted and its ${chain.length} half-edge(s) are left unclaimed`,
        { arcIdx: chain[0].arcIdx, members: chain.length })
      runs.push({ closed: true, memberKeys, terminator: { kind: 'closed-run-too-short' }, faceIdx: null })
      continue
    }
    const A = signedArea(ring)
    const owners = [...new Set(chain.map(h => `${h.skelId}|${h.side}`))]
    // ⛔ EMIT THE BAD FACE. Do not delete it, do not repair it. Silently erasing
    // the land between two carriageways is the exact defect the walk exists to
    // fix; a self-intersecting face is the walk DOING ITS JOB and saying so.
    if (A <= 0) fail('negative-area-face', chain[0].skelId, chain[0].side,
      `face closes with signed area ${A.toFixed(2)} m² — the side-chains bounding it have crossed`, { owners, area: A })
    const sx = selfCrossings(ring, true)
    if (sx) fail('self-intersecting-face', chain[0].skelId, chain[0].side,
      `face self-intersects ${sx}x — authored widths push these side-chains past each other`, { owners, crossings: sx })

    const onRim = outerRing ? chain.some(h => h.skelId === '__boundary__') : false
    // ⛔ The two degeneracies are kept SEPARATE on the face, never summed into
    // one flag alone: a negative area is WINDING (the signature of a traversal
    // enumerating the complementary faces) while selfCrossings is
    // winding-agnostic. Collapsing them scores a gusset walk as a bad block walk.
    runs.push({ closed: true, memberKeys, terminator, faceIdx: faces.length })
    faces.push({ ring, edges, area: A, owners, selfIntersections: sx, degenerate: A <= 0 || sx > 0, onRim })
  }

  return {
    faces, failures, runs,
    // The half-edge UNIVERSE, so a caller can check coverage against what was
    // actually built rather than against a tile list from another producer.
    halfEdges: [...halves.values()].map(h => ({ key: h.key, skelId: h.skelId, side: h.side, arcIdx: h.arcIdx, i0: h.i0, i1: h.i1, fromKey: h.fromKey, toKey: h.toKey })),
    // The successor relation itself. ⛔ Exposed so a caller can attribute an
    // unclaimed half-edge to the terminal event DOWNSTREAM of it rather than
    // re-deriving the relation — a second copy of the coupler resolution is the
    // parallel-mechanism anti-pattern the header forbids for widths.
    successors: [...succ.entries()],
    unbuilt,
    stats: {
      chains: streets.length, arcs: arcs.length,
      halfEdgesExpected: arcs.length * 2, halfEdges: halves.size, halfEdgesUnbuilt: unbuilt.length,
      couplerPairs: pairs, withSuccessor: succ.size,
      pairsUnresolvedBoth: unresolved.both, pairsNoInbound: unresolved.noInbound,
      pairsNoOutbound: unresolved.noOutbound, pairsAlreadyClaimed: unresolved.alreadyClaimed,
      faces: faces.length, openRuns,
      degenerateFaces: faces.filter(f => f.degenerate).length,
    },
  }
}

/**
 * ⭐⭐ THE COMPLETENESS INVARIANT — the walk's own guard, and the acceptance.
 *
 * A directed half-edge walk is a PARTITION or it is nothing. The invariant:
 *   **every half-edge is claimed by exactly one face in each traversal.**
 *   · UNCLAIMED (0 in a traversal) = a HOLE — that arc bounds nothing.
 *   · MULTI-CLAIMED (>1 in one traversal) = an OVERLAP — two faces over one arc.
 *   · A face produced by BOTH traversals = the two face sets do not complement;
 *     the same region is being counted as block and as gusset at once.
 *
 * ⛔ WHY THIS REPLACES "84 of 101". A complete partition measured against a
 * BLOCK-ONLY tile list was never a comparison: the walk emits gussets and
 * medians the tile list has no member for, so a shortfall could mean a hole in
 * the walk or a face the comparand cannot name, and the number could not tell
 * you which. This checks the walk against ITSELF — the universe is the
 * half-edges the walk built, so town #2 needs no reference map to be checked.
 *
 * ⛔ Nothing is repaired, nothing is excluded. Every failure is returned NAMED
 * at (skelId, side, arcIdx).
 *
 * ⚠️ AND ONE THING IT DOES *NOT* MEAN, because the construction says otherwise:
 * a block face and the gusset on the far side of the same arc BOTH come out of
 * ONE traversal — §2 builds a half-edge for each side of every arc before any
 * orientation is consulted, and §3 only chooses which member of a coupler pair
 * is the successor. So `orientation` is a choice of coupler permutation, NOT
 * blocks-vs-gussets, and a half-edge claimed in both traversals is exactly that
 * and nothing more.
 *
 * @param runs [{ label, result }] — two or more walkSubstrate results over the
 *             SAME streets/junctionMap, differing only in `orientation`.
 */
export function completeness(runs) {
  const nameOf = (h) => `${h.skelId}|${h.side}|${h.arcIdx}`

  // The universe must be identical across runs — half-edges are built before
  // any orientation is consulted. ⛔ A mismatch is reported, never reconciled:
  // it would mean the runs are not comparable and every count below is void.
  const universe = new Map()
  const universeMismatch = []
  for (const { label, result } of runs) {
    const keys = new Set(result.halfEdges.map(h => h.key))
    for (const h of result.halfEdges) if (!universe.has(h.key)) universe.set(h.key, h)
    for (const [k, h] of universe) if (!keys.has(k)) universeMismatch.push({ label, ...h })
  }

  // ⛔⛔ THE DENOMINATOR IS WHAT THE ARCS OWE, NOT WHAT GOT BUILT. Every arc owes
  // two half-edges. One that failed to build is ABSENT, not unclaimed — it never
  // enters `universe`, so measuring coverage against `universe` alone REWARDS the
  // failure with a higher percentage. Reported separately and loudly.
  const expected = runs[0]?.result?.stats?.halfEdgesExpected ?? universe.size
  const unbuilt = runs[0]?.result?.unbuilt ?? []

  const claimsByKey = new Map([...universe.keys()].map(k => [k, []]))
  const perRun = []
  const faceSig = new Map()   // sorted half-edge key set -> [{label, faceIdx}]

  for (const { label, result } of runs) {
    const count = new Map([...universe.keys()].map(k => [k, 0]))
    result.faces.forEach((f, faceIdx) => {
      for (const e of f.edges) count.set(e.key, (count.get(e.key) || 0) + 1)
      const sig = f.edges.map(e => e.key).sort().join('')
      if (!faceSig.has(sig)) faceSig.set(sig, [])
      faceSig.get(sig).push({ label, faceIdx, area: f.area, owners: f.owners })
    })
    const unclaimed = [], multi = []
    for (const [k, n] of count) {
      claimsByKey.get(k).push(n)
      if (n === 0) unclaimed.push(universe.get(k))
      else if (n > 1) multi.push({ ...universe.get(k), claims: n })
    }
    perRun.push({
      label,
      total: universe.size,
      claimedOnce: universe.size - unclaimed.length - multi.length,
      unclaimed, multi,
      faces: result.faces.length,
    })
  }

  // The joint picture: the claim-count vector across runs, in `runs` order.
  const joint = new Map()
  for (const [k, v] of claimsByKey) {
    const sig = v.join(',')
    if (!joint.has(sig)) joint.set(sig, [])
    joint.get(sig).push(universe.get(k))
  }

  const sharedFaces = [...faceSig.entries()]
    .filter(([, hits]) => new Set(hits.map(h => h.label)).size > 1)
    .map(([sig, hits]) => ({ edges: sig.split('').length, hits }))

  return {
    universe: universe.size, expected, unbuilt, universeMismatch, perRun,
    joint: [...joint.entries()]
      .map(([sig, list]) => ({ pattern: sig, count: list.length, members: list }))
      .sort((a, b) => b.count - a.count),
    sharedFaces,
    nameOf,
  }
}
