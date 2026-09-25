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
 * ⭐ `landUseCodes: null` is a POSITIVE statement, not an omission: it means the
 * well's code is self-describing and needs no decode table. Ohio's `StateLUC` arrives
 * as `"500: Res-Vacant Land"` — the code and its meaning in one string — so a St-Louis
 * shaped CSV lookup would be inventing a step that does not exist there.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { mapDir } from './config.js'

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
