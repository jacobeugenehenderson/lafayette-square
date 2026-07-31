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
