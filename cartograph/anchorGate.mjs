/**
 * anchorGate.mjs — THE GUARD: a slab whose tree or lamp anchors do not belong to it never ships (Boz ruled, 2026-10-29).
 * The verdicts are the player's own (src/lib/anchorGate.js), read here off the slab on disk with its own heightfield's
 * identity, so the runtime refusal is only the backstop. Called by Publish (serve.js POST /looks/<id>/publish) before
 * anything is committed or uploaded. ▶ node checks/claims-anchors-know-their-terrain.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { terrainIdentity } from '../src/lib/terrainCommon.js'
import { treeAnchorsVerdict, lampAnchorsVerdict } from '../src/lib/anchorGate.js'

const json = (p) => JSON.parse(readFileSync(p, 'utf8'))

/** The slab's heightfield identity, as the player computes it from the same two files. */
export function slabTerrainIdentity(lookDir) {
  const tj = join(lookDir, 'terrain.json'), tb = join(lookDir, 'terrain.bin')
  if (!existsSync(tj) || !existsSync(tb)) return 'none'
  const b = readFileSync(tb)
  return terrainIdentity({ ...json(tj), data: new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) })
}

/** [{ what, why, step }] for each anchored layer of the slab its verdict refuses; [] when every one belongs. */
export function slabAnchorRefusals(lookDir, look) {
  const out = [], terrainId = slabTerrainIdentity(lookDir)
  const trees = join(lookDir, 'trees.json')
  if (existsSync(trees)) {
    const instances = json(trees).instances || []
    if (instances.length) {
      const anchors = join(lookDir, 'tree-anchors.json')
      const v = treeAnchorsVerdict({ doc: existsSync(anchors) ? json(anchors) : null, instances, terrainId })
      if (!v.ok) out.push({ what: 'trees', why: v.why, step: `node cartograph/bake-tree-anchors.js --look=${look} --scene=<its scene>` })
    }
  }
  const lamps = join(lookDir, 'lamps.json')
  if (existsSync(lamps)) {
    const v = lampAnchorsVerdict({ doc: json(lamps), terrainId })
    if (!v.ok) out.push({ what: 'lamps', why: v.why, step: `node cartograph/bake-lamps.js --scene=<its scene> --look=${look}` })
  }
  return out
}
