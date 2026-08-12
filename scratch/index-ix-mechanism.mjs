import { readFileSync } from 'fs'
const SK = JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))
const NB = JSON.parse(readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const cx=NB.center[0], cz=NB.center[1], keepR=NB.streetFade.outer+30, R2=keepR*keepR
function clipPieces(pts){
  if(!Array.isArray(pts)||pts.length<2) return [pts]
  const inC=(x,z)=>(x-cx)**2+(z-cz)**2<=R2
  const pieces=[];let cur=null
  const close=()=>{if(cur&&cur.length>=2)pieces.push(cur);cur=null}
  const push=(p)=>{if(!cur){cur=[p];return}const l=cur[cur.length-1];if(l[0]!==p[0]||l[1]!==p[1])cur.push(p)}
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],A=dx*dx+dz*dz;const ts=[]
    if(A>1e-12){const fx=a[0]-cx,fz=a[1]-cz,B=2*(fx*dx+fz*dz),C=fx*fx+fz*fz-R2,disc=B*B-4*A*C
      if(disc>0){const sq=Math.sqrt(disc);for(const t of[(-B-sq)/(2*A),(-B+sq)/(2*A)])if(t>1e-9&&t<1-1e-9)ts.push(t)}}
    ts.sort((x,y)=>x-y);const stops=[0,...ts,1]
    for(let s=0;s<stops.length-1;s++){const t0=stops[s],t1=stops[s+1];if(t1-t0<1e-9)continue
      const mt=(t0+t1)/2
      if(inC(a[0]+dx*mt,a[1]+dz*mt)){push([a[0]+dx*t0,a[1]+dz*t0]);push([a[0]+dx*t1,a[1]+dz*t1])}else close()}}
  close();return pieces
}
const pre = SK.streets.map(s=>({skelId:s.id,points:(s.points||[]).map(p=>[p.x,p.z])})).filter(s=>s.points.length>=2)
const post = pre.map(s=>{const p=clipPieces(s.points); if(!p.length) return null
  const best=p.reduce((a,b)=>b.length>a.length?b:a); return {skelId:s.skelId,points:best}}).filter(Boolean)

const EPS=0.5, posKey=(x,z)=>`${Math.round(x/EPS)}|${Math.round(z/EPS)}`
function owners(streets){const m=new Map()
  for(let ci=0;ci<streets.length;ci++) for(const p of streets[ci].points){const k=posKey(p[0],p[1]);if(!m.has(k))m.set(k,new Set());m.get(k).add(streets[ci].skelId)}
  return m}
const oU=owners(pre), oC=owners(post)
function ixOf(s,o){const set=new Set();for(let i=0;i<s.points.length;i++){const k=posKey(s.points[i][0],s.points[i][1]);if((o.get(k)?.size??0)>=2)set.add(i)}return set}

for(const id of ['south-18th-street-3','missouri-avenue-2','park-avenue-0']){
  const u=pre.find(s=>s.skelId===id), c=post.find(s=>s.skelId===id)
  const iu=ixOf(u,oU), ic=ixOf(c,oC)
  console.log(`\n── ${id}  (pts unclipped=${u.points.length} clipped=${c.points.length})`)
  console.log(`   IX unclipped: [${[...iu].sort((a,b)=>a-b)}]`)
  console.log(`   IX clipped  : [${[...ic].sort((a,b)=>a-b)}]`)
  const added=[...ic].filter(i=>!iu.has(i)), removed=[...iu].filter(i=>!ic.has(i))
  for(const i of added){const k=posKey(c.points[i][0],c.points[i][1])
    console.log(`   + IX@${i} ${JSON.stringify(c.points[i])} owners clipped={${[...oC.get(k)]}}  unclipped={${[...(oU.get(posKey(u.points[i][0],u.points[i][1]))||[])]}}`)
    console.log(`     coord unclipped ${JSON.stringify(u.points[i])}  same=${u.points[i][0]===c.points[i][0]&&u.points[i][1]===c.points[i][1]}`)}
  for(const i of removed) console.log(`   - IX@${i} ${JSON.stringify(u.points[i])}`)
}
// how many chains are bit-identical after clipPieces?
let identical=0, floatDrift=0
for(const s of pre){const c=post.find(q=>q.skelId===s.skelId); if(!c) continue
  if(c.points.length!==s.points.length) continue
  let bit=true, drift=false
  for(let i=0;i<s.points.length;i++){if(c.points[i][0]!==s.points[i][0]||c.points[i][1]!==s.points[i][1]){bit=false;if(Math.hypot(c.points[i][0]-s.points[i][0],c.points[i][1]-s.points[i][1])<1e-6)drift=true}}
  if(bit)identical++; else if(drift)floatDrift++}
console.log(`\nchains bit-identical through clipPieces: ${identical}; changed only by sub-micron float rebuild: ${floatDrift}`)
