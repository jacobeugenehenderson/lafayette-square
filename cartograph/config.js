/**
 * Cartograph — shared configuration (GEOGRAPHY).
 *
 * Every town carries its OWN geography in data/<scene>/geography.json (the pre-bake extent/projection SSOT that later
 * bakes into the slab), Lafayette Square included: `CARTOGRAPH_SCENE=hipointedemun node fetch.js` projects HiPointe's
 * extent. ⛔ With NO scene named there is no geography: the dev servers, libraries and checks import this for the names
 * and helpers, and every projected value below REFUSES by name when read (`noTown`), never a default town's.
 *
 * ⛔ SCENE RESOLUTION LIVES IN `scene.js`, NOT HERE — and importing THIS file to
 * ask what scene you are on is a mistake. `_loadGeography()` runs at module load
 * and exits when a named scene has no geography.json, so a writer that only needs the scene's NAME must import `scene.js`
 * directly. The names are re-exported below purely so existing importers of
 * `config.js` keep working; `scene.js`'s header explains why the split is
 * load-bearing and must not be undone.
 */
import { geographyFor, projectorOf } from './geography.mjs'
import {
  SCENE, SCENE_IS_EXPLICIT, requireExplicitMap,
  CARTOGRAPH_DIR, mapDir, mapRawDir, mapCleanDir, RAW_DIR, CLEAN_DIR, ribbonsPathOf, declaredRibbonsOf,
} from './scene.js'

export {
  SCENE, SCENE_IS_EXPLICIT, requireExplicitMap,
  CARTOGRAPH_DIR, mapDir, mapRawDir, mapCleanDir, RAW_DIR, CLEAN_DIR, ribbonsPathOf, declaredRibbonsOf,
}

// Geography resolver — `geography.mjs` is the single answer (the town's data/<scene>/geography.json), and it is
// what the pour stamps into map.json as `geographyRead`. Unbuildable → exit loudly.
// ⛔ No scene named: every projected value is a refusal that names itself the moment it is read or spread.
const noTown = (what) => { const refuse = () => { throw new Error(`[config] ⛔ ${what} read with no scene named — there is no default town's geography. Pass --scene=<town> or CARTOGRAPH_SCENE.`) }
  return new Proxy({}, { get: refuse, has: refuse, ownKeys: refuse, getOwnPropertyDescriptor: refuse }) }
let _geo = null
if (SCENE) { try { _geo = geographyFor(SCENE) } catch (e) { console.error(e.message); process.exit(2) } }
// ⭐ the value the pour read — pipeline.js stamps it; the Bake compares it (pour-code.mjs).
export const GEOGRAPHY_READ = _geo ?? noTown('GEOGRAPHY_READ')

// Center + extent from the resolved SSOT.
export const CENTER = _geo ? { lat: _geo.lat, lon: _geo.lon } : noTown('CENTER')

export const BBOX = _geo ? { ..._geo.bbox } : noTown('BBOX')

// WGS84 → local meters conversion at this latitude (from the SSOT). NaN with no town: nothing is projected through it.
export const LON_TO_METERS = _geo ? _geo.lonToMeters : NaN
export const LAT_TO_METERS = _geo ? _geo.latToMeters : NaN

const _project = _geo ? projectorOf(_geo) : null
export function wgs84ToLocal(lon, lat) {
  if (!_project) return CENTER.lon   // no town: CENTER refuses by name
  return _project(lon, lat)          // Z = south (+)
}

export function localToWgs84(x, z) {
  const lon = CENTER.lon + x / LON_TO_METERS
  const lat = CENTER.lat - z / LAT_TO_METERS
  return [lon, lat]
}

// Overpass bounding box string (S,W,N,E)
export function overpassBbox(bbox = BBOX) {
  return `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`
}
