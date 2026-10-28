/**
 * THE ONE VOCABULARY — every way the pour admits is one CLASS out of this closed table.
 *
 * `BRIEF-the-classifier.md` Pass A; the vocabulary is `scratch/style-guide/STYLE-GUIDE.draft.md §1`
 * (a draft: it replaces nothing yet). Decided ONCE, in `skeleton.js`, before `groupByName` and
 * before `seedSection`, and carried on every chain as `class` · `classRung` · `classReason`.
 *
 * ⛔ CLOSED. A way whose tags match no rule is UNKNOWN, and the pour refuses it by name
 *    (`skeleton.js`). There is no default row and no wildcard on `highway`: every rule names the
 *    `highway` values it takes. A subtag rule may say "any other value" (`'*'`), never the key.
 *    ▶ node checks/claims-every-feature-is-classified.mjs — RED on a catch-all row.
 * ⛔ DATA SELECTS, IT NEVER MEASURES. Nothing here is a dimension. What each class is DRAWN as
 *    is the consumer's to read off this table once it is rewired (the brief's §2, "Both passes").
 *
 * Rungs (the ladder, authored → data → town norm → kit): Pass A produces two of them.
 *   `data` — the tag names the class outright (`highway=living_street`).
 *   `kit`  — the tag is too vague to select, and the kit's house rule decides (`highway=road`,
 *            OSM's own "class unknown"; a `service` way with no `service=*` subtag).
 *   `authored` / `norm` are not produced yet: no class override and no class norm exist.
 */

// What a class IS, as one column a consumer can read instead of keeping its own set.
//   network — how it enters the frame TODAY, by class (unnamed ways; a NAMED way becomes a chain
//             whatever its class, which is the defect the check reports as `name-made`):
//             'street' a chain that bounds blocks · 'path' kept in `paths[]` · 'area' an area ·
//             'none' dropped from the network (printed).
//   guide   — where the class's authority is: a style-guide section, or a §5 ruling of BRIEF-the-classifier
//             whose guide entry is not written yet (the draft is not in the repo). `null` = a PROPOSAL, open
//             for Jacob (printed by the check).
//   surveyed — the classes the width survey and the centreline seed measure (`survey.js`,
//             `seed-centerlines.js`, `extend-centerlines.js`). ⚠️ living-street is out of it, as
//             it was out of their copied sets; whether it belongs is not ruled.
//   labelTier — 'major' = the arterial label tier an operator frames a boundary on (`serve.js`
//             OSM labels). ⛔ A `*_link` way of a major class is NOT major (`labelMajor`).
//   swept   — its section is the highway typical section (`streetProfiles#highwaySection`, H-3), swept
//             from its lanes; ⛔ it has no class constant, and `classSection` returns none.
//   section — the KIT HOUSE STYLE the class seeds a chain with (BRIEF-the-classifier §5 rulings 1 and 5).
//             `lane` = the house lane width; the carriageway is lanes × lane + 2 × parking, where the lane
//             count is the configuration the data selects (an untagged chain: 2, 1 if one-way, the KIT
//             rung). `halfWidth` = a fixed carriageway half-width for a class that has no lanes. A class
//             with no walk and no lawn seeds `pedRealm: false`.
//             Street rows: lanes, parking and corner radius are today's `STD_SECTION` [C]; walk and lawn
//             are the guide's per-class widths (§1 table). living-street keeps local's carriageway: its
//             shared surface, edge to edge with no curb, is not built (step 7). The `halfWidth` rows are
//             today's `streetProfiles` `TYPE_PAVEMENT_HW` (service = `standards.js` `STANDARDS.alley`, 15 ft):
//             such a class reaches a chain only when a NAME made it one (the check's `name-made`).
//   marking — the KIT HOUSE STYLE of the road's paint (`streetMarkings.js`; STYLE-GUIDE §18): `marked` = the type carries
//             paint at all (a street the house style leaves unmarked takes none unless the data says lane_markings=yes);
//             `centre` = its centre kind when two-way and the data selects none. Jacob, 2026-10-25: "no residential
//             stripes, double yellow OK for default otherwise"; unclassified (a `local` road) is unmarked, Boz's call,
//             vetoable by Jacob. Every class that can become a chain carries one: a chain whose class has none REFUSES.
import { KIT_CURB_WIDTH } from './streetProfiles.js'   // read at call time only: streetProfiles imports this module
const FT = 0.3048
// ⛔ No row carries a curb width: the curb is the Look's (`curbWidth`), else the kit's one home, `streetProfiles.js#KIT_CURB_WIDTH`.
const street = (lane, parking, treelawn, sidewalk, cornerR) => ({ lane: lane * FT, parking: parking * FT, treelawn, sidewalk, cornerR })
const fixed = (halfWidthFt) => ({ halfWidth: halfWidthFt * FT, treelawn: 0, sidewalk: 0, cornerR: 4.5 })
export const CLASSES = {
  'not-built':     { network: 'none',   guide: '§1' },
  'highway':       { network: 'street', guide: '§1', labelTier: 'major', swept: true, marking: { marked: true, centre: 'double-solid' } },
  'highway-link':  { network: 'street', guide: '§1', swept: true, marking: { marked: true, centre: 'double-solid' } },
  'primary':       { network: 'street', guide: '§1', labelTier: 'major', surveyed: true, section: street(11, 0, 4 * FT, 8 * FT, 7.5), marking: { marked: true, centre: 'double-solid' } },
  'secondary':     { network: 'street', guide: '§1', labelTier: 'major', surveyed: true, section: street(11, 0, 4 * FT, 6 * FT, 6.0), marking: { marked: true, centre: 'double-solid' } },
  'tertiary':      { network: 'street', guide: '§1', labelTier: 'major', surveyed: true, section: street(10, 0, 4 * FT, 6 * FT, 5.0), marking: { marked: true, centre: 'double-solid' } },
  // ⭐ THE LOCAL ROW IS THE KIT'S STREET DEFAULT (Jacob, 2026-10-20: "yes to imperial") — exact US values, metres:
  //   treelawn 5 ft = 1.524 (f-massdot-buffer-width, the preferred buffer) · sidewalk 5 ft = 1.524 (f-massdot-sidewalk-width,
  //   the minimum) · corner radius 15 ft = 4.572 (f-caltrans-corner-radii, the minor-street minimum).
  // ⚠️ The painter and ② read THIS row for every street, uniformly, until classifier step 7 makes them read each street's
  // own class row (`LOCAL_SECTION` below). ▶ node checks/claims-a-look-authors-its-curb-width.mjs (one home, no second copy)
  'local':         { network: 'street', guide: '§1', surveyed: true, section: street(10, 8, 1.524, 1.524, 4.572), marking: { marked: false, centre: 'none' } },
  'living-street': { network: 'street', guide: '§1 §3', section: street(10, 8, 0, 0, 4.5), marking: { marked: false, centre: 'none' } },
  'pedestrian':    { network: 'path',   guide: '§1', section: fixed(5), marking: { marked: false, centre: 'none' } },      // street or path: guide Q1.b, open
  'plaza':         { network: 'area',   guide: '§9', section: fixed(5), marking: { marked: false, centre: 'none' } },
  'alley':         { network: 'path',   guide: '§1', section: fixed(7.5), marking: { marked: false, centre: 'none' } },
  'driveway':      { network: 'path',   guide: '§1 §11', section: fixed(7.5), marking: { marked: false, centre: 'none' } },
  'lot-aisle':     { network: 'path',   guide: '§1', section: fixed(7.5), marking: { marked: false, centre: 'none' } },
  // A `service` way with no subtag (§5 ruling 8: a named service road is not a lot aisle by default; the tags
  // decide, never the name). PROPOSED, not ruled: local's carriageway and a walk with no lawn, which is exactly
  // what it painted before (the paint's 1.5 m walk; no treelawn gleaned).
  'service-road':  { network: 'path',   guide: null, section: street(10, 8, 0, 1.5, 4.5), marking: { marked: false, centre: 'none' } },
  'sidewalk':      { network: 'path',   guide: '§1 §2', section: fixed(3), marking: { marked: false, centre: 'none' } },   // evidence, not ink
  'crossing':      { network: 'path',   guide: '§7', section: fixed(3), marking: { marked: false, centre: 'none' } },
  'path':          { network: 'path',   guide: '§1', section: fixed(3), marking: { marked: false, centre: 'none' } },
  'indoor':        { network: 'path',   guide: 'ruling 7', section: fixed(3), marking: { marked: false, centre: 'none' } },
  'services-area': { network: 'area',   guide: 'ruling 7', section: fixed(7.5), marking: { marked: false, centre: 'none' } },
}

// The rules, first match wins. `highway` is always an explicit list. `area: true` rules are the
// only ones an `area=yes` way may match, so an area of a class with no area rule is UNKNOWN,
// never quietly linear. `where` constrains a subtag: a list of values, or '*' = any other value
// (including absent). `link: true` marks a `*_link` folded into its parent's class.
export const RULES = [
  { highway: ['proposed', 'construction', 'planned', 'abandoned', 'razed', 'demolished', 'dismantled'], class: 'not-built', rung: 'data' },

  { area: true, highway: ['pedestrian', 'footway', 'service'], class: 'plaza', rung: 'data' },
  { area: true, highway: ['services'], class: 'services-area', rung: 'data' },
  { area: true, highway: ['elevator'], class: 'indoor', rung: 'data' },

  { highway: ['motorway', 'trunk'], class: 'highway', rung: 'data' },
  { highway: ['motorway_link', 'trunk_link'], class: 'highway-link', rung: 'data' },
  { highway: ['primary'], class: 'primary', rung: 'data' },
  { highway: ['primary_link'], class: 'primary', rung: 'data', link: true },
  { highway: ['secondary'], class: 'secondary', rung: 'data' },
  { highway: ['secondary_link'], class: 'secondary', rung: 'data', link: true },
  { highway: ['tertiary'], class: 'tertiary', rung: 'data' },
  { highway: ['tertiary_link'], class: 'tertiary', rung: 'data', link: true },
  { highway: ['residential', 'unclassified'], class: 'local', rung: 'data' },
  { highway: ['road'], class: 'local', rung: 'kit' },
  { highway: ['living_street'], class: 'living-street', rung: 'data' },
  { highway: ['pedestrian'], class: 'pedestrian', rung: 'data' },

  { highway: ['service'], where: { service: ['alley'] }, class: 'alley', rung: 'data' },
  { highway: ['service'], where: { service: ['driveway'] }, class: 'driveway', rung: 'data' },
  { highway: ['service'], where: { service: ['parking_aisle', 'drive-through'] }, class: 'lot-aisle', rung: 'data' },
  { highway: ['service'], where: { service: '*' }, class: 'service-road', rung: 'kit' },

  { highway: ['footway'], where: { footway: ['sidewalk'] }, class: 'sidewalk', rung: 'data' },
  { highway: ['footway'], where: { footway: ['crossing', 'traffic_island'] }, class: 'crossing', rung: 'data' },
  { highway: ['footway', 'cycleway', 'path', 'steps', 'track', 'bridleway'], class: 'path', rung: 'data' },

  { highway: ['corridor', 'elevator'], class: 'indoor', rung: 'data' },
]

const isArea = (tags) => tags?.area === 'yes'

function ruleMatches(rule, tags) {
  if (!!rule.area !== isArea(tags)) return false
  if (!rule.highway.includes(tags?.highway)) return false
  for (const [k, vals] of Object.entries(rule.where || {})) {
    if (vals !== '*' && !vals.includes(tags?.[k])) return false
  }
  return true
}

function reasonOf(rule, tags) {
  const parts = [`highway=${tags.highway}`]
  for (const k of Object.keys(rule.where || {})) parts.push(`${k}=${tags[k] ?? '(none)'}`)
  if (rule.area) parts.push('area=yes')
  return parts.join(' ')
}

/** One way's class from its tags, or `null` when the vocabulary has no entry (UNKNOWN). */
export function classifyWay(tags) {
  const rule = RULES.find(r => ruleMatches(r, tags))
  if (!rule) return null
  return { class: rule.class, rung: rule.rung, reason: reasonOf(rule, tags), ...(rule.link && { link: true }) }
}

/**
 * A way's class for a consumer that reads raw tags. ⛔ It refuses, by the way's tags, when the
 * vocabulary has no entry — the pour refuses the same way, so this never fires on a poured town.
 */
export function classOf(tags) {
  const c = classifyWay(tags || {})
  if (!c) throw new Error(`⛔ no class in the vocabulary (src/cartograph/streetClass.js) for highway=${tags?.highway ?? '(none)'}${tags?.area ? ` area=${tags.area}` : ''}${tags?.name ? ` "${tags.name}"` : ''}`)
  return c
}

/** The major label tier: a major class, and not a `*_link` of it. */
export const labelMajor = (tags) => { const c = classOf(tags); return CLASSES[c.class].labelTier === 'major' && !c.link }

/**
 * The seeded cross-section of a chain of class `cls` (the kit house style; `section` above). `lanes` is the
 * configuration the data selected (a positive integer), or null for an untagged chain.
 * ⛔ A swept (highway) class has no class constant: its seed says so and carries no widths.
 */
/** The local row's ped depths and corner radius — the kit's street defaults, read by the painter, ②, the survey seed and
 *  the authoring tools. ⚠️ Uniform for every street until classifier step 7. */
export const LOCAL_SECTION = CLASSES.local.section

export function classSection(cls, { lanes = null, oneway = false, expressway = false } = {}) {
  const c = CLASSES[cls]
  if (!c) throw new Error(`⛔ classSection: "${cls}" is not a class in the vocabulary`)
  if (c.swept) return { seededClass: cls, swept: true }
  const s = c.section
  if (!s) throw new Error(`⛔ classSection: class "${cls}" has no section — it never seeds a chain`)
  const tagged = Number.isInteger(lanes) && lanes > 0
  const nLanes = s.lane ? (tagged ? lanes : (oneway ? 1 : 2)) : null
  const pavementHW = +(s.lane ? (nLanes * s.lane + 2 * s.parking) / 2 : s.halfWidth).toFixed(2)
  const noPed = expressway || (s.treelawn === 0 && s.sidewalk === 0)
  const treelawn = noPed ? 0 : +s.treelawn.toFixed(2)
  const sidewalk = noPed ? 0 : +s.sidewalk.toFixed(2)
  return {
    seededClass: cls,
    ...(s.lane && { lanesAssumed: nLanes, lanesRung: tagged ? 'data' : 'kit' }),
    pavementHW,
    treelawn,
    sidewalk,
    cornerR: s.cornerR,
    rowHalf: +(pavementHW + KIT_CURB_WIDTH + treelawn + sidewalk).toFixed(2),
    ...(noPed && { pedRealm: false }),
  }
}

/** A `lanes` tag the configuration can read: a positive integer, or absent. ⛔ Anything else refuses the pour. */
export const lanesTagIsReadable = (v) => v == null || /^[1-9][0-9]*$/.test(String(v).trim())

// ⭐ THE TAG DECIDES ONE-WAY — every site that asks "is this way one-way?" asks this. OSM: `yes` (and the discouraged
// `1`/`true`) and `-1` are one-way; `junction=roundabout|circular` IMPLIES `yes`; an explicit `oneway` tag still wins.
// ⛔ Reading `oneway === 'yes'` alone made every `-1` way TWO-WAY to the whole pour (welds, sections, the stripe):
// invisible on LS, which has none (HPDM 15 ways, PTown 1, raw osm.json). `reversible` / `alternating` are not one-way
// here (a lane whose direction changes by the hour).
const RING_JUNCTIONS = new Set(['roundabout', 'circular'])
const ONEWAY_TAGS = new Set(['yes', '1', 'true', '-1'])
export const isOneway = (tags) => tags?.oneway != null ? ONEWAY_TAGS.has(tags.oneway) : RING_JUNCTIONS.has(tags?.junction)
export const isRingWay = (tags) => RING_JUNCTIONS.has(tags?.junction)

// ⭐⭐ A ONE-WAY RUNS IN TRAVEL ORDER — ONE INVARIANT, MADE AT INTAKE (Zob's ruling (A), Boz, 2026-10-25). Every reader
// downstream assumes a one-way's points run the way traffic does (the canonical-direction pass, the divided pairing on
// anti-parallel coords, OneWayArrows, `highwayEndContact`, the highway shoulders), so a `oneway=-1` way is REVERSED here,
// as the pour reads it, and becomes `oneway=yes`; there is no sense to carry after this. ⛔ The reversal flips what is
// relative to the way's node order WITH it, or a reversed way's tags point to the wrong side: the `:left`↔`:right` and
// `:forward`↔`:backward` key segments (lanes, overtaking, parking, cycleway, sidewalk, maxspeed…), the `left`/`right`
// VALUES of `sidewalk` and `cycleway*`, and `incline`'s sign. `turn:lanes` is travel-relative already and stays.
// The skeleton and the layer derive (`pipeline.js`) both read the ways through this. The way says so (`reversedAtIntake`).
const SIDE_SWAP = { left: 'right', right: 'left', forward: 'backward', backward: 'forward' }
const flipKey = (k) => k.split(':').map(s => SIDE_SWAP[s] ?? s).join(':')
const flipValue = (k, v) => {
  if (k === 'incline') return v === 'up' ? 'down' : v === 'down' ? 'up' : /^-?[0-9.]+%?$/.test(v) ? (v.startsWith('-') ? v.slice(1) : '-' + v) : v
  if (/^(sidewalk|cycleway)(:|$)/.test(k) && (v === 'left' || v === 'right')) return SIDE_SWAP[v]
  return v
}
export function travelOrdered(ways, who = 'intake') {
  let n = 0
  const out = (ways || []).map(w => {
    if (w?.tags?.oneway !== '-1') return w
    n++
    const tags = {}
    for (const [k, v] of Object.entries(w.tags)) { const fk = flipKey(k); tags[fk] = fk === 'oneway' ? 'yes' : flipValue(fk, v) }
    return { ...w, coords: [...w.coords].reverse(), tags, reversedAtIntake: true }
  })
  console.log(`    [${who}] oneway=-1: ${n} way(s) reversed into travel order (tags flipped with them)`)
  return out
}

/**
 * THE CHAIN'S SOURCE RECORD — what `skeleton.js` `carryWays` writes on every chain in `skeleton.json`, so nothing
 * the intake took in is lost (Jacob, 2026-10-20). Paint reads none of it; it reads `class` and the columns above.
 *   chain.sources      [osmId, …]                   the chain's ways (unchanged; every consumer keys on it)
 *   chain.ways         { [osmId]: tags }             each source way's FULL raw tags, verbatim from osm.json — except a
 *                      oneway=-1 way's, flipped with its reversal into travel order (`travelOrdered`)
 *   chain.segmentWays  [{ from, to, ways, by? }, …]  runs over segment indices [from, to) of `chain.points`;
 *                      `ways` = the osmIds that segment came from (two when it spans a way joint). `by` is
 *                      absent when both ends sit exactly on a source way's vertices; 'one-end' when only one
 *                      does; 'order' when neither does and the run takes its neighbour's ways along the chain
 *                      (never by distance). A chain of one way is that way end to end.
 *   path.tags          a path (one way) carries its full tags already.
 * A way dropped from the record is dropped by a NAMED rule that prints every pour (not-built; the
 * EXCLUDE_FROM_STREETS name list until step 2). ▶ node scratch/style-guide/classifier-tag-census.mjs <town> <skeleton>
 */

/** The table's order, for a deterministic tie-break in a chain's vote. */
export const CLASS_ORDER = Object.keys(CLASSES)

// ⭐ ONE WAY OFF GRADE (the skeleton's own predicate, exported so the mint reads it, never retyped; Boz, 2026-10-27): a way
// tagged bridge or tunnel (anything but `no`), or on a non-zero `layer`, does not touch the ground. skeleton.js#gradeFacts
// summarizes it over a chain; cartograph/mintInputs.mjs reads it per segment run, so a bridge or tunnel span over ①'s water
// leaves the street ink there (a bridge is above the water, a tunnel below it).
export function isOffGradeWay(t) {
  if (!t) return false
  const b = !!t.bridge && t.bridge !== 'no', tu = !!t.tunnel && t.tunnel !== 'no'
  const Lraw = t.layer !== undefined ? parseInt(t.layer, 10) : 0, L = Number.isFinite(Lraw) ? Lraw : 0
  return b || tu || L !== 0
}

// ⭐ A WAY'S OWN TAG DECIDES BEFORE THE COAST (Jacob, 2026-10-27, `r-a-way-tag-decides-before-byCoast`; Boz's vocabulary): what a
// street way over ①'s water IS, read off its STRUCTURAL tags (man_made, embankment, ford; no other key counts), the class
// selected by the tag and never measured by it:
//   'offGrade' — bridge, tunnel or a non-zero layer (isOffGradeWay): a span, painted over the water
//   'deck'     — man_made ∈ DECK_KINDS: the street rides its deck, taken out of the water (structures.mjs#streetDecks)
//   'ground'   — embankment=* (isEmbankment): the tag is evidence the land is there, and the coast bake HOLDS its footprint as
//                land before it traces (r-the-coast-bake-holds-an-embankment-as-land; structures.mjs#embankmentFootprints), so
//                the coast and the dike are one line; a piece still in ①'s water is a missed hold, refused by name at ①
//   null       — no structural tag: a street crossing the water bank to bank is a bridge all the same (ruling "a")
//   { unknown: 'key=value' } — a structural value outside this vocabulary (a ford, for now): refused by name over the water
// The mint reads it per segment run (cartograph/mintInputs.mjs#gradeRunsOf), and splitOverWater judges a wet piece by it.
export const DECK_KINDS = ['pier', 'quay', 'wharf', 'jetty', 'platform']
// ⭐ AN EMBANKMENT is embankment=* (anything but `no`: yes, dyke, …), the one predicate (Zob, 2026-10-28): the over-water
// class below and the coast bake's dike barrier (cartograph/coastFile.mjs#heldCells) both read it, so the tag has one home.
export const isEmbankment = (t) => t?.embankment != null && t.embankment !== 'no'
export function structureOverWater(t) {
  if (!t) return null
  if (isOffGradeWay(t)) return 'offGrade'
  const has = (k) => t[k] != null && t[k] !== 'no'
  if (has('man_made') && DECK_KINDS.includes(t.man_made)) return 'deck'
  if (isEmbankment(t)) return 'ground'
  for (const k of ['man_made', 'ford']) if (has(k)) return { unknown: `${k}=${t[k]}` }
  return null
}
