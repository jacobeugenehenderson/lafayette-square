// The seam itself: walk the slab's own shoreline arc (`__water__` in shape.json)
// and ask how far the draped terrain sits above/below the level water plane.
// Sign flips along the walk are the gashes.
import fs from 'fs'
import { baked, ROOT, M_TO_FT } from './common.mjs'
const gj = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/ground.json`, 'utf8'))
const bin = fs.readFileSync(`${ROOT}/public/baked/huron/ground.bin`)
const w = gj.groups.find(g => g.id === 'water:lake')
const pos = new Float32Array(bin.buffer, bin.byteOffset + w.vertexByteOffset, w.vertexCount * 3)
const WY = pos[1]
const shape = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/shape.json`, 'utf8'))

const seen = new Set(); const arcs = []
for (const t of shape.tiles) for (const r of (t.runs || [])) if (r.skelId === '__water__') {
  const key = `${r.poly.length}:${r.poly[0][0].toFixed(2)},${r.poly[0][1].toFixed(2)}`
  if (seen.has(key)) continue
  seen.add(key); arcs.push(r.poly)
}
let total = 0, samples = [], flips = 0, walked = 0, gashes = []
for (const poly of arcs) {
  let prevSign = null, runStart = null, acc = 0
  for (let i = 0; i < poly.length; i++) {
    const [x, z] = poly[i]
    if (i) acc += Math.hypot(x - poly[i-1][0], z - poly[i-1][1])
    const g = baked.get(x, z)
    if (!Number.isFinite(g)) continue
    const rel = (g - baked.meta.baseElev) - WY
    samples.push(rel); walked++
    const s = rel > 0 ? 1 : -1
    if (prevSign !== null && s !== prevSign) { flips++; if (runStart !== null) gashes.push(acc - runStart); runStart = acc }
    if (prevSign === null) runStart = acc
    prevSign = s
  }
  total += acc
}
samples.sort((a,b)=>a-b)
const q = p => samples[Math.floor(samples.length*p)]
console.log(`shoreline arcs in the shipped slab: ${arcs.length} unique, ${walked.toLocaleString()} vertices, ${(total/1000).toFixed(2)} km`)
console.log(`water plane Y = ${WY.toFixed(4)} m (level)\n`)
console.log(`terrain height AT the shoreline, relative to the water plane:`)
console.log(`  min ${q(0).toFixed(2)}  p10 ${q(.1).toFixed(2)}  median ${q(.5).toFixed(2)}  p90 ${q(.9).toFixed(2)}  max ${q(.999).toFixed(2)} m`)
console.log(`  land ABOVE the plane (a step down to the water) : ${(100*samples.filter(v=>v>0).length/samples.length).toFixed(1)}%`)
console.log(`  land BELOW the plane (water washes over it)     : ${(100*samples.filter(v=>v<=0).length/samples.length).toFixed(1)}%`)
console.log(`\n  sign changes along the walk : ${flips}   ⇒ a gash every ${(total/Math.max(1,flips)).toFixed(0)} m of shore, on average`)
console.log(`  median gash/step run length : ${gashes.sort((a,b)=>a-b)[gashes.length>>1]?.toFixed(0)} m`)
console.log(`\n  ⇒ the seam disagrees with itself by a median ${q(.5).toFixed(2)} m (${(q(.5)*M_TO_FT).toFixed(1)} ft) and flips sign ${flips} times.`)
