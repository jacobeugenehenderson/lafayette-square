/**
 * prominence.mjs — which buildings get promoted from bare building to landmark,
 * and in what order.  (`INTAKE-CATALOGUE §4.3`, `BRIEF-roster-prominence-C`.)
 *
 * ⛔ NAME COLLISION, AND IT IS NOT THIS FILE. "Prominence" also named a RETIRED tree-LOD
 * classifier in the arborist (`promThreshold`, "the hero-pan prominence classifier",
 * `arborist/ARCHITECTURE.md`). That one is dead and its per-scene threshold no longer
 * exists. This is `INTAKE-CATALOGUE §4`'s word for buildings and it is the canon's, so
 * it stays — but if you arrived here from a tree-render doc, you are in the wrong file.
 *
 * ⭐ THE LADDER IS `_bare: true` → landmark (`src/hooks/useListings.js:105`).
 * There is no third state and no new noun: this file produces an ORDER over the
 * bare set, so the operator can work down it and stop anywhere.
 *
 * ── THE TWO CONSTRAINTS (`§4.3`, non-negotiable) ──────────────────────────────
 *
 * ① ⛔ THE RANK IS A SORT, NEVER A FILTER. Every building in the roster gets a
 *    rank; there is no threshold, no top-N cut, no score that suppresses a card.
 *    Rank N is as reachable as rank 1 — the number orders a work queue and that
 *    is the whole of its authority.
 *
 * ② ⭐ HAND-PROMOTION OUTRANKS THE SCORE, and it is designed here FIRST rather
 *    than bolted on. `record.promoted` — patched in via the town's own
 *    `content/roster.overrides.json` — sorts a building above every scored one.
 *    Its `by` field is the seam for `§4.3`'s resident path ("connect your
 *    neighborhood" captures a prominence signal no dataset carries): `by:'resident'`
 *    needs no change here. ⛔ That path is NOT built in this file — the seam is.
 *
 * ── ⛔ NO FALLBACKS: AN ABSENT WELL IS DROPPED, NOT ZERO-FILLED ───────────────
 *
 * A signal splits into two families and they must not be confused:
 *
 *   PRESENCE signals (OSM tags) — absence is real negative evidence. A building
 *     with no `wikidata` genuinely was not catalogued. Scores 0, correctly.
 *
 *   VALUE signals (assessor: appraised value, sqft, units) — absence is IGNORANCE.
 *     A building whose parcel did not match has an UNKNOWN value, not a low one.
 *     Zero-filling it would rank "we failed to join this" identically to "this is
 *     the cheapest building in town" — a confident wrong answer, which is exactly
 *     the class `CLAUDE.md` Layer 0 q2 forbids.
 *
 *   ⇒ So: a signal NO building in the town can supply is dropped for the whole
 *     town — uniform, and therefore RANK-NEUTRAL, because a sort is invariant
 *     under a constant. A signal SOME buildings lack is scored 0 for them AND
 *     named in `prominence.unknown`, so the breakdown says out loud that this
 *     building's rank was computed on less evidence than its neighbour's.
 *
 * ── THE WEIGHTS ARE PRE-REGISTERED ───────────────────────────────────────────
 *
 * ⛔ Set from `INTAKE-CATALOGUE §4.1`'s own prose ordering BEFORE the LS-recovery
 * measurement was run, and NOT adjusted after seeing it. `BRIEF §7`: tuning until
 * the score recovers all 87 LS landmarks is overfitting to the mould the kit was
 * cast around. The recovery number reported by
 * `checks/claims-prominence-recovers-ls-landmarks.mjs` is therefore what a
 * doctrine-derived weighting achieves, not what a fitted one does.
 *
 * ⛔ TWO SIGNALS `§4.1` NAMES ARE DELIBERATELY ABSENT, and neither is weighted to
 *    zero in silence:
 *
 *    · HERO-PATH VISIBILITY — `§4.1` calls it "arguably THE prominence metric".
 *      OUT OF SCOPE, and NOT a prerequisite. `CartographApp.jsx`'s
 *      `genericSceneConfig` sets `hasHero: false`; the hero path is LS-only, and a
 *      freshly poured town has none until somebody authors one. A rank that needed
 *      it would be unavailable exactly when it is most needed — on the first day of
 *      town #2, which is the entire point of the rank. ⭐ And it is CIRCULAR: you
 *      author a hero path to fly past the buildings that matter, so hero visibility
 *      is DOWNSTREAM of prominence, not an input to it. Once a town has a path it
 *      belongs here as a re-ranking pass, in the `promoted` family — a decision the
 *      operator made — never in the blind score.
 *
 *    · YEAR BUILT — an obvious-looking assessor signal, and it is LS-shaped.
 *      "Older ⇒ more prominent" is true of a Victorian historic district and false
 *      of a post-war suburb; wiring it in would make the rank fail worst on the
 *      towns least like LS. Excluded on the same grounds as `in_historic_district`,
 *      which is true of 977 of LS's 1,082 buildings — a MEMBERSHIP fact, not a
 *      prominence one.
 */

// ── Weights. The ordering is `§4.1`'s, in its own words. ─────────────────────
export const WEIGHTS = {
  // "the strongest cheap prominence signal in existence — someone catalogued this"
  wikidata:       100,
  wikipedia:       60,
  // designation
  heritage:        50,
  historic:        45,
  tourism:         30,
  // "named ≫ unnamed, universally and language-independently"
  name:            25,
  // ⭐ GOING-CONCERN — not in `§4.1`'s table and proposed for it (`BRIEF §6`):
  // these are the closest cheap proxy for Jacob's "where the viable businesses are".
  website:         20,
  opening_hours:   18,
  phone:           15,
  brand:           10,
  // business/institution presence (any one of amenity/shop/office/craft/leisure)
  occupied:        20,
  // each hosted POI beyond the first, capped so a strip mall cannot run away
  poi_extra:       12,
  poi_extra_cap:    4,
  // computed, free — town-relative percentile × weight
  footprint_area:  20,
  stories:         15,
  // assessor well — town-relative percentile × weight, DROPPED if undeclared
  appraised_value: 25,
  building_sqft:   15,
  units:           10,
  // a vacant building is a weaker candidate for content work, but ⛔ never hidden
  vacant:         -30,
}

// Presence-family OSM tag keys, in the order they are scored.
const TAG_SIGNALS = ['wikidata', 'wikipedia', 'heritage', 'historic', 'tourism', 'name', 'brand']
const CONTACT = {
  website:       ['website', 'contact:website'],
  phone:         ['phone', 'contact:phone'],
  opening_hours: ['opening_hours'],
}
const OCCUPANCY = ['amenity', 'shop', 'office', 'craft', 'leisure']

// Value-family fields: (roster field → weight key). Absence here is ignorance.
const VALUE_FIELDS = [
  ['appraised_value', 'appraised_value'],
  ['building_sqft',   'building_sqft'],
  ['units',           'units'],
]

/**
 * Town-relative percentile of `v` within `sorted` (ascending, finite, >0 values
 * only). Returns 0..1. Rank-based rather than min/max so one outlier mansion
 * cannot flatten the other 1,081 buildings into a single bucket.
 */
function percentile(sorted, v) {
  if (!sorted.length) return 0
  let lo = 0, hi = sorted.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m }
  return sorted.length === 1 ? 1 : lo / (sorted.length - 1)
}

/**
 * Build the town-level context ONCE: which wells this town actually has, and the
 * sorted population for every percentile-normalised field.
 *
 * `bundles` — one per building, from `gatherProminenceSignals` below.
 */
export function prominenceContext(bundles) {
  const wells = {}
  const dists = {}
  for (const key of ['footprint_area', 'stories', ...VALUE_FIELDS.map(([f]) => f)]) {
    const vals = bundles.map(b => b[key]).filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b)
    dists[key] = vals
    // ⭐ A well the town has ZERO of is DROPPED, for every building, and named.
    // Rank-neutral by construction — a sort does not move under a constant.
    wells[key] = vals.length > 0
  }
  return { wells, dists, n: bundles.length }
}

/**
 * Score one building. Pure: same bundle + same context ⇒ same number.
 * Returns `{ score, signals, unknown }` — ⛔ never a bare number (`BRIEF`, done #1).
 */
export function scoreProminence(bundle, ctx) {
  const signals = {}
  const unknown = []
  const add = (k, pts) => { if (pts) signals[k] = Math.round(pts * 10) / 10 }

  const tags = bundle.tags || {}
  for (const k of TAG_SIGNALS) if (tags[k]) add(k, WEIGHTS[k])
  for (const [k, keys] of Object.entries(CONTACT)) if (keys.some(kk => tags[kk])) add(k, WEIGHTS[k])
  if (OCCUPANCY.some(k => tags[k])) add('occupied', WEIGHTS.occupied)

  const extra = Math.min(Math.max(0, (bundle.poi_count || 0) - 1), WEIGHTS.poi_extra_cap)
  if (extra) add('poi_extra', extra * WEIGHTS.poi_extra)

  for (const key of ['footprint_area', 'stories']) {
    if (!ctx.wells[key]) continue
    const v = bundle[key]
    if (!Number.isFinite(v) || v <= 0) { unknown.push(key); continue }
    add(key, percentile(ctx.dists[key], v) * WEIGHTS[key])
  }
  for (const [field, wkey] of VALUE_FIELDS) {
    if (!ctx.wells[field]) continue          // ⛔ well absent town-wide → dropped, not zeroed
    const v = bundle[field]
    if (!Number.isFinite(v) || v <= 0) { unknown.push(field); continue }  // ⛔ ignorance, named
    add(wkey, percentile(ctx.dists[field], v) * WEIGHTS[wkey])
  }
  if (bundle.vacant) add('vacant', WEIGHTS.vacant)

  const score = Object.values(signals).reduce((a, b) => a + b, 0)
  return { score: Math.round(score * 10) / 10, signals, unknown }
}

/**
 * Rank the whole roster in place.
 *
 * ⛔ SORT, NOT FILTER: every record leaves with a `prominence.rank` in 1..N and
 * nothing is dropped, hidden or thresholded. ⭐ `record.promoted` (an operator or,
 * later, a resident decision) sorts above EVERY scored building — the guess never
 * overrules the person who knows. Ties break on id so the order is deterministic
 * and a re-bake of unchanged input produces an unchanged file.
 */
export function rankRoster(records, bundlesById) {
  const bundles = records.map(r => bundlesById.get(r.id) || {})
  const ctx = prominenceContext(bundles)
  for (const r of records) {
    const b = bundlesById.get(r.id) || {}
    r.prominence = scoreProminence(b, ctx)
  }
  const order = [...records].sort((a, b) => {
    const pa = a.promoted ? 1 : 0, pb = b.promoted ? 1 : 0
    if (pa !== pb) return pb - pa
    if (b.prominence.score !== a.prominence.score) return b.prominence.score - a.prominence.score
    return String(a.id).localeCompare(String(b.id))
  })
  order.forEach((r, i) => { r.prominence.rank = i + 1 })
  return { ctx, order }
}
