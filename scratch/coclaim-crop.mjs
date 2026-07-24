// coclaim-crop.mjs — render the FILL at an apex, painting the tl∩lu CO-CLAIM RED.
// Rasterized so a double-owned pixel (treelawn AND block-LU) shows as red — the
// tl∩lu defect made visible. Run on baseline vs fixed to see the red vanish.
//   node scratch/coclaim-crop.mjs <cx> <cy> <label> [W_m]
import fs from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const CX = +process.argv[2], CY = +process.argv[3], LABEL = process.argv[4] || 'crop', W = +(process.argv[5] || 44)
const PX = 900
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
let design = {}; try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0, emitArtifact: true, blockCustoms: design.blockCustoms || null, curbWidth: design.curbWidth ?? 0.15 })
console.log = o
const prep = (rings) => (rings || []).map(r => { let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity; for (const p of r){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1]} return {r,x0,y0,x1,y1} })
const inR = (idx,x,y)=>{let ins=false;for(const b of idx){if(x<b.x0||x>b.x1||y<b.y0||y>b.y1)continue;const r=b.r;for(let i=0,j=r.length-1;i<r.length;j=i++){const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins}}return ins}
const TL = prep(Object.values(g.treelawnByLu || {}).flat())
const LU = prep(Object.values(g.luByClass || {}).flat())
const SW = prep(g.sidewalk), ASPH = prep(g.asphalt), CURB = prep(g.curb)
const buf = Buffer.alloc(PX * PX * 3)
const sc = PX / W, minx = CX - W/2, miny = CY - W/2
for (let py = 0; py < PX; py++) for (let px = 0; px < PX; px++) {
  const x = minx + px / sc, y = miny + py / sc
  const sw = inR(SW,x,y), tl = inR(TL,x,y), lu = inR(LU,x,y), asph = inR(ASPH,x,y), curb = inR(CURB,x,y)
  let c = [22,22,22]                                   // background
  if (asph) c = [60,60,60]
  if (curb) c = [136,136,136]
  if (lu) c = [42,34,24]                               // block-LU (dark parcel)
  if (tl) c = [90,160,60]                              // treelawn (green)
  if (sw) c = [232,226,212]                            // sidewalk (cream)
  if (tl && lu) c = [220,40,40]                        // ⛔ tl∩lu CO-CLAIM → RED
  if (sw && tl) c = [230,120,20]                       // sw∩tl co-claim → orange (deferred)
  const i = (py * PX + px) * 3; buf[i]=c[0]; buf[i+1]=c[1]; buf[i+2]=c[2]
}
const out = `scratch/coclaim-crop-${LABEL}.png`
await sharp(buf, { raw: { width: PX, height: PX, channels: 3 } }).png().toFile(out)
console.log(`wrote ${out}  @ [${CX},${CY}] ${W}m  (RED=tl∩lu co-claim, orange=sw∩tl)`)
