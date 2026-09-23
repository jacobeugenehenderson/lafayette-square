// Read-only repro (Keel, 2026-09-23): feed Farmington Court's closed stripe ring, built exactly as
// bake-ground's polylineToRing does, through the REAL clipAllToStencil (imported, not copied).
import fs from 'fs'
import { clipAllToStencil } from '../../src/lib/ribbonsGeometry.js'
const mP = 'cartograph/data/huron/clean/map.json'; console.log('#', mP, fs.statSync(mP).mtime.toISOString())
const it = JSON.parse(fs.readFileSync(mP)).layers.centerStripe.find(i => i.name === 'Farmington Court' && i.coords.length === 21)
const C = it.coords.map(p => [p.x ?? p[0], p.z ?? p[1]]), n = C.length, hw = 0.10, L = [], R = []
for (let i = 0; i < n; i++) { const a = C[Math.max(0, i-1)], b = C[Math.min(n-1, i+1)], dx = b[0]-a[0], dz = b[1]-a[1], l = Math.hypot(dx, dz) || 1
  L.push([C[i][0] - dz/l*hw, C[i][1] + dx/l*hw]); R.push([C[i][0] + dz/l*hw, C[i][1] - dx/l*hw]) }
const ring = [...L, ...R.reverse()]
const area = r => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i+1) % r.length]; s += p[0]*q[1] - q[0]*p[1] } return s / 2 }
const sq = [[-5000,-5000],[5000,-5000],[5000,5000],[-5000,5000]]   // a stencil that contains everything
console.log('input: 1 bare ring,', ring.length, 'verts, signed area', area(ring).toFixed(2), 'm² (the band)')
const bm = new Map([['stripe', [ring]]]); clipAllToStencil(bm, new Map(), sq)
for (const r of bm.get('stripe')) console.log(' out: bare ring', r.length, 'verts, signed area', area(r).toFixed(2), 'm²  → triangulated as a SOLID', Math.abs(area(r)).toFixed(1), 'm²')
const bm2 = new Map([['stripe', [{ outer: ring, holes: [] }]]]); clipAllToStencil(bm2, new Map(), sq)
for (const r of bm2.get('stripe')) console.log(' same ring as {outer} (PolyTree branch): outer', r.outer.length, 'verts', area(r.outer).toFixed(2), '· holes', r.holes.map(h => area(h).toFixed(2)))
