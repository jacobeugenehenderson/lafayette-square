/**
 * `neighborhood_boundary.json` — THREE RECORDS, ONE FILE (`EXTENT-DESIGN §5.1`).
 *
 * The artifact welds three jobs, and the weld is what destroys authored values:
 *
 *   ① DISC       — `version` `center` `radius` `boundary[256]` + the fade set
 *                  (`innerFadeOffset` `fade` `streetFade`). "How much world do we
 *                  draw." The two feather bands are a downstream contract
 *                  (`SLAB-CONTRACT §2.1`) and `streetFade.outer` sets the content
 *                  clip radius (`pipeline.js` keepR).
 *   ② MEMBERSHIP — `polygon` `polygonSource`. "What is IN the neighborhood."
 *   ③ EXCLUSIONS — `exclusions[]`. The subtractive margin corrections.
 *
 * ⛔ The defect this removes: the routes built the whole file by CONSTRUCTING A
 * FRESH OBJECT (`makeCircleBoundary`), so every field not re-stated by hand was
 * lost. Membership and exclusions each grew an `if` branch to hand-preserve them
 * — the weld made visible — while THE FADE SET NEVER GOT ONE. It regenerated from
 * hardcoded constants on every commit and every rescope, with no protection and no
 * warning. Lafayette Square is the only scene carrying an authored fade set
 * (measured 2026-08-12: every other v2 scene is exactly the formula), it is
 * production, and it has never been poured — so the first touch of the Extent tool
 * would have silently replaced its four authored values with the defaults.
 *
 * The cure is structural, not a guard: SPLIT the file into its three records, and
 * have the routes START FROM THE PRIOR RECORDS and replace only what the operator's
 * gesture actually addresses. Preservation stops being a branch you can forget.
 *
 * ⛔ NOT a redesign and NOT three files on disk. Thirteen production sites open
 * `neighborhood_boundary.json` by literal path; the composed file remains the wire
 * format and stays byte-identical. Split/compose round-trips every existing scene
 * byte-for-byte — `node scratch/claims-boundary-record-split.mjs` proves it.
 *
 * ⭐ AUTHORED vs GENERATED is DERIVED, never stamped. A fade set is "generated" iff
 * it equals `generatedFade(radius)` exactly; otherwise it is the operator's. That
 * needs no new field, no migration, and cannot go stale — it measures the artifact
 * against the one live formula rather than restating a verdict (CLAUDE.md §PRUNE).
 */

/** The three fade fields, as a set. All present or all absent — never partial. */
export const FADE_FIELDS = ['innerFadeOffset', 'fade', 'streetFade']

/**
 * THE ONE FADE FORMULA. Previously inline in `serve.js:makeCircleBoundary`; it
 * lives here now so the check can measure a scene against it instead of copying
 * the numbers into a second place that then drifts.
 */
export function generatedFade(R) {
  return {
    innerFadeOffset: 200,
    fade: { inner: Math.max(0, R - 200), outer: R },
    streetFade: { inner: Math.max(0, R - 140), outer: R + 160 },
  }
}

/** The 256-gon render ring. Always derived from radius + center — never authored. */
export function makeRing(R, cx, cz) {
  const r2 = (v) => Math.round(v * 100) / 100
  const ring = []
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * 2 * Math.PI
    ring.push([r2(cx + R * Math.cos(a)), r2(cz + R * Math.sin(a))])
  }
  return ring
}

const isBand = (b) => b && typeof b === 'object' && Number.isFinite(b.inner) && Number.isFinite(b.outer)
const sameBand = (a, b) => a.inner === b.inner && a.outer === b.outer

/** Deep-equal over the three fade fields only. */
export function sameFade(a, b) {
  return a.innerFadeOffset === b.innerFadeOffset &&
    sameBand(a.fade, b.fade) && sameBand(a.streetFade, b.streetFade)
}

/**
 * Classify an artifact's fade set. ⛔ FAILS LOUDLY, NAMING THE FIELD — no defaults,
 * no silent reconstruction. Reconstructing an absent fade set is the exact defect
 * being removed here; it must not reappear one layer down.
 *
 * → { kind: 'authored' | 'generated' | 'absent', fade }
 *
 * `absent` is LEGAL and meaningful, not a hole to fill: `toy` carries no fade
 * fields at all, and that absence is READ — it signals "no soft-circle silhouette"
 * to `bake-ground.js` and `BakedGround`. A sentinel that nothing reads is not a
 * value; this one is read, so it is. Only a PARTIAL set is a defect.
 */
export function classifyFade(nb, where = 'boundary') {
  const present = FADE_FIELDS.filter(f => nb[f] !== undefined && nb[f] !== null)
  if (present.length === 0) return { kind: 'absent', fade: null }
  if (present.length !== FADE_FIELDS.length) {
    const missing = FADE_FIELDS.filter(f => !present.includes(f))
    throw new Error(
      `${where}: fade set is PARTIAL — missing ${missing.join(', ')}. ` +
      `The fade set is all-present or all-absent; a partial set cannot be completed ` +
      `without inventing the operator's intent (EXTENT-DESIGN §5.1).`)
  }
  if (!Number.isFinite(nb.innerFadeOffset)) throw new Error(`${where}: innerFadeOffset is not a finite number`)
  for (const f of ['fade', 'streetFade']) {
    if (!isBand(nb[f])) throw new Error(`${where}: ${f} must be { inner, outer } with finite numbers`)
  }
  if (!Number.isFinite(nb.radius)) {
    throw new Error(`${where}: radius is missing — a fade set cannot be classified authored-vs-generated without it`)
  }
  const fade = {
    innerFadeOffset: nb.innerFadeOffset,
    fade: { inner: nb.fade.inner, outer: nb.fade.outer },
    streetFade: { inner: nb.streetFade.inner, outer: nb.streetFade.outer },
  }
  return { kind: sameFade(fade, generatedFade(nb.radius)) ? 'generated' : 'authored', fade }
}

/**
 * Split a parsed artifact into its three records.
 *
 * `keyOrder` + `carry` exist so `compose` is BYTE-identical, not merely
 * value-identical: `carry` holds every top-level key that is none of the three
 * records' business (`description` on LS, `_comment` on toy — authored operator
 * text that the fresh-object construction used to drop on the floor).
 */
export function splitBoundary(nb, where = 'boundary') {
  if (!nb || typeof nb !== 'object') throw new Error(`${where}: not an object`)
  if (!Number.isFinite(nb.radius)) throw new Error(`${where}: radius is missing or not a finite number`)
  if (!Array.isArray(nb.boundary) || nb.boundary.length === 0) {
    throw new Error(`${where}: boundary ring is missing or empty`)
  }
  const { kind, fade } = classifyFade(nb, where)

  const disc = {
    version: nb.version,
    center: nb.center,
    radius: nb.radius,
    boundary: nb.boundary,
    fade,                 // null when kind === 'absent'
    fadeOrigin: kind,     // derived, never stored
  }
  const membership = (Array.isArray(nb.polygon) && nb.polygon.length >= 3)
    ? { polygon: nb.polygon, polygonSource: nb.polygonSource }
    : null
  const exclusions = Array.isArray(nb.exclusions) ? nb.exclusions : null

  const OWNED = new Set(['version', 'center', 'radius', 'boundary', ...FADE_FIELDS,
    'polygon', 'polygonSource', 'exclusions'])
  const carry = {}
  for (const k of Object.keys(nb)) if (!OWNED.has(k)) carry[k] = nb[k]

  return { disc, membership, exclusions, carry, keyOrder: Object.keys(nb) }
}

/**
 * Recompose the three records into the on-disk artifact. Emits keys in
 * `keyOrder` first (so a round-trip is byte-identical), then any new key.
 */
export function composeBoundary({ disc, membership, exclusions, carry, keyOrder = [] }) {
  const flat = { ...carry }
  if (disc.version !== undefined) flat.version = disc.version
  if (disc.center !== undefined) flat.center = disc.center
  flat.radius = disc.radius
  if (disc.fade) Object.assign(flat, disc.fade)
  flat.boundary = disc.boundary
  // exclusions before polygon — the order the fresh-object construction produced,
  // so a FIRST pour (no prior `keyOrder` to follow) writes the same bytes as before.
  // Any non-null array is emitted, INCLUDING an empty one: the legacy radius-only
  // rescope preserved a bare `exclusions: []` verbatim, and dropping it here would
  // be a silent schema change. The active branches pass null when they mean absent.
  if (exclusions) flat.exclusions = exclusions
  if (membership) {
    flat.polygon = membership.polygon
    if (membership.polygonSource !== undefined) flat.polygonSource = membership.polygonSource
  }

  const out = {}
  for (const k of keyOrder) if (k in flat) out[k] = flat[k]
  for (const k of Object.keys(flat)) if (!(k in out)) out[k] = flat[k]
  return out
}

/**
 * Build the DISC record for a commit / rescope.
 *
 * `radius` and `center` are the operator's gesture and always apply; the ring is
 * always re-derived. The FADE SET is the part that used to be destroyed:
 *
 *   - no prior disc, or a prior whose fade was GENERATED → generate from the new
 *     radius. Byte-identical to the old behaviour for every scene but LS.
 *   - prior fade AUTHORED, radius unchanged → PRESERVE it verbatim. This is the fix.
 *   - prior fade AUTHORED, radius CHANGED → ⛔ THROW. The bands are absolute metres
 *     and `fade.outer` is the silhouette edge; holding them at a new radius leaves
 *     the feather finishing inside the disc, and scaling them invents an intent the
 *     operator never expressed. Neither is knowable, so neither is guessed — the
 *     kit says which four values are in conflict and stops (CLAUDE.md Layer 0, q2).
 *   - prior fade ABSENT → treated as no prior. `toy`'s absence is legal to READ but
 *     nothing carries it through a commit today, and inventing that carry would be
 *     a behaviour change this window does not have.
 */
export function makeDiscRecord({ radius, center = [0, 0], prior = null, where = 'boundary' }) {
  if (!Number.isFinite(radius) || radius <= 0) throw new Error(`${where}: need a positive radius`)
  const R = Math.round(radius)
  const r2 = (v) => Math.round(v * 100) / 100
  const cx = r2(center?.[0] || 0), cz = r2(center?.[1] || 0)

  let fade, fadeOrigin
  if (prior && prior.fadeOrigin === 'authored') {
    if (prior.radius !== R) {
      const g = generatedFade(R)
      throw new Error(
        `${where}: this scene has an AUTHORED fade set and the radius is changing ` +
        `(${prior.radius} → ${R}). Authored: innerFadeOffset ${prior.fade.innerFadeOffset}, ` +
        `fade ${prior.fade.fade.inner}/${prior.fade.fade.outer}, ` +
        `streetFade ${prior.fade.streetFade.inner}/${prior.fade.streetFade.outer}. ` +
        `Generated at the new radius would be ${g.innerFadeOffset}, ` +
        `${g.fade.inner}/${g.fade.outer}, ${g.streetFade.inner}/${g.streetFade.outer}. ` +
        `The bands are absolute metres, so they can neither be held nor scaled without ` +
        `guessing — re-author the fade set for the new radius, or keep the radius.`)
    }
    fade = prior.fade
    fadeOrigin = 'authored'
  } else {
    fade = generatedFade(R)
    fadeOrigin = 'generated'
  }

  return { version: 2, center: [cx, cz], radius: R, boundary: makeRing(R, cx, cz), fade, fadeOrigin }
}
