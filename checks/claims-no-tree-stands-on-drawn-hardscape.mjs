/**
 * NO TREE MAY STAND ON A SURFACE THE MAP DRAWS AS HARDSCAPE.
 *
 * ⛔ WHY THIS EXISTS, AND WHY THE EXISTING GUARD IS NOT ENOUGH (2026-08-28). `bake-trees.js`
 * already re-checks every kept tree at its final position and REFUSES to write a slab that
 * plants on hardscape — and it passes: 0 of 5146 on LS. But it asks `makeZoneTester`, which
 * builds its surfaces from `shape.json` + `map.json` + the Look's `design.json`. The ground
 * the operator LOOKS AT is a different artifact, built by a different producer (`bake-ground`
 * → `ground.json` groups + `ground.bin`). ⭐ **Two producers, and nothing compared them.**
 * Measured at a point: the gate says `lu` — plantable — where the ground draws `highway`.
 *
 * ⭐ THIS IS THE OPERATOR'S EYE, AUTOMATED. It asks the RENDERED geometry what is underneath
 * each shipped tree — the highest-renderOrder group whose triangle contains it, i.e. exactly
 * what a viewer sees — and needs no one to have looked at the street first. A town nobody has
 * opened gets it free. Measured on first run: LS 6/5146 (4 of them in the roadway), HPDM
 * 27/8346 (including 7 trees standing in a swimming pool), ksi-y-m-yn 0.
 *
 * ⚠️ IT IS A DISAGREEMENT DETECTOR, NOT A VERDICT ON WHICH SIDE IS WRONG. A hit means the gate
 * and the drawn ground disagree about that spot. Which one is right is the judgment call — the
 * road may be drawn too wide, or the gate's surface model may be missing a layer the ground
 * draws. ⛔ Do not "fix" it by widening the gate until you have looked at one.
 *
 *   node scratch/claims-no-tree-stands-on-drawn-hardscape.mjs [scene ...]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
const ROOT = path.join(import.meta.dirname, '..')


let failed = 0
const scenes = process.argv.slice(2).length ? process.argv.slice(2)
  : readdirSync(path.join(ROOT,'public/baked')).filter(d => existsSync(path.join(ROOT,'public/baked',d,'ground.json')) && existsSync(path.join(ROOT,'public/baked',d,'trees.json')))
for (const scene of scenes) {
const G = JSON.parse(readFileSync(path.join(ROOT, 'public/baked', scene, 'ground.json'), 'utf8'))
const bin = readFileSync(path.join(ROOT, 'public/baked', scene, G.bin))
const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
const trees = JSON.parse(readFileSync(path.join(ROOT, 'public/baked', scene, 'trees.json'), 'utf8')).instances

// Grid index over every triangle of every group. The visible material at a point is the
// group with the HIGHEST renderOrder whose triangle contains it (later draw = on top).
const CELL = 4
const [minX, , minZ] = G.bbox.min, [maxX, , maxZ] = G.bbox.max
const NX = Math.ceil((maxX - minX) / CELL), NZ = Math.ceil((maxZ - minZ) / CELL)
const cells = new Map()
const tris = []
for (const g of G.groups) {
  const pos = new Float32Array(buf, g.vertexByteOffset, g.vertexCount * 3)
  const idx = new Uint32Array(buf, g.indexByteOffset, g.indexCount)
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i+1] * 3, c = idx[i+2] * 3
    const t = [pos[a], pos[a+2], pos[b], pos[b+2], pos[c], pos[c+2], g.renderOrder, g.id]
    const ti = tris.push(t) - 1
    const lo = Math.max(0, Math.floor((Math.min(t[0],t[2],t[4]) - minX) / CELL))
    const hi = Math.min(NX-1, Math.floor((Math.max(t[0],t[2],t[4]) - minX) / CELL))
    const lz = Math.max(0, Math.floor((Math.min(t[1],t[3],t[5]) - minZ) / CELL))
    const hz = Math.min(NZ-1, Math.floor((Math.max(t[1],t[3],t[5]) - minZ) / CELL))
    for (let cx = lo; cx <= hi; cx++) for (let cz = lz; cz <= hz; cz++) {
      const k = cx * NZ + cz
      let arr = cells.get(k); if (!arr) { arr = []; cells.set(k, arr) }
      arr.push(ti)
    }
  }
}
const inTri = (px, pz, t) => {
  const d1 = (px-t[2])*(t[1]-t[3]) - (t[0]-t[2])*(pz-t[3])
  const d2 = (px-t[4])*(t[3]-t[5]) - (t[2]-t[4])*(pz-t[5])
  const d3 = (px-t[0])*(t[5]-t[1]) - (t[4]-t[0])*(pz-t[1])
  const neg = (d1<0)||(d2<0)||(d3<0), pos2 = (d1>0)||(d2>0)||(d3>0)
  return !(neg && pos2)
}
function drawnAt(x, z) {
  const cx = Math.floor((x - minX) / CELL), cz = Math.floor((z - minZ) / CELL)
  const arr = cells.get(cx * NZ + cz); if (!arr) return null
  let best = null, bestOrder = -1
  for (const ti of arr) { const t = tris[ti]; if (t[6] > bestOrder && inTri(x, z, t)) { bestOrder = t[6]; best = t[7] } }
  return best
}
// ⭐ PLANTABLE IS DERIVED FROM THE ARTIFACT'S OWN STRUCTURE, not a hand list that goes stale
// when a town draws a material this one never saw: a land-use FACE (kind === 'face'), a tree
// lawn (the `treelawn:` prefix), or the two planted strips the ground names outright. Anything
// else the ground draws — road, walk, curb, pool, pitch — is not ground a tree grows out of.
const plantable = (id, kind) => kind === 'face' || id.startsWith('treelawn:') || id === 'median' || id === 'garden'
const KIND = new Map(G.groups.map(g => [g.id, g.kind]))
const ROAD = { has: (m) => m !== '(nothing drawn)' && !plantable(m, KIND.get(m)) }
const by = new Map(), ex = new Map()
for (const t of trees) {
  const m = drawnAt(t.x, t.z) ?? '(nothing drawn)'
  by.set(m, (by.get(m) || 0) + 1)
  if (ROAD.has(m) && !ex.has(m)) ex.set(m, t)
}
console.log(`${scene}: what is DRAWN under each of ${trees.length} shipped trees\n`)
let bad = 0
for (const [m, n] of [...by].sort((a,b) => b[1]-a[1])) {
  const isBad = ROAD.has(m); if (isBad) bad += n
  console.log(`  ${(isBad ? '⛔ ON IT' : '  ok').padEnd(9)} ${m.padEnd(26)} ${String(n).padStart(5)}  ${((n/trees.length)*100).toFixed(1).padStart(5)}%`)
}
console.log(`\n  ${bad} of ${trees.length} (${((bad/trees.length)*100).toFixed(1)}%) stand on a surface the map DRAWS as hardscape`)
for (const [m, t] of ex) console.log(`   e.g. ${m.padEnd(14)} x=${t.x.toFixed(1)} z=${t.z.toFixed(1)}  ${t.species} (well ${t.source})`)
if (bad) failed++
}
process.exit(failed ? 2 : 0)
