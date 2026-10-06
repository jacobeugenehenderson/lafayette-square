/**
 * `neighborhood_boundary.json` — THREE RECORDS, ONE FILE (`EXTENT-DESIGN §5.1`).
 *
 * The artifact welds three jobs, and the weld is what destroys authored values:
 *
 *   ① DISC       — `version` `center` `radius` `boundary[256]`. "How much world do
 *                  we draw." ⛔ NO FADE: the edge's band + ruffle are the LOOK's
 *                  (Stage › Horizon › Edge, 2026-10-06); `fadeBand`/`fadeRuffle`
 *                  are RETIRED from this file and refused if present.
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
 */

/**
 * ⛔ FADE FIELDS RETIRED FROM THE BOUNDARY FILE (2026-10-06). The band moved to the Look (`edgeFadeBand`) and the
 * ruffle to a Look channel (`edgeRuffle`); every town's value was migrated into its Look first. A boundary file that
 * still carries one is REFUSED by name — carried silently it would be a second origin for the edge that nothing reads.
 * (`innerFadeOffset`, `fade`, `streetFade` went 2026-09-20 as stored copies of derivable numbers.)
 */
export const RETIRED_FADE_FIELDS = ['fadeBand', 'fadeRuffle', 'innerFadeOffset', 'fade', 'streetFade']

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
export function deriveFade(radius, band) {
  if (!Number.isFinite(band)) throw new Error(`[deriveFade] ⛔ band ${JSON.stringify(band)} — a fade needs its band; there is no default here (the Look's, via lookFade)`)
  return { inner: Math.max(0, radius - band), outer: radius }
}

/**
 * ⭐ THE BAND'S HOME IS THE LOOK (Jacob, 2026-10-06: the edge's Fade band + Ruffle move from Extent to Stage). A Look
 * carries `edgeFadeBand` in metres; a Look without one takes the kit's neutral default, 5% of the radius — a fraction,
 * never a width in metres that is right only for a town of one size (`CLAUDE.md` Layer 0, Class D) — and says so,
 * ONCE per Look per load (`announce`), never per frame. The ruffle is the Look's `edgeRuffle` channel, read at render.
 * ⛔ A negative band THROWS: it would put fade.inner past the rim.
 * ⛔ Geometry does not read this: the clip is the radius exactly (2026-10-06, Jacob's (a)). Only the rendering does.
 */
export const EDGE_DEFAULT_BAND_FRACTION = 0.05
const _announced = new Set()
export function edgeBandOf(design, radius, who = 'edge', look = '?') {
  const b = design?.edgeFadeBand
  if (b != null) {
    if (!Number.isFinite(b) || b < 0) throw new Error(`[${who}] ⛔ Look "${look}" edgeFadeBand = ${JSON.stringify(b)} — must be a width in metres, ≥ 0`)
    return { band: b, source: 'look' }
  }
  const band = EDGE_DEFAULT_BAND_FRACTION * radius
  const k = `${who}|${look}|${radius}`
  if (!_announced.has(k)) { _announced.add(k)
    console.warn(`[${who}] Look "${look}" authors no edge fade band — using the kit default, 5% of the radius = ${band.toFixed(1)} m (Stage › Horizon › Edge).`) }
  return { band, source: 'default' }
}
/** The Look's edge fade, derived: `{ inner, outer }` from the radius and the Look's band. */
export const lookFade = (design, radius, who, look) => deriveFade(radius, edgeBandOf(design, radius, who, look).band)

/**
 * ⭐ THE DISC STAYS INSIDE THE FETCHED DATA — `EXTENT-DESIGN §4` (`bbox ⊇ disc + padding`). The tightest margin, in
 * metres, between the disc (centre + radius, local frame: x east, z = −Δlat) and the town's `geography.json` bbox;
 * negative ⇒ the rim shows ground nobody fetched. ⚠️ The padding is unquantified (`§4` names a percentage), so 0.
 * ▶ node checks/claims-the-disc-stays-inside-the-bb.mjs
 */
export function discMargin(geo, center, radius) {
  const B = geo?.bbox
  if (!B || !Number.isFinite(geo.lonToMeters) || !Number.isFinite(geo.latToMeters)) return null
  const x0 = (B.minLon - geo.lon) * geo.lonToMeters, x1 = (B.maxLon - geo.lon) * geo.lonToMeters
  const z0 = -(B.maxLat - geo.lat) * geo.latToMeters, z1 = -(B.minLat - geo.lat) * geo.latToMeters
  const [cx, cz] = center || [0, 0]
  return Math.min(cx - radius - x0, x1 - (cx + radius), cz - radius - z0, z1 - (cz + radius))
}
/** Refuse a disc that reaches past its bbox — or that cannot be checked (no bbox). Never a silent write. */
export function assertDiscInBox(geo, center, radius, where) {
  const m = discMargin(geo, center, radius)
  if (m === null) throw new Error(`${where}: geography.json carries no usable bbox — the disc cannot be checked against the fetched data. Refusing.`)
  if (m < 0) throw new Error(`${where}: the disc (radius ${Math.round(radius)} m) reaches ${Math.round(-m)} m past the fetched bounding box — its rim would show ground nobody fetched (EXTENT-DESIGN §4). Shrink the radius, move the disc, or re-fetch a larger box.`)
  return m
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

/**
 * Split a parsed artifact into its three records.
 *
 * `keyOrder` + `carry` exist so `compose` is BYTE-identical, not merely
 * value-identical: `carry` holds every top-level key that is none of the three
 * records' business (`description` on LS, `_comment` — authored operator
 * text that the fresh-object construction used to drop on the floor).
 */
export function splitBoundary(nb, where = 'boundary') {
  if (!nb || typeof nb !== 'object') throw new Error(`${where}: not an object`)
  if (!Number.isFinite(nb.radius)) throw new Error(`${where}: radius is missing or not a finite number`)
  if (!Array.isArray(nb.boundary) || nb.boundary.length === 0) {
    throw new Error(`${where}: boundary ring is missing or empty`)
  }
  const retired = RETIRED_FADE_FIELDS.filter(f => nb[f] !== undefined)
  if (retired.length) throw new Error(`${where}: carries retired fade field(s) ${retired.join(', ')} — the edge fade is the Look's (Stage › Horizon › Edge). Move the value into the Look's edgeFadeBand / edgeRuffle and delete it here.`)

  const disc = {
    version: nb.version,
    center: nb.center,
    radius: nb.radius,
    boundary: nb.boundary,
  }
  const membership = (Array.isArray(nb.polygon) && nb.polygon.length >= 3)
    ? { polygon: nb.polygon, polygonSource: nb.polygonSource }
    : null
  const exclusions = Array.isArray(nb.exclusions) ? nb.exclusions : null

  const OWNED = new Set(['version', 'center', 'radius', 'boundary',
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
 * Build the DISC record for a commit / rescope: `radius` and `center` are the operator's gesture and always apply;
 * the ring is always re-derived. Nothing about the edge's fade — that is the Look's.
 */
export function makeDiscRecord({ radius, center = [0, 0], where = 'boundary' }) {
  if (!Number.isFinite(radius) || radius <= 0) throw new Error(`${where}: need a positive radius`)
  const R = Math.round(radius)
  const r2 = (v) => Math.round(v * 100) / 100
  const cx = r2(center?.[0] || 0), cz = r2(center?.[1] || 0)

  return { version: 2, center: [cx, cz], radius: R, boundary: makeRing(R, cx, cz) }
}
