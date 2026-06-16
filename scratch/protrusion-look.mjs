import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const strokesRaw = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/clean/marker_strokes.json', import.meta.url)))
const r = buildTileGround(ribbons, {
  curbWidth: design.curbWidth, smooth: 0, blockLandUse: design.blockLandUse,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, blockCustoms: design.blockCustoms,
})
// strokes: entries may be arrays OR numeric-keyed objects
const toPts = s => Array.isArray(s) ? s.map(p=>[p.x??p[0],p.z??p[1]]) : Object.keys(s).filter(k=>/^\d+$/.test(k)).map(k=>[s[k].x??s[k][0],s[k].z??s[k][1]])
const marks = strokesRaw.map((s,i)=>{const pts=toPts(s);const xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]);return{i,pts,x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs)}})

function bbox(ring){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const p of ring){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1])}return{x0,x1,z0,z1}}
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const j=(i+1)%ring.length;a+=ring[i][0]*ring[j][1]-ring[j][0]*ring[i][1]}return Math.abs(a)/2}
function ovl(bb,m,pad=3){return!(bb.x1<m.x0-pad||bb.x0>m.x1+pad||bb.z1<m.z0-pad||bb.z0>m.z1+pad)}
// count ring vertices that fall INSIDE the (thin) stroke bbox — a sliver/spike poking into the marked zone
function ptsInMark(ring,m,pad=2){let n=0;for(const p of ring){if(p[0]>=m.x0-pad&&p[0]<=m.x1+pad&&p[1]>=m.z0-pad&&p[1]<=m.z1+pad)n++}return n}

// flatten all rendered layers into (label, ring) pairs
function* allLayers(){
  for(const name of ['asphalt','curb','sidewalk','highway','block']) for(const ring of (r[name]||[])) yield [name,ring]
  for(const obj of ['treelawnByLu','luByClass']) for(const [k,rings] of Object.entries(r[obj]||{})) for(const ring of (rings||[])) yield [`${obj}:${k}`,ring]
}

for(const m of marks){
  console.log(`\n=== MARK #${m.i}  x[${m.x0.toFixed(0)}..${m.x1.toFixed(0)}] z[${m.z0.toFixed(0)}..${m.z1.toFixed(0)}]  (${(m.x1-m.x0).toFixed(1)}×${(m.z1-m.z0).toFixed(1)}m) ===`)
  const hits=[]
  for(const [name,ring] of allLayers()){
    if(ring.length<3)continue
    const bb=bbox(ring)
    if(!ovl(bb,m))continue
    const inside=ptsInMark(ring,m)
    if(inside===0)continue   // only rings that actually have vertices in the marked thin zone
    hits.push({name,inside,npts:ring.length,area:area(ring),bb})
  }
  hits.sort((a,b)=>b.inside-a.inside)
  for(const h of hits.slice(0,8)) console.log(`   ${h.name.padEnd(20)} vtxInMark=${h.inside}  ringPts=${h.npts}  ringArea=${h.area.toFixed(0)}m²  ringBox=[${h.bb.x0.toFixed(0)},${h.bb.z0.toFixed(0)}..${h.bb.x1.toFixed(0)},${h.bb.z1.toFixed(0)}]`)
  if(!hits.length) console.log('   (no layer has vertices inside the marked zone — the protrusion may be an EDGE crossing it, not a vertex)')
}
