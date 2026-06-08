import { readFileSync } from 'fs'
import clipperLib from 'clipper-lib'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const r = buildTileGround(ribbons, {
  curbWidth: design.curbWidth, smooth: 0, blockLandUse: design.blockLandUse,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, blockCustoms: design.blockCustoms,
})
const SCALE=1000
const toC=p=>({X:Math.round(p[0]*SCALE),Y:Math.round(p[1]*SCALE)})
const fromC=p=>[p.X/SCALE,p.Y/SCALE]
function signedArea(r){let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return a/2}
function differenceRings(subj,clip){const{Clipper,ClipType,PolyType,PolyFillType}=clipperLib;const c=new Clipper();let s=0,cl=0;for(const r of subj)if(r&&r.length>=3){c.AddPath(r.map(toC),PolyType.ptSubject,true);s++}for(const r of clip)if(r&&r.length>=3){c.AddPath(r.map(toC),PolyType.ptClip,true);cl++}if(!s)return[];if(!cl)return subj.map(r=>r.slice());const out=[];c.Execute(ClipType.ctDifference,out,PolyFillType.pftNonZero,PolyFillType.pftNonZero);return out.map(p=>p.map(fromC))}

const FILLET_TURN_TOL=18*Math.PI/180, RING_DUP_EPS=0.02, MIN_CORNER_LEG=0.05
function dedupeRing(ring){const n=ring.length;if(n<3)return ring;const out=[];for(let i=0;i<n;i++){const p=ring[i],q=out[out.length-1];if(q&&Math.hypot(p[0]-q[0],p[1]-q[1])<RING_DUP_EPS)continue;out.push(p)}while(out.length>=3&&Math.hypot(out[0][0]-out[out.length-1][0],out[0][1]-out[out.length-1][1])<RING_DUP_EPS)out.pop();return out.length>=3?out:ring}
// replicate filletRing pass-1 + inset gate, return {nCorners, nSink, skipReasons}
function filletAnalyze(ring0,Rfn){
  const ring=dedupeRing(ring0);const n=ring.length
  if(n<3)return{nCorners:0,nSink:0,reasons:{}}
  const sign=signedArea(ring)>=0?1:-1
  const corners=[]
  for(let i=0;i<n;i++){const A=ring[(i-1+n)%n],V=ring[i],B=ring[(i+1)%n]
    let inx=V[0]-A[0],iny=V[1]-A[1],outx=B[0]-V[0],outy=B[1]-V[1]
    const li=Math.hypot(inx,iny),lo=Math.hypot(outx,outy)
    if(li<MIN_CORNER_LEG||lo<MIN_CORNER_LEG)continue
    inx/=li;iny/=li;outx/=lo;outy/=lo
    if((inx*outy-iny*outx)*sign<=0)continue
    const turn=Math.acos(Math.max(-1,Math.min(1,inx*outx+iny*outy)))
    if(turn<FILLET_TURN_TOL)continue
    const theta=Math.PI-turn;const R=Rfn(V,theta)
    if(!(R>0.01))continue
    corners.push({i,R,theta,inx,iny,outx,outy})}
  const reasons={inset_clamp:0,tanH:0,Rzero:0}
  if(!corners.length)return{nCorners:0,nSink:0,reasons}
  const segLen=(a,b)=>Math.hypot(ring[a][0]-ring[b][0],ring[a][1]-ring[b][1])
  const gapAfter=ci=>{const a=corners[ci].i,b=corners[(ci+1)%corners.length].i;let d=0,k=a;while(k!==b){const nk=(k+1)%n;d+=segLen(k,nk);k=nk}return d}
  let nSink=0
  for(let ci=0;ci<corners.length;ci++){const c=corners[ci]
    const tanH=Math.tan(c.theta/2)
    if(!(tanH>1e-6)){reasons.tanH++;continue}
    const gPrev=corners.length>1?gapAfter((ci-1+corners.length)%corners.length):Infinity
    const gNext=corners.length>1?gapAfter(ci):Infinity
    const inset=Math.min(c.R/tanH,0.45*gPrev,0.45*gNext)
    if(!(inset>1e-4)){reasons.inset_clamp++;continue}
    nSink++}
  return{nCorners:corners.length,nSink,reasons}
}

const baseR=4.5*(design.cornerRadiusScale||1)
const Rfn=()=>baseR  // approximate: ignores per-corner/IX overrides (most corners use base)
const tiles=r._tiles||[]
const agg={tileConvex:0,blockCorners:0,blockSink:0,collapsedTiles:0,droppedRings:0}
const reasonsAgg={inset_clamp:0,tanH:0}
const collapseList=[]
for(let ti=0;ti<tiles.length;ti++){const t=tiles[ti];if(!t.ring||t.ring.length<3)continue
  const blockRings=differenceRings([t.ring],r.asphalt).filter(r=>Math.abs(signedArea(r))>0.5)
  let bc=0,bs=0
  const rs={inset_clamp:0,tanH:0}
  for(const br of blockRings){const a=filletAnalyze(br,Rfn);bc+=a.nCorners;bs+=a.nSink;rs.inset_clamp+=a.reasons.inset_clamp;rs.tanH+=a.reasons.tanH}
  agg.blockCorners+=bc;agg.blockSink+=bs
  reasonsAgg.inset_clamp+=rs.inset_clamp;reasonsAgg.tanH+=rs.tanH
  // tile-ring convex corners (denominator)
  const tc=filletAnalyze(t.ring,Rfn).nCorners; agg.tileConvex+=tc
  if(blockRings.length===0){agg.collapsedTiles++;collapseList.push({ti,area:Math.abs(signedArea(t.ring)),tc})}
  if(bs<tc) collapseList.push({ti,area:Math.abs(signedArea(t.ring)),tc,bc,bs,rs,note:'sink<tileConvex'})
}
console.log('tile-ring convex corners:',agg.tileConvex)
console.log('blockRing corners (post-difference, >0.5m2):',agg.blockCorners)
console.log('blockRing fillet sinks (my replica):',agg.blockSink)
console.log('actual cornerFillets stamped:',Object.keys(r.cornerFillets).length)
console.log('collapsed tiles (no blockRing >0.5m2):',agg.collapsedTiles)
console.log('filletRing skip reasons across blockRings:',JSON.stringify(reasonsAgg))
console.log('\n--- tiles where blockSink < tileConvex (or collapsed) ---')
for(const c of collapseList.sort((a,b)=>a.ti-b.ti)) console.log(JSON.stringify(c))
