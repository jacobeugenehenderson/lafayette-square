// READ-ONLY prototype — does clamping band depth to the local reach clean the
// throat? Render tile#4 strips: CURRENT (cap=WB) vs cap lowered to the reach.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround, sectionPass } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer+50, sc0=tR/bnd.radius, cx0=bnd.center[0], cz0=bnd.center[1]
const clip = bnd.boundary.map(([x,z])=>[cx0+(x-cx0)*sc0, cz0+(z-cz0)*sc0])
const cw=d.curbWidth, customs=d.blockCustoms||null, stripMat={outer:'LU',inner:'SW'}
const pr = buildTileGround(r,{stencil:clip,smooth:0,curbWidth:cw,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:customs,emitArtifact:true})
const T = pr._shapeArtifact[4]
const cur = sectionPass([T], cw, stripMat, customs)
const clamped = sectionPass([{...T, cap: cw+1.6}], cw, stripMat, customs)  // global cap=reach (validation only)
const flat=o=>Object.values(o||{}).flat()
async function crop(name, out, cx, cy, W, ppx=1000){
  const sc=ppx/W, minx=cx-W/2, miny=cy-W/2, X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${ppx}" style="background:#4a4a4a">`
  const fill=(rings,f)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${f}" fill-rule="evenodd"/>`}
  fill([T.iA[0]],'#d8cfb0')
  fill(flat(out.tlByLu),'#7aa356'); fill(out.Wacc,'#e8e3d6')
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./w18-clamp-${name}.png`,import.meta.url).pathname)
  console.log('wrote w18-clamp-'+name+'.png')
}
await crop('A-current', cur, 612,-400, 40)
await crop('B-clamped', clamped, 612,-400, 40)
