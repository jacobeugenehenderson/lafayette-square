import { buildTileGround } from '../src/lib/tileGround.js'
import clipperLib from 'clipper-lib'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1,emitArtifact:true})
const SCALE=1000,{ClipperOffset,JoinType,EndType}=clipperLib
const toC=p=>({X:Math.round(p[0]*SCALE),Y:Math.round(p[1]*SCALE)}),fromC=p=>[p.X/SCALE,p.Y/SCALE]
function offsetRings(rings,delta,join){const co=new ClipperOffset(2,0.05*SCALE);const jt=join==='miter'?JoinType.jtMiter:JoinType.jtRound;for(const r of rings)if(r&&r.length>=3)co.AddPath(r.map(toC),jt,EndType.etClosedPolygon);const out=[];co.Execute(out,delta*SCALE);return out.map(p=>p.map(fromC))}
const sa=r=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return a/2}
function worstNear(rings,N,r=20){let w={t:0};for(const ring of rings){const sign=sa(ring)>=0?1:-1;for(let i=0;i<ring.length;i++){const b=ring[i];if(Math.hypot(b[0]-N[0],b[1]-N[1])>r)continue;const a=ring[(i-1+ring.length)%ring.length],c=ring[(i+1)%ring.length];let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1];const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);if(li<1e-9||lo<1e-9)continue;ix/=li;iz/=li;ox/=lo;oz/=lo;const cross=ix*oz-iz*ox,t=Math.acos(Math.max(-1,Math.min(1,ix*ox+iz*oz)))*180/Math.PI;if(t>w.t)w={t,p:b,cvx:cross*sign>0?'CVX':'CNCV'}}}return w}
const cw=d.curbWidth, N=[340,-120.6], st=g._shapeArtifact[10]
const join=st.bandJoin
console.log('tile#10 join='+join+' cw='+cw+' tl='+st.tl.toFixed(2)+' sw='+st.sw.toFixed(2))
const iA=st.iA
const iC=offsetRings(iA,-Math.min(cw,st.cap),join)
const iT=offsetRings(iA,-Math.min(cw+st.tl,st.cap),join)
const iW=offsetRings(iA,-Math.min(cw+st.tl+st.sw,st.cap),join)
for(const [lab,rings] of [['iA(input)',iA],['iC (=+cw '+cw.toFixed(2)+')',iC],['iT (=+cw+tl '+(cw+st.tl).toFixed(2)+')',iT],['iW (=+cw+tl+sw '+(cw+st.tl+st.sw).toFixed(2)+')',iW]]){
  const w=worstNear(rings,N);console.log('  '+lab.padEnd(26)+' rings='+rings.length+' worst near-mouth: '+w.t.toFixed(0)+'° '+(w.cvx||'')+(w.p?' @['+w.p[0].toFixed(1)+','+w.p[1].toFixed(1)+'] d='+Math.hypot(w.p[0]-N[0],w.p[1]-N[1]).toFixed(1)+'m':''))
}
// also test miter vs round at iW depth to see if join matters
console.log('  --- join sensitivity at iW depth ---')
for(const j of ['miter','round']){const w=worstNear(offsetRings(iA,-(cw+st.tl+st.sw),j),N);console.log('  iW with '+j+': '+w.t.toFixed(0)+'° '+(w.cvx||''))}

// ===== FIX CANDIDATE TESTS =====
console.log('\n=== FIX CANDIDATES (tile#10 iW, mouth N) ===')
const {Clipper,ClipType,PolyType,PolyFillType}=clipperLib
function unionNZ(rings){const c=new Clipper();for(const r of rings)if(r&&r.length>=3)c.AddPath(r.map(toC),PolyType.ptSubject,true);const out=[];c.Execute(ClipType.ctUnion,out,PolyFillType.pftNonZero,PolyFillType.pftNonZero);return out.map(p=>p.map(fromC))}
const iWraw=offsetRings(iA,-(cw+st.tl+st.sw),join)
// A: NonZero self-union
console.log('A union-NZ(iW):           ', worstNear(unionNZ(iWraw),N).t.toFixed(0)+'°')
// B: morphological close then the offset (offset out eps, in eps) on iA first — smooth the neck
const close=(rings,e)=>offsetRings(offsetRings(rings,e,join),-e,join)
console.log('B iW after close(iA,1.0): ', worstNear(offsetRings(close(iA,1.0),-(cw+st.tl+st.sw),join),N).t.toFixed(0)+'°')
// C: open the iW result (erode eps, dilate eps) to clip needles
const open=(rings,e)=>offsetRings(offsetRings(rings,-e,join),e,join)
for(const e of [0.3,0.6,1.0]) console.log('C open(iW,'+e+'):            ', worstNear(open(iWraw,e),N).t.toFixed(0)+'°  rings='+open(iWraw,e).length)
// D: offset iA inward in ONE step but via round-trip out then the needle test is the depth — test reduced sw
for(const frac of [0.75,0.5]) console.log('D iW at '+(frac*100)+'% sw depth ('+(cw+st.tl+frac*st.sw).toFixed(2)+'): ', worstNear(offsetRings(iA,-(cw+st.tl+frac*st.sw),join),N).t.toFixed(0)+'°')
