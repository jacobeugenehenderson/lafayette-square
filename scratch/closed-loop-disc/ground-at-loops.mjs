// Read-only probe (Keel, 2026-09-23): for every closed-loop street in a town's skeleton, which
// ground.json groups cover the loop's centroid (and a point halfway to the ring)? Prints mtimes.
import fs from 'fs'
const town = process.argv[2] || 'huron', look = process.argv[3] || town
const skP = `cartograph/data/${town}/clean/skeleton.json`, gP = `public/baked/${look}/ground.json`, bP = `public/baked/${look}/ground.bin`
for (const f of [skP, gP, bP]) console.log('#', f, fs.statSync(f).mtime.toISOString())
const s = JSON.parse(fs.readFileSync(skP)).streets
const P = p => Array.isArray(p) ? p : [p.x, p.z]
const loops = s.filter(x => { const a = P(x.points[0]), b = P(x.points.at(-1)); return x.points.length > 2 && Math.hypot(a[0]-b[0], a[1]-b[1]) < 1 })
const g = JSON.parse(fs.readFileSync(gP)); const buf = fs.readFileSync(bP)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const groups = g.groups.map(G => ({ G, pos: new Float32Array(ab, G.vertexByteOffset, G.vertexCount * 3), idx: new Uint32Array(ab, G.indexByteOffset, G.indexCount) }))
// grid index of triangles per group, for speed
const CELL = 20
for (const gr of groups) { const m = new Map(); const { pos, idx } = gr
  for (let t = 0; t < idx.length; t += 3) { let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9
    for (let k = 0; k < 3; k++) { const v = idx[t+k]; const x = pos[v*3], z = pos[v*3+2]; x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z) }
    for (let i = Math.floor(x0/CELL); i <= Math.floor(x1/CELL); i++) for (let j = Math.floor(z0/CELL); j <= Math.floor(z1/CELL); j++) { const k=i+','+j; let a=m.get(k); if(!a)m.set(k,a=[]); a.push(t) } }
  gr.grid = m }
const inTri = (px, pz, a, b, c) => { const d = (p,q,r) => (p[0]-r[0])*(q[1]-r[1])-(q[0]-r[0])*(p[1]-r[1]); const d1=d([px,pz],a,b),d2=d([px,pz],b,c),d3=d([px,pz],c,a); return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0)) }
const hits = (x, z) => { const out = []; for (const gr of groups) { const a = gr.grid.get(Math.floor(x/CELL)+','+Math.floor(z/CELL)) || []; let n = 0
  for (const t of a) { const V = k => { const v = gr.idx[t+k]; return [gr.pos[v*3], gr.pos[v*3+2]] }; if (inTri(x, z, V(0), V(1), V(2))) n++ }
  if (n) out.push(`${gr.G.id}${n>1?'×'+n:''}`) } return out.join(' ') || '—' }
const tally = {}
for (const L of loops) { const pts = L.points.map(P); let cx=0,cz=0; for (const p of pts){cx+=p[0];cz+=p[1]} cx/=pts.length; cz/=pts.length
  const R = pts.reduce((a,p)=>a+Math.hypot(p[0]-cx,p[1]-cz),0)/pts.length
  const h0 = hits(cx, cz), h1 = hits(cx + (pts[0][0]-cx)*0.5, cz + (pts[0][1]-cz)*0.5)
  tally[h0] = (tally[h0]||0)+1
  console.log(`${L.id.padEnd(28)} R=${R.toFixed(1).padStart(6)}  c=(${cx.toFixed(1)},${cz.toFixed(1)})  centre: ${h0.padEnd(40)} half: ${h1}`) }
console.log('\nloops', loops.length, 'centre-cover tally', tally)
