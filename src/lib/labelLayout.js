// labelLayout.js — the SHARED runtime street-label layout module.
//
// Input: the bake's named, hood-clipped polylines (`{ name, widthM, points }`
// from src/lib/streetLabels.js) + the panel label style. Output: per-placement
// labels the SceneLabel renderer draws. Computed at RUNTIME (universal-player
// capability — a hood is only dozens of chains, so it's cheap) and consumed by
// BOTH MapLayers (Designer) and LafayetteScene (player) via the same hook, so
// the two never drift ([[project_preview_equals_ls_literally]]).
//
// It does three things (LOD is added on top in a later step):
//   • SIZE LAW — fontSize = k × widthM, FLOORED for legibility, NO ceiling.
//     k = SIZE_K_AUTO × the panel Size scale (Auto = absent = 1× baseline).
//     Proportions fall out of the real widths; custom-width overrides ride in
//     via widthM for free.
//   • REPEAT — labels repeat along each street at a width-aware interval, so a
//     long street reads labelled wherever you're looking, not once at a midpoint.
//   • FIT / ABBREVIATE — per placement, the text run is checked against the
//     straight run available; overflow → least abbreviation that fits
//     (streetAbbrev.js) → else drop (never spill across the cross-street).
//
// PURE (no React) so it's node-testable (scratch/plot-label-placements.mjs); the
// React hook that wires it to the panel style lives in useLabelPlacements.js.
import { abbreviateName, MAX_ABBREV_LEVEL } from './streetAbbrev.js'

// ── Tunable constants ──────────────────────────────────────────────────────
// Auto size: fontSize = SIZE_K_AUTO × widthM. 1/3 lands a ~12 m residential at
// ~4 m text (matching the old reference tie) and an 18 m arterial at ~6 m — but
// now proportional, unclamped either way.
const SIZE_K_AUTO = 1 / 3
const SIZE_FLOOR_M = 2.5          // legibility floor — no street reads smaller
const DEFAULT_WIDTH_M = 10        // widthM absent (unmeasured chain) → typical residential
// Text-run estimate: fontSize × (aspect × chars + tracking × gaps). ASPECT is a
// mean glyph advance/height for the label fonts (Roboto-ish); the fit gate wants
// a slight over-estimate so a label never spills past the run it claimed.
const GLYPH_ASPECT = 0.58
const ANGLE_TOL = 0.22            // ~12.6° — headings within this read as "straight"
const REPEAT_MULT = 4             // repeat interval ≈ this × the full-name run
const MIN_REPEAT_M = 170          // …but never denser than one per this many metres
// Collision de-dup (restores the retired LS SAME_NAME_MIN_DIST / ANY_LABEL_MIN_DIST).
// A street is many polyline pieces (divided carriageways, chains split at
// intersections); without this, collinear same-name pieces stack their labels
// on top of each other. Same-name repeats stay ≥ SAME_NAME apart; any two labels
// stay ≥ ANY_LABEL apart so different streets don't pile up at a junction.
const SAME_NAME_MIN_M = 140
const ANY_LABEL_MIN_M = 16

// ── Geometry helpers ───────────────────────────────────────────────────────
function textRunLength(text, fontSize, tracking) {
  const n = text.length
  if (n === 0) return 0
  return fontSize * (GLYPH_ASPECT * n + tracking * Math.max(0, n - 1))
}

// Fold a heading into [-π/2, π/2] so text never renders upside-down.
function normalizeReadAngle(a) {
  if (a > Math.PI / 2) a -= Math.PI
  if (a < -Math.PI / 2) a += Math.PI
  return a
}

// Acute angle between two (undirected) line headings → [0, π/2].
function acuteDelta(a, b) {
  let d = Math.abs(a - b) % (2 * Math.PI)
  if (d > Math.PI) d = 2 * Math.PI - d
  if (d > Math.PI / 2) d = Math.PI - d
  return d
}

function buildSegments(points) {
  const segs = []
  let cum = 0
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1]
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (len === 0) continue
    segs.push({ x0, z0, x1, z1, len, ang: Math.atan2(z1 - z0, x1 - x0), cum0: cum })
    cum += len
  }
  return { segs, total: cum }
}

// Point + local heading + segment index at arclength s.
function locate(segs, s) {
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i]
    if (s <= sg.cum0 + sg.len || i === segs.length - 1) {
      const t = sg.len > 0 ? (s - sg.cum0) / sg.len : 0
      return { x: sg.x0 + (sg.x1 - sg.x0) * t, z: sg.z0 + (sg.z1 - sg.z0) * t, ang: sg.ang, idx: i }
    }
  }
  return null
}

// The straight run available for a label centered at arclength s (segment idx):
// extend both ways while the heading stays within ANGLE_TOL of the center, then
// take twice the shorter arm (the text is centered, so it needs symmetric room).
function straightRun(segs, s, idx) {
  const centerAng = segs[idx].ang
  let fwd = (segs[idx].cum0 + segs[idx].len) - s
  for (let i = idx + 1; i < segs.length; i++) {
    if (acuteDelta(segs[i].ang, centerAng) < ANGLE_TOL) fwd += segs[i].len
    else break
  }
  let back = s - segs[idx].cum0
  for (let i = idx - 1; i >= 0; i--) {
    if (acuteDelta(segs[i].ang, centerAng) < ANGLE_TOL) back += segs[i].len
    else break
  }
  return 2 * Math.min(fwd, back)
}

/**
 * Lay out repeating, size-to-width, fit-gated labels along the polylines.
 * @param {Array<{name,widthM,points:[[x,z]...]}>} polylines
 * @param {{sizeK?:number, letterSpacing?:number}} style
 * @returns {Array<{name,fullName,street,x,z,angle,fontSize,widthM,runLen}>}
 *   `name` = the placed (possibly abbreviated) text; `street` = group key for LOD.
 */
export function layoutStreetLabels(polylines, style = {}) {
  const sizeK = style.sizeK == null ? 1 : style.sizeK   // Auto (absent) = 1× baseline
  const tracking = style.letterSpacing ?? 0.05
  const out = []
  for (const pl of polylines || []) {
    if (!pl?.points || pl.points.length < 2) continue
    const widthM = pl.widthM && pl.widthM > 0 ? pl.widthM : DEFAULT_WIDTH_M
    const fontSize = Math.max(SIZE_FLOOR_M, SIZE_K_AUTO * sizeK * widthM)
    const { segs, total } = buildSegments(pl.points)
    if (!segs.length) continue

    const fullLen = textRunLength(pl.name, fontSize, tracking)
    const spacing = Math.max(MIN_REPEAT_M, fullLen * REPEAT_MULT)
    const n = Math.max(1, Math.floor(total / spacing))

    for (let i = 0; i < n; i++) {
      const s = total * (i + 0.5) / n
      const p = locate(segs, s)
      if (!p) continue
      const run = straightRun(segs, s, p.idx)
      // Least abbreviation that fits the straight run; else drop.
      let text = null
      for (let lvl = 0; lvl <= MAX_ABBREV_LEVEL; lvl++) {
        const t = abbreviateName(pl.name, lvl)
        if (textRunLength(t, fontSize, tracking) <= run) { text = t; break }
      }
      if (text == null) continue
      out.push({
        name: text, fullName: pl.name, street: pl.name,
        x: p.x, z: p.z, angle: normalizeReadAngle(p.ang),
        fontSize, widthM: pl.widthM ?? null, runLen: run,
      })
    }
  }
  return dedupe(out)
}

// Greedy spatial de-dup: best candidates first (longest straight run, then
// widest street), accept one only if it clears the same-name and any-label
// radii from everything already accepted. O(n²) over dozens–low-hundreds of
// candidates — negligible.
function dedupe(candidates) {
  const ranked = candidates.slice().sort((a, b) => (b.runLen - a.runLen) || (b.fontSize - a.fontSize))
  const kept = []
  for (const c of ranked) {
    let ok = true
    for (const k of kept) {
      const d2 = (c.x - k.x) ** 2 + (c.z - k.z) ** 2
      const min = k.street === c.street ? SAME_NAME_MIN_M : ANY_LABEL_MIN_M
      if (d2 < min * min) { ok = false; break }
    }
    if (ok) kept.push(c)
  }
  return kept
}
