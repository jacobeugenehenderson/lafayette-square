/**
 * A TILE IS ONE TREE.
 *
 * ⭐ THE INVARIANT (Jacob, 2026-08-26): *"with the exception of multi-stem/trunk trees,
 * there is no such thing as a tile with more than one tree."* A published specimen is one
 * tree. Multi-stem is the one exception, and it is still ONE tree — its trunks share a base
 * and stand inside its own crown.
 *
 * ⛔ THE DEFECT THIS EXISTS FOR. `acer_saccharum` — Sugar Maple, 516 placements, 10% of the
 * LS map — composes from `sugar_maple_low_poly_forest_o.glb`: a STAND of ~20 trees. It ships
 * as one specimen, so the Grove draws one base circle and nineteen trees stand around it with
 * none, and the Salon offers you knobs for "the tree" that are really knobs for a wood.
 *
 * ⭐ WHY FOOTPRINT / HEIGHT AND NOT A TRUNK COUNT. Counting trunks cannot tell a legitimate
 * multi-stem from a forest, and clustering them is fragile. A tree is roughly as wide as it
 * is tall; a forest is many times wider than any one of its trees. Measured on the LS library:
 *
 *     legitimate specimens   footprint/height  0.33 – 1.22   (incl. a 6-trunk linden at 0.81)
 *     acer_saccharum                           10.21          (10.4 m tall, 106.2 m wide)
 *
 * The rule is an order of magnitude from every real tree, so it is not a tuned threshold —
 * and it needs no species list, no roster and no operator who has already looked. Any town.
 *
 *   node scratch/claims-a-tile-is-one-tree.mjs
 */
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const TREES = path.join(ROOT, 'public/trees')
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

// A tree three times wider than it is tall does not exist. The widest real specimen in the
// library is 1.22; the forest asset is 10.21. Anything in between is a judgment call the
// operator should be shown, not a number this check should quietly absorb.
const MAX_FOOTPRINT_OVER_HEIGHT = 3

function extents(doc) {
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')?.getArray(); if (!pos) continue
    for (let i = 0; i < pos.length; i += 3) {
      if (pos[i] < minX) minX = pos[i];         if (pos[i] > maxX) maxX = pos[i]
      if (pos[i+1] < minY) minY = pos[i+1];     if (pos[i+1] > maxY) maxY = pos[i+1]
      if (pos[i+2] < minZ) minZ = pos[i+2];     if (pos[i+2] > maxZ) maxZ = pos[i+2]
    }
  }
  if (!isFinite(minY)) return null
  return { height: maxY - minY, footprint: Math.max(maxX - minX, maxZ - minZ) }
}

let checked = 0, fail = 0
for (const sp of readdirSync(TREES).sort()) {
  const mf = path.join(TREES, sp, 'manifest.json'); if (!existsSync(mf)) continue
  const m = JSON.parse(readFileSync(mf, 'utf8')); if (m.source !== 'glb') continue
  // Only COMPOSED specimens make this claim — a raw vendor chassis in the library has not
  // been offered as a tree yet. `hasComposition` is the same gate the Grove uses.
  if (!existsSync(path.join(ROOT, 'arborist/state', sp, 'compositions.json'))) continue
  for (const v of (m.variants || [])) {
    const f = v.skeletons?.lod0; if (!f) continue
    const p = path.join(TREES, sp, f); if (!existsSync(p)) continue
    let e; try { e = extents(await io.read(p)) } catch (err) { console.log(`  ! ${sp}: ${err.message}`); continue }
    if (!e || e.height <= 0) continue
    checked++
    const ratio = e.footprint / e.height
    if (ratio > MAX_FOOTPRINT_OVER_HEIGHT) {
      fail++
      console.log(`⛔ ${sp} (variant ${v.id}) is not one tree`)
      console.log(`   ${e.height.toFixed(1)} m tall, ${e.footprint.toFixed(1)} m across — ${ratio.toFixed(1)}× wider than tall`)
      console.log(`   its chassis is a stand, not a specimen; compose it onto a single tree`)
    }
  }
}

console.log(`\ncomposed specimens checked: ${checked}   not one tree: ${fail}`)
if (fail) process.exit(1)
console.log('✅ PASS — every composed specimen is one tree.')
