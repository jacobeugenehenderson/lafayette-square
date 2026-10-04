/**
 * Cartograph — shared configuration (GEOGRAPHY).
 *
 * Geography is sourced from the per-instance SSOT (src/instance.js#geography)
 * for the DEFAULT scene (Lafayette Square). A non-default scene selected via
 * the CARTOGRAPH_SCENE env var carries its OWN geography in
 * data/<scene>/geography.json (the pre-bake extent/projection SSOT that later
 * bakes into the slab — multi-instance routing decision, 2026-07-02). This is
 * how the fetch/prebake pipeline targets neighborhood #2 without hand-editing
 * instance.js or clobbering LS: `CARTOGRAPH_SCENE=hipointedemun node fetch.js`
 * fetches HiPointe's extent and writes to data/hipointedemun/raw/. With the
 * env unset, every export below is byte-identical to before.
 * ⛔ IT IMPORTS THE MAP **REGISTRY**, NOT `src/instance.js` (2026-09-21). instance.js
 * statically imports `public/looks/index.json`, which the dev server REWRITES on
 * every bake — and `node --watch` watches a module graph, so importing it here made
 * serve.js (and arborist, via this file) kill themselves mid-pour. The registry is
 * the same town modules with the look→map table left out, which is all this file
 * ever wanted. Full account: `src/instances/registry.js`.
 * ▶ node checks/claims-the-dev-servers-do-not-import-the-looks-index.mjs
 *
 * ⛔ SCENE RESOLUTION LIVES IN `scene.js`, NOT HERE — and importing THIS file to
 * ask what scene you are on is a mistake. `_loadGeography()` runs at module load
 * and exits when a named scene has no geography.json, so a writer that only needs the scene's NAME must import `scene.js`
 * directly. The names are re-exported below purely so existing importers of
 * `config.js` keep working; `scene.js`'s header explains why the split is
 * load-bearing and must not be undone.
 */
import { geographyFor } from './geography.mjs'
import {
  DEFAULT_MAP, SCENE, SCENE_IS_EXPLICIT, requireExplicitMap,
  CARTOGRAPH_DIR, mapDir, mapRawDir, mapCleanDir, RAW_DIR, CLEAN_DIR,
} from './scene.js'

export {
  DEFAULT_MAP, SCENE, SCENE_IS_EXPLICIT, requireExplicitMap,
  CARTOGRAPH_DIR, mapDir, mapRawDir, mapCleanDir, RAW_DIR, CLEAN_DIR,
}

// Geography resolver — `geography.mjs` is the single answer (a non-default scene's
// data/<scene>/geography.json, else the default map's registry module), and it is
// what the pour stamps into map.json as `geographyRead`. Unbuildable → exit loudly.
let _geo
try { _geo = geographyFor(SCENE) } catch (e) { console.error(e.message); process.exit(2) }
// ⭐ the value the pour read — pipeline.js stamps it; the Bake compares it (pour-code.mjs).
export const GEOGRAPHY_READ = _geo

// Center + extent from the resolved SSOT.
export const CENTER = { lat: _geo.lat, lon: _geo.lon }

export const BBOX = { ..._geo.bbox }

// WGS84 → local meters conversion at this latitude (from the SSOT).
export const LON_TO_METERS = _geo.lonToMeters
export const LAT_TO_METERS = _geo.latToMeters

export function wgs84ToLocal(lon, lat) {
  const x = (lon - CENTER.lon) * LON_TO_METERS
  const z = (CENTER.lat - lat) * LAT_TO_METERS // Z = south (+)
  return [x, z]
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
