// Read-only census (Keel, 2026-09-23). For every CLOSED polyline in map.json's line layers that
// bake-ground buffers with polylineToRing, is the loop's INTERIOR (a point well inside, off the band)
// covered by that layer's baked triangles? Covered = a disc. Prints artifact mtimes.
import fs from 'fs'
const town = process.argv[2], look = process.argv[3] || town
const mP = `cartograph/data/${town}/clean/map.json`, gP = `public/baked/${look}/ground.json`, bP = `public/baked/${look}/ground.bin`
for (const f of [mP, gP, bP]) console.log('#', f, fs.existsSync(f) ? fs.statSync(f).mtime.toISOString() : 'MISSING')
const m = JSON.parse(fs.readFileSync(mP)), g = JSON.parse(fs.readFileSync(gP)), buf = fs.readFileSync(bP)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const grp = id => { const G = g.groups.find(x => x.id === id); if (!G) return null
  return { pos: new Float32Array(ab, G.vertexByteOffset, G.vertexCount * 3), idx: new Uint32Array(ab, G.indexByteOffset, G.indexCount) } }
const inTri = (p, a, b, c) => { const d = (p,q,r) => (p[0]-r[0])*(q[1]-r[1])-(q[0]-r[0])*(p[1]-r[1]); const d1=d(p,a,b),d2=d(p,b,c),d3=d(p,c,a); return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0)) }
const covered = (G, p) => { for (let t = 0; t < G.idx.length; t += 3) { const V = k => [G.pos[G.idx[t+k]*3], G.pos[G.idx[t+k]*3+2]]; if (inTri(p, V(0), V(1), V(2))) return true } return false }
const pip = (p, R) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) { const [xi, zi] = R[i], [xj, zj] = R[j]; if ((zi > p[1]) !== (zj > p[1]) && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) c = !c } return c }
const st = g.stencil, inDisc = p => Math.hypot(p[0] - st.center[0], p[1] - st.center[1]) < st.radius
const LAYERS = { centerStripe: 'stripe', barrier: null, parkingLine: 'edgeline', bikeLane: 'bikelane' }
for (const [layer, gid] of Object.entries(LAYERS)) {
  const items = m.layers?.[layer] || []
  const loops = items.map(it => (it.coords || []).map(p => [p.x ?? p[0], p.z ?? p[1]])).filter(c => c.length > 3 && Math.hypot(c[0][0] - c.at(-1)[0], c[0][1] - c.at(-1)[1]) < 1e-3)
  if (!loops.length) { console.log(`${layer}: 0 closed of ${items.length}`); continue }
  const G = gid && grp(gid)
  let disc = 0, clean = 0, outside = 0, noInterior = 0
  for (const c of loops) {
    let cx = 0, cz = 0; for (const p of c) { cx += p[0]; cz += p[1] } cx /= c.length; cz /= c.length
    if (!inDisc([cx, cz])) { outside++; continue }
    // an interior probe point: the centroid if it is inside the loop and ≥1 m from every vertex
    const dmin = Math.min(...c.map(p => Math.hypot(p[0] - cx, p[1] - cz)))
    if (!pip([cx, cz], c) || dmin < 1) { noInterior++; continue }
    if (G && covered(G, [cx, cz])) disc++; else clean++
  }
  console.log(`${layer} → ${gid}: ${loops.length} closed of ${items.length} · inside stencil & probeable ${disc + clean} → DISC ${disc} · clean ${clean} · outside stencil ${outside} · no clear interior ${noInterior}${G ? '' : ' (group absent from bake)'}`)
}
