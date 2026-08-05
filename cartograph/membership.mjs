/**
 * membership.mjs — THE ONE building-membership decision. (ROADMAP A08.)
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
  const polygon = Array.isArray(nb?.polygon) && nb.polygon.length >= 3 ? nb.polygon : null
  const exclusions = Array.isArray(nb?.exclusions)
    ? nb.exclusions.filter(e => Array.isArray(e) && e.length >= 3)
    : []
  const cx = nb?.center?.[0] ?? 0
  const cz = nb?.center?.[1] ?? 0
  const r2 = (nb?.radius ?? Infinity) ** 2

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
    // 4. exclusion loops — the coarse correction.
    for (const e of exclusions) if (pointInPolygon(bx, bz, e)) { stats.excluded++; stats.out++; return false }
    // 5. the polygon decides; the disc is the fallback only when there is none.
    const keep = polygon ? pointInPolygon(bx, bz, polygon) : (bx - cx) ** 2 + (bz - cz) ** 2 <= r2
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

/** The id a building is keyed by everywhere: msbf- if it has one, else osm-. */
export function buildingIdOf(b) {
  if (b?.id != null) return b.id
  if (b?.msbfId != null) return `msbf-${b.msbfId}`
  if (b?.osmId != null) return `osm-${b.osmId}`
  return null
}
