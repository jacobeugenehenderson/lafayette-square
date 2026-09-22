// Where are the negative samples? Under water is correct (the bed's lower patch).
// On LAND in quantity would mean the derived datum is too high.
import fs from 'fs'
import { baked, ROOT, osm, localToWgs84 } from './common.mjs'
const buf = fs.readFileSync(`${ROOT}/cartograph/data/huron/clean/terrain.bin`)
const h = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
const { width, height, bounds } = baked.meta
const stepX = baked.stepX, stepZ = baked.stepZ

// the same water rings the datum used: the drawn lake mesh is the honest stand-in
const gj = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/ground.json`, 'utf8'))
const gb = fs.readFileSync(`${ROOT}/public/baked/huron/ground.bin`)
const wg = gj.groups.find(g => g.id === 'water:lake')
const pos = new Float32Array(gb.buffer, gb.byteOffset + wg.vertexByteOffset, wg.vertexCount * 3)
const idx = new Uint32Array(gb.buffer, gb.byteOffset + wg.indexByteOffset, wg.indexCount)
// rasterise the lake into a mask
const wet = new Uint8Array(width * height)
for (let t = 0; t < idx.length; t += 3) {
  const P = [0,1,2].map(k => [pos[idx[t+k]*3], pos[idx[t+k]*3+2]])
  const mnz = Math.min(P[0][1],P[1][1],P[2][1]), mxz = Math.max(P[0][1],P[1][1],P[2][1])
  const j0 = Math.max(0, Math.floor((mnz - bounds.minZ)/stepZ)), j1 = Math.min(height-1, Math.ceil((mxz - bounds.minZ)/stepZ))
  for (let j = j0; j <= j1; j++) {
    const z = bounds.minZ + stepZ*j
    const xs = []
    for (let k = 0; k < 3; k++) { const a = P[k], b = P[(k+1)%3]
      if ((a[1] > z) === (b[1] > z)) continue
      xs.push(a[0] + (z-a[1])*(b[0]-a[0])/(b[1]-a[1])) }
    if (xs.length < 2) continue
    xs.sort((m,n)=>m-n)
    const i0 = Math.max(0, Math.ceil((xs[0]-bounds.minX)/stepX)), i1 = Math.min(width-1, Math.floor((xs[xs.length-1]-bounds.minX)/stepX))
    for (let i = i0; i <= i1; i++) wet[j*width+i] = 1
  }
}
let negWet=0, negDry=0, posWet=0, posDry=0, wetN=0
const dryNeg = []
for (let i = 0; i < h.length; i++) {
  const neg = h[i] < -0.001
  if (wet[i]) { wetN++; neg ? negWet++ : posWet++ }
  else { if (neg) { negDry++; dryNeg.push(h[i]) } else posDry++ }
}
const tot = h.length
console.log(`grid ${tot.toLocaleString()} samples · lake mask covers ${wetN.toLocaleString()} (${(100*wetN/tot).toFixed(1)}%)\n`)
console.log(`NEGATIVE samples: ${(negWet+negDry).toLocaleString()} (${(100*(negWet+negDry)/tot).toFixed(1)}%)`)
console.log(`  under the drawn lake : ${negWet.toLocaleString()}  (${(100*negWet/(negWet+negDry)).toFixed(1)}% of all negatives) ← expected: the bed's lower patch`)
console.log(`  NOT under the lake   : ${negDry.toLocaleString()}  (${(100*negDry/(negWet+negDry)).toFixed(1)}%)`)
if (dryNeg.length) {
  dryNeg.sort((a,b)=>a-b)
  const q = p => dryNeg[Math.floor(dryNeg.length*p)]
  console.log(`    their depth below the water: median ${q(.5).toFixed(2)} m · p90 ${q(.9).toFixed(2)} · deepest ${q(0).toFixed(2)} m`)
  console.log(`    ⇒ ${(100*negDry/(posDry+negDry)).toFixed(1)}% of the NON-lake grid is below the lake surface`)
}
console.log(`\nunder the lake, ${(100*posWet/wetN).toFixed(1)}% of the bed is at or ABOVE the water — the split-surface residue the check reports.`)
