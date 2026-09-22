// Hold both elevation sources against each other AT THE SHORELINE, each measured
// from its OWN lake surface. If they agree, the seam is real relief. If they do
// not, the seam is a disagreement between sources and stone would be filling it.
import fs from 'fs'
import { baked, ROOT, localToWgs84, M_TO_FT } from './common.mjs'
import { utm17, patch } from './lidar.mjs'
const gj = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/ground.json`, 'utf8'))
const gb = fs.readFileSync(`${ROOT}/public/baked/huron/ground.bin`)
const wg = gj.groups.find(g => g.id === 'water:lake')
const WY = new Float32Array(gb.buffer, gb.byteOffset + wg.vertexByteOffset, 3)[1]
const shape = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/shape.json`, 'utf8'))
const seen = new Set(); const arcs = []
for (const t of shape.tiles) for (const r of (t.runs || [])) if (r.skelId === '__water__') {
  const k = `${r.poly.length}:${r.poly[0][0].toFixed(2)},${r.poly[0][1].toFixed(2)}`
  if (!seen.has(k)) { seen.add(k); arcs.push(r.poly) }
}
// each source's own lake surface
const buf = fs.readFileSync(`${ROOT}/cartograph/data/huron/clean/terrain.bin`)
const hh = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4)
const srt = hh.slice().sort()
const BAKE_LAKE = srt[Math.floor(srt.length * 0.03)]     // the flat plateau the lake occupies
const LIDAR_LAKE = 174.44
console.log(`bake's own lake plateau : ${BAKE_LAKE.toFixed(3)} m normalized  (abs ${(BAKE_LAKE + baked.meta.baseElev).toFixed(2)})`)
console.log(`water mesh drawn at     : ${WY.toFixed(4)} m  ⇒ ${((WY - BAKE_LAKE)*100).toFixed(1)} cm above the bake's own lake. ${Math.abs(WY-BAKE_LAKE) < 0.1 ? '✅ the mesh sits on its own water' : '⛔ mismatch'}`)
console.log(`lidar's lake surface    : ${LIDAR_LAKE.toFixed(2)} m abs   ⇒ the two sources differ by ${(LIDAR_LAKE - BAKE_LAKE - baked.meta.baseElev).toFixed(2)} m\n`)

let rows = []
const flat = arcs.flat()
for (let i = 0; i < flat.length; i += 30) {
  const batch = flat.slice(i, i + 30)
  let mnE=Infinity,mxE=-Infinity,mnN=Infinity,mxN=-Infinity
  const pts = batch.map(([x,z]) => { const [lo,la]=localToWgs84(x,z); const [E,N]=utm17(lo,la)
    mnE=Math.min(mnE,E);mxE=Math.max(mxE,E);mnN=Math.min(mnN,N);mxN=Math.max(mxN,N); return [E,N] })
  const P = await patch(mnE-20, mnN-20, mxE+20, mxN+20)
  batch.forEach(([x,z], k) => {
    const b = baked.get(x,z); const l = P.get(...pts[k])
    if (!Number.isFinite(b) || !Number.isFinite(l)) return
    rows.push({ bake: (b - baked.meta.baseElev) - BAKE_LAKE, lidar: l - LIDAR_LAKE })
  })
}
const q = (a,p) => { const s=a.slice().sort((m,n)=>m-n); return s[Math.floor(s.length*p)] }
const B = rows.map(r=>r.bake), L = rows.map(r=>r.lidar), D = rows.map(r=>r.bake-r.lidar)
console.log(`${rows.length} shoreline vertices, height above EACH SOURCE'S OWN lake surface:`)
console.log(`  5 m bake  : p10 ${q(B,.1).toFixed(2)}  median ${q(B,.5).toFixed(2)}  p90 ${q(B,.9).toFixed(2)}  max ${q(B,.999).toFixed(2)} m`)
console.log(`  1 m lidar : p10 ${q(L,.1).toFixed(2)}  median ${q(L,.5).toFixed(2)}  p90 ${q(L,.9).toFixed(2)}  max ${q(L,.999).toFixed(2)} m`)
console.log(`  difference: p10 ${q(D,.1).toFixed(2)}  median ${q(D,.5).toFixed(2)}  p90 ${q(D,.9).toFixed(2)} m`)
console.log(`\n⇒ the two independent sources ${Math.abs(q(D,.5))<0.4 ? 'AGREE' : 'DISAGREE'} on the wall at the shoreline.`)
