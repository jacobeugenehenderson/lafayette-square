/**
 * states/index.mjs — THE STATE ADAPTERS: what a town takes from its state (Jacob, 2026-10-05: "yes, go").
 *
 * A state publishes WELLS (parcels, address points — statewide layers, or sub-state ones: a county's or an independent
 * city's own assessor) and VOCABULARIES (how its land-use codes read). Before this, each town re-declared its state's
 * wells by hand in its own sources.json — Huron carried Ohio's endpoints, LS and HPDM each carried an identical copy of
 * St. Louis City's — and a new town in a known state started from nothing.
 *
 * ⭐ A town now declares only WHAT IT TAKES and HOW IT SELECTS (cartograph/data/<scene>/sources.json):
 *     "state": "MA", "select": { "town_id": 242 },
 *     "parcels": [{ "from": "state", "id": "massgis-l3" }]
 *   and `readSources` resolves each entry against its state's record, substituting the selector into the well's
 *   `select.where`. Every resolved well is STAMPED `fromState: "<CODE>@<version>"`, so a pour records exactly what it
 *   took. A town may still declare a well of its own in full (no `from`), as before.
 * ⛔ NO FALLBACKS: a state with no record, a well its state does not list, or a selector the well needs and the town
 *   did not give, THROWS — naming what is missing. A town is never handed another state's well.
 * ⭐ The town's declared state must be the state its OWN map votes (`townState`, every `addr:state` in its OSM):
 *   ▶ node checks/claims-a-state-gives-its-towns-their-wells.mjs
 */
import oh from './oh.mjs'
import ma from './ma.mjs'
import mo from './mo.mjs'
import ny from './ny.mjs'
import { classifyUseFromText } from '../parcel-landuse.mjs'

export const STATES = Object.fromEntries([oh, ma, mo, ny].map(r => [r.code, r]))

/** How a well is fetched. ⭐ Every STATE well declares one (BRIEF-nyc-adapter §3.2a): `arcgis` (a FeatureServer/
 *  MapServer `query`; `select.where` is ArcGIS SQL), `socrata` (NYC Open Data and the like; `select.where` is SoQL),
 *  `file` (a declared file with no endpoint — read, never fetched). The selector substitution is the same for all
 *  three; the protocol says which fetcher reads the result. ⛔ A state well with none, or another, THROWS.
 *  A well a town declares IN FULL keeps the original full-declaration schema, which is ArcGIS. */
export const PROTOCOLS = ['arcgis', 'socrata', 'file']

export function stateRecord(code, where = '') {
  const r = STATES[code]
  if (!r) throw new Error(`${where}declares state "${code}", which has NO state adapter (cartograph/states/: ${Object.keys(STATES).join(', ')}).\n` +
    `  Write cartograph/states/${String(code).toLowerCase()}.mjs, or declare this town's wells in full in its sources.json.`)
  return r
}

/** The land-use code readers, by `land_use_code_format`: the kit's own text reader plus every state's vocabularies.
 *  `stl-assessor-numeric` is read with its jurisdiction + decode table (parcel-landuse.mjs#classifyParcelLandUse). */
export const LAND_USE_READERS = Object.assign({ 'self-describing': classifyUseFromText }, ...Object.values(STATES).map(r => r.vocabularies || {}))

/**
 * Resolve one declared entry: `{ from: "state", id }` → the state's well, selected for this town, stamped. A full
 * declaration (no `from`) passes through untouched.
 */
export function resolveFromState(entry, kind, town, where = '') {
  if (entry?.from !== 'state') return entry
  if (!town.state) throw new Error(`${where}takes ${kind} "${entry.id}" from its state but declares no \`state\``)
  const rec = stateRecord(town.state, where)
  const well = rec[kind]?.[entry.id]
  if (!well) throw new Error(`${where}takes ${kind} "${entry.id}" from ${rec.code}, which lists no such well (${Object.keys(rec[kind] || {}).join(', ') || 'none'})`)
  if (!PROTOCOLS.includes(well.protocol)) throw new Error(`${where}takes ${kind} "${entry.id}" from ${rec.code}, whose well declares protocol ${JSON.stringify(well.protocol)} — a state well must declare one of ${PROTOCOLS.join(', ')}`)
  const { select, ...rest } = well
  const out = { ...rest, id: entry.id, fromState: `${rec.code}@${rec.version}` }
  if (select?.where) {
    out.where = select.where.replace(/\{(\w+)\}/g, (_, k) => {
      const v = town.select?.[k]
      if (v == null || v === '') throw new Error(`${where}takes ${kind} "${entry.id}" from ${rec.code}, whose well selects by \`${k}\` — but the town's \`select\` gives no \`${k}\``)
      if (!/^[\w .'-]+$/.test(String(v))) throw new Error(`${where}select.${k} = ${JSON.stringify(v)} is not a plain name or number`)
      return String(v).replace(/'/g, "''")
    })
  }
  return { ...out, ...Object.fromEntries(Object.entries(entry).filter(([k]) => !['from', 'id'].includes(k))) }   // a town's own keys (e.g. a note) ride along
}
