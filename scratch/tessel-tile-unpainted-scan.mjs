// READ-ONLY, scratch. Per-run band presence on ONE tile: march perpendicular
// from each run's polyline and record which union component (if any) is hit.
//
// ⚠️ LIMITATION, stated because it changes how the output reads: the march is
// PERPENDICULAR to the run. At a run END the band is the corner pad, which does
// not lie perpendicular to either leg — so the 5-16 m of "UNPAINTED" at run ends
// is a property of this probe, not necessarily of the map. Only mid-run gaps are
// evidence. ⛔ Do not quote the per-run metre counts as unpainted arc.
//
// ⚠️ Component INDICES are Clipper's output order and are NOT stable between
// processes — read the areas printed on the first line, never the index alone.
//
//   node scratch/tessel-tile-unpainted-scan.mjs
import fs from 'node:fs'
import clipperLib from 'clipper-lib'
import { sectionPassTile } from '../src/lib/tileGround.js'
const R="";
const sh=JSON.parse(fs.readFileSync(R+'public/baked/lafayette-square/shape.json','utf8'))
const dg=JSON.parse(fs.readFileSync(R+'public/looks/lafayette-square/design.json','utf8'))
const bc=dg.blockCustoms||null, CW=dg.curbWidth??0.381, st=sh.tiles[10]
const SC=1e5
const uni=(rings)=>{const{Clipper,ClipType,PolyType,PolyFillType}=clipperLib;const c=new Clipper();let n=0
 for(const r of rings) if(r&&r.length>=3){c.AddPath(r.map(p=>({X:Math.round(p[0]*SC),Y:Math.round(p[1]*SC)})),PolyType.ptSubject,true);n++}
 if(!n)return[];const out=[];c.Execute(ClipType.ctUnion,out,PolyFillType.pftNonZero,PolyFillType.pftNonZero);return out.map(p=>p.map(q=>[q.X/SC,q.Y/SC]))}
const area=r=>{let a=0;for(let i=0;i<r.length;i++){const j=(i+1)%r.length;a+=r[i][0]*r[j][1]-r[j][0]*r[i][1]}return a/2}
const inR=(p,r)=>{let s=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],zi=r[i][1],xj=r[j][0],zj=r[j][1];if((zi>p[1])!==(zj>p[1])&&p[0]<(xj-xi)*(p[1]-zi)/(zj-zi)+xi)s=!s}return s}
const out=sectionPassTile(st,CW,{outer:'LU',inner:'SW'},bc)
const comps=uni([...(out.Wacc||[]),...Object.values(out.tlByLu||{}).flat()]).filter(r=>r.length>=3&&area(r)>0.05)
const which=(p)=>{for(let i=0;i<comps.length;i++) if(inR(p,comps[i]))return i;return -1}
const H=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])
console.log('comps',comps.map(r=>area(r).toFixed(0)).join(', '))
for(const run of st.runs){
  const cum=[0];for(let i=1;i<run.poly.length;i++)cum[i]=cum[i-1]+H(run.poly[i-1],run.poly[i])
  const L=cum[cum.length-1]
  let miss=0, row=''
  for(let s=1;s<L;s+=1){
    let seg=1;while(seg<cum.length-1&&cum[seg]<s)seg++
    const a=run.poly[seg-1],b=run.poly[seg],ln=Math.max(1e-9,cum[seg]-cum[seg-1]),u=(s-cum[seg-1])/ln
    const tx=(b[0]-a[0])/ln,tz=(b[1]-a[1])/ln,p=[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],n=[-tz,tx]
    let hit=-1
    for(let d=0.2;d<16;d+=0.1){const q=[p[0]+n[0]*d,p[1]+n[1]*d];const c=which(q);if(c>=0){hit=c;break}}
    if(hit<0)miss++
    row+= hit<0?'·':String(hit)
  }
  console.log(`${run.skelId.padEnd(22)} ${run.side.padEnd(5)} seg${String(run.segOrd).padStart(2)} len ${L.toFixed(0).padStart(4)}m  UNPAINTED ${String(miss).padStart(4)} m`)
  if(miss) console.log('   '+row)
}
