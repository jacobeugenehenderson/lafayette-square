// THE PREDICATE, CROSS-TABBED. Rule ③ only applies where ① and ② are both silent;
// this sizes that population before anything is hard-coded.
import fs from 'fs'
import { osm, baked, ROOT, M_TO_FT } from './common.mjs'
const gj = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/ground.json`, 'utf8'))
const gb = fs.readFileSync(`${ROOT}/public/baked/huron/ground.bin`)
const wg = gj.groups.find(g => g.id === 'water:lake')
const WY = new Float32Array(gb.buffer, gb.byteOffset + wg.vertexByteOffset, 3)[1]
const LIFT = wg.renderOrder * 0.002
const shape = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/shape.json`, 'utf8'))
const seen = new Set(); const arcs = []
for (const t of shape.tiles) for (const r of (t.runs || [])) if (r.skelId === '__water__') {
  const k = `${r.poly.length}:${r.poly[0][0].toFixed(2)},${r.poly[0][1].toFixed(2)}`
  if (!seen.has(k)) { seen.add(k); arcs.push(r.poly) }
}
const g = osm.ground
const HARD = { retaining_wall: g.barrier.filter(f=>f.tags.barrier==='retaining_wall'),
               wall: g.barrier.filter(f=>f.tags.barrier==='wall'),
               breakwater: g.other.filter(f=>f.tags.man_made==='breakwater'),
               groyne: g.other.filter(f=>f.tags.man_made==='groyne') }
const SOFT_TAG = { beach: g.natural.filter(f=>f.tags.natural==='beach'),
                   sand: g.natural.filter(f=>f.tags.natural==='sand'),
                   wetland: g.natural.filter(f=>f.tags.natural==='wetland'),
                   reef: g.natural.filter(f=>f.tags.natural==='reef') }
const SOFT_LU = []
for (const b of ['leisure','natural','landuse']) for (const f of (g[b]||[])) {
  if (!f.isClosed) continue
  const v = f.tags[b]
  if (['park','nature_reserve','garden','wood','scrub','grassland','beach','sand','wetland','scree'].includes(v)) SOFT_LU.push(f)
}
const d2 = (px,pz,ax,az,bx,bz)=>{const dx=bx-ax,dz=bz-az,L2=dx*dx+dz*dz
  const t=L2?Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/L2)):0
  return Math.hypot(px-(ax+t*dx),pz-(az+t*dz))}
const near=(fs_,x,z)=>{let b=Infinity;for(const f of fs_)for(let i=1;i<f.coords.length;i++)
  {const d=d2(x,z,f.coords[i-1].x,f.coords[i-1].z,f.coords[i].x,f.coords[i].z);if(d<b)b=d}return b}
const inside=(f,x,z)=>{let c=false;const C=f.coords
  for(let i=0,j=C.length-1;i<C.length;j=i++) if((C[i].z>z)!==(C[j].z>z) &&
    x<(C[j].x-C[i].x)*(z-C[i].z)/(C[j].z-C[i].z)+C[i].x) c=!c; return c}

const R = 12
let n=0, hardOnly=0, softOnly=0, both=0, neither=0
const neitherH=[], hardH=[]
for (const poly of arcs) for (const [x,z] of poly) {
  const v = baked.get(x,z); if (!Number.isFinite(v)) continue
  const h = (v - baked.meta.baseElev) - (WY - LIFT)
  n++
  const isHard = Object.values(HARD).some(f => near(f,x,z) <= R)
  const isSoft = Object.values(SOFT_TAG).some(f => near(f,x,z) <= R) || SOFT_LU.some(f => inside(f,x,z))
  if (isHard && isSoft) { both++; }
  else if (isHard) { hardOnly++; hardH.push(h) }
  else if (isSoft) softOnly++
  else { neither++; neitherH.push(h) }
}
const q=(a,p)=>{const s=a.slice().sort((m,x)=>m-x);return s.length?s[Math.floor(s.length*p)]:NaN}
const pc=(x)=>`${(100*x/n).toFixed(1)}%`
console.log(`${n.toLocaleString()} shoreline vertices, height from the water plane (1 m-sourced bake)\n`)
console.log(`  ② HARD tag only   ${pc(hardOnly).padStart(6)}  → STONE          median ${q(hardH,.5).toFixed(2)} m · p90 ${q(hardH,.9).toFixed(2)}`)
console.log(`  ① SOFT only       ${pc(softOnly).padStart(6)}  → NO STONE`)
console.log(`  ⛔ BOTH (conflict) ${pc(both).padStart(6)}  → must PRINT, not pick`)
console.log(`  ③ neither         ${pc(neither).padStart(6)}  → the height decides   median ${q(neitherH,.5).toFixed(2)} m · p75 ${q(neitherH,.75).toFixed(2)} · p90 ${q(neitherH,.9).toFixed(2)}`)
console.log(`\n  of the ③ population, share at or above each candidate floor:`)
for (const f of [0.3, 0.5, 0.75, 1.0]) {
  const k = neitherH.filter(v=>v>=f).length
  console.log(`    >= ${f.toFixed(2)} m : ${(100*k/neitherH.length).toFixed(1)}% of ③  =  ${(100*k/n).toFixed(1)}% of the whole shore`)
}
console.log(`\n  ⇒ stone總 under each floor (② + qualifying ③):`)
for (const f of [0.3, 0.5, 0.75, 1.0]) {
  const k = neitherH.filter(v=>v>=f).length
  console.log(`    floor ${f.toFixed(2)} m → ${(100*(hardOnly+k)/n).toFixed(1)}% of the shoreline gets stone`)
}
