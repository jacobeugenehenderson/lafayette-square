import fs from 'fs'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const st = shape.tiles[53]
st.runs.forEach((r,i)=>{
  const p0=r.poly[0], pN=r.poly[r.poly.length-1]
  console.log(`run[${i}] ${r.skelId}/${r.side} segOrd=${r.segOrd} polyLen=${r.poly.length} start=${p0.map(x=>+x.toFixed(2))} end=${pN.map(x=>+x.toFixed(2))}`)
})
console.log("\nfillets count:", (st.fillets||[]).length)
;(st.fillets||[]).forEach((f,i)=>console.log(`  fillet[${i}] apex=${f.apex.map(x=>+x.toFixed(2))} r=${f.r.toFixed(2)}`))
