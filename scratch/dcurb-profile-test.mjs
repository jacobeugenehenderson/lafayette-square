import { readFileSync } from 'fs'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url), 'utf8'))
const get=n=>ribbons.streets.find(s=>s.skelId===n)
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],mul=(v,s)=>[v[0]*s,v[1]*s]
const len=v=>Math.hypot(v[0],v[1]),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]
const unit=v=>{const l=len(v)||1;return[v[0]/l,v[1]/l]}
const perp=v=>[-v[1],v[0]]
const CW_HW=4.673822891386253
function clen(p){let s=0;for(let i=1;i<p.length;i++)s+=len(sub(p[i],p[i-1]));return s}

function profile(cwId){
  const cw=get(cwId), pts=cw.points
  const out=pts.map(()=>CW_HW)
  const sideOut={}
  const chk=[]
  const half=clen(pts)/2
  const ends=[{spineId:cw.phase.spineAtStart,nodeIdx:0},{spineId:cw.phase.spineAtEnd,nodeIdx:pts.length-1}]
  const Fcw=unit(sub(pts[1],pts[0]))   // carriageway forward (start->end)
  const cwLeft=perp(Fcw)
  for(const e of ends){
    const sp=get(e.spineId); if(!sp) continue
    const node=pts[e.nodeIdx], adj=pts[e.nodeIdx===0?1:pts.length-2]
    const s0=sp.points[0], sN=sp.points[sp.points.length-1]
    const atStart=len(sub(s0,node))<len(sub(sN,node))
    const spFwd=unit(atStart?sub(sp.points[1],s0):sub(sN,sp.points[sp.points.length-2]))
    const spN=perp(spFwd)
    const spL=sp.measure.left.pavementHW, spR=sp.measure.right.pavementHW
    const cwDir=unit(sub(adj,node))
    const sideSign=Math.sign(dot(sub(adj,node),spN))||1
    const spineOuter=sideSign>0?spL:spR
    if(spineOuter<=CW_HW+0.05) continue
    const cap=Math.min(half, 2.5*spineOuter)
    // outer side string = which carriageway own-side the outer normal (spN*sideSign) points to
    const outerNormal=mul(spN,sideSign)
    const sideStr=dot(outerNormal,cwLeft)>0?'left':'right'
    sideOut[e.nodeIdx]=sideStr
    const lineP=[node[0]+spN[0]*sideSign*spineOuter, node[1]+spN[1]*sideSign*spineOuter]
    for(let i=0;i<pts.length;i++){
      const along=dot(sub(pts[i],node),cwDir)
      if(along<-0.5 || along>cap) continue
      const lateral=dot(sub(pts[i],node),outerNormal)
      const oh=spineOuter-Math.max(0,lateral)
      if(oh>CW_HW+1e-6 && oh>out[i]+1e-6){
        out[i]=oh
        const oe=[pts[i][0]+outerNormal[0]*oh, pts[i][1]+outerNormal[1]*oh]
        chk.push({i,along:+along.toFixed(1),oh:+oh.toFixed(2),d:+Math.abs(dot(sub(oe,lineP),spN)).toFixed(2),side:sideStr})
      }
    }
  }
  return {cw,out,chk,sideOut}
}
for(const cid of ['lafayette-avenue-5','lafayette-avenue-6','lafayette-avenue-7','lafayette-avenue-8']){
  const {cw,out,chk,sideOut}=profile(cid)
  const ramped=out.filter(v=>Math.abs(v-CW_HW)>0.01).length
  console.log(`\n${cid} (innerSign=${cw.innerSign}) ramped ${ramped}/${out.length} side=${JSON.stringify(sideOut)}`)
  console.log('   ['+out.map(v=>v.toFixed(1)).join(', ')+']')
  for(const c of chk) console.log(`   v${c.i} side=${c.side} along=${c.along} oh=${c.oh} off=${c.d}m ${c.d<0.6?'OK':'<--OFF'}`)
}

// cross-check inboardSideOf (the consumer's oracle) vs my spineOuter side
console.log('\n--- inboardSideOf cross-check ---')
function inboardSideOf(s, mate){
  const pa=s.points, pb=mate.points
  const i=Math.max(1,Math.floor(pa.length/2))
  const ca=pa[i], cb=pb[Math.floor(pb.length/2)]
  const dx=pa[i][0]-pa[i-1][0], dz=pa[i][1]-pa[i-1][1], L=Math.hypot(dx,dz)||1
  const toMate=[cb[0]-ca[0],cb[1]-ca[1]]
  return ((-dz/L)*toMate[0]+(dx/L)*toMate[1]>0)?'left':'right'
}
for(const cid of ['lafayette-avenue-5','lafayette-avenue-6','lafayette-avenue-7','lafayette-avenue-8']){
  const cw=get(cid), mate=get(cw.pairId)
  const inb=inboardSideOf(cw,mate), outer=inb==='left'?'right':'left'
  console.log(`  ${cid}: inboard=${inb} OUTER=${outer}  (measure.left=${cw.measure.left.pavementHW.toFixed(2)} right=${cw.measure.right.pavementHW.toFixed(2)})`)
}
