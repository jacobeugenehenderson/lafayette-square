import fs from 'fs'
const R = JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
const N = [-416.4,-164.2]
const near=(p,q,t)=>Math.hypot(p[0]-q[0],p[1]-q[1])<t
// St Vincent fragments: caps + which end sits at the node
for (const s of R.streets){
  if(!/saint.vincent/i.test(s.name||'')) continue
  const p=s.points
  const d0=Math.hypot(p[0][0]-N[0],p[0][1]-N[1])
  const d1=Math.hypot(p[p.length-1][0]-N[0],p[p.length-1][1]-N[1])
  console.log(`${s.skelId.padEnd(24)} pts=${p.length} caps=${JSON.stringify(s.caps||{})}`)
  console.log(`   start[${p[0].map(v=>v.toFixed(1))}] d=${d0.toFixed(1)}m   end[${p[p.length-1].map(v=>v.toFixed(1))}] d=${d1.toFixed(1)}m`)
}
// any loop / roundabout / junction feature near the node?
console.log('\n--- junctions within 15m ---')
for (const j of (R.junctions||[])) if(near([j.x,j.z],N,15)) console.log('  ',JSON.stringify(j))
console.log('\n--- any street whose points form a tiny loop (roundabout) near node ---')
for (const s of R.streets){
  const p=s.points; if(!p||p.length<3) continue
  const closed = Math.hypot(p[0][0]-p[p.length-1][0],p[0][1]-p[p.length-1][1])<3
  const anyNear = p.some(pt=>near(pt,N,20))
  if(closed && anyNear) console.log('  LOOP?',s.skelId, s.name, 'pts',p.length)
}
// raw OSM junction=roundabout / circular tag?
try{
  const osm=JSON.parse(fs.readFileSync('cartograph/data/lafayette-square/raw/osm.json','utf8'))
  const els=osm.elements||osm.features||[]
  console.log('\n--- raw OSM ways tagged roundabout/circular near St Vincent ---')
  for(const e of els){ const t=e.tags||e.properties||{}
    if(/round|circul/i.test(JSON.stringify(t)) && /vincent/i.test(JSON.stringify(t))) console.log('  ',JSON.stringify(t).slice(0,160)) }
}catch(e){ console.log('(no raw osm read:',e.message,')') }
