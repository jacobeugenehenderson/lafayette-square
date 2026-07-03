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
import { makeElevationSampler } from '../src/lib/terrainCommon.js'

const CARTOGRAPH_DIR = dirname(fileURLToPath(import.meta.url))

export function sceneTerrainPaths(scene) {
  const dir = join(CARTOGRAPH_DIR, 'data', scene, 'clean')
  return { json: join(dir, 'terrain.json'), bin: join(dir, 'terrain.bin') }
}

// Returns a full sampler ({ getElevation, getElevationRaw, displaceGeometry,
// bounds, width, height }) or null if this scene has no baked terrain.
export function loadSceneTerrain(scene) {
  const { json, bin } = sceneTerrainPaths(scene)
  if (!existsSync(json) || !existsSync(bin)) return null
  const meta = JSON.parse(readFileSync(json, 'utf-8'))
  const buf = readFileSync(bin)
  const data = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  return makeElevationSampler({ ...meta, data })
}
