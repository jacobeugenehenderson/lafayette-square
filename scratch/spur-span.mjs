import fs from 'fs'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const st = shape.tiles[53]
const ring = st.iA[0]
// The albion spur span in iA = verts [133..145, 0..29]? Let's trace the contiguous run
// from the mouth corner, out one wall, around the cap (tip), back the other wall, to the
// other mouth corner. We saw mouth pts at [17..29] and [133..145], tip at [0..16].
// So the spur span in ring order is [133..145, 0..29] (wraps): wall_right(133..145) -> ... 
// Actually verts are in ring order; cap [0..16] sits between [145..0] and [16..17].
// Print verts 130..35 to see the full spur curve in order
console.log("iA verts 130..end then 0..35 (the albion spur span):")
const idxs=[]
for(let i=130;i<ring.length;i++) idxs.push(i)
for(let i=0;i<=35;i++) idxs.push(i)
for(const i of idxs){ const p=ring[i]; console.log(`  [${i}] ${p.map(x=>+x.toFixed(2))}`) }
