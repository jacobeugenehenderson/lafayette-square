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
//   guide   — the style-guide section it comes from; `null` = NOT IN THE GUIDE, added here so the
//             five towns pour, and open for Jacob (printed by the check).
//   surveyed — the classes the width survey and the centreline seed measure (`survey.js`,
//             `seed-centerlines.js`, `extend-centerlines.js`). ⚠️ living-street is out of it, as
//             it was out of their copied sets; whether it belongs is not ruled.
//   labelTier — 'major' = the arterial label tier an operator frames a boundary on (`serve.js`
//             OSM labels). ⛔ A `*_link` way of a major class is NOT major (`labelMajor`).
export const CLASSES = {
  'not-built':     { network: 'none',   guide: '§1' },
  'highway':       { network: 'street', guide: '§1', labelTier: 'major' },
  'highway-link':  { network: 'street', guide: '§1' },
  'primary':       { network: 'street', guide: '§1', labelTier: 'major', surveyed: true },
  'secondary':     { network: 'street', guide: '§1', labelTier: 'major', surveyed: true },
  'tertiary':      { network: 'street', guide: '§1', labelTier: 'major', surveyed: true },
  'local':         { network: 'street', guide: '§1', surveyed: true },
  'living-street': { network: 'street', guide: '§1 §3' },
  'pedestrian':    { network: 'path',   guide: '§1' },      // street or path: guide Q1.b, open
  'plaza':         { network: 'area',   guide: '§9' },
  'alley':         { network: 'path',   guide: '§1' },
  'driveway':      { network: 'path',   guide: '§1 §11' },
  'lot-aisle':     { network: 'path',   guide: '§1' },
  'sidewalk':      { network: 'path',   guide: '§1 §2' },   // evidence, not ink
  'crossing':      { network: 'path',   guide: '§7' },
  'path':          { network: 'path',   guide: '§1' },
  'indoor':        { network: 'path',   guide: null },
  'services-area': { network: 'area',   guide: null },
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
  { highway: ['service'], where: { service: ['parking_aisle'] }, class: 'lot-aisle', rung: 'data' },
  { highway: ['service'], where: { service: '*' }, class: 'lot-aisle', rung: 'kit' },

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

/** The table's order, for a deterministic tie-break in a chain's vote. */
export const CLASS_ORDER = Object.keys(CLASSES)
