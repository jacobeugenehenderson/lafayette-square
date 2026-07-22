// cap-side-parity.mjs — does a leg's material render on its OWN side?
//
// ⚠️ NOT A GATE. Read before trusting a number from this.
//   · It INJECTS a custom on the 'right' run and watches which side changes, so
//     any cap whose injected slot doesn't resolve comes back INCONCLUSIVE — 22-24
//     of ~40 caps, i.e. most of the class.
//   · It is BLIND to simpson-place, the one cap verified two independent ways.
//   · Its verdict flipped 0 -> 8 mirrored on a sampling change alone (it sampled
//     poly[mid], which IS the tip for a 2-point leg).
// Use it as a smell test; verify a specific street with a direct probe, and let
// the operator's eye gate the change.
//
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
const inR=(rings,x,y)=>{let ins=false;for(const r2 of rings||[]){for(let i=0,j=r2.length-1;i<r2.length;j=i++){const xi=r2[i][0],yi=r2[i][1],xj=r2[j][0],yj=r2[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins}}return ins}
const o=console.log;console.log=()=>{}
const g0=buildTileGround(r,{smooth:0,emitArtifact:true})
console.log=o
// collect caps + their two runs
const caps=[]
for(const st of (g0._shapeArtifact||[])) for(const t of (st.roundTips||[])) caps.push({tip:t.p})
let ok=0,bad=0,skip=0
for(const c of caps.slice(0,40)){
  const TIP=c.tip
  // find the runs at this tip
  let runs=[]
  for(const st of (g0._shapeArtifact||[])) for(const rm of (st.runs||[])){
    const p=rm.poly,n=p.length
    if(Math.hypot(p[0][0]-TIP[0],p[0][1]-TIP[1])<1.5||Math.hypot(p[n-1][0]-TIP[0],p[n-1][1]-TIP[1])<1.5) runs.push(rm)
  }
  const byside={}; for(const rm of runs) if(rm.skelId) (byside[rm.side]??=rm)
  if(!byside.left||!byside.right||byside.left.skelId!==byside.right.skelId){skip++;continue}
  const sk=byside.right.skelId
  const st2=r.streets.find(s=>(s.skelId||s.name)===sk); if(!st2){skip++;continue}
  const pts=st2.points
  const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
  const atEnd = near(pts[pts.length-1],TIP)<2
  const tipP = atEnd?pts[pts.length-1]:pts[0]
  const prevP= atEnd?pts[pts.length-2]:pts[1]
  const ax=[tipP[0]-prevP[0],tipP[1]-prevP[1]]; const L=Math.hypot(...ax)||1; ax[0]/=L;ax[1]/=L
  const perp=[-ax[1],ax[0]]
  // which side does run 'right' polyline sit on?
  const rp=byside.right.poly
  const mid=(Math.hypot(rp[0][0]-TIP[0],rp[0][1]-TIP[1])>Math.hypot(rp[rp.length-1][0]-TIP[0],rp[rp.length-1][1]-TIP[1]))?rp[0]:rp[rp.length-1]
  const sideOfRun=Math.sign((mid[0]-tipP[0])*perp[0]+(mid[1]-tipP[1])*perp[1])
  const hw=Math.max(st2.measure?.left?.pavementHW||4,st2.measure?.right?.pavementHW||4)
  const bc={[sk]:{right:{[String(byside.right.segOrd)]:{pavementHW:hw,treelawn:1.5,sidewalk:1.5,terminal:'sidewalk',materials:{outer:'LU',inner:'LU'}}}}}
  const o2=console.log;console.log=()=>{}
  const g1=buildTileGround(r,{smooth:0,blockCustoms:bc,curbWidth:0.15})
  console.log=o2
  const bx=tipP[0]-ax[0]*10, by=tipP[1]-ax[1]*10
  const cnt=(sgn)=>{let n=0;for(let d=0.5;d<=3.5;d+=0.25){if(inR(g1.sidewalk,bx+sgn*perp[0]*(hw+0.15+d),by+sgn*perp[1]*(hw+0.15+d)))n++}return n}
  const lost = cnt(sideOfRun)===0 && cnt(-sideOfRun)>0
  const mirrored = cnt(-sideOfRun)===0 && cnt(sideOfRun)>0
  if(lost) ok++; else if(mirrored){bad++; console.log('  MIRRORED at',sk,'tip',TIP.map(v=>+v.toFixed(0)))} else skip++
}
console.log(`\ncorrect-side=${ok}  MIRRORED=${bad}  inconclusive=${skip}`)
