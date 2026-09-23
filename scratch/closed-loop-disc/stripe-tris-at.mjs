// Read-only (Keel 2026-09-23): dump baked `stripe` triangles covering a point, with area + spans.
import fs from 'fs'
const [look, X, Z] = [process.argv[2], +process.argv[3], +process.argv[4]]
const gP = `public/baked/${look}/ground.json`, bP = `public/baked/${look}/ground.bin`
for (const f of [gP, bP]) console.log('#', f, fs.statSync(f).mtime.toISOString())
const g = JSON.parse(fs.readFileSync(gP)), buf = fs.readFileSync(bP), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const G = g.groups.find(x => x.id === (process.argv[5] || 'stripe'))
const pos = new Float32Array(ab, G.vertexByteOffset, G.vertexCount * 3), idx = new Uint32Array(ab, G.indexByteOffset, G.indexCount)
const inTri = (p, a, b, c) => { const d = (p,q,r) => (p[0]-r[0])*(q[1]-r[1])-(q[0]-r[0])*(p[1]-r[1]); const d1=d(p,a,b),d2=d(p,b,c),d3=d(p,c,a); return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0)) }
for (let t = 0; t < idx.length; t += 3) {
  const V = [0,1,2].map(k => [pos[idx[t+k]*3], pos[idx[t+k]*3+2], pos[idx[t+k]*3+1]])
  if (!inTri([X, Z], V[0], V[1], V[2])) continue
  const A = Math.abs((V[1][0]-V[0][0])*(V[2][1]-V[0][1]) - (V[2][0]-V[0][0])*(V[1][1]-V[0][1])) / 2
  console.log(`tri ${t/3} area ${A.toFixed(2)} m²  idx [${idx[t]},${idx[t+1]},${idx[t+2]}]  verts ${V.map(v => v.map(n => n.toFixed(2)).join(',')).join(' | ')}`)
}
