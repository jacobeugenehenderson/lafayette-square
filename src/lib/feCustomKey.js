// Chain-anchored customs key — the keystone of the wall-move (W1).
//
// Ribbon customs (blockCustoms) used to be keyed by (blockKey, edgeOrd): a
// bbox-derived centroid hash of a *derived* polygon. That polygon drifts when
// corner-rounding nudges the bbox across a 0.5m bin (rounded-vs-sharp,
// pass1-vs-pass2), so a custom written under one blockKey was read back under
// another and the edit evaporated. (project_ribbon_three_representations,
// feedback_block_key_rounded_vs_sharp_diverges.)
//
// The fix (HANDOFF-wall-move §Design-decisions Q2): key off the *stable
// authored input* instead — the chain identity (skelId), the side, and the
// natural-segment ordinal. None of those move when geometry re-derives; they
// invalidate only on TOPOLOGY edits (add/remove IX, split chain), which is the
// sanctioned, deliberate boundary. The operator already authors in
// (street, side, segment) terms (MeasurePanel "segment N"), so this key matches
// their mental model exactly.
//
// SINGLE SOURCE OF TRUTH. Every representation of a ribbon — authoring handles,
// committed bake (bakeFeScalars / emit) — MUST resolve customs through THIS one
// helper. A second copy of the key formula is how they drift apart again; don't
// make one. (The third rep, the figure-ground live preview buildChainBandsLive,
// was deleted at T4 2026-07-15.)
//
// Storage shape: blockCustoms[skelId][side][segOrd] = single-side measure
//   { pavementHW, treelawn, sidewalk, terminal, materials? }
// (side is in the key, so the value is one side — no left/right nesting.)
//
// segOrd is the fe's REPRESENTATIVE natural segment = min(fe.segOrds).
// assignSegOrdsToFes assigns each natural segment to a single closest fe, so an
// fe's segOrds are disjoint from its siblings' → (skelId, side, min segOrd) is
// unique per fe and gives exact one-slot-per-fe parity with the old key.
// min() (not segOrds[0]) makes the key order-independent, so a future reorder
// of the segOrds array can't silently reintroduce a micro-drift.

// Resolve an fe to its chain-anchored customs key, or null if the fe can't
// carry a custom (no chain identity, no side, or no owned segment — e.g. a tiny
// fe that assignSegOrdsToFes never reached; such fes are never authored and
// fall through to chain.measure).
export function feCustomKey(fe) {
  if (!fe) return null
  const skel = fe.chainSkelId || fe.chainName || null
  if (!skel || fe.side == null) return null
  if (!fe.segOrds || fe.segOrds.length === 0) return null
  const seg = Math.min(...fe.segOrds)
  if (!Number.isFinite(seg)) return null
  return [skel, fe.side, seg]
}

// Read the custom measure for an fe, or null. The one read used by every path.
export function readFeCustom(blockCustoms, fe) {
  const k = feCustomKey(fe)
  if (!k) return null
  return blockCustoms?.[k[0]]?.[k[1]]?.[k[2]] || null
}

// Expand each fe's custom (stored under its REPRESENTATIVE min-segOrd, per
// feCustomKey) across ALL of the fe's owned segOrds. The renderer reads
// blockCustoms[run.skelId][run.side][run.segOrd] PER RUN (tileGround
// sectionPassTile), but the store keys ONE slot per block-edge at min(segOrds).
// When a T splits a frontage so a block-edge owns several segments (segOrds
// [3,4,5]), the flip/drag lands on slot 3 and the runs at 4/5 read an empty slot
// → the edit "silently orphans" (the T3 key-parity hazard, README construction
// row). Expanding here — one arrangement across the whole corner-to-corner edge
// — restores parity without touching the store's min-keyed storage, and fixes
// customs authored before this shipped. Returns a new object only if it changed;
// input is never mutated. (Boz + Jacob, 2026-07-16 — the "flip inert on split
// runs" fix; low-stakes, one arrangement to the next corner.)
export function expandCustomsAcrossFeSegOrds(blockCustoms, fes) {
  if (!blockCustoms || !Array.isArray(fes) || !fes.length) return blockCustoms
  let out = null
  for (const fe of fes) {
    if (!fe?.segOrds || fe.segOrds.length < 2) continue   // single-segment fes already have parity
    const k = feCustomKey(fe)
    if (!k) continue
    const [skel, side, seg] = k
    const custom = blockCustoms?.[skel]?.[side]?.[seg]
    if (!custom) continue
    for (const so of fe.segOrds) {
      if (so === seg) continue
      if (blockCustoms?.[skel]?.[side]?.[so]) continue     // an authored slot already there — never clobber
      if (!out) out = { ...blockCustoms }
      out[skel] = { ...(out[skel] || {}) }
      out[skel][side] = { ...(out[skel][side] || {}) }
      out[skel][side][so] = custom
    }
  }
  return out || blockCustoms
}
