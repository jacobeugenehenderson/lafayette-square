import fs from 'fs'
const R = JSON.parse(fs.readFileSync('cartograph/data/hipointe-demun/clean/ribbons.json','utf8'))
const turn=(a,b,c)=>{const ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)return 0;return Math.acos(Math.max(-1,Math.min(1,(ix*ox+iz*oz)/(li*lo))))*180/Math.PI}
// find De Mun + Clayton chains
const want = s => /de\s*mun/i.test(s.name||'')||/clayton/i.test(s.name||'')
const hits = R.streets.filter(want)
console.log('Matching chains:')
for(const s of hits){
  const p=s.points
  console.log(`\n  ${s.name} (${s.skelId}) pts=${p.length} phase=${JSON.stringify(s.phase?{role:s.phase.role,kind:s.phase.kind}:'-')}`)
  console.log(`    ends: [${p[0].map(v=>v.toFixed(1))}] .. [${p[p.length-1].map(v=>v.toFixed(1))}]`)
  // measure per-side pavementHW
  const m=s.measure||{}
  console.log(`    measure L: hw=${m.left?.pavementHW} tl=${m.left?.treelawn} sw=${m.left?.sidewalk}   R: hw=${m.right?.pavementHW} tl=${m.right?.treelawn} sw=${m.right?.sidewalk}`)
  // internal max turn (chain straightness)
  let mx=0,mxi=-1
  for(let i=1;i<p.length-1;i++){const t=turn(p[i-1],p[i],p[i+1]);if(t>mx){mx=t;mxi=i}}
  console.log(`    chain max internal turn = ${mx.toFixed(1)}° at v${mxi} [${mxi>=0?p[mxi].map(v=>v.toFixed(1)):''}]`)
}
// find the shared corner node between a De Mun and a Clayton chain
console.log('\n--- shared nodes (De Mun endpoint ~ Clayton point) ---')
const demun=hits.filter(s=>/de\s*mun/i.test(s.name))
const clay=hits.filter(s=>/clayton/i.test(s.name))
const near=(a,b,t=3)=>Math.hypot(a[0]-b[0],a[1]-b[1])<t
for(const d of demun)for(const c of clay){
  for(const dp of [d.points[0],d.points[d.points.length-1]])
    for(let i=0;i<c.points.length;i++)
      if(near(dp,c.points[i])) console.log(`  De Mun ${d.skelId} end [${dp.map(v=>v.toFixed(1))}] ~ Clayton ${c.skelId} v${i} (${i===0||i===c.points.length-1?'END':'INTERIOR'})`)
}
