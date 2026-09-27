// terrainLoad.js — load an installation's baked terrain heightfield from its
// portable folder (cartograph/data/<scene>/clean/terrain.*) for the node-side
// bake scripts. ONE SSOT so ground / buildings / lamps / tree-anchors all read
// the SAME per-scene terrain the runtime lifts by (via terrainCommon's shared
// sampler + V_EXAG — no hand-rolled copy).
//
// No installation is privileged: every scene (LS included) reads its own
// clean/terrain.* — never a global src/data/terrain.* (that global path is
// retired; feedback_installations_are_independent). Returns null when the
// scene has no terrain baked yet — a legitimate state (bake flat / no lift),
// NOT an error.
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { makeElevationSampler, terrainIdentity, DEFAULT_V_EXAG } from '../src/lib/terrainCommon.js'
import { pourPolicyFor } from './intake-rows.mjs'

const CARTOGRAPH_DIR = dirname(fileURLToPath(import.meta.url))

export function mapTerrainPaths(scene) {
  // CARTOGRAPH_TERRAIN_DIR: read a scratch heightfield (bake-terrain --out-dir) for an A/B bake — said out loud.
  const alt = process.env.CARTOGRAPH_TERRAIN_DIR
  if (alt) console.warn(`  ⚠️ [terrain] reading ${scene}'s heightfield from ${alt} (CARTOGRAPH_TERRAIN_DIR), NOT the scene's own clean/`)
  const dir = alt || join(CARTOGRAPH_DIR, 'data', scene, 'clean')
  return { json: join(dir, 'terrain.json'), bin: join(dir, 'terrain.bin') }
}

// Returns a full sampler ({ getElevation, getElevationRaw, displaceGeometry,
// bounds, width, height }) or null if this scene has no baked terrain.
// ⛔ THE BAKE AND THE RUNTIME MUST AGREE ON THE EXAGGERATION OR THE SLAB IS TUNED FOR A
// DIFFERENT MAP THAN THE ONE DRAWN. bake-ground's adaptive refinement subdivides where the
// heightfield BENDS more than the tolerance, and "how much it bends" is a function of exag —
// so a bake at 1.5 against a runtime at 1 over-tessellates, and the reverse under-tessellates
// and facets the hill. Both now read the same authored number (site 15).
// ⚠️ Read from the LOOK's design.json, which is the authoring SSoT; the slab's scene.json is
// the runtime's copy of it and is written by bake-scene from this same field.
function authoredExag(scene) {
  const p = join(CARTOGRAPH_DIR, '..', 'public', 'looks', scene, 'design.json')
  if (!existsSync(p)) return DEFAULT_V_EXAG
  try {
    const v = JSON.parse(readFileSync(p, 'utf-8'))?.terrainExag
    return typeof v === 'number' && isFinite(v) && v >= 0 ? v : DEFAULT_V_EXAG
  } catch { return DEFAULT_V_EXAG }
}

export function loadSceneTerrain(scene) {
  const { json, bin } = mapTerrainPaths(scene)
  if (!existsSync(json) || !existsSync(bin)) return null
  const meta = JSON.parse(readFileSync(json, 'utf-8'))
  const buf = readFileSync(bin)
  const data = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  const t = { ...meta, data }
  return { ...makeElevationSampler(t, authoredExag(scene)), identity: terrainIdentity(t), baseElev: meta.baseElev ?? null }
}

/**
 * The terrain an ANCHOR bake must sample, or a loud refusal. ⛔ Not `loadSceneTerrain(scene) || flat`:
 * that fallback seated every lamp and tree of a hilly town at y = 0, with no warning, whenever its
 * terrain had not been baked yet (BRIEF-street-lamps-derived, found by Plumb).
 * Flat is honest in exactly one case — the town has put `verifiedAbsent` on record for its elevation
 * row (`pourPolicyFor`, the kit's one "we looked and there is none" state). Otherwise: throw, naming the fix.
 * @param {string} scene
 * @param {string} who  the calling bake, for the message
 */
export function requireSceneTerrain(scene, who) {
  const t = loadSceneTerrain(scene)
  if (t) return t
  const policy = pourPolicyFor('elevation', scene)
  if (policy.onTheRecord) {
    console.warn(`[${who}] ${scene}: no terrain baked — anchoring FLAT, on the record: ${policy.onTheRecord}`)
    return { getElevationRaw: () => 0, identity: 'none', baseElev: null }
  }
  throw new Error(`[${who}] ${scene}: no clean/terrain.* to anchor against, and flat is not on the record. ` +
    (policy.allow
      ? `The town HAS an elevation input — bake its terrain first (node cartograph/bake-terrain.js --scene=${scene}).`
      : `${policy.why}${policy.fix ? `\n   ▶ ${policy.fix}` : ''}`) +
    `\n   Refusing to seat every object at y = 0.`)
}
