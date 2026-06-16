import { readFileSync } from 'fs'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const marks = [{i:0,x:450,z:-92},{i:1,x:177,z:202},{i:2,x:-343,z:-244}]
const R = 28
const streets = ribbons.streets||[]
const junctions = ribbons.junctions||[]
const P = s => (s.points||s.pts||[]).map(p=>[p.x??p[0],p.z??p[1]])
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
const ang=(a,b,c)=>{const v1=[a[0]-b[0],a[1]-b[1]],v2=[c[0]-b[0],c[1]-b[1]];const d=(v1[0]*v2[0]+v1[1]*v2[1])/((Math.hypot(...v1)||1)*(Math.hypot(...v2)||1));return Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI}

for(const m of marks){
  const M=[m.x,m.z]
  console.log(`\n========= MARK #${m.i} [${m.x},${m.z}] within ${R}m =========`)
  // junctions near
  const jn = junctions.filter(j=>dist([j.x,j.z],M)<R)
  console.log(`junctions near: ${jn.map(j=>`${j.kind}(deg${j.degree})@[${j.x.toFixed(0)},${j.z.toFixed(0)}]`).join('  ')||'none'}`)
  for(const s of streets){
    const pts=P(s); if(pts.length<2)continue
    const near = pts.map((p,idx)=>({p,idx,d:dist(p,M)})).filter(o=>o.d<R)
    if(!near.length)continue
    const id=s.skelId||s.id||s.name||'?'
    // flags
    const flags=[]
    // short segments touching the zone
    for(const o of near){ const a=pts[o.idx-1],b=pts[o.idx+1]; if(a&&dist(a,o.p)<2)flags.push(`shortseg ${dist(a,o.p).toFixed(2)}m@${o.idx}`); }
    // sharp kinks at near vertices
    for(const o of near){ const a=pts[o.idx-1],c=pts[o.idx+1]; if(a&&c){const t=ang(a,o.p,c); if(t<150)flags.push(`kink ${t.toFixed(0)}°@${o.idx}`);} }
    // dead-end endpoint in zone (spur tip)
    const firstNear=dist(pts[0],M)<R, lastNear=dist(pts[pts.length-1],M)<R
    if(firstNear)flags.push(`ENDPOINT(start)@[${pts[0][0].toFixed(0)},${pts[0][1].toFixed(0)}]`)
    if(lastNear)flags.push(`ENDPOINT(end)@[${pts[pts.length-1][0].toFixed(0)},${pts[pts.length-1][1].toFixed(0)}]`)
    console.log(`  ${String(id).padEnd(22)} hwy=${s.highway||'?'} pts-in-zone=${near.length}/${pts.length}  phase=${s.phase?.kind||'-'}/${s.phase?.role||'-'}  ${flags.length?'⚠ '+flags.join(' · '):''}`)
    // dump the in-zone vertices for the closest street segments
    if(near.length<=8) for(const o of near) console.log(`        v${o.idx} [${o.p[0].toFixed(1)},${o.p[1].toFixed(1)}] d=${o.d.toFixed(1)}`)
  }
}
