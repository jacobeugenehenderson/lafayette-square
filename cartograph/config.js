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
 * (instance.js is pure/dependency-free, so this node backend can import it.)
 *
 * ⛔ SCENE RESOLUTION LIVES IN `scene.js`, NOT HERE — and importing THIS file to
 * ask what scene you are on is a mistake. `_loadGeography()` runs at module load
 * and exits when a named scene has no geography.json (the `toy` fixture has
 * none), so a writer that only needs the scene's NAME must import `scene.js`
 * directly. The names are re-exported below purely so existing importers of
 * `config.js` keep working; `scene.js`'s header explains why the split is
 * load-bearing and must not be undone.
 */
import { INSTANCE } from '../src/instance.js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_SCENE, SCENE, SCENE_IS_EXPLICIT, requireExplicitScene,
  CARTOGRAPH_DIR, sceneDir, sceneRawDir, sceneCleanDir, RAW_DIR, CLEAN_DIR,
} from './scene.js'

export {
  DEFAULT_SCENE, SCENE, SCENE_IS_EXPLICIT, requireExplicitScene,
  CARTOGRAPH_DIR, sceneDir, sceneRawDir, sceneCleanDir, RAW_DIR, CLEAN_DIR,
}

// Geography resolver: a non-default scene's data/<scene>/geography.json wins;
// otherwise the instance.js SSOT (LS). Same shape either way.
function _loadGeography() {
  if (SCENE !== DEFAULT_SCENE) {
    const p = join(sceneDir(SCENE), 'geography.json')
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
  return INSTANCE.geography
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
