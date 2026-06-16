import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
// FULL bake opts (match bake-ground.js buildTileBakeShape)
const pr = buildTileGround(r, {
  stencil: clip, smooth: 0,
  curbWidth: d.curbWidth,
  blockLandUse: d.blockLandUse || null,
  cornerRadiusScale: d.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: d.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides || null,
  blockCustoms: d.blockCustoms || null,
})
async function crop(name, cx, cy, W, px=900){
  const sc=px/W, minx=cx-W/2, miny=cy-W/2
  const X=x=>((x-minx)*sc).toFixed(1), Y=y=>((y-miny)*sc).toFixed(1)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#7aa356">`
  const path=(rings,fill)=>{let dd='';for(const rr of(rings||[])){if(!rr||rr.length<3)continue;dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z '}if(dd)s+=`<path d="${dd}" fill="${fill}" fill-rule="evenodd"/>`}
  for(const rings of Object.values(pr.treelawnByLu))path(rings,'#7aa356')   // treelawn = grass
  for(const[k,rings]of Object.entries(pr.luByClass||{}))path(rings,k==='median'?'#7aa356':'#cfc3a8')
  path(pr.sidewalk,'#e8e3d6')   // sidewalk cream
  path(pr.curb,'#c89b6a')       // curb tan
  path(pr.asphalt,'#4a4a4a')    // asphalt
  s+='</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./fill-${name}.png`,import.meta.url).pathname)
  console.log('wrote fill-'+name+'.png')
}
await crop('vail',295,85,55)        // round cul-de-sac
await crop('albion-stub',-361,-109,40) // dead-end stub
await crop('straight',0,0,60)       // a straight run for registration check
