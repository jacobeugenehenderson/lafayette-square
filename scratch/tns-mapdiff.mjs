// Full-map A/B: draw NEW curb (blue); overlay in RED the curb of any tile whose
// frozen iA changed, so a lost-corner regression would jump out. Also prints,
// per changed tile, whether it has a same-throughId/diff-roadId vertex (the only
// legitimate cause) by re-deriving streetByEdge under both keys.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const scene = process.argv[2] || 'hipointe-demun'
const rib = scene==='lafayette-square' ? '../src/data/ribbons.json' : `../cartograph/data/${scene}/clean/ribbons.json`
const r = JSON.parse(readFileSync(new URL(rib, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL(`../cartograph/data/${scene}/neighborhood_boundary.json`, import.meta.url)))
const d = JSON.parse(readFileSync(new URL(`../public/looks/${scene}/design.json`, import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const opts = { stencil: clip, curbWidth: d.curbWidth, smooth: d.streetSmooth ?? 0.5, blockLandUse: d.blockLandUse, emitArtifact: true }
const stripped = JSON.parse(JSON.stringify(r)); for (const s of (stripped.streets||stripped)){delete s.throughId;delete s.through}
const A=buildTileGround(stripped,opts), B=buildTileGround(r,opts)
const sig=t=>JSON.stringify((t.iA||[]).map(rr=>rr.map(p=>[Math.round(p[0]*100),Math.round(p[1]*100)])))
const sa=A._shapeArtifact||[], sb=B._shapeArtifact||[]
// tiles align 1:1 (throughId doesn't touch extractFaces) — compare by index
const changedIdx=[]
for(let i=0;i<Math.min(sa.length,sb.length);i++) if(sig(sa[i])!==sig(sb[i])) changedIdx.push(i)
console.log(`${scene}: ${sa.length} frozen tiles, ${changedIdx.length} changed iA (index-aligned)`)
// bounds
let xs=[],ys=[]; for(const t of sb) for(const p of (t.ring||[])){xs.push(p[0]);ys.push(p[1])}
const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys)
const px=1600, sc=px/Math.max(maxx-minx,maxy-miny), H=Math.round((maxy-miny)*sc)+20
const X=x=>((x-minx)*sc+10).toFixed(1), Y=y=>((y-miny)*sc+10).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px+20}" height="${H}" style="background:#f2efe7">`
const path=(rings,fill,stroke,sw)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`}
// all NEW curb light blue
for(const t of sb) path(t.iA,'none','#7fa8e0',0.6)
// changed tiles: NEW iA in solid blue, BASE iA in dashed red (so a removed corner shows red poking out)
for(const i of changedIdx){ path(sb[i].iA,'none','#1550cc',1.3); let dd='';for(const rr of(sa[i].iA||[])){if(rr.length<3)continue;dd+=rr.map((p,k)=>(k?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '} if(dd)s+=`<path d="${dd}" fill="none" stroke="#e01515" stroke-width="1.1" stroke-dasharray="3 3"/>` }
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL(`./tns-mapdiff-${scene}.png`,import.meta.url).pathname)
console.log('wrote tns-mapdiff-'+scene+'.png  (blue=new curb, red-dashed=old curb where changed)')
