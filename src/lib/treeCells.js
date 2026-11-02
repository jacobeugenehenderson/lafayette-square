// treeCells.js — DRAW ONLY THE TREES THE FRAME CAN SHOW (BRIEF-a-frame-budget-for-every-shot §5; Jacob: "nothing is drawn
// that the rendered frame can't show"). Measured first (scratch/tree-step0, 2026-11-02): the hero impostor cards ARE the
// trees' cost and it tracks INSTANCES, not pixels (PTown close: −36 ms hidden, −30 ms at a quarter of the pixels), while
// 61–97 % of them sit outside the frustum at the mid and close cameras. A per-instance pass over PTown's 110,853 costs
// 4.3 ms a frame (13.8 ms at 4× CPU), so the cull is by CELL: instances are grouped once, each frame tests the cells, and
// the instance buffers are rewritten only when the set of visible cells changes.
// ⭐ A VISUAL NO-OP BY CONSTRUCTION: a cell is kept if any part of its bound can reach the frustum. The bound is everything
// the vertex shader can move a card by — its canopy and card half-extent at its own scale, plus the wind: at most
// 1.7 × the crown lean (hula ≤ amp, lean 0.7·amp) + √2 × the crown flutter (windDetail is a vec2 in [−1,1]²), from the
// Look's treeWind figures at the strongest felt wind (treeAtlasMaterial.js#treeWindCrown) — and the visible floor, which is
// PIXELS at the card's own depth (windMetresForPixels), so it widens the frustum by (1.7 + √2)·floorPx pixels, not metres.
// ⛔ The main camera is the only view that draws trees: they cast no shadow (castShadow false on every tree mount) and no
// camera renders a reflection. ▶ node checks/claims-a-tree-the-frame-cannot-show-is-not-drawn.mjs --mutants
/** The switch. ⭐ DORMANT (off) until the live A/B proves it a visual no-op on :5173 (Boz's gate: pixel diff + ms + the
 *  flight's CPU at 1× and 4×); then one commit turns it on. A probe flips it at runtime; `?treeDebug=noCull` forces it off. */
export const treeCull = { on: false }
export const LEAN_FACTOR = 1.7          // hula (≤ amp) + downwind lean (0.7 · amp): CARD_WIND_RIGID
export const FLUTTER_FACTOR = Math.SQRT2 // |windDetail| ≤ √2 (each component in [−1, 1]): CARD_FLUTTER_VERTEX

/** The wind's reach in metres at the crown (no floor), from the Look's treeWind figures and the strongest felt wind (m/s). */
export function windReachM(tw, feltMax) {
  const lean = tw.leanRefM + tw.leanPerMps * feltMax, flut = tw.flutterRefM + tw.flutterPerMps * feltMax
  return LEAN_FACTOR * lean + FLUTTER_FACTOR * flut
}
/** The floor's reach in PIXELS: the gust lift can put up to floorPx pixels into lean + flutter at any depth. */
export const floorReachPx = (tw) => (LEAN_FACTOR + FLUTTER_FACTOR) * tw.floorPx

/**
 * Group instances into square cells. The cell edge is derived, never a constant: about √N cells of about √N instances
 * each over the town's disc (edge = 2R / N^¼), which balances the per-frame cell test (√N cells) against what one cell
 * entering or leaving costs to rewrite (√N instances); never below twice the largest card's reach. The cell size changes
 * only the cost, never the picture (a cell is kept whenever any part of its bound reaches the frustum). → { edge, cells: [{ cx, cz, r, idx: [instance indices] }] }
 * `inst[i]` = { x, z, reach } where reach is that card's own static bound (canopy/card half-extent × its scale).
 */
export function buildCells(inst, discRadius) {
  if (!inst.length) return { edge: 0, cells: [] }
  const maxReach = inst.reduce((a, t) => Math.max(a, t.reach), 0)
  const edge = Math.max(2 * maxReach, (2 * discRadius) / Math.pow(inst.length, 0.25))
  const map = new Map()
  for (let i = 0; i < inst.length; i++) {
    const t = inst[i], k = `${Math.floor(t.x / edge)},${Math.floor(t.z / edge)}`
    let c = map.get(k); if (!c) map.set(k, c = { idx: [], minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, reach: 0 })
    c.idx.push(i); c.minX = Math.min(c.minX, t.x); c.maxX = Math.max(c.maxX, t.x); c.minZ = Math.min(c.minZ, t.z); c.maxZ = Math.max(c.maxZ, t.z); c.reach = Math.max(c.reach, t.reach)
  }
  const cells = [...map.values()].map((c) => {
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2
    return { cx, cz, r: Math.hypot(c.maxX - cx, c.maxZ - cz) + c.reach, idx: c.idx }
  })
  return { edge, cells }
}

/**
 * The six frustum planes [a,b,c,d] (normalised, inward) from a column-major projection·view matrix (Gribb–Hartmann).
 */
export function planesOf(e) {
  return [[e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]], [e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]],
    [e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]], [e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]],
    [e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]], [e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]]]
    .map(([a, b, c, d]) => { const l = Math.hypot(a, b, c); return [a / l, b / l, c / l, d / l] })
}

/**
 * The cells whose bound can reach the frustum. A cell is a vertical capsule from `yLo` to `yHi` (the ground's range under
 * the town plus the tallest card), widened by `windM` metres and, at its own distance, by `pxMargin` pixels
 * (`metresPerPx(dist)` from the live camera). → Uint8Array, 1 = visible.
 */
export function visibleCells(cells, planes, { yLo, yHi, windM, pxMargin, camPos, metresPerPx }) {
  const out = new Uint8Array(cells.length), ym = (yLo + yHi) / 2, yh = (yHi - yLo) / 2
  for (let k = 0; k < cells.length; k++) {
    const c = cells[k], dist = Math.hypot(c.cx - camPos[0], ym - camPos[1], c.cz - camPos[2])
    const r = Math.hypot(c.r + windM, yh) + pxMargin * metresPerPx(dist)
    let ok = 1
    for (const p of planes) { if (p[0] * c.cx + p[1] * ym + p[2] * c.cz + p[3] < -r) { ok = 0; break } }
    out[k] = ok
  }
  return out
}

/** Did the visible set change? (The buffers are rewritten only then.) */
export function sameSet(a, b) { if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true }
