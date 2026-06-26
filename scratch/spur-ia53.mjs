import fs from 'fs'
const shape = JSON.parse(fs.readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const st = shape.tiles[53]
console.log(`tile[53] iA rings: ${st.iA.length}`)
st.iA.forEach((r,ri)=>console.log(`  ring[${ri}] verts=${r.length}`))
console.log(`runs: ${st.runs.map(r=>r.skelId+'/'+r.side[0]).join('  ')}`)
console.log(`roundTips: ${JSON.stringify(st.roundTips)}`)
console.log(`bluntTips: ${JSON.stringify(st.bluntTips)}`)
// Find the iA points near the albion mouth (-177.5,-78.7) and the tip (-361.18,-108.99)
const mouth=[-177.5,-78.7], tip=[-361.18,-108.99]
const near=(p,q,r=12)=>Math.hypot(p[0]-q[0],p[1]-q[1])<r
for (const r of st.iA){
  const mouthPts = r.map((p,i)=>({i,p})).filter(o=>near(o.p,mouth,15))
  const tipPts = r.map((p,i)=>({i,p})).filter(o=>near(o.p,tip,10))
  if (mouthPts.length || tipPts.length){
    console.log(`\n  iA ring with ${r.length} verts:`)
    console.log(`    near MOUTH (${mouthPts.length} pts): ${mouthPts.map(o=>`[${o.i}]${o.p.map(x=>+x.toFixed(2))}`).join('  ')}`)
    console.log(`    near TIP (${tipPts.length} pts): ${tipPts.map(o=>`[${o.i}]${o.p.map(x=>+x.toFixed(2))}`).join('  ')}`)
  }
}
