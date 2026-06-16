import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { extractFaces } from '../src/lib/tileGround.js'
import { smoothChain } from '../src/lib/smoothCenterline.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
// find a degree-4 crossing to target
const k=p=>`${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`
let streets=r.streets.filter(s=>s?.points?.length>=2).map(s=>{const sm=smoothChain(s.points,0.5);return sm?{...s,points:sm}:s})
const tiles=extractFaces(streets)
// count vertex incidence
const cnt=new Map()
for(const t of tiles)for(const v of t.ring){const kk=k(v);cnt.set(kk,(cnt.get(kk)||0)+1)}
const crossings=[...cnt.entries()].filter(([,c])=>c>=4).slice(0,3).map(([kk])=>kk)
console.log('targeting crossings:',crossings)
const ov={}; for(const c of crossings) ov[c]=14
// build default vs override; compare asphalt vert counts as a coarse proof
const base=buildTileGround(r,{smooth:0.5})
const mod=buildTileGround(r,{smooth:0.5,cornerRadiusOverrides:ov})
const vc=g=>g.asphalt.reduce((s,ring)=>s+ring.length,0)
console.log('asphalt verts  base:',vc(base),' override:',vc(mod),' (differ => resolver wired)')
console.log('changed?', vc(base)!==vc(mod))
function area(rings){let a=0;for(const r of rings){let s=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];s+=x1*y2-x2*y1}a+=Math.abs(s/2)}return a}
console.log('asphalt AREA  base:',area(base.asphalt).toFixed(1),' override:',area(mod.asphalt).toFixed(1))
console.log('curb AREA     base:',area(base.curb).toFixed(1),' override:',area(mod.curb).toFixed(1))
