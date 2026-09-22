// LOOK AT LU AND OSM — what does the map already say each stretch of shore is,
// and does the 1 m LIDAR agree? Heights are measured from the LIDAR's own lake
// surface, so the coarse source's 1.3 m shoreline smear is out of the picture.
import fs from 'fs'
import { osm, baked, ROOT, localToWgs84, M_TO_FT } from './common.mjs'
import { utm17, patch } from './lidar.mjs'
const LIDAR_LAKE = 174.44
const shape = JSON.parse(fs.readFileSync(`${ROOT}/public/baked/huron/shape.json`, 'utf8'))
const seen = new Set(); const arcs = []
for (const t of shape.tiles) for (const r of (t.runs || [])) if (r.skelId === '__water__') {
  const k = `${r.poly.length}:${r.poly[0][0].toFixed(2)},${r.poly[0][1].toFixed(2)}`
  if (!seen.has(k)) { seen.add(k); arcs.push(r.poly) }
}
const g = osm.ground
const STRUCT = {
  'retaining_wall': g.barrier.filter(f => f.tags.barrier === 'retaining_wall'),
  'wall':           g.barrier.filter(f => f.tags.barrier === 'wall'),
  'breakwater':     g.other.filter(f => f.tags.man_made === 'breakwater'),
  'groyne':         g.other.filter(f => f.tags.man_made === 'groyne'),
  'pier':           g.other.filter(f => f.tags.man_made === 'pier'),
}
const SOFT = {
  'beach': g.natural.filter(f => f.tags.natural === 'beach'),
  'sand':  g.natural.filter(f => f.tags.natural === 'sand'),
  'wetland': g.natural.filter(f => f.tags.natural === 'wetland'),
  'scree': g.natural.filter(f => f.tags.natural === 'scree'),
  'reef':  g.natural.filter(f => f.tags.natural === 'reef'),
}
// LAND USE landward of the shore — the LU vocabulary, from the same fetch
const LU = {}
for (const bucket of ['landuse', 'leisure', 'natural', 'amenity']) for (const f of (g[bucket] || [])) {
  if (!f.isClosed) continue
  const v = f.tags[bucket]; if (!v) continue
  if (bucket === 'natural' && ['water'].includes(v)) continue
  ;(LU[`${bucket}=${v}`] ||= []).push(f)
}
const d2seg = (px,pz,ax,az,bx,bz) => { const dx=bx-ax,dz=bz-az,L2=dx*dx+dz*dz
  const t = L2 ? Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/L2)) : 0
  return Math.hypot(px-(ax+t*dx), pz-(az+t*dz)) }
const near = (feats,x,z) => { let b=Infinity; for (const f of feats) for (let i=1;i<f.coords.length;i++)
  { const d=d2seg(x,z,f.coords[i-1].x,f.coords[i-1].z,f.coords[i].x,f.coords[i].z); if(d<b) b=d } return b }
const inside = (f,x,z) => { let c=false; const C=f.coords
  for (let i=0,j=C.length-1;i<C.length;j=i++) if ((C[i].z>z)!==(C[j].z>z) &&
    x < (C[j].x-C[i].x)*(z-C[i].z)/(C[j].z-C[i].z)+C[i].x) c=!c; return c }

const flat = arcs.flat()
const rec = []
for (let i = 0; i < flat.length; i += 30) {
  const batch = flat.slice(i, i + 30)
  let mnE=Infinity,mxE=-Infinity,mnN=Infinity,mxN=-Infinity
  const pts = batch.map(([x,z]) => { const [lo,la]=localToWgs84(x,z); const [E,N]=utm17(lo,la)
    mnE=Math.min(mnE,E);mxE=Math.max(mxE,E);mnN=Math.min(mnN,N);mxN=Math.max(mxN,N); return [E,N] })
  const P = await patch(mnE-45, mnN-45, mxE+45, mxN+45)
  batch.forEach(([x,z], k) => {
    const h0 = P.get(...pts[k]); if (!Number.isFinite(h0)) return
    let struct = null, sd = 12
    for (const [n,f] of Object.entries(STRUCT)) { const d = near(f,x,z); if (d < sd) { sd = d; struct = n } }
    let soft = null, fd = 12
    for (const [n,f] of Object.entries(SOFT)) { const d = near(f,x,z); if (d < fd) { fd = d; soft = n } }
    let lu = null
    for (const [n,fs] of Object.entries(LU)) { if (fs.some(f => inside(f,x,z))) { lu = n; break } }
    rec.push({ h: h0 - LIDAR_LAKE, struct, soft, lu })
  })
  process.stderr.write(`\r  ${Math.min(i+30, flat.length)}/${flat.length}`)
}
process.stderr.write('\n')
const q=(a,p)=>{const s=a.slice().sort((m,n)=>m-n);return s.length?s[Math.floor(s.length*p)]:NaN}
const group = (key) => { const m={}; for (const r of rec) { const k = r[key] || '(none)'; (m[k] ||= []).push(r.h) } return m }
const show = (title, m) => { console.log(`\n${title}`)
  console.log('  label                  verts   share    height above the lake (1 m lidar)  median / p90')
  for (const [k,v] of Object.entries(m).sort((a,b)=>b[1].length-a[1].length))
    console.log(`  ${k.padEnd(22)} ${String(v.length).padStart(5)}  ${(100*v.length/rec.length).toFixed(1).padStart(5)}%          ${q(v,.5).toFixed(2).padStart(6)} m / ${q(v,.9).toFixed(2).padStart(6)} m`) }
console.log(`${rec.length} shoreline vertices, 1 m lidar, measured from Lake Erie's own surface (${LIDAR_LAKE} m)`)
show('OSM STRUCTURE within 12 m  ← "is there a built thing here"', group('struct'))
show('OSM SOFT SHORE within 12 m ← "is there sand/marsh here"', group('soft'))
show('LAND USE containing the shore vertex', group('lu'))
