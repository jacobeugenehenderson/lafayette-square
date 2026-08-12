import { readFileSync } from 'fs'
const SK=JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/skeleton.json','utf8'))
const NB=JSON.parse(readFileSync('cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const D =JSON.parse(readFileSync('public/looks/lafayette-square/design.json','utf8'))
const cx=NB.center[0],cz=NB.center[1],keepR=NB.streetFade.outer+30,R2=keepR*keepR
function clipRun(pts){const inC=(x,z)=>(x-cx)**2+(z-cz)**2<=R2
  const pieces=[];let cur=null
  const close=()=>{if(cur&&cur.length>=2)pieces.push(cur);cur=null}
  const push=(p)=>{if(!cur){cur=[p];return}const l=cur[cur.length-1];if(l[0]!==p[0]||l[1]!==p[1])cur.push(p)}
  for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],A=dx*dx+dz*dz;const ts=[]
    if(A>1e-12){const fx=a[0]-cx,fz=a[1]-cz,B=2*(fx*dx+fz*dz),C=fx*fx+fz*fz-R2,disc=B*B-4*A*C
      if(disc>0){const sq=Math.sqrt(disc);for(const t of[(-B-sq)/(2*A),(-B+sq)/(2*A)])if(t>1e-9&&t<1-1e-9)ts.push(t)}}
    ts.sort((x,y)=>x-y);const stops=[0,...ts,1]
    for(let s=0;s<stops.length-1;s++){const t0=stops[s],t1=stops[s+1];if(t1-t0<1e-9)continue
      const mt=(t0+t1)/2
      if(inC(a[0]+dx*mt,a[1]+dz*mt)){push([a[0]+dx*t0,a[1]+dz*t0]);push([a[0]+dx*t1,a[1]+dz*t1])}else close()}}
  close();if(!pieces.length)return null
  return pieces.reduce((p,q)=>q.length>p.length?q:p)}

const EPS=0.5,posKey=(x,z)=>`${Math.round(x/EPS)}|${Math.round(z/EPS)}`
function segsFor(streets){
  const own=new Map()
  for(const s of streets) for(const p of s.points){const k=posKey(p[0],p[1]);if(!own.has(k))own.set(k,new Set());own.get(k).add(s.skelId)}
  const out=new Map()
  for(const s of streets){const n=s.points.length;if(n<2){out.set(s.skelId,[]);continue}
    const ixs=[];for(let i=0;i<n;i++){const k=posKey(s.points[i][0],s.points[i][1]);if((own.get(k)?.size??0)>=2&&i>0&&i<n-1)ixs.push(i)}
    const segs=[];let prev=0
    if(!ixs.length)segs.push({start:0,end:n-1})
    else{for(const i of ixs){if(i>prev)segs.push({start:prev,end:i});prev=i}if(prev<n-1)segs.push({start:prev,end:n-1})}
    out.set(s.skelId,segs.map(g=>{const sl=s.points.slice(g.start,g.end+1);let L=0
      for(let i=1;i<sl.length;i++)L+=Math.hypot(sl[i][0]-sl[i-1][0],sl[i][1]-sl[i-1][1])
      return {...g,len:L,mid:[(s.points[g.start][0]+s.points[g.end][0])/2,(s.points[g.start][1]+s.points[g.end][1])/2]}}))}
  return out}

const pre=SK.streets.map(s=>({skelId:s.id,points:(s.points||[]).map(p=>[p.x,p.z])})).filter(s=>s.points.length>=2)
const post=pre.map(s=>{const r=clipRun(s.points);return r?{skelId:s.skelId,points:r}:null}).filter(Boolean)
const segTODAY=segsFor(post)   // the world the operator authored against
const segAFTER=segsFor(pre)    // the world after the clip is removed

console.log('THE 30 AUTHORED SLOTS — does the segOrd still name the same stretch of road?\n')
console.log('slot                                    | today mid          | after mid          | move   | verdict')
const bc=D.blockCustoms||{}
let moved=0,orphan=0,stable=0,caps=0
for(const skel of Object.keys(bc))for(const side of Object.keys(bc[skel]))for(const so of Object.keys(bc[skel][side])){
  const n=Number(so), tag=`${skel}|${side}|${so}`.padEnd(39)
  if(n<0){caps++;console.log(`${tag} | CAP slot — keyed to chain+end only, no segOrd → survives iff skelId survives (${segAFTER.has(skel)?'skelId PRESENT':'⛔ skelId GONE'})`);continue}
  const t=segTODAY.get(skel), a=segAFTER.get(skel)
  if(!t||!a){orphan++;console.log(`${tag} | ⛔ chain missing (today=${!!t} after=${!!a})`);continue}
  const st=t[n], sa=a[n]
  if(!st){orphan++;console.log(`${tag} | ⛔ slot does not resolve TODAY (chain has ${t.length} segs)`);continue}
  if(!sa){orphan++;console.log(`${tag} | ${JSON.stringify(st.mid.map(v=>+v.toFixed(0)))} | — | — | ⛔ ORPHANS (after has only ${a.length} segs)`);continue}
  const dist=Math.hypot(st.mid[0]-sa.mid[0],st.mid[1]-sa.mid[1])
  const ok=dist<1
  if(ok)stable++;else moved++
  console.log(`${tag} | ${JSON.stringify(st.mid.map(v=>+v.toFixed(0))).padEnd(18)} | ${JSON.stringify(sa.mid.map(v=>+v.toFixed(0))).padEnd(18)} | ${dist.toFixed(0).padStart(5)}m | ${ok?'stable':'⛔ RE-POINTS TO A DIFFERENT STRETCH'}`)
}
console.log(`\nSUMMARY of ${stable+moved+orphan+caps} authored slots:`)
console.log(`  stable (same stretch):        ${stable}`)
console.log(`  ⛔ silently re-point:          ${moved}`)
console.log(`  ⛔ orphan (no such segOrd):    ${orphan}`)
console.log(`  cap slots (no segOrd):        ${caps}`)
