/**
 * DOES THE HERO-BAND TRIANGLE BUDGET ACTUALLY CLOSE?
 *
 * Sums the lod1 triangles of every `heroRole === 'mesh'` placement and compares to
 * `heroBandMeta.trianglesSpent`. It reconciles EXACTLY — recorded because I claimed it did
 * not, having assumed the runtime drew the `url` (lod2) when `InstancedTrees#lodForRole`
 * overrides it to lod1 for mesh role.
 *
 * ⭐ The number worth having: Σ lod1 vs Σ lod2 for the same placements. That ratio is what a
 * distance-graded LOD would buy, and `lodForRole` currently takes the instance and ignores it.
 *
 *   node scratch/hero-band-reconcile.mjs
 */
import { glbTriangleCount } from '../arborist/hero-band.mjs'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
const ROOT = path.join(import.meta.dirname, '..')
const look = 'lafayette-square'
const t = JSON.parse(readFileSync(path.join(ROOT, 'public/baked', look, 'trees.json'), 'utf8'))
const cache = new Map()
const tris = (rel) => { if (!rel) return null
  if (!cache.has(rel)) { const abs = path.join(ROOT, 'public/baked', look, rel.replace(/^\//,''))
    cache.set(rel, existsSync(abs) ? glbTriangleCount(abs) : null) }
  return cache.get(rel) }
let sum1 = 0, sum2 = 0, n = 0, unk = 0
for (const i of t.instances) {
  if (i.heroRole !== 'mesh') continue
  n++
  const a = tris(i.lods?.lod1), b = tris(i.lods?.lod2)
  if (a == null) { unk++; continue }
  sum1 += a; sum2 += (b ?? 0)
}
console.log(`heroRole=mesh: ${n}  (unweighable ${unk})`)
console.log(`  Σ lod1 triangles  ${sum1.toLocaleString()}   ← what the budget charged`)
console.log(`  Σ lod2 triangles  ${sum2.toLocaleString()}`)
console.log(`  heroBandMeta.trianglesSpent ${t.heroBandMeta.trianglesSpent.toLocaleString()}  budget ${t.heroBandMeta.triangleBudget.toLocaleString()}`)
console.log(`  reconciles with lod1? ${sum1 === t.heroBandMeta.trianglesSpent ? 'YES — exactly' : 'NO, delta ' + (sum1 - t.heroBandMeta.trianglesSpent)}`)
