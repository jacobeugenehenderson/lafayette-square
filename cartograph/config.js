/**
 * Cartograph — shared configuration
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
 */
import { INSTANCE } from '../src/instance.js'
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Scene selection — CARTOGRAPH_SCENE overrides the default (single-scene per
// process; the pipeline runs one neighborhood at a time). Exported so scripts
// can log/branch on the active scene.
export const DEFAULT_SCENE = 'lafayette-square'
export const SCENE = process.env.CARTOGRAPH_SCENE || DEFAULT_SCENE

// Geography resolver: a non-default scene's data/<scene>/geography.json wins;
// otherwise the instance.js SSOT (LS). Same shape either way.
function _loadGeography() {
  if (SCENE !== DEFAULT_SCENE) {
    const p = join(__dirname, 'data', SCENE, 'geography.json')
    if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8'))
    console.warn(`[config] CARTOGRAPH_SCENE=${SCENE} but no ${p}; falling back to instance.js geography`)
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

// Paths
export const CARTOGRAPH_DIR = __dirname

// Per-scene data lives under cartograph/data/<scene>/. Each scene mirrors
// the same raw/ + clean/ split (raw = ingested inputs; clean = derived /
// operator-edited artifacts). Scripts that operate on a specific scene
// should call sceneRawDir(scene) / sceneCleanDir(scene); the unqualified
// RAW_DIR / CLEAN_DIR aliases resolve to the ACTIVE scene (SCENE) — the
// default (Lafayette Square) when CARTOGRAPH_SCENE is unset, so existing call
// sites keep working; the target scene when it's set.
export function sceneDir(scene)      { return join(__dirname, 'data', scene) }
export function sceneRawDir(scene)   { return join(__dirname, 'data', scene, 'raw') }
export function sceneCleanDir(scene) { return join(__dirname, 'data', scene, 'clean') }
export const RAW_DIR   = sceneRawDir(SCENE)
export const CLEAN_DIR = sceneCleanDir(SCENE)
