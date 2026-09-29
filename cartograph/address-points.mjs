/**
 * address-points.mjs — a town's street-address POINTS (county/state E-911 and the like): the providers the kit knows,
 * how each one's record becomes an address, and the loader the bake reads. Declared per town in sources.json
 * (`addressPoints`, cartograph/sources.js#readAddressPointSources); fetched by fetch-address-points.mjs.
 *
 * ⭐ THE ADDRESS IS COMPOSED FROM THE POINT'S OWN FIELDS — house number + street parts — WITHOUT the unit, so
 *    "2115 A CLEVELAND RD W" and "2115 B CLEVELAND RD W" are one building's "2115 CLEVELAND RD W" (the units ride
 *    alongside as `unit`). That is the source's words, assembled — never expanded, re-cased or guessed. A record with
 *    no house number or no street name is not an address and is dropped, counted.
 * ⭐ A provider is a kit entry, not a town patch: an Ohio town declares 'ohio-lbrs' and gets it; another state is a new
 *    provider row, not an edit to the bake (CLAUDE.md Layer 0 q1).
 * Joined by containment only (cartograph/building-address.mjs): a point inside the footprint, or inside the parcel the
 * building stands in. ⛔ Never the nearest point.
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { mapDir } from './config.js'
import { readAddressPointSources, declaredParcelPaths } from './sources.js'
import { tidy } from './building-address.mjs'

const s = (v) => (v == null ? '' : String(v).trim())

export const ADDRESS_POINT_PROVIDERS = {
  // Ohio's Statewide LBRS Address Points (OGRIP; all 88 counties, E-911 field-verified). Public use "as is".
  'ohio-lbrs': {
    endpoint: 'https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/Statewide_LBRS_Address_Points/FeatureServer/0/query',
    attribution: 'Ohio Statewide LBRS Address Points — OGRIP (Ohio Geographically Referenced Information Program)',
    outFields: 'HOUSENUM,UNITNUM,ST_PREFIX,ST_NAME,ST_TYPE,ST_SUFFIX,ST_SUFFIX2',
    compose(a) {
      const n = s(a.HOUSENUM)
      const street = [a.ST_PREFIX, a.ST_NAME, a.ST_TYPE, a.ST_SUFFIX, a.ST_SUFFIX2].map(s).filter(Boolean).join(' ')
      if (!n || n === '0' || !s(a.ST_NAME)) return null
      return { housenumber: n, street, unit: s(a.UNITNUM) || null, address: tidy(`${n} ${street}`) }
    },
  },
}

/**
 * The town's address points, as the bake reads them: { state, points: [{ address, unit, x, z }], reason? }.
 * ⛔ A DECLARED source whose file is not there throws, naming the button — the town said it exists.
 */
export function loadAddressPoints(scene) {
  const d = readAddressPointSources(scene, ADDRESS_POINT_PROVIDERS)
  if (d.state !== 'declared') return { state: d.state, points: [], reason: d.absentReason ?? null }
  const points = []
  for (const src of d.sources) {
    const p = join(mapDir(scene), 'raw', src.file)
    if (!existsSync(p)) throw new Error(`[address-points] "${scene}" declares "${src.id}" → raw/${src.file}, which is not there.\n  Acquire it: CARTOGRAPH_SCENE=${scene} node cartograph/fetch-address-points.mjs`)
    for (const q of JSON.parse(readFileSync(p, 'utf8')).points || []) {
      if (q.address && Number.isFinite(q.x) && Number.isFinite(q.z)) points.push({ address: q.address, unit: q.unit ?? null, x: q.x, z: q.z })
    }
  }
  return { state: 'declared', points }
}

/** The town's parcel rings ([[{x,z}]] per parcel), from its declared parcel files — the JOIN geometry, not a value. */
export function loadParcelRings(scene) {
  const out = []
  for (const p of declaredParcelPaths(scene)) {
    if (!existsSync(p)) continue
    for (const par of JSON.parse(readFileSync(p, 'utf8')).parcels || []) {
      if (Array.isArray(par.rings) && par.rings.length) out.push(par.rings.map((r) => r.map(([x, z]) => ({ x, z }))))
    }
  }
  return out
}
