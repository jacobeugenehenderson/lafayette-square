// IS THE LAKE FLAT IN OUR OWN HEIGHTFIELD? Histogram the terrain under the drawn
// water mesh. A level body should be ONE value.
import fs from 'fs'
import { baked, ROOT, M_TO_FT } from './common.mjs'
const gj = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/ground.json`, 'utf8'))
const gb = fs.readFileSync(`${ROOT}/public/baked/huron/ground.bin`)
const wg = gj.groups.find(g => g.id === 'water:lake')
const pos = new Float32Array(gb.buffer, gb.byteOffset + wg.vertexByteOffset, wg.vertexCount * 3)
const idx = new Uint32Array(gb.buffer, gb.byteOffset + wg.indexByteOffset, wg.indexCount)
const WY = pos[1]
const hist = new Map(); let n = 0
for (let t = 0; t < idx.length; t += 3) {
  const P = [0,1,2].map(k => [pos[idx[t+k]*3], pos[idx[t+k]*3+2]])
  for (let s = 0; s < 40; s++) {
    let a = Math.random(), b = Math.random(); if (a+b > 1) { a = 1-a; b = 1-b }
    const x = P[0][0] + a*(P[1][0]-P[0][0]) + b*(P[2][0]-P[0][0])
    const z = P[0][1] + a*(P[1][1]-P[0][1]) + b*(P[2][1]-P[0][1])
    const v = baked.get(x, z); if (!Number.isFinite(v)) continue
    const rel = v - baked.meta.baseElev
    const bucket = (Math.round(rel * 10) / 10).toFixed(1)
    hist.set(bucket, (hist.get(bucket) || 0) + 1); n++
  }
}
console.log(`${n.toLocaleString()} samples of the heightfield UNDER the drawn lake (water mesh Y = ${WY.toFixed(3)})\n`)
console.log('  terrain value   share    what it is')
const rows = [...hist.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10)
for (const [v, c] of rows) {
  const d = Number(v) - WY
  const tag = Math.abs(d) < 0.15 ? '← sits ON the drawn water ✅'
            : d > 0 ? `← ${d.toFixed(2)} m ABOVE the water — this is a gash` : ''
  console.log(`  ${v.padStart(8)} m  ${(100*c/n).toFixed(1).padStart(5)}%    ${tag}`)
}
const above = [...hist.entries()].filter(([v]) => Number(v) - WY > 0.15).reduce((a,[,c]) => a+c, 0)
console.log(`\n⇒ ${(100*above/n).toFixed(1)}% of the lake's own area has the heightfield standing above the water surface.`)
console.log(`⇒ the two dominant plateaus differ by ${(Number(rows[0][0]) - Number(rows.find(r => Math.abs(Number(r[0])-Number(rows[0][0])) > 0.5)?.[0] ?? rows[0][0])).toFixed(2)} m — a LEVEL body cannot have two surfaces.`)
