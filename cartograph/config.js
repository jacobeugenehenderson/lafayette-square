/**
 * Cartograph — shared configuration (GEOGRAPHY).
 *
 * Geography is sourced from the per-instance SSOT (src/instance.js#geography)
 * for the DEFAULT scene (Lafayette Square). A non-default scene selected via
 * the CARTOGRAPH_SCENE env var carries its OWN geography in
 * data/<scene>/geography.json (the pre-bake extent/projection SSOT that later
 * bakes into the slab — multi-instance routing decision, 2026-07-02). This is
 * how the fetch/prebake pipeline targets neighborhood #2 without hand-editing
 * instance.js or clobbering LS: `CARTOGRAPH_SCENE=hipointe-demun node fetch.js`
 * fetches HiPointe's extent and writes to data/hipointe-demun/raw/. With the
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
 * and exits when a named scene has no geography.json (the `toy` fixture has
 * none), so a writer that only needs the scene's NAME must import `scene.js`
 * directly. The names are re-exported below purely so existing importers of
 * `config.js` keep working; `scene.js`'s header explains why the split is
 * load-bearing and must not be undone.
 */
import { instanceForMap } from '../src/instances/registry.js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_MAP, SCENE, SCENE_IS_EXPLICIT, requireExplicitMap,
  CARTOGRAPH_DIR, mapDir, mapRawDir, mapCleanDir, RAW_DIR, CLEAN_DIR,
} from './scene.js'

export {
  DEFAULT_MAP, SCENE, SCENE_IS_EXPLICIT, requireExplicitMap,
  CARTOGRAPH_DIR, mapDir, mapRawDir, mapCleanDir, RAW_DIR, CLEAN_DIR,
}

// Geography resolver: a non-default scene's data/<scene>/geography.json wins;
// otherwise the default map's registry module (LS). Same shape either way.
function _loadGeography() {
  if (SCENE !== DEFAULT_MAP) {
    const p = join(mapDir(SCENE), 'geography.json')
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
    // ⛔ Was: warn + fall back to instance.js (Lafayette Square's lat/lon). That
    // projects another town at St. Louis's coordinates — every metre of its
    // geometry lands in the wrong place, plausibly, with only a console warning.
    // An absent geography is not a degraded state, it is an unbuildable one.
    console.error(`
⛔ scene '${SCENE}' has no geography.json (looked in ${p}).

   Refusing to fall back to Lafayette Square's coordinates — that would project
   this town at St. Louis's lat/lon and every derived metre would be wrong.

   Create data/${SCENE}/geography.json (lat/lon/bbox) first.
`)
    process.exit(2)
  }
  // The DEFAULT scene's geography is the default map's own module — this branch is
  // only reached when `SCENE === DEFAULT_MAP`, so there is one right answer and no
  // look involved. ⛔ An unregistered default map is unbuildable, not degraded: say
  // so and exit, exactly as an absent geography.json does above.
  const town = instanceForMap(DEFAULT_MAP)
  if (!town?.geography) {
    console.error(`
⛔ the default map '${DEFAULT_MAP}' has no registered instance module (looked in
   src/instances/registry.js), so there is no geography to project from.

   Register src/instances/${DEFAULT_MAP}.js before building.
`)
    process.exit(2)
  }
  return town.geography
}
const _geo = _loadGeography()

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
