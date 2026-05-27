/**
 * Cartograph — shared configuration
 *
 * Geography is sourced from the per-instance SSOT (src/instance.js#geography).
 * To target a different neighborhood, edit THAT — not here. These re-exports
 * preserve config.js's existing API for downstream pipeline scripts.
 * (instance.js is pure/dependency-free, so this node backend can import it.)
 */
import { INSTANCE } from '../src/instance.js'

const _geo = INSTANCE.geography

// Lafayette Square, St. Louis — from the SSOT.
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
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const CARTOGRAPH_DIR = __dirname

// Per-scene data lives under cartograph/data/<scene>/. Each scene mirrors
// the same raw/ + clean/ split (raw = ingested inputs; clean = derived /
// operator-edited artifacts). Scripts that operate on a specific scene
// should call sceneRawDir(scene) / sceneCleanDir(scene); the unqualified
// RAW_DIR / CLEAN_DIR aliases continue to point at the default scene
// (Lafayette Square) so existing call sites keep working during migration.
export const DEFAULT_SCENE = 'lafayette-square'
export function sceneDir(scene)      { return join(__dirname, 'data', scene) }
export function sceneRawDir(scene)   { return join(__dirname, 'data', scene, 'raw') }
export function sceneCleanDir(scene) { return join(__dirname, 'data', scene, 'clean') }
export const RAW_DIR   = sceneRawDir(DEFAULT_SCENE)
export const CLEAN_DIR = sceneCleanDir(DEFAULT_SCENE)
