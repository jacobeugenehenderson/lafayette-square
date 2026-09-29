/**
 * slab-tree-geometry.mjs — read a baked town off disk and ask the RUNTIME's rule
 * (`src/lib/treeGeometry.js#slabTreeGeometry`) whether any of its trees draw through the atlas.
 * The uploader uses it to leave model GLBs and atlas PNGs out of an all-impostor town; the verifier
 * uses it to expect exactly that. Both ask the runtime, neither asks the other.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { slabTreeGeometry } from '../src/lib/treeGeometry.js'

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null)

export function treeGeometryOfTown(townDir, look) {
  return slabTreeGeometry({
    trees: readJson(join(townDir, 'trees.json')),
    atlasManifest: readJson(join(townDir, 'trees-atlas.json')),
    scene: readJson(join(townDir, 'scene.json')),
    look,
  })
}
