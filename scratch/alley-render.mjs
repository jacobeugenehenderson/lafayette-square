import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
import { buildPathRibbons } from '../src/lib/buildPathRibbons.js'
import { differenceRings } from '../src/lib/buildBlockGeometryV2.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null })
const subtract = []
for (const rr of (pr.curb||[])) if (rr?.length>=3) subtract.push(rr)
for (const rings of Object.values(pr.treelawnByLu||{})) for (const rr of rings) if (rr?.length>=3) subtract.push(rr)
for (const rr of (pr.sidewalk||[])) if (rr?.length>=3) subtract.push(rr)
for (const rr of (pr.luByClass?.park||[])) if (rr?.length>=3) subtract.push(rr)
const blockRings=(pr.block||[]).filter(rr=>rr?.length>=3)
const parcelInteriors=differenceRings(blockRings, subtract)
const byKind = Object.fromEntries(buildPathRibbons(r, { intersect: parcelInteriors, alleyCap: 'square' }))
// neighborhood frame
const allx=[],ally=[]; for(const rr of (pr.asphalt||[]))for(const p of rr){allx.push(p[0]);ally.push(p[1]);}
const minx=Math.min(...allx),maxx=Math.max(...allx),miny=Math.min(...ally),maxy=Math.max(...ally)
const W=Math.max(maxx-minx,maxy-miny), px=1500, scl=px/W
const X=x=>((x-minx)*scl).toFixed(1), Y=y=>((y-miny)*scl).toFixed(1)
let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#dcd3b8">`
const path=(rings,fill)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" fill-rule="evenodd"/>`}
path(pr.asphalt,'#9a9a92')   // streets faint for context
path(byKind.alley,'#cc2222')    // alleys RED
path(byKind.footway,'#2244dd')  // footways BLUE
s+='</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./alley-render.png',import.meta.url).pathname)
console.log('alley rings:',(byKind.alley||[]).length,'footway rings:',(byKind.footway||[]).length)
