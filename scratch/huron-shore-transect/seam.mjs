// THE GASHES — measure them, don't quote them. How far does the draped terrain
// punch up through the level water plane inside the lake polygon?
import fs from 'fs'
import { baked, ROOT, M_TO_FT } from './common.mjs'
const gj = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/ground.json`, 'utf8'))
const bin = fs.readFileSync(`${ROOT}/public/baked/huron/ground.bin`)
const w = gj.groups.find(g => g.id === 'water:lake')
const pos = new Float32Array(bin.buffer, bin.byteOffset + w.vertexByteOffset, w.vertexCount * 3)
const idx = new Uint32Array(bin.buffer, bin.byteOffset + w.indexByteOffset, w.indexCount)

const ys = []
for (let i = 1; i < pos.length; i += 3) ys.push(pos[i])
ys.sort((a, b) => a - b)
console.log(`water:lake — ${w.vertexCount} verts, ${w.indexCount / 3} tris`)
console.log(`  its baked Y: min ${ys[0].toFixed(4)}  median ${ys[ys.length >> 1].toFixed(4)}  max ${ys[ys.length - 1].toFixed(4)} m   ⇒ ${ys[0] === ys[ys.length-1] ? 'LEVEL' : 'NOT LEVEL'}`)
const WY = ys[ys.length >> 1]

// The terrain is the same field BakedGround drapes every land group over. Sample
// it at points INSIDE the water triangles and ask how far above the plane it is.
const bx = gj.bbox
let over = 0, n = 0, mx = 0, mxAt = null
const rises = []
for (let t = 0; t < idx.length; t += 3) {
  const P = [0, 1, 2].map(k => [pos[idx[t + k] * 3], pos[idx[t + k] * 3 + 2]])
  for (let s = 0; s < 6; s++) {                       // 6 barycentric samples per tri
    let a = Math.random(), b = Math.random()
    if (a + b > 1) { a = 1 - a; b = 1 - b }
    const x = P[0][0] + a * (P[1][0] - P[0][0]) + b * (P[2][0] - P[0][0])
    const z = P[0][1] + a * (P[1][1] - P[0][1]) + b * (P[2][1] - P[0][1])
    const g = baked.get(x, z)
    if (!Number.isFinite(g)) continue
    const rel = (g - baked.meta.baseElev) - WY       // terrain height above the water plane
    n++; rises.push(rel)
    if (rel > 0) over++
    if (rel > mx) { mx = rel; mxAt = [x, z] }
  }
}
rises.sort((a, b) => a - b)
const q = p => rises[Math.floor(rises.length * p)]
console.log(`\n${n.toLocaleString()} samples inside the lake polygon, terrain height relative to the water plane:`)
console.log(`  min ${q(0).toFixed(2)}   median ${q(.5).toFixed(2)}   p90 ${q(.9).toFixed(2)}   p99 ${q(.99).toFixed(2)}   max ${mx.toFixed(2)} m (${(mx*M_TO_FT).toFixed(1)} ft)`)
console.log(`  ⇒ ABOVE the water (visible gash) : ${over.toLocaleString()} / ${n.toLocaleString()} = ${(100*over/n).toFixed(1)}% of the lake's area`)
console.log(`  ⇒ steepest poke-through at local x${mxAt[0].toFixed(0)} z${mxAt[1].toFixed(0)}`)
console.log(`\n  scene terrainExag = ${JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/scene.json`,'utf8')).terrainExag} (so this is the rendered amount, unmultiplied)`)
