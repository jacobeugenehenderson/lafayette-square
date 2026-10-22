import { readFileSync } from 'node:fs'
import { lookFade } from './boundaryRecords.mjs'

/**
 * membership.mjs — THE ONE membership decision: buildings (ROADMAP A08), and the point test and dissolve every other
 * object reads (`insideHood`, `discOf`, `makeMembership`).
 *
 * ⭐ THE WHOLE REASON THIS MODULE EXISTS: the decision used to be written out
 * three times — `pipeline.js` pre-clip, `pipeline.js` post-derive, and
 * `bake-buildings.js` — under a comment asserting they "must match exactly so
 * 2D + slab agree on membership." They did not. For a footprint with fewer than
 * three vertices, pipeline pre-clip KEPT it, pipeline post-derive centroid-TESTED
 * it, and the bake DROPPED it. Three behaviours, one stated contract, and the
 * consequence was that the 2D Designer could show a building the slab does not —
 * findable only by diffing three filters in two files.
 *
 * So the fix is not "pick a rule and paste it three times." It is one function.
 *
 * ── THE PRECEDENCE (RULED 2026-08-04 — NEIGHBORHOOD-INPUTS §5.2) ────────────
 * The formula is ORDERED and THE FINEST GESTURE WINS. Coarse → fine: the
 * inclusion polygon (what the hood IS) → exclusion loops (a coarse sweep) →
 * per-building activate/hide (the finest statement).
 *
 *     hide ⇒ OUT · else activate ⇒ IN · else in any exclusion loop ⇒ OUT
 *          · else the polygon (or the disc, when a scene carries no polygon)
 *
 *     ((polygon − exclusions) ∪ activate) − hide
 *
 * ⛔ Do NOT "fix" this to the old flat form `(polygon ∪ activate) − (exclusions
 * ∪ hide)`. That form silently discarded a per-building override — an operator
 * who lassos a strip out and clicks the corner bakery back in would get nothing,
 * with no signal. `CLAUDE.md` Layer 0 q3: the override IS the product.
 *
 * ── DEGENERATE FOOTPRINTS: undecidable, and therefore LOUD ──────────────────
 * A ring with fewer than 3 vertices has no trustworthy centroid, so membership
 * cannot be evaluated for it. That is a genuine failure, and Layer 0 q2 says a
 * failure must be loud rather than resolved into a plausible-looking answer.
 *
 * Both of the old behaviours were silent, and each is bad in its own direction:
 * dropping quietly deletes a building (and its content — "losing soft contents
 * outranks losing geometry"), keeping quietly passes malformed geometry on.
 *
 * The rule here: `hide`/`activate` still apply because they are ID-keyed and
 * need no geometry; past that the building is KEPT and COUNTED, and `report()`
 * prints a ⛔ line naming the ids. Membership is not a data-quality culler —
 * a malformed footprint is an INTAKE defect and must be fixed at source. The
 * bake's mesh loop separately (and now audibly) skips what it cannot extrude.
 */

/**
 * Even-odd ray cast, FORMAT-AGNOSTIC — a ring vertex may be `{x, z}` or `[x, z]`.
 *
 * ⚠️ Read this before "simplifying" it. `nb.polygon` and `nb.exclusions` are
 * persisted as `{x, z}` OBJECTS (verified on every scene on disk), while building
 * rings appear in both shapes depending on the stage. Both old copies of this
 * function hard-coded the object form; a unification that assumed `[x, z]` would
 * read `undefined` for every coordinate, make every comparison false, and return
 * `false` for every point — i.e. it would silently drop EVERY building in any
 * scene that has a polygon. That failure renders as an empty map, not an error.
 */
const vx = (p) => (Array.isArray(p) ? p[0] : p.x)
const vz = (p) => (Array.isArray(p) ? p[1] : p.z)

export function pointInPolygon(px, pz, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = vx(poly[i]), zi = vz(poly[i])
    const xj = vx(poly[j]), zj = vz(poly[j])
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/**
 * ⭐ THE DISC, ABOUT ITS OWN CENTRE (BRIEF-the-disc-is-one-source §1a, 2026-10-21). The boundary file stores `radius` and
 * `center`; the disc is the circle of that radius about that centre, never about the origin. Right only where the centre is
 * (0, 0): LS's is (−15, −15), Huron's (−46.42, −36.21), and an origin circle disagreed with the ring by 21 m and 59 m at the rim.
 * ⛔ A file with no `center` or no `radius` is refused by name (a reader without a disc refuses; no default stands in).
 * ▶ node checks/claims-membership-is-the-disc.mjs
 */
export function discOf(nb, who = 'membership') {
  const c = nb?.center, R = nb?.radius
  if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1]))
    throw new Error(`[${who}] ⛔ the boundary file carries no \`center\` (${JSON.stringify(c)}) — the disc cannot be placed; never the origin`)
  if (!(Number.isFinite(R) && R > 0)) throw new Error(`[${who}] ⛔ the boundary file carries no \`radius\` (${JSON.stringify(R)}) — the disc has no size`)
  const cx = c[0], cz = c[1]
  const dist = (x, z) => Math.hypot(x - cx, z - cz)
  return { cx, cz, R, dist, inDisc: (x, z) => dist(x, z) <= R }
}

/**
 * ⭐ THE CANON'S POINT TEST, ONE HOME: is (x, z) inside the neighbourhood? In any exclusion loop ⇒ OUT · else the authored
 * `polygon` decides · else the disc (`discOf`). The ID-keyed gestures (activate/hide) are the building filter's, below; this
 * is the same order without them, for objects that have no id (labels, lamps, trees).
 */
export function insideHood(nb, who = 'membership') {
  const polygon = Array.isArray(nb?.polygon) && nb.polygon.length >= 3 ? nb.polygon : null
  const exclusions = Array.isArray(nb?.exclusions) ? nb.exclusions.filter(e => Array.isArray(e) && e.length >= 3) : []
  const disc = polygon ? null : discOf(nb, who)
  const inside = (x, z) => {
    for (const e of exclusions) if (pointInPolygon(x, z, e)) return false
    return polygon ? pointInPolygon(x, z, polygon) : disc.inDisc(x, z)
  }
  return { inside, polygon, exclusions }
}

/**
 * Build the membership predicate for one scene.
 *
 * @param {object}   o
 * @param {object}   o.nb        the parsed `neighborhood_boundary.json`
 * @param {Set}      o.activate  ids forced IN  (`building-overrides.json`)
 * @param {Set}      o.hide      ids forced OUT (`building-overrides.json`)
 * @param {string}   o.label     log prefix, e.g. 'pipeline/pre-clip'
 * @returns {{ decide: (id: string|null, ring: Array|null) => boolean,
 *             report: () => void, stats: object }}
 */
export function createMembershipFilter({ nb, activate = new Set(), hide = new Set(), label = 'membership' }) {
  const hood = insideHood(nb, label), polygon = hood.polygon, exclusions = hood.exclusions

  const stats = { in: 0, out: 0, hidden: 0, activated: 0, excluded: 0, undecidable: 0, undecidableIds: [] }

  function decide(id, ring) {
    // 1. hide — the finest gesture, negative. Beats everything, needs no geometry.
    if (id && hide.has(id)) { stats.hidden++; stats.out++; return false }
    // 2. activate — the finest gesture, positive. Beats an exclusion loop.
    if (id && activate.has(id)) { stats.activated++; stats.in++; return true }
    // 3. UNDECIDABLE — no centroid, so no membership answer. Keep + count + shout.
    const pts = ring || []
    if (pts.length < 3) {
      stats.undecidable++
      if (stats.undecidableIds.length < 20) stats.undecidableIds.push(id ?? '<no id>')
      stats.in++
      return true
    }
    let sx = 0, sz = 0
    for (const p of pts) { sx += vx(p); sz += vz(p) }
    const bx = sx / pts.length, bz = sz / pts.length
    // 4. exclusion loops — the coarse correction (counted here; `insideHood` applies the same order).
    if (exclusions.some(e => pointInPolygon(bx, bz, e))) { stats.excluded++; stats.out++; return false }
    // 5. the polygon decides; the disc about its own centre only when there is none (`insideHood`).
    const keep = hood.inside(bx, bz)
    keep ? stats.in++ : stats.out++
    return keep
  }

  function report() {
    console.log(
      `[${label}] membership: kept ${stats.in}, dropped ${stats.out} ` +
      `(poly=${!!polygon}, excl=${exclusions.length}, +${activate.size}/−${hide.size}; ` +
      `forced in ${stats.activated}, hidden ${stats.hidden}, excluded ${stats.excluded})`
    )
    // ⛔ NO SILENT DEGRADATION. A footprint we cannot centroid is an intake
    // defect; it is kept so nothing is lost, and named so it gets fixed.
    if (stats.undecidable > 0) {
      console.warn(
        `[${label}] ⛔ ${stats.undecidable} building(s) have a footprint with <3 vertices — ` +
        `membership is UNDECIDABLE for them and they were KEPT unjudged. ` +
        `This is an INTAKE defect, not a membership one; fix it at the fetch. ` +
        `ids: ${stats.undecidableIds.join(', ')}${stats.undecidable > stats.undecidableIds.length ? ', …' : ''}`
      )
    }
  }

  return { decide, report, stats }
}

/**
 * ⭐ THE ONE MINTER — the id a building is keyed by EVERYWHERE (the pour, membership, bake-buildings, bake-content,
 * Extent's footprint layer). It replaced four copies that agreed only by copy-paste (BRIEF-nyc-adapter step 3).
 *   a stamped `id` · a declared well's `<kind>-<permanent id>` (bin-4029691) or `<well>-<n>` · `msbf-<n>` · `osm-<id>`
 *   · a curated `projectId` (LS's project data) · else null.
 */
export function buildingIdOf(b) {
  if (b?.id != null) return b.id
  // A declared geometry well (footprint-well.mjs): its permanent id (`bin-4029691`), or its centroid-registry number.
  if (b?.keyKind === 'centroid' && b.well && b.wellN != null) return `${b.well}-${b.wellN}`
  if (b?.keyKind && b.permanentId != null) return `${b.keyKind}-${b.permanentId}`
  if (b?.msbfId != null) return `msbf-${b.msbfId}`
  if (b?.osmId != null) return `osm-${b.osmId}`
  if (b?.projectId != null) return b.projectId
  return null
}

/**
 * makeMembership — "is this inside the neighborhood proper?", and the dissolve beyond it (folded in from
 * neighborhood-membership.mjs, 2026-10-21: one module, one formula).
 *
 * ⭐ THE RULE (Jacob, 2026-07-15): *"We want the trees and lamps as literal as
 * possible inside the neighborhood proper; outside, inside the radius, we watch
 * for GPU."*
 *
 * Two regions, and the canon already draws the line (`NEIGHBORHOOD-INPUTS §5.2`,
 * `README §21`): **the neighborhood is the boundary-STREET POLYGON, not the
 * circle — the circle stays the slab disc/fade.**
 *
 *   INSIDE the polygon   → LITERAL. Real census, honest surfaces, nothing thinned.
 *   OUTSIDE, inside R    → the greater circle. GPU-managed: dissolve + hero-tier.
 *
 * Buildings (`pipeline.js`) and lamps (`bake-lamps.js`) already test membership
 * this way; each rolled its own copy. This is the shared one, so the hood's edge
 * means the same thing for every object standing in it
 * (`project_the_palimpsest_code_path_multiplicity` — collapse paths, never add one).
 *
 * ⚠️ A DISSOLVE, never an on/off cut (Jacob: *"I'd rather a dissolve [than an]
 * on/off edge fade dichotomy"*). The ramp is not invented here — it is the ground's
 * fade band, so objects thin out over exactly the band the ground fades on.
 *
 * ⛔⛔ AND IT IS DERIVED, NOT READ. This module used to read a stored
 * `fade: {inner, outer}` off the artifact with `?? R` on both sides. The fade-SSoT
 * work (77aa5aa9) deleted that stored field — it was a copy of numbers derivable
 * from `radius` — and BOTH `??` then fired, collapsing fadeIn and fadeOut onto R.
 * `density()` became 1-inside / 0-outside: exactly the on/off dichotomy quoted
 * above, reinstated four lines below the ruling against it, silently, in every
 * town. ⭐ 77aa5aa9 found ONE consumer of the deleted field (bake-ground's manifest
 * gate) and there were FOUR; the other three reach it through here. Found by the
 * arborist seat 2026-09-20, measured on HPDM: 34 lamps and 1,417 derived trees had
 * stopped thinning.
 *
 * ⛔ NO `??` HERE EVER AGAIN. The band is the baked Look's, passed in (`design`); a caller that thins
 * without one is refused, never handed a guessed band.
 */
/** Deterministic [0,1) from a position — stable across re-bakes. */
function hash01(x, z, salt) {
  let h = Math.imul(Math.round(x * 10) | 0, 73856093) ^ Math.imul(Math.round(z * 10) | 0, 19349663) ^ Math.imul(salt, 83492791)
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/**
 * @param {string} boundaryPath  cartograph/data/<scene>/neighborhood_boundary.json
 * @returns {{
 *   isInside(x,z): boolean,        // inside the neighborhood proper (the street polygon)
 *   keep(x,z, salt?): boolean,     // the DISSOLVE — inside: always; outside: thinning to 0 at the rim
 *   density(x,z): number,          // 1 inside, ramping to 0 across the fade band
 *   hasPolygon: boolean,           // false → no street polygon persisted; disc is all we have
 *   radius: number,
 * }}
 */
export function makeMembership(boundaryPath, { design = null, look = '?' } = {}) {
  const b = JSON.parse(readFileSync(boundaryPath, 'utf-8'))
  // ⭐ ONE FORMULA (BRIEF-the-disc-is-one-source §1a, 2026-10-21): inside is the canon's `insideHood`, and the dissolve's
  // distance is measured from the disc's own centre (`discOf`). This used to be a second copy: polygon or exclusions,
  // else a circle of the radius about the ORIGIN.
  const hood = insideHood(b, 'membership'), disc = discOf(b, 'membership'), R = disc.R, poly = hood.polygon
  // The ground's own fade band — the BAKED LOOK's (Stage › Horizon › Edge, 2026-10-06), derived by the same rule
  // the ground bake uses (`boundaryRecords.mjs#lookFade`), so objects thin over exactly the band the ground fades on.
  // ⭐ No presence gate: every Look has a band (its own, or the kit's 5% of the radius, said). The dissolve is how the
  // Look RENDERS the edge; membership itself (`isInside`) never reads it.
  // ⛔ A caller that asks for `density`/`keep` without a design is refused — never a band guessed for it.
  const fade = design ? lookFade(design, R, 'membership', look) : null
  const fadeIn = fade?.inner, fadeOut = fade?.outer
  const needFade = (what) => { if (!fade) throw new Error(`[membership] ⛔ ${what}() needs the baked Look's design for its fade band — makeMembership(path, { design, look })`) }

  const isInside = hood.inside

  /**
   * 1.0 inside the neighborhood proper — literal, never thinned.
   * Outside, it rides the ground's fade band to 0 at the rim, so the greater
   * circle dissolves rather than ending at a seam.
   */
  const density = (x, z) => {
    needFade('density')
    if (isInside(x, z)) return 1
    const r = disc.dist(x, z)
    if (r >= fadeOut) return 0
    if (r <= fadeIn) return 1
    return 1 - (r - fadeIn) / (fadeOut - fadeIn)
  }

  const keep = (x, z, salt = 1) => {
    const d = density(x, z)
    if (d >= 1) return true
    if (d <= 0) return false
    return hash01(x, z, salt) < d
  }

  // ⭐ `fade` is exposed so the band can be asserted DIRECTLY. It cannot be inferred
  // from density(): on a scene with no boundary-street polygon, isInside covers the
  // whole disc and SHADOWS the band entirely, so an invented band is invisible to
  // every behavioural probe. A check that can only see symptoms cannot pin this.
  return { isInside, keep, density, hasPolygon: !!poly, fade: fade && { inner: fadeIn, outer: fadeOut }, radius: R }
}
