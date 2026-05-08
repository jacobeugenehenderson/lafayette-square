/**
 * Cartograph — shared configuration
 *
 * To target a different neighborhood, change CENTER and BBOX.
 * Everything downstream reads from here.
 */

// Lafayette Square, St. Louis
export const CENTER = { lat: 38.6160, lon: -90.2161 }

export const BBOX = {
  minLat: 38.6100,   // south edge: above I-44
  maxLat: 38.6230,   // north edge: one block past Chouteau (both sides' buildings)
  minLon: -90.2290,  // west: Lafayette commercial strip past Jefferson
  maxLon: -90.2070,
}

// WGS84 → local meters conversion at this latitude
export const LON_TO_METERS = 86774
export const LAT_TO_METERS = 111000

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
