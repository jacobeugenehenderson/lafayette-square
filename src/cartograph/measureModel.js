// Shared authoring model for the Measure tool.
//
// Data-wall doctrine (RIBBONS.md §1): chains end forever at bake; polygons
// are the surface. The Measure tool authors PER-FE (per block-edge); every
// write lands in blockCustoms keyed by the fe's chain-anchored identity
// (skelId, side, segOrd) via feCustomKey. The chain is a topology +
// SELECTION criterion, never an authoring scope — no path in this tool
// writes to chain.measure. chain.measure stays a READ-ONLY inherited default
// (pipeline-derived from skeleton.js → ribbons.json).
//
// These helpers were duplicated across MeasureOverlay.jsx + MeasurePanel.jsx
// ("keep the two in sync until extracted"); the authoring redesign extracts
// them here so the two consumers share one definition.

import { defaultMeasure, CURB_WIDTH } from './streetProfiles.js'
import { ringRunOwners, bandSpans } from '../lib/tileGround.js'

// Drag clamps — a handle dragged very far must not explode ribbon geometry
// (subdivideGeo can request a multi-million-vert buffer). 30m past any real
// curb; stripes capped so neither vanishes nor blows up.
export const MAX_PAVEMENT_HW = 30
export const MAX_STRIPE = 20
export const STRIPE_MIN = 1.0  // meters — thinnest a stripe can be dragged

// ⛔⛔ EXCISED 2026-07-31 — this was an LS BLEED (`BRIEF-ls-bleed-excision` site 9,
// Class B). It statically imported Lafayette Square's ribbons.json and built a
// seed map keyed by street NAME, consulted in EVERY scene. Its own comment named
// the assumption — "Toy and LS identities are disjoint, so one merged map
// resolves each correctly" — which held for toy vs LS and is FALSE for LS vs any
// other American town. MEASURED: 24 Altadena streets silently inherited St. Louis
// measurements (Allen Ave, Iowa Ave), Hi-Pointe 6, both Polish pours 0 — so the
// defect was invisible in exactly the scenes used to prove the kit travels.
//
// Now SCENE-SCOPED: the active scene's fixture is registered by the store (which
// already resolves it correctly per scene) and nothing else is consulted. With no
// registration the seed is EMPTY and `chainMeasure` degrades to the generic
// type default — which belongs to no town. An honest generic beats a plausible
// wrong one; a default seeded from another installation's survey is the defect,
// not a "documented fallback" (brief §A.3).
let _sceneMeasure = new Map()
let _sceneMeasureScene = null

/** Register the ACTIVE scene's ribbons as the seed source. Call on scene resolve. */
export function setSceneMeasureSource(ribbons, sceneId = null) {
  const m = new Map()
  for (const st of (ribbons?.streets || [])) {
    if (!st.measure) continue
    if (st.skelId) m.set(st.skelId, st.measure)
    if (st.name) m.set(st.name, st.measure)
  }
  _sceneMeasure = m
  _sceneMeasureScene = sceneId
}

/** Which scene the current seed came from — for probes/asserts. */
export function sceneMeasureSource() { return { scene: _sceneMeasureScene, size: _sceneMeasure.size } }

// Chain-level READ default. Order: street.measure → pipeline-derived →
// type default. This is a fallback for seeding/handle-placement only —
// never a write target.
export function chainMeasure(st) {
  if (st.measure) return st.measure
  const fromPipeline = _sceneMeasure.get(st.skelId) || _sceneMeasure.get(st.name)
  if (fromPipeline) {
    return {
      left: { ...fromPipeline.left },
      right: { ...fromPipeline.right },
      symmetric: fromPipeline.left.terminal === fromPipeline.right.terminal
        && Math.abs(fromPipeline.left.treelawn - fromPipeline.right.treelawn) < 0.01
        && Math.abs(fromPipeline.left.sidewalk - fromPipeline.right.sidewalk) < 0.01,
    }
  }
  return defaultMeasure(st.type || 'residential')
}

// Resolve a (street, segOrd, side) tuple to its containing block-edge fe.
// streetIdx callers index centerlineData.streets, but fe.chainIdx indexes
// liveRibbons.streets (different ordering) — match by chain identity
// (skelId/id, name fallback) so the two indexings need not agree.
// (See feedback_index_mismatch_centerline_vs_ribbons.)
export function findFeForSide(v2FrontageEdges, st, segOrd, sideKey) {
  if (!st || segOrd == null || !v2FrontageEdges?.length) return null
  const idKey = st.skelId || st.id || null
  const nameKey = st.name || null
  for (const fe of v2FrontageEdges) {
    if (fe.side !== sideKey) continue
    const idMatches = idKey && fe.chainSkelId === idKey
    const nameMatches = !idKey && nameKey && fe.chainName === nameKey
    if (!idMatches && !nameMatches) continue
    if (fe.segOrds?.includes(segOrd)) return fe
  }
  return null
}

// Every block-edge fe of a chain on the given side, across all segOrds.
// This is the polygon set the "whole chain" gesture selects: a whole-chain
// edit fans a per-fe write across these, never writes chain.measure.
export function feesForChainSide(v2FrontageEdges, st, sideKey) {
  if (!st || !v2FrontageEdges?.length) return []
  const idKey = st.skelId || st.id || null
  const nameKey = st.name || null
  const out = []
  for (const fe of v2FrontageEdges) {
    if (fe.side !== sideKey) continue
    const idMatches = idKey && fe.chainSkelId === idKey
    const nameMatches = !idKey && nameKey && fe.chainName === nameKey
    if (idMatches || nameMatches) out.push(fe)
  }
  return out
}

// ── THE ARC A HANDLE RIDES ──────────────────────────────────────────────────
// A handle belongs to a block-edge, and that edge owns a stretch of the frozen
// curb. Everything below hands it THAT stretch — never "the nearest curb", which
// is what a ray off the centreline actually asks and why a handle could land on
// the far side of the street or in a rooftop (measured: `scratch/claims-handle-
// rides-its-arc.mjs`).
//
// ⛔ NO DISTANCE DECIDES OWNERSHIP HERE. Identity comes from (skelId, side) —
// the same chain-anchored key `blockCustoms` is written under, which is the
// operator's design intent and explicitly legitimate (2026-08-04). Geometry
// comes from the polygon. Those are different questions and this is the seam.

const ringSign = (ring) => {
  let a = 0
  for (let i = 0, n = ring.length; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a > 0 ? 1 : -1
}

/**
 * The partition, in the form a handle can use. One record per tile run:
 *
 *   { skelId, side, segOrd, run, arcs, sgn }
 *
 * `run` is the run's own stretch of centerline (a sub-polyline of its chain —
 * measured, 550/550 runs, every interior vertex within 0.05 m). `arcs` are the
 * stretches of the frozen curb `iA` that this run OWNS, off the same
 * `ringRunOwners` + `bandSpans` the FILL partitions with. `sgn` orients the
 * ring so "inward" means into the block, matching the band's own sweep.
 *
 * ⭐ A run that owns no arc still gets a record, with `arcs: []` and `why` NAMED.
 * Withholding the record instead would make the handle vanish with no account of
 * itself, and an unexplained absence in an authoring tool reads as a bug in the
 * tool rather than as the state of the map. On LS this is 33 frontages —
 * measured, `node scratch/claims-handle-rides-its-arc.mjs` — 32 of them a stamp
 * gap, one a partition refusal, and Allen Avenue's 144 m is among them. The
 * operator is told which, per edge; ⛔ no handle is drawn for any of them.
 */
export function buildCurbArcs(shapeTiles) {
  const out = []
  const withheld = (run, why) => {
    if (!run?.skelId || !run.poly || run.poly.length < 2) return
    out.push({ skelId: run.skelId, side: run.side, segOrd: run.segOrd, run: run.poly, arcs: [], sgn: 1, why })
  }
  for (const st of shapeTiles || []) {
    if (!st?.runs?.length) continue
    if (!st.iaEdge || !st.iA?.length) {
      // the A06 refusal class — the stamp is absent and says why it is absent
      for (const run of st.runs) withheld(run, st.iaEdgeReason || 'no iaEdge stamp')
      continue
    }
    const owner = ringRunOwners(st)
    const spans = owner ? bandSpans(st, owner) : null
    if (!spans?.length) {
      for (const run of st.runs) withheld(run, 'partition refused')
      continue
    }
    const byRun = new Map()
    for (const s of spans) {
      const A = st.iA[s.r]
      if (!A || A.length < 3) continue
      const m = A.length
      const arc = []
      for (let t = 0; t <= s.len; t++) arc.push(A[(s.i0 + t) % m])
      if (arc.length < 2) continue
      if (!byRun.has(s.owner)) byRun.set(s.owner, { arcs: [], sgn: ringSign(A) })
      byRun.get(s.owner).arcs.push(arc)
    }
    st.runs.forEach((run, ri) => {
      const e = byRun.get(ri)
      if (!e) { withheld(run, 'run owns no arc'); return }
      if (!run?.skelId || !run.poly || run.poly.length < 2) return
      out.push({ skelId: run.skelId, side: run.side, segOrd: run.segOrd, run: run.poly, arcs: e.arcs, sgn: e.sgn })
    })
  }
  return out
}

// Nearest point on a polyline: { d, x, z, tx, tz, interior }. `interior` says
// the foot landed inside the polyline rather than clamped to an end.
function nearestOnPolyline(pts, px, pz) {
  let best = Infinity, out = null
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1]
    const dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az
    const l2 = dx * dx + dz * dz
    if (l2 < 1e-12) continue
    const raw = ((px - ax) * dx + (pz - az) * dz) / l2
    const t = Math.max(0, Math.min(1, raw))
    const x = ax + t * dx, z = az + t * dz
    const d = Math.hypot(px - x, pz - z)
    if (d < best) {
      const L = Math.sqrt(l2)
      best = d
      out = { d, x, z, tx: dx / L, tz: dz / L, interior: (raw > 0 || i > 0) && (raw < 1 || i < pts.length - 2) }
    }
  }
  return out
}

/**
 * The run of (skelId, side) that owns the stretch of chain under `(px, pz)`.
 *
 * The anchor is a point ON the chain and every candidate `run` is a stretch OF
 * that same chain, so containment is exact: take the candidate whose foot is
 * INTERIOR to its run, nearest first. ⛔ No cap and no epsilon — identity was
 * already settled by (skelId, side), so the only question left is WHICH stretch,
 * and a wrong-street hit is not constructible.
 *
 * Returns null when this side owns no run here at all. A record WITH `arcs: []`
 * is different and is returned in preference to nothing: it means the run exists
 * and its curb could not be partitioned, and `rec.why` says which. A record that
 * owns arcs always wins over a withheld one at the same station.
 */
export function runArcsAt(curbArcs, skelId, side, px, pz) {
  if (!curbArcs?.length || !skelId) return null
  let best = null, bestD = Infinity
  for (const rec of curbArcs) {
    if (rec.side !== side || rec.skelId !== skelId) continue
    const on = nearestOnPolyline(rec.run, px, pz)
    if (!on || !on.interior) continue
    const better = !best
      || (rec.arcs.length > 0 && best.arcs.length === 0)
      || (rec.arcs.length > 0 === best.arcs.length > 0 && on.d < bestD)
    if (better) { bestD = on.d; best = rec }
  }
  return best
}

/**
 * ⭐ THE SCOPE IS THE BLOCK-EDGE, NOT ONE RUN — and that is not a widening, it is
 * the right unit. The operator authors per fe (`blockCustoms[skelId][side]
 * [segOrd]`) and a write already fans across every segOrd the fe owns
 * (`feSegOrds`), so the handle belongs to the whole frontage, whose curb is the
 * union of its runs' arcs.
 *
 * ⚠️ Asking it per RUN instead costs real ground: on LS 33 frontages have a run
 * that owns no arc, and 17 of those runs are ONE RING EDGE wide. Withholding a
 * whole frontage's handle over a one-edge sliver is a larger visible regression
 * than the gap it reports — Jacob, 2026-08-11. At fe scope the sliver's frontage
 * keeps its handle on the arcs it does own, and a frontage that owns NOTHING
 * still goes dark, which is the 12 cases where the ground is a neighbour's.
 *
 * `segOrds` is the fe's owned set. Pass null to scope to the single run.
 */
export function feArcRecords(curbArcs, skelId, side, segOrds) {
  if (!curbArcs?.length || !skelId) return []
  const want = segOrds && segOrds.length ? new Set(segOrds) : null
  return curbArcs.filter(r => r.skelId === skelId && r.side === side
    && (!want || want.has(r.segOrd)))
}

/**
 * Where a handle sits and which way it points: the point on these records' arcs
 * under the anchor, its tangent, and the INWARD normal (into the block, the same
 * direction the band sweeps — `spanClaimPoly`'s `nrm`).
 *
 * Projection may clamp to an arc end (the anchor sits at a fillet, between two
 * arcs). Safe by construction: every candidate already belongs to this
 * block-edge, so a clamp can only pick another stretch of the SAME frontage —
 * never another street's curb. ⛔ That is why there is no cap here and no
 * epsilon: identity was settled before geometry was asked.
 */
export function arcAnchor(recs, px, pz) {
  const list = Array.isArray(recs) ? recs : [recs]
  let best = null, bestD = Infinity, bestRec = null
  for (const rec of list) {
    for (const arc of (rec?.arcs || [])) {
      const on = nearestOnPolyline(arc, px, pz)
      if (on && on.d < bestD) { bestD = on.d; best = on; bestRec = rec }
    }
  }
  if (!best) return null
  const s = bestRec.sgn
  return {
    x: best.x, z: best.z,
    tx: best.tx, tz: best.tz,             // along the arc
    nx: -best.tz * s, nz: best.tx * s,    // inward, into the block
    segOrd: bestRec.segOrd,
  }
}

/** Why a block-edge has no arc to ride, named for the operator. */
export function arcWithheldReason(recs) {
  const list = (Array.isArray(recs) ? recs : [recs]).filter(Boolean)
  if (!list.length) return 'no tile face on this side'
  const whys = [...new Set(list.map(r => r.why).filter(Boolean))]
  return whys.length ? whys.join(' · ') : 'no arc'
}

/**
 * Which block-edge a free click landed on, asked of the arcs rather than of the
 * chain's normal. Returns { rec, anchor, depth } where `depth` is the inward
 * distance from the frozen curb — the same datum the FILL's strips are measured
 * from — or null when the click is not inside any candidate's band.
 *
 * `candidates` is normally every arc record of the selected chain (both sides);
 * the SIDE falls out of the record that claims the click, so no chain normal is
 * consulted. `reach` bounds how deep a click still counts as "in the band"; it
 * is the band's own total depth at that edge, not a tuned radius.
 */
export function arcHitAt(curbArcs, skelId, px, pz, reachFor) {
  if (!curbArcs?.length || !skelId) return null
  let best = null, bestDepth = Infinity
  for (const rec of curbArcs) {
    if (rec.skelId !== skelId || !rec.arcs.length) continue
    const a = arcAnchor(rec, px, pz)
    if (!a) continue
    const depth = (px - a.x) * a.nx + (pz - a.z) * a.nz   // inward from the curb
    if (depth < 0) continue                                // out in the roadway
    const reach = reachFor(rec)
    if (!(reach > 0) || depth > reach) continue
    if (depth < bestDepth) { bestDepth = depth; best = { rec, anchor: a, depth } }
  }
  return best
}

// Apply a boundary drag to a per-side measure. `r` = new radius (absolute,
// from centerline); `kind` names the dragged boundary. Returns a NEW measure
// (seed is not mutated). Pure — identical math for per-block and whole-chain
// writes, so both seed per-fe and call this.
export function applyKindToMeasure(seed, kind, r) {
  const next = { ...seed }
  const cw = Number.isFinite(next.curb) ? next.curb : CURB_WIDTH
  if (kind === 'pavementHW') {
    next.pavementHW = Math.min(MAX_PAVEMENT_HW, Math.max(0.5, r))
  } else if (kind === 'treelawnOuter') {
    const curbEnd = (next.pavementHW || 0) + cw
    const total = (next.treelawn || 0) + (next.sidewalk || 0)
    if (total >= STRIPE_MIN * 2) {
      const newTl = Math.max(STRIPE_MIN, Math.min(total - STRIPE_MIN, r - curbEnd))
      next.treelawn = Math.min(MAX_STRIPE, newTl)
      next.sidewalk = Math.min(MAX_STRIPE, total - newTl)
    } else {
      next.treelawn = total / 2
      next.sidewalk = total / 2
    }
  } else if (kind === 'propertyLine') {
    const curbEnd = (next.pavementHW || 0) + cw
    const inner = curbEnd + (next.treelawn || 0)
    next.sidewalk = Math.min(MAX_STRIPE, Math.max(STRIPE_MIN, r - inner))
  }
  return next
}
