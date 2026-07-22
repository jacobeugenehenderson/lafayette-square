// Render the FROZEN FILL (treelawn green, sidewalk cream, curb blue, asphalt tan)
// via sectionOpen — A/B on throughId. Shows the ADA/treelawn shatter the FILL fix targets.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround, sectionOpen } from '../src/lib/tileGround.js'
const scene=process.argv[2], cxw=+process.argv[3], cyw=+process.argv[4], W=+(process.argv[5]||100)
const rib = scene==='lafayette-square' ? '../src/data/ribbons.json' : `../cartograph/data/${scene}/clean/ribbons.json`
const r = JSON.parse(readFileSync(new URL(rib, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL(`../cartograph/data/${scene}/neighborhood_boundary.json`, import.meta.url)))
const d = JSON.parse(readFileSync(new URL(`../public/looks/${scene}/design.json`, import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const opts = { stencil: clip, curbWidth: d.curbWidth, smooth: d.streetSmooth ?? 0.5, blockLandUse: d.blockLandUse, emitArtifact:true }
const stripped = JSON.parse(JSON.stringify(r)); for (const s of (stripped.streets||stripped)){delete s.throughId;delete s.through}
const raws={base:buildTileGround(stripped,opts), new:buildTileGround(r,opts)}
const px=1100,minx=cxw-W/2,miny=cyw-W/2,sc=px/W,X=x=>((x-minx)*sc).toFixed(1),Y=y=>((y-miny)*sc).toFixed(1)
for(const [tag,raw] of Object.entries(raws)){
  const so=sectionOpen(raw._shapeArtifact,opts.curbWidth,{outer:'LU',inner:'SW'},clip)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#e9e4d8">`
  const path=(rings,fill,stroke='#0003',sw=0.3)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`}
  path(so.asphalt,'#c9c2b0')
  for(const rings of Object.values(so.treelawnByLu||{}))path(rings,'#6ea83a')
  path(so.sidewalk,'#efe9dc'); path(so.curb,'#2b6cff','#2b6cff',0.5)
  for(const st of (r.streets||r)){if(!st.points||st.points.length<2)continue;s+=`<path d="M${st.points.map(p=>X(p[0])+' '+Y(p[1])).join(' L ')}" fill="none" stroke="#0a1a4a" stroke-width="1"/>`}
  s+=`<circle cx="${X(cxw)}" cy="${Y(cyw)}" r="6" fill="#fff" stroke="#333" stroke-width="2"/><text x="10" y="30" font-size="24" font-family="sans-serif" fill="#111">FILL ${tag.toUpperCase()}</text></svg>`
  await sharp(Buffer.from(s)).png().toFile(new URL(`./tns-fill-${scene}-${tag}.png`,import.meta.url).pathname)
}
console.log('wrote tns-fill-'+scene+'-{base,new}.png')
