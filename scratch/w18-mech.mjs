// READ-ONLY — pin the throat overlap MECHANISM. Reproduce sectionPass's band
// rings for tile#4 (iC, iW, the medial pinch) and render them at the rcorner
// throat, so the sliver source is unambiguous + the local reach value is read off.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import clipperLib from 'clipper-lib'
import { buildTileGround, resolvePedDepths } from '../src/lib/tileGround.js'
const SCALE = 1000
const toC = p => ({ X: Math.round(p[0]*SCALE), Y: Math.round(p[1]*SCALE) })
const fromC = p => [p.X/SCALE, p.Y/SCALE]
function offsetRings(rings, delta, join='round') {
  if (!rings.length) return []; if (delta===0) return rings.map(r=>r.slice())
  const { ClipperOffset, JoinType, EndType } = clipperLib
  const co = new ClipperOffset(2, 0.05*SCALE)
  const jt = join==='miter'?JoinType.jtMiter:JoinType.jtRound
  for (const r of rings) if (r&&r.length>=3) co.AddPath(r.map(toC), jt, EndType.etClosedPolygon)
  const out=[]; co.Execute(out, delta*SCALE); return out.map(p=>p.map(fromC))
}
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR/bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0, cz0+(z-cz0)*sc0])
const cw = d.curbWidth
const pr = buildTileGround(r, { stencil: clip, smooth:0, curbWidth:cw, blockLandUse:d.blockLandUse||null, cornerRadiusScale:d.cornerRadiusScale??1, blockCustoms:d.blockCustoms||null, emitArtifact:true })
const T = pr._shapeArtifact[4]
const iA = T.iA, join = T.bandJoin
const TLmax = T.tl, SWmax = T.sw   // (no per-edge authoring near throat → tile defaults)
console.log(`tile#4 join=${join} cw=${cw} tl=${TLmax} sw=${SWmax} WB=${(cw+TLmax+SWmax).toFixed(2)} cap=${T.cap.toFixed(2)}`)

// sweep inward offset depth; report where the throat region (near 612,-400) pinches off
const px=612, py=-400
const nearThroat = (rings) => { let m=1e9; for(const rr of rings) for(const p of rr){const dd=Math.hypot(p[0]-px,p[1]-py); if(dd<m)m=dd} return m }
console.log('\ninward offset sweep (round join) — distance of nearest offset vertex to throat (612,-400):')
for (let dpth=0.5; dpth<=4.0; dpth+=0.25) {
  const o = offsetRings(iA, -(cw+dpth), join)
  const dist = o.length ? nearThroat(o) : Infinity
  console.log(`  band depth ${dpth.toFixed(2)} (offset ${(cw+dpth).toFixed(2)}): ${o.length} rings, nearest vtx to throat = ${isFinite(dist)?dist.toFixed(2)+'m':'GONE'}`)
}

// render the band rings at the throat
const iC = offsetRings(iA, -cw, join)
const iW = offsetRings(iA, -(cw+TLmax+SWmax), join)
async function crop(name, cx, cy, W, ppx=1300){
  const sc=ppx/W, minx=cx-W/2, miny=cy-W/2
  const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${ppx}" style="background:#fff">`
  const fill=(rings,f,op)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${f}" fill-rule="evenodd" fill-opacity="${op}"/>`}
  const line=(rings,c,w)=>{for(const rr of(rings||[])){if(!rr||rr.length<2)continue;s+=`<path d="${rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')} Z" fill="none" stroke="${c}" stroke-width="${w}"/>`}}
  fill(iA,'#ddd',1)
  fill([...iC, ...iW],'#88c',0.0)
  line(iA,'#000',2); line(iC,'#0a0',2); line(iW,'#d00',2)
  s+=`<circle cx="${X(px)}" cy="${Y(py)}" r="6" fill="magenta"/>`
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./w18-mech-${name}.png`,import.meta.url).pathname)
  console.log('wrote w18-mech-'+name+'.png  (black=iA curb, green=iC, red=iW band-inner; magenta=throat)')
}
await crop('rcorner', 612, -400, 45)
