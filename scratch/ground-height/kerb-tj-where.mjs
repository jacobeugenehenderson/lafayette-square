// kerb-tj-where.mjs — where the kerb cut's T-junctions sit (dump from scratch/kerb-cut/dump.mjs). READ-ONLY.
// For each T-junction: the group pair, the distance to the nearest crease-segment ENDPOINT (a region corner) and to the
// nearest crease segment, and how many distinct crease endpoints lie within 1 mm of that endpoint (several creases meeting).
import { readFileSync } from 'fs'
const R0 = new URL('../../', import.meta.url).pathname
const { cutAlong, findTJunctions } = await import(R0 + 'cartograph/groundConformity.js')
const base = process.argv[2]
const meta = JSON.parse(readFileSync(base + '.json', 'utf8'))
const pos = new Float32Array(readFileSync(base + '.pos').buffer.slice(0)), idx = new Uint32Array(readFileSync(base + '.idx').buffer.slice(0))
let po = 0, io = 0
const bufs = meta.sizes.map(([np, ni]) => { const b = { positions: pos.slice(po, po + np), indices: idx.slice(io, io + ni) }; po += np; io += ni; return b })
const out = cutAlong(bufs, meta.segs, {})
const tj = findTJunctions(out.map((b, i) => ({ id: meta.keys[i], ...b })))
const ends = meta.segs.flatMap(s => [s[0], s[1]])
const dSeg = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-18, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz) }
const rows = tj.found.map(f => {
  const p = [f.x, f.z]
  let de = Infinity, ne = null; for (const e of ends) { const d = Math.hypot(e[0] - p[0], e[1] - p[1]); if (d < de) { de = d; ne = e } }
  let ds = Infinity; for (const [a, b] of meta.segs) ds = Math.min(ds, dSeg(p, a, b))
  const cluster = new Set(ends.filter(e => Math.hypot(e[0] - ne[0], e[1] - ne[1]) < 1e-3).map(e => e.join(','))).size
  return { pair: `${f.vertexGroup} on ${f.edgeGroup}`, de, ds, cluster, x: f.x, z: f.z }
})
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))] }
console.log(`T-junctions: ${rows.length}`)
const pairs = {}; for (const r of rows) pairs[r.pair] = (pairs[r.pair] || 0) + 1
console.log('by group pair:', Object.entries(pairs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '))
console.log(`distance to nearest crease segment: p50 ${q(rows.map(r => r.ds), .5).toExponential(1)} p90 ${q(rows.map(r => r.ds), .9).toExponential(1)} max ${Math.max(...rows.map(r => r.ds)).toExponential(1)} m`)
for (const lim of [0.002, 0.01, 0.05, 0.5]) console.log(`  within ${lim} m of a crease-segment endpoint (a ramp/flare/taper corner): ${rows.filter(r => r.de < lim).length}`)
const cl = {}; for (const r of rows) cl[Math.min(r.cluster, 5)] = (cl[Math.min(r.cluster, 5)] || 0) + 1
console.log('distinct crease endpoints within 1 mm of the nearest one (≥2 = creases meet at a mm-scale knot):', JSON.stringify(cl))
for (const lim of [0.005, 0.05, 1]) console.log(`  farther than ${lim} m from every crease segment: ${rows.filter(r => r.ds > lim).length}`)
const sites = new Map(); for (const r of rows) { const k = `${Math.round(r.x)},${Math.round(r.z)}`; sites.set(k, (sites.get(k) || 0) + 1) }
console.log(`distinct 1 m sites: ${sites.size}; top: ${[...sites].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `(${k}) ${v}`).join(' · ')}`)
