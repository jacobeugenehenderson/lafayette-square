// offline: a town's conformed ground + its kerb crease segments (scratch/kerb-cut/dump.mjs) → cutAlong → findTJunctions, in seconds.
//   node scratch/kerb-cut/harness.mjs <dump base> [x z]   — with x z, the segments, triangles and unmatched edges around that point
import { readFileSync } from 'fs'
const R0 = new URL('../../', import.meta.url).pathname
const { cutAlong, findTJunctions } = await import(R0 + 'cartograph/groundConformity.js')
const base = process.argv[2]
const meta = JSON.parse(readFileSync(base + '.json', 'utf8'))
const pos = new Float32Array(readFileSync(base + '.pos').buffer.slice(0)), idx = new Uint32Array(readFileSync(base + '.idx').buffer.slice(0))
let po = 0, io = 0
const bufs = meta.sizes.map(([np, ni]) => { const b = { positions: pos.slice(po, po + np), indices: idx.slice(io, io + ni) }; po += np; io += ni; return b })
const before = findTJunctions(bufs.map((b, i) => ({ id: meta.keys[i], ...b })))
const st = {}, out = cutAlong(bufs, meta.segs, st)
const tj = findTJunctions(out.map((b, i) => ({ id: meta.keys[i], ...b })))
console.log(`before cut: ${before.total} T-junctions · cut: ${JSON.stringify(st)}`)
console.log(`after cut: ${tj.total} T-junctions (${tj.within} within, ${tj.cross} across)`)
for (const f of tj.found.slice(0, 6)) console.log(`  (${f.x.toFixed(3)}, ${f.z.toFixed(3)}) ${f.vertexGroup} vertex on ${f.edgeGroup} edge`)
const X = +process.argv[3] || 347.221, Z = +process.argv[4] || 341.138
const dSeg = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const near = meta.segs.map((s, i) => [i, s, dSeg([X, Z], s[0], s[1])]).filter(x => x[2] < 0.05)
console.log(`segments within 5 cm of (${X}, ${Z}):`); for (const [i, s, d] of near) console.log(`  #${i} ${s.map(p => p.map(v => v.toFixed(3)).join(',')).join(' → ')} d=${d.toFixed(4)}`)
console.log('triangles (after cut) with a vertex within 2 cm:')
out.forEach((b, gi) => { const P = b.positions, I = b.indices; for (let t = 0; t < I.length; t += 3) { const v = [0, 1, 2].map(k => [P[I[t + k] * 3], P[I[t + k] * 3 + 2]]); if (v.some(p => Math.hypot(p[0] - X, p[1] - Z) < 0.02)) console.log(`  ${meta.keys[gi]}: ${v.map(p => p.map(x => x.toFixed(3)).join(',')).join(' | ')}`) } })
console.log('triangles (BEFORE cut) containing the point:')
bufs.forEach((b, gi) => { const P = b.positions, I = b.indices; for (let t = 0; t < I.length; t += 3) { const v = [0, 1, 2].map(k => [P[I[t + k] * 3], P[I[t + k] * 3 + 2]]); const cr = (a, c) => (c[0] - a[0]) * (Z - a[1]) - (c[1] - a[1]) * (X - a[0]); const s1 = cr(v[0], v[1]), s2 = cr(v[1], v[2]), s3 = cr(v[2], v[0]); if ((s1 >= -1e-9 && s2 >= -1e-9 && s3 >= -1e-9) || (s1 <= 1e-9 && s2 <= 1e-9 && s3 <= 1e-9)) console.log(`  ${meta.keys[gi]}: ${v.map(p => p.map(x => x.toFixed(3)).join(',')).join(' | ')}`) } })
{ const k = (x, z) => `${Math.round(x * 1000)},${Math.round(z * 1000)}`, cnt = new Map()
  out.forEach((b, gi) => { const P = b.positions, I = b.indices; for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const a = I[t + e], c = I[t + (e + 1) % 3]
    const ka = k(P[a * 3], P[a * 3 + 2]), kc = k(P[c * 3], P[c * 3 + 2]); if (ka === kc) continue; const key = ka < kc ? ka + '|' + kc : kc + '|' + ka
    const r = cnt.get(key) || { n: 0, g: [], a: [P[a * 3], P[a * 3 + 2]], c: [P[c * 3], P[c * 3 + 2]] }; r.n++; r.g.push(meta.keys[gi]); cnt.set(key, r) } })
  console.log('unmatched (used-once) edges within 3 m:')
  for (const [key, r] of cnt) if (r.n === 1 && Math.hypot((r.a[0] + r.c[0]) / 2 - X, (r.a[1] + r.c[1]) / 2 - Z) < 3) console.log(`  ${r.a.map(v => v.toFixed(3)).join(',')} → ${r.c.map(v => v.toFixed(3)).join(',')} ${r.g}`) }
