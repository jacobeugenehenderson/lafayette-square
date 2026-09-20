/**
 * `neighborhood_boundary.json` — THREE RECORDS, ONE FILE (`EXTENT-DESIGN §5.1`).
 *
 * The artifact welds three jobs, and the weld is what destroys authored values:
 *
 *   ① DISC       — `version` `center` `radius` `boundary[256]` + `fadeBand`, the
 *                  ONE fade knob. "How much world do we draw." The feather is a
 *                  downstream contract (`SLAB-CONTRACT §2.1`) and `fade.outer`
 *                  sets the content clip radius (`pipeline.js` keepR) — both
 *                  DERIVED from `radius` + `fadeBand`, never stored.
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
 * byte-for-byte — `node checks/claims-boundary-record-split.mjs` proves it.
 *
 * ⭐ AUTHORED vs GENERATED is DERIVED, never stamped. A fade set is "generated" iff
 * its `fadeBand` equals `DEFAULT_FADE_BAND`; otherwise it is the operator's. That
 * needs no new field, no migration, and cannot go stale — it measures the artifact
 * against the one live formula rather than restating a verdict (CLAUDE.md §PRUNE).
 */

/**
 * The fade set, as a set. ⭐ It is now ONE field: `fadeBand`.
 *
 * `innerFadeOffset`, `fade` and `streetFade` were removed 2026-09-20 — the first
 * was renamed by the additive ruling, the other two were stored copies of numbers
 * derivable from `radius` (`fade.outer === radius` held EXACTLY in all five
 * fade-carrying scenes on disk, which is what a redundant copy looks like).
 */
export const FADE_FIELDS = ['fadeBand']

/**
 * The default feather width in metres — the value every Extent-poured town already
 * carried. LS carried 134 (an unauthored 2019 migration default) until the band was
 * ruled kit-wide at 200 on 2026-09-20; its look changed on purpose.
 */
export const DEFAULT_FADE_BAND = 200

/**
 * ⭐ THE ONE FADE FORMULA, and it is the only one. INWARD: the feather ends AT the
 * rim, dissolving content from inside the disc.
 *
 * ⛔ THE RADIUS CUTS THE GEOMETRY, AND THAT IS THE INTENDED BEHAVIOUR (Jacob,
 * 2026-09-20): *"We can just adjust the circle in the extent tool… The radius cuts
 * off the geometry, might as well just keep that."* An operator who wants more
 * content at the edge PULLS THE CIRCLE OUT — an authoring gesture, not a render
 * change. The override is the product.
 *
 * ⚠️ An ADDITIVE band (`inner: radius, outer: radius + band`) was tried and reverted
 * the same day. It is recorded here because the reason is not obvious: outward only
 * works if every fading population carries geometry all the way to `fade.outer`, and
 * that precondition is silently false — LS block fill stops INSIDE the rim in 261 of
 * 360 bearings, so it rendered at full alpha against a ragged straight-sided edge.
 * ▶ node checks/claims-fade-has-something-to-dissolve.mjs
 */
export function deriveFade(radius, fadeBand = DEFAULT_FADE_BAND) {
  const band = Number.isFinite(fadeBand) ? fadeBand : DEFAULT_FADE_BAND
  return { inner: Math.max(0, radius - band), outer: radius }
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

/** Equal over the fade set — which is one knob. */
export function sameFade(a, b) {
  return a.fadeBand === b.fadeBand
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
  if (!Number.isFinite(nb.fadeBand)) throw new Error(`${where}: fadeBand is not a finite number`)
  if (nb.fadeBand < 0) throw new Error(`${where}: fadeBand is negative (${nb.fadeBand}) — a width cannot be negative; it would put fade.inner past fade.outer`)
  const fade = { fadeBand: nb.fadeBand }
  return { kind: nb.fadeBand === DEFAULT_FADE_BAND ? 'generated' : 'authored', fade }
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
 * always re-derived. `fadeBand` rides through untouched.
 *
 *   - prior carries a fadeBand → CARRY IT, whatever the radius does.
 *   - no prior, or prior fade ABSENT → the default band.
 *
 * ⭐ A RADIUS CHANGE IS NO LONGER A CONFLICT, and that is the whole point of the
 * 2026-09-20 ruling. This function used to THROW when an authored fade met a
 * changed radius, because the stored bands were absolute metres that could neither
 * be held (feather finishes inside the disc) nor scaled (invents intent). ⛔ That
 * dilemma was manufactured by storing derived numbers. `fadeBand` is a WIDTH, not a
 * position: it is radius-independent, so it survives any rescope and `fade` simply
 * re-derives at the new radius. The throw is gone because the conflict is gone.
 *
 * ⛔ Note what "preserve" now means. The old code preserved `fade`/`streetFade` —
 * stored copies that kept pointing at the OLD circle after a rescope. Preserving
 * THOSE was the bug. Preserving `fadeBand` is correct: it is the operator's knob
 * and nothing else.
 */
export function makeDiscRecord({ radius, center = [0, 0], prior = null, where = 'boundary' }) {
  if (!Number.isFinite(radius) || radius <= 0) throw new Error(`${where}: need a positive radius`)
  const R = Math.round(radius)
  const r2 = (v) => Math.round(v * 100) / 100
  const cx = r2(center?.[0] || 0), cz = r2(center?.[1] || 0)

  let fade, fadeOrigin
  if (prior && prior.fade && Number.isFinite(prior.fade.fadeBand)) {
    fade = { fadeBand: prior.fade.fadeBand }
    fadeOrigin = prior.fadeOrigin
  } else {
    fade = { fadeBand: DEFAULT_FADE_BAND }
    fadeOrigin = 'generated'
  }

  return { version: 2, center: [cx, cz], radius: R, boundary: makeRing(R, cx, cz), fade, fadeOrigin }
}
