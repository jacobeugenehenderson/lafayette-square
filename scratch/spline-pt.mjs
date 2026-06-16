import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null })
function inRings(rings,px,pz){let c=false;for(const ring of (rings||[])){for(let i=0,j=ring.length-1;i<ring.length;j=i++){const xi=ring[i][0],zi=ring[i][1],xj=ring[j][0],zj=ring[j][1];if(((zi>pz)!==(zj>pz))&&(px<(xj-xi)*(pz-zi)/(zj-zi)+xi))c=!c;}}return c;}
const layers={asphalt:pr.asphalt,sidewalk:pr.sidewalk,curb:pr.curb}
for(const[k,v]of Object.entries(pr.luByClass||{}))layers['lu:'+k]=v
let tl=[];for(const v of Object.values(pr.treelawnByLu))tl=tl.concat(v);layers['treelawn']=tl
const probe=(name,x,z)=>{const hits=Object.entries(layers).filter(([k,v])=>inRings(v,x,z)).map(([k])=>k);console.log(`  (${x},${z}) ${name.padEnd(22)} -> ${hits.length?hits.join(", "):"** VOID (no tile) **"}`);}
console.log("=== point classification (is the interior covered?) ===");
probe("lower interior",430,-150);
probe("mid interior",405,0);
probe("upper interior (>kennett)",425,195);
probe("between legs top",420,215);
probe("on west leg",388,124);
probe("on east leg",490,150);
probe("dead-end gap (N of tops)",425,255);
