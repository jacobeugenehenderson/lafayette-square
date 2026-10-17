// analyze.mjs <a.json> <b.json> — the unowned vertices of two bakes, classified by what each owner's ray found, matched
// by position (never by tile index: the tile is named by its ring's centroid), and the clusters only one bake has.
import { readFileSync } from 'fs'
const [fa, fb] = process.argv.slice(2), A = JSON.parse(readFileSync(fa)), B = JSON.parse(readFileSync(fb))
const cen = (r) => { if (!r) return 'none'; let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1] } return `${(x / r.length).toFixed(0)},${(z / r.length).toFixed(0)}` }
const ped = (bs) => { const o = []; let back = 0; for (const [c, f, t] of bs) { if (c === 'beyond') { if (o.length) break; continue } if (c === 'lot') break; o.push(c); back = t } return { o, back } }
const why = (q) => { if (!q.owners.length) return 'no owner within reach'
  const r = q.owners.map(c => { const { o, back } = ped(c.bands); return !o.length ? 'ray finds no ped band' : `band ends ${(c.d - back).toFixed(3)} m short` })
  return r.every(s => s === 'ray finds no ped band') ? 'every ray finds no ped band' : r.some(s => s.startsWith('band ends')) ? 'nearest ped ray ends short by ' + Math.min(...q.owners.map(c => { const { o, back } = ped(c.bands); return o.length ? c.d - back : Infinity })).toFixed(3) + ' m' : r[0] }
const cls = (q) => (q.inWalk ? 'walk' : '') + (q.inLawn ? 'lawn' : '') + (q.inCurb ? 'curb' : '') || 'none'
const summ = (D, name) => { const c = {}, w = {}
  for (const q of D.pts) { c[cls(q)] = (c[cls(q)] || 0) + 1; const y = why(q).replace(/short by [\d.]+/, s => { const v = +s.split(' ').pop(); return 'short by ' + (v < 0.002 ? '<2mm' : v < 0.05 ? '<5cm' : v < 1 ? '<1m' : '>=1m') }); w[y] = (w[y] || 0) + 1 }
  console.log(name, D.pts.length, 'in band', JSON.stringify(c), '\n  why', JSON.stringify(w)) }
summ(A, 'A'); summ(B, 'B')
const key = (q) => `${q.x},${q.z}`, ka = new Set(A.pts.map(key)), kb = new Set(B.pts.map(key))
const cluster = (P) => { const cl = []; for (const q of P) { const c = cl.find(c => Math.hypot(c.x - q.x, c.z - q.z) < 2); if (c) c.n.push(q); else cl.push({ x: q.x, z: q.z, n: [q] }) } return cl }
for (const [X, Y, lab, ky] of [[B, A, 'only in B', ka], [A, B, 'only in A', kb]]) {
  const only = X.pts.filter(q => !ky.has(key(q))), near = only.filter(q => Y.pts.some(p => Math.hypot(p.x - q.x, p.z - q.z) < 2))
  const far = only.filter(q => !near.includes(q)), cl = cluster(far)
  console.log(`\n${lab}: ${only.length} (exact-position) · ${near.length} within 2 m of one the other bake has · ${far.length} in ${cl.length} new cluster(s)`)
  const byTile = {}; for (const c of cl) { const t = cen(c.n[0].ring); (byTile[t] ||= []).push(c) }
  for (const [t, cs] of Object.entries(byTile).sort((a, b) => b[1].reduce((u, c) => u + c.n.length, 0) - a[1].reduce((u, c) => u + c.n.length, 0)).slice(0, 25))
    console.log(`  tile@${t} · ${cs.reduce((u, c) => u + c.n.length, 0)} pts in ${cs.length} cl · first (${cs[0].x.toFixed(3)}, ${cs[0].z.toFixed(3)}) ${cls(cs[0].n[0])} · ${why(cs[0].n[0])}`)
}
