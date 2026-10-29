// ⭐ THE GEOGRAPHY A POUR READS — every town's own data/<scene>/geography.json, Lafayette Square included.
//
// config.js projects every metre from five numbers: lat, lon, bbox, lonToMeters, latToMeters. The pour's code record
// (`pour-code.mjs`) records THIS value (`map.json.geographyRead`). ⛔ There is no default town: Lafayette Square's used
// to come from its registry module as the default map's, and was measured identical to its geography.json on
// 2026-10-21 when the default went (BRIEF-no-default-town). ⛔ Nothing here imports `src/instances/`.
//    ▶ node checks/claims-the-bake-watches-its-code.mjs
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { mapDir } from './scene.js'

const pick = (g) => ({ lat: g.lat, lon: g.lon, bbox: g.bbox, lonToMeters: g.lonToMeters, latToMeters: g.latToMeters })

// → the five fields config.js reads for `scene`. ⛔ Throws, never falls back: an absent geography is unbuildable.
export function geographyFor(scene) {
  if (!scene) throw new Error('⛔ geographyFor: no scene named — there is no default town to project.')
  const p = join(mapDir(scene), 'geography.json')
  if (existsSync(p)) return pick(JSON.parse(readFileSync(p, 'utf8')))
  // ⛔ Was: warn + fall back to Lafayette Square's lat/lon. That projects another town at St. Louis's coordinates —
  // every metre of its geometry lands in the wrong place, plausibly, with only a console warning.
  throw new Error(`
⛔ scene '${scene}' has no geography.json (looked in ${p}).

   Refusing to fall back to another town's coordinates — every derived metre would be wrong.

   Create data/${scene}/geography.json (lat/lon/bbox) first.
`)
}

/** The frame's metres-per-degree, REFUSED by name when geography.json lacks a usable one. A default (it was 111000 for a
 *  missing latToMeters; a missing lonToMeters gave NaN, or a cosine guess) places everything plausibly wrong. */
export function metresPerDegree(geo, who) {
  const lon = geo?.lonToMeters, lat = geo?.latToMeters
  if (!(Number.isFinite(lon) && lon > 0) || !(Number.isFinite(lat) && lat > 0))
    throw new Error(`[${who}] ⛔ geography.json carries no usable lonToMeters/latToMeters (${lon}, ${lat}) — the frame cannot place anything; refusing`)
  return { lonToM: lon, latToM: lat }
}

/** lon/lat → local metres (x east, z south) for one geography. config.js#wgs84ToLocal IS this, for the scene it names. It lives
 *  with the town's place so the player projects through the same function (src/lib/townPlace.js#projectorOf). */
export { projectorOf } from '../src/lib/townPlace.js'

/** The bb in LOCAL coords: the frozen fetch envelope (`osm.bbox`) through `project`. null when the fetch wrote none. */
export function localBB(osm, project) {
  const bx = osm?.bbox
  if (!bx) return null
  const a = project(bx.minLon, bx.maxLat), b = project(bx.maxLon, bx.minLat)
  return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]) }
}
