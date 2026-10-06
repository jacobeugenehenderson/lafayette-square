/**
 * sources.js — WHERE A TOWN'S DATA COMES FROM, declared by the town.
 *
 * `INTAKE-CATALOGUE §4.2`, the one-button rule, listed the assessor row as
 * *"per-jurisdiction ArcGIS/Socrata | varies — **needs a per-town endpoint field**"*
 * on 2026-07-20 and nobody built it. This is that field.
 *
 * ⛔ THE HARDCODE THIS REPLACES was `bake-content.js#loadParcels` walking a literal
 * `[['stl_parcels.json','city'], ['stlco_parcels.json','county']]`. Every town that
 * was not St. Louis printed "missing stl_parcels.json" and matched 0 parcels — the
 * LS-bleed shape of `§0`, in the acquisition path.
 *
 * ⛔⛔ THE THREE-WAY DISTINCTION IS THE WHOLE POINT, AND IT IS `CLAUDE.md` LAYER 0 q2.
 * A parcel count of zero has three completely different meanings and the old code
 * could express only one of them:
 *
 *   UNDECLARED  — no sources.json. Nobody has said where this town's parcels come
 *                 from. ⛔ This is NOT "no parcels"; it is "not looked into yet", and
 *                 it is LOUD, because a silent zero here reads downstream as a town
 *                 with no assessor and the operator never learns the difference.
 *   DECLARED-NONE — `parcels: []` with a `parcels_absent_reason`. An HONEST ZERO: a
 *                 human established there is no well and wrote down why. The pour
 *                 proceeds and says so once.
 *   DECLARED     — one or more wells, each naming its endpoint, its field map, and
 *                 ⭐ the fields it does NOT supply (`absent`). That last list is what
 *                 stops "this well has no year_built" from arriving downstream as
 *                 "this building was built in year zero".
 *
 * ⭐ `absent` is not documentation. It is read by the roster bake, which refuses to
 * emit a value for a field the declaration says the well cannot carry.
 *
 * Shape — `cartograph/data/<scene>/sources.json`:
 *
 *   {
 *     "parcels": [{
 *       "id":            "ohio-statewide",        // stable, for logs + the census
 *       "jurisdiction":  "county",                // rides onto every parcel record
 *       "file":          "oh_parcels.json",       // under data/<scene>/raw/
 *       "attribution":   "Ohio Statewide Parcels (OGRIP)",
 *       "endpoint":      "https://…/FeatureServer/0/query",   // ArcGIS; omit for a hand-placed file
 *       "where":         "County = 'Erie'",       // optional server-side filter
 *       "fields":        { "<our field>": "<THEIR_COLUMN>" },
 *       "constants":     { "municipality": "St. Louis" },  // true of the whole well, not per row
 *       "provides":      ["address", "land_use_code"],
 *       "absent":        ["year_built", "appraised_value", "zoning", "units"]
 *     }],
 *     "landUseCodes": { "file": "county-land-use-codes.csv" }   // or null — see below
 *   }
 *
 * ⭐ A WELL FROM THE STATE (2026-10-05): `"state": "OH", "select": { "county": "Erie" }, "parcels": [{ "from": "state",
 * "id": "ohio-statewide" }]` — resolved here against `cartograph/states/<st>.mjs` (endpoint, fields, absent, format), the
 * selector substituted into the well's `where`, stamped `fromState`. An unknown state, an unlisted well or a missing
 * selector THROWS. A full declaration (above) still works for a town in a state with no record.
 *
 * ⭐ `landUseCodes: null` is a POSITIVE statement, not an omission: it means the
 * well's code is self-describing and needs no decode table. Ohio's `StateLUC` arrives
 * as `"500: Res-Vacant Land"` — the code and its meaning in one string — so a St-Louis
 * shaped CSV lookup would be inventing a step that does not exist there.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { mapDir } from './config.js'
import { resolveFromState } from './states/index.mjs'

export const SOURCES_FILE = 'sources.json'

/** Every field a parcel record can carry. A declaration's `provides`/`absent` must
 *  between them be a subset of this, so a typo in a town's declaration is caught at
 *  read time rather than showing up as a permanently-null column months later. */
export const PARCEL_FIELDS = [
  'handle', 'address', 'owner', 'year_built', 'building_sqft', 'land_area',
  'appraised_value', 'land_use_code', 'zoning', 'units', 'num_buildings',
  'vacant', 'historic_district', 'municipality',
]

export function sourcesPath(scene) {
  return join(mapDir(scene), SOURCES_FILE)
}

/**
 * Read a scene's declaration.
 *
 * Returns `{ declared: true, parcels: [...], landUseCodes, absentReason }`
 *      or `{ declared: false }` — ⛔ never a silent empty. The CALLER decides how loud
 *      undeclared is, because the bake and an operator-facing tool want to say it
 *      differently; what this function will not do is hand back a zero that looks the
 *      same as a declared-none.
 *
 * ⛔ Throws on a declaration that is present but malformed. A town that took the
 * trouble to declare its sources and got the shape wrong must not degrade to
 * "undeclared" — that is the plausible-looking success Layer 0 q2 forbids, and it is
 * exactly the case where the operator believes the file is doing something.
 */
export function readSources(scene) {
  const p = sourcesPath(scene)
  if (!existsSync(p)) return { declared: false, path: p }

  let j
  try { j = JSON.parse(readFileSync(p, 'utf8')) }
  catch (e) { throw new Error(`${p} is not valid JSON: ${e.message}`) }

  if (!Array.isArray(j.parcels)) {
    throw new Error(`${p} has no \`parcels\` array. Declare the wells, or declare none:\n` +
      `  "parcels": [], "parcels_absent_reason": "<why this town has no parcel well>"`)
  }
  // ⭐ A well taken from the town's STATE (`{ "from": "state", "id": … }`) resolves to the state's record, selected
  // for this town and stamped `fromState` — cartograph/states/index.mjs. A full declaration passes through.
  j.parcels = j.parcels.map(e => resolveFromState(e, 'parcels', j, `${p}: `))

  const seen = new Set()
  for (const src of j.parcels) {
    const who = src.id ? `parcels[${src.id}]` : `parcels[#${j.parcels.indexOf(src)}]`
    for (const req of ['id', 'jurisdiction', 'file']) {
      if (!src[req]) throw new Error(`${p}: ${who} is missing \`${req}\``)
    }
    if (seen.has(src.id)) throw new Error(`${p}: duplicate parcel source id "${src.id}"`)
    seen.add(src.id)
    // ⛔ `provides` and `absent` must PARTITION the schema — every field accounted for,
    // none claimed twice. A field in neither list is the silent middle this whole record
    // exists to abolish: the bake would have no way to tell "this well doesn't carry it"
    // from "this parcel happens to lack it".
    // ⭐ A CONSTANT COUNTS AS PROVIDED. Some columns are true of the whole well rather
    // than of each row — a CITY assessor's parcels are all in that city, and the old
    // code expressed this as `jur === 'city' ? 'St. Louis' : null`, a town's name
    // hardcoded into the reader. Declared here, it is the town asserting it.
    const constants = src.constants || {}
    const provides = [...(src.provides || []), ...Object.keys(constants)]
    const absent = src.absent || []
    const both = provides.filter(f => absent.includes(f))
    if (both.length) throw new Error(`${p}: ${who} lists ${both.join(', ')} as BOTH provided and absent`)
    const unknown = [...provides, ...absent].filter(f => !PARCEL_FIELDS.includes(f))
    if (unknown.length) throw new Error(`${p}: ${who} names unknown parcel field(s): ${unknown.join(', ')}\n` +
      `  known fields: ${PARCEL_FIELDS.join(', ')}`)
    const unaccounted = PARCEL_FIELDS.filter(f => !provides.includes(f) && !absent.includes(f))
    if (unaccounted.length) throw new Error(`${p}: ${who} accounts for neither provides nor absent: ${unaccounted.join(', ')}\n` +
      `  Every parcel field must be in exactly one list — a field in neither is a zero nobody can interpret.`)
  }

  if (!j.parcels.length && !j.parcels_absent_reason) {
    throw new Error(`${p} declares no parcel wells but gives no \`parcels_absent_reason\`.\n` +
      `  "No wells" is a FINDING — say what was searched and why nothing was adopted.`)
  }

  return {
    declared: true,
    path: p,
    parcels: j.parcels,
    state: j.state || null,
    // ⭐ `undefined` (key absent) and `null` (declared self-describing) are different
    // states and are kept different. Absent means the town never said.
    landUseCodes: 'landUseCodes' in j ? j.landUseCodes : undefined,
    absentReason: j.parcels_absent_reason || null,
  }
}

/**
 * The files a town's DECLARED parcel wells land at, absolute. `[]` for an undeclared
 * town and for a declared-none town alike, so a caller that must tell those two apart
 * reads `readSources` itself. For dirty-checks and counts, never for classification.
 * ⛔ A malformed declaration THROWS (from `readSources`); it is never read as "no wells".
 */
export function declaredParcelPaths(scene) {
  const s = readSources(scene)
  return s.declared ? s.parcels.map(p => join(mapDir(scene), 'raw', p.file)) : []
}

/** The one-line, loud message for an undeclared town. Shared so the bake, the fetcher
 *  and any future operator surface all say the same thing in the same words. */
export function undeclaredMessage(scene, path) {
  return [
    `⛔ scene "${scene}" has NO ${SOURCES_FILE} — its data wells are UNDECLARED.`,
    `   This is not the same as "this town has no assessor", and the pour must not`,
    `   treat it as such: an undeclared town yields zero parcels and every downstream`,
    `   reader sees a town that looks surveyed and is not.`,
    `   Write ${path} — see cartograph/sources.js for the shape. To declare there is`,
    `   genuinely no well, say so explicitly:`,
    `     { "parcels": [], "parcels_absent_reason": "<what was searched, and why nothing was adopted>" }`,
  ].join('\n')
}

/**
 * ADDRESS POINTS — a town's street-address points (county/state E-911, OpenAddresses…), joined to buildings by
 * containment (cartograph/building-address.mjs). Declared in the same sources.json, with the same three states:
 *   UNDECLARED    — no `addressPoints` key: nobody has looked. Reported as such, never read as "none".
 *   DECLARED-NONE — `addressPoints: []` + `addressPoints_absent_reason`.
 *   DECLARED      — [{ id, provider, file, attribution?, endpoint?, where? }], `provider` one the kit knows
 *                   (cartograph/address-points.mjs#ADDRESS_POINT_PROVIDERS). Fetched by fetch-address-points.mjs.
 * ⛔ A malformed declaration throws; it is never read as undeclared.
 */
export function readAddressPointSources(scene, providers) {
  const p = sourcesPath(scene)
  if (!existsSync(p)) return { state: 'undeclared', path: p, sources: [] }
  const j = JSON.parse(readFileSync(p, 'utf8'))
  if (!('addressPoints' in j)) return { state: 'undeclared', path: p, sources: [] }
  if (!Array.isArray(j.addressPoints)) throw new Error(`${p}: \`addressPoints\` must be an array`)
  j.addressPoints = j.addressPoints.map(e => resolveFromState(e, 'addressPoints', j, `${p}: `))
  if (!j.addressPoints.length) {
    if (!j.addressPoints_absent_reason) throw new Error(`${p} declares no address-point source but gives no \`addressPoints_absent_reason\` — "none" is a finding; say what was searched.`)
    return { state: 'none', path: p, sources: [], absentReason: j.addressPoints_absent_reason }
  }
  const seen = new Set()
  for (const src of j.addressPoints) {
    const who = src.id ? `addressPoints[${src.id}]` : `addressPoints[#${j.addressPoints.indexOf(src)}]`
    for (const req of ['id', 'provider', 'file']) if (!src[req]) throw new Error(`${p}: ${who} is missing \`${req}\``)
    if (seen.has(src.id)) throw new Error(`${p}: duplicate address-point source id "${src.id}"`)
    seen.add(src.id)
    if (providers && !providers[src.provider]) throw new Error(`${p}: ${who} names provider "${src.provider}", which the kit does not know (${Object.keys(providers).join(', ')})`)
  }
  return { state: 'declared', path: p, sources: j.addressPoints }
}

/**
 * BUILDINGS — the town's footprint GEOMETRY well (BRIEF-nyc-adapter §3.2a, step 3). Two states:
 *   UNDECLARED — no `buildings` key: the kit's generic global well, Microsoft's ML footprints (raw/msbf.json), and the
 *                pour SAYS so. ⭐ A broad default is not A00's defect — that was another TOWN's data (Boz, 2026-10-05).
 *   DECLARED   — [{ "from": "state", "id": … }] — exactly ONE well, taken from the town's state (e.g. NY's NYC
 *                footprints), which replaces MSBF; OSM still unions in (building-union.mjs).
 * ⛔ A malformed declaration, more than one well, or a well with no `file` throws; never read as undeclared.
 */
export function readBuildingSources(scene) {
  const p = sourcesPath(scene)
  if (!existsSync(p)) return { state: 'undeclared', path: p, well: null }
  const j = JSON.parse(readFileSync(p, 'utf8'))
  if (!('buildings' in j)) return { state: 'undeclared', path: p, well: null }
  if (!Array.isArray(j.buildings) || j.buildings.length !== 1) throw new Error(`${p}: \`buildings\` must be an array of exactly one footprint well (it is the town's geometry well)`)
  const well = resolveFromState(j.buildings[0], 'buildings', j, `${p}: `)
  for (const req of ['id', 'file']) if (!well[req]) throw new Error(`${p}: buildings well is missing \`${req}\``)
  // Attribute wells joined onto it by its permanent id (no geometry) — e.g. NYC's BES. Optional; absent = none.
  if ('buildingAttributes' in j && !Array.isArray(j.buildingAttributes)) throw new Error(`${p}: \`buildingAttributes\` must be an array`)
  const attributes = (j.buildingAttributes || []).map(e => resolveFromState(e, 'buildingAttributes', j, `${p}: `))
  for (const a of attributes) if (!a.joinOn || a.joinOn !== well.permanentId?.field) throw new Error(`${p}: buildingAttributes "${a.id}" joins on \`${a.joinOn}\`, but the buildings well's permanent id is \`${well.permanentId?.field ?? 'none'}\``)
  return { state: 'declared', path: p, well, attributes }
}

/**
 * TREES — a town's declared tree-census wells (BRIEF-nyc-adapter §3.2a: "trees become a well kind"). Three states:
 *   UNDECLARED    — no `trees` key: the town's census is whatever canonical files it holds (arborist/bake-trees.js
 *                   SOURCE_BY_BASENAME) — the state every town was in before this kind existed.
 *   DECLARED-NONE — `trees: []` + `trees_absent_reason`.
 *   DECLARED      — [{ "from": "state", "id" }] — each fetched by cartograph/fetch-trees.mjs into clean/<file>, and READ
 *                   by both tree entry points (tree-bake-inputs.mjs, bake-trees.js), unioned with the canonical wells.
 * ⛔ A malformed declaration throws; it is never read as undeclared.
 */
export function readTreeSources(scene) {
  const p = sourcesPath(scene)
  if (!existsSync(p)) return { state: 'undeclared', path: p, wells: [] }
  const j = JSON.parse(readFileSync(p, 'utf8'))
  if (!('trees' in j)) return { state: 'undeclared', path: p, wells: [] }
  if (!Array.isArray(j.trees)) throw new Error(`${p}: \`trees\` must be an array`)
  if (!j.trees.length) {
    if (!j.trees_absent_reason) throw new Error(`${p} declares no tree well but gives no \`trees_absent_reason\` — "none" is a finding; say what was searched.`)
    return { state: 'none', path: p, wells: [], absentReason: j.trees_absent_reason }
  }
  const wells = j.trees.map(e => resolveFromState(e, 'trees', j, `${p}: `))
  for (const w of wells) for (const req of ['id', 'file']) if (!w[req]) throw new Error(`${p}: tree well "${w.id ?? '?'}" is missing \`${req}\``)
  return { state: 'declared', path: p, wells }
}

/** The clean/ files a town's declared tree wells land at (absolute); [] when undeclared or declared-none. */
export function declaredTreeWellPaths(scene) {
  return readTreeSources(scene).wells.map((w) => join(mapDir(scene), 'clean', w.file))
}

/** The files a town's declared address-point sources land at (absolute); [] when undeclared or declared-none. */
export function declaredAddressPointPaths(scene) {
  return readAddressPointSources(scene).sources.map((s) => join(mapDir(scene), 'raw', s.file))
}

/**
 * CROPLAND — where crops grow (USDA's Cropland Data Layer, cartograph/cdl.mjs). The same three states as every well:
 *   UNDECLARED    — no `cropland` key: nobody has looked. LOUD at the pour; crop then grows on mapped fields only.
 *   DECLARED-NONE — `cropland: []` + `cropland_absent_reason`.
 *   DECLARED      — [{ id: "usda-cdl", year }] — one raster per year at raw/cdl-<year>.tif.
 * ⛔ A malformed declaration throws; it is never read as undeclared.
 */
export function readCroplandSources(scene) {
  const p = sourcesPath(scene)
  if (!existsSync(p)) return { state: 'undeclared', path: p, sources: [] }
  const j = JSON.parse(readFileSync(p, 'utf8'))
  if (!('cropland' in j)) return { state: 'undeclared', path: p, sources: [] }
  if (!Array.isArray(j.cropland)) throw new Error(`${p}: \`cropland\` must be an array`)
  if (!j.cropland.length) {
    if (!j.cropland_absent_reason) throw new Error(`${p} declares no cropland source but gives no \`cropland_absent_reason\` — "none" is a finding; say why.`)
    return { state: 'none', path: p, sources: [], absentReason: j.cropland_absent_reason }
  }
  for (const s of j.cropland) {
    if (s.id !== 'usda-cdl') throw new Error(`${p}: cropland source "${s.id}" is not one the kit knows (usda-cdl)`)
    if (!Number.isInteger(s.year)) throw new Error(`${p}: cropland usda-cdl needs an integer \`year\``)
  }
  if (j.cropland.length > 1) throw new Error(`${p}: declare ONE cropland year — two would disagree with nobody to rule between them`)
  return { state: 'declared', path: p, sources: j.cropland }
}
