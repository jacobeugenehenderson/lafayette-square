import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const strokes = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/clean/marker_strokes.json', import.meta.url)))
const r = buildTileGround(ribbons, {
  curbWidth: design.curbWidth, smooth: 0, blockLandUse: design.blockLandUse,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, blockCustoms: design.blockCustoms,
})
const marks = strokes.map((s,i)=>{const xs=s.map(p=>p.x),zs=s.map(p=>p.z);return{i,pts:s.map(p=>[p.x,p.z]),cx:(Math.min(...xs)+Math.max(...xs))/2,cz:(Math.min(...zs)+Math.max(...zs))/2,w:Math.max(...xs)-Math.min(...xs),h:Math.max(...zs)-Math.min(...zs)}})

// segment intersection for self-intersection detection
function segInt(a,b,c,d){const d1=cross(c,d,a),d2=cross(c,d,b),d3=cross(a,b,c),d4=cross(a,b,d);if(((d1>0)!==(d2>0))&&((d3>0)!==(d4>0)))return true;return false}
function cross(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])}
function ringSelfInt(ring){const n=ring.length;let count=0;for(let i=0;i<n;i++){const a=ring[i],b=ring[(i+1)%n];for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;const c=ring[j],dd=ring[(j+1)%n];if(segInt(a,b,c,dd))count++}}return count}
function bbox(ring){let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const p of ring){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1])}return{x0,x1,z0,z1}}
function overlaps(bb,X0,X1,Z0,Z1){return!(bb.x1<X0||bb.x0>X1||bb.z1<Z0||bb.z0>Z1)}

const layers=[['asphalt','#ddd','none'],['curb','#222','none'],['sidewalk','#39f','none'],['highway','#fa0','none']]
const M=45 // half-box margin meters
for(const mk of marks){
  const X0=mk.cx-M,X1=mk.cx+M,Z0=mk.cz-M,Z1=mk.cz+M
  // NOTE: raw x,z plotted. SVG y grows downward; we negate z so +z(north) is up. x not flipped (so +x=west draws right; labelled).
  const tx=x=>(x-X0)*6, ty=z=>(Z1-z)*6
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${2*M*6}" height="${2*M*6}" viewBox="0 0 ${2*M*6} ${2*M*6}"><rect width="100%" height="100%" fill="white"/>`
  svg+=`<text x="6" y="16" font-size="13" fill="black">MARK #${mk.i}  centroid=[${mk.cx.toFixed(0)},${mk.cz.toFixed(0)}] box=±${M}m  (+x=WEST→right, +z=NORTH→up)  PROXY</text>`
  const flagged=[]
  for(const [name,stroke] of layers){
    for(const ring of (r[name]||[])){
      if(!ring||ring.length<3)continue
      const bb=bbox(ring)
      if(!overlaps(bb,X0,X1,Z0,Z1))continue
      const si=ringSelfInt(ring)
      const col= si>0 ? 'red' : stroke
      const sw = si>0 ? 1.8 : 0.6
      let d='M'+ring.map(p=>`${tx(p[0]).toFixed(1)},${ty(p[1]).toFixed(1)}`).join(' L')+'Z'
      svg+=`<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" opacity="0.85"/>`
      if(si>0) flagged.push({name,si,bb,npts:ring.length})
    }
  }
  // the marker stroke (Jacob) — thick magenta
  let sd='M'+mk.pts.map(p=>`${tx(p[0]).toFixed(1)},${ty(p[1]).toFixed(1)}`).join(' L')
  svg+=`<path d="${sd}" fill="none" stroke="magenta" stroke-width="3" opacity="0.9"/>`
  // crosshair at centroid
  svg+=`<circle cx="${tx(mk.cx)}" cy="${ty(mk.cz)}" r="3" fill="none" stroke="green" stroke-width="1.5"/>`
  svg+='</svg>'
  writeFileSync(new URL(`./caliper-mark${mk.i}.svg`,import.meta.url),svg)
  console.log(`MARK #${mk.i} [${mk.cx.toFixed(0)},${mk.cz.toFixed(0)}] ${mk.w.toFixed(0)}x${mk.h.toFixed(0)}m  self-int rings in box: ${flagged.length}`)
  for(const f of flagged) console.log(`   SELF-INT ${f.name} crossings=${f.si} npts=${f.npts} bbox=[${f.bb.x0.toFixed(0)},${f.bb.z0.toFixed(0)}..${f.bb.x1.toFixed(0)},${f.bb.z1.toFixed(0)}]`)
}
