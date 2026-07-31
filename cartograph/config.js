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

// Scene selection — `--scene=<id>` or CARTOGRAPH_SCENE (single-scene per process;
// the pipeline runs one neighborhood at a time). Exported so scripts can
// log/branch on the active scene.
//
// ⛔⛔ NO SILENT DEFAULT ON ANYTHING THAT WRITES (`BRIEF-ls-bleed-excision` site 11,
// Class C). `SCENE = env || DEFAULT_SCENE` meant forgetting the variable silently
// redirected the whole run onto Lafayette Square — no error, no warning. On
// 2026-07-31 that cost a full day: an agent rebuilt LS repeatedly while the
// operator worked in `lafayette-square-staging`, and the resulting "no symptom
// change" was read as the fix failing rather than as the wrong town being built.
// A fallback turns a failure into a plausible-looking success; for a kit that is
// the worst available outcome (`CLAUDE.md` Layer 0).
//
// READ paths may still resolve to the default (the dev server imports this at
// module load and must not die), but the choice is now VISIBLE. Anything that
// WRITES must call `requireExplicitScene()` and refuse.
export const DEFAULT_SCENE = 'lafayette-square'

const _sceneArg = (process.argv || []).map(a => /^--scene=(.+)$/.exec(a)).find(Boolean)?.[1]
/** true when the operator actually named the scene (flag or env), false when defaulted. */
export const SCENE_IS_EXPLICIT = !!(_sceneArg || process.env.CARTOGRAPH_SCENE)
export const SCENE = _sceneArg || process.env.CARTOGRAPH_SCENE || DEFAULT_SCENE

/**
 * Refuse to proceed unless the operator named the scene. Call this FIRST in any
 * entry point that writes an artifact — a wrong scene there does not show a wrong
 * map, it overwrites a right one.
 */
export function requireExplicitScene(who = 'this command') {
  if (SCENE_IS_EXPLICIT) return SCENE
  console.error(`
⛔ ${who} refuses to run without an explicit scene.

   It writes artifacts, and defaulting would silently target '${DEFAULT_SCENE}' —
   overwriting Lafayette Square's build with another town's run, or vice versa.

   Name the scene:
     node ${process.argv[1]?.split('/').pop() || '<script>'} --scene=${DEFAULT_SCENE}
     CARTOGRAPH_SCENE=${DEFAULT_SCENE} node ${process.argv[1]?.split('/').pop() || '<script>'}

   (BRIEF-ls-bleed-excision site 11 · CLAUDE.md Layer 0 — no fallbacks.)
`)
  process.exit(2)
}

if (!SCENE_IS_EXPLICIT) console.warn(`[config] scene not named — defaulting to '${DEFAULT_SCENE}'. Pass --scene=<id> to be explicit.`)

// Geography resolver: a non-default scene's data/<scene>/geography.json wins;
// otherwise the instance.js SSOT (LS). Same shape either way.
function _loadGeography() {
  if (SCENE !== DEFAULT_SCENE) {
    const p = join(__dirname, 'data', SCENE, 'geography.json')
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
