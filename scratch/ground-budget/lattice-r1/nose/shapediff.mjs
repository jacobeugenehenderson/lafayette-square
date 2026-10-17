// shapediff.mjs <before> <after> — the ② (iA) vertices that differ per tile, each placed against the nearest nose site the after-run reported
import { readFileSync } from 'fs'
const [A, B] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')))
const sites = B.noses?.at || [], byR = (D) => new Map(D.tiles.map(t => [t.ring0.join(','), t])), a = byR(A), b = byR(B); let diff = 0
for (const [k, t] of a) { const u = b.get(k); if (!u) { console.log('tile gone', k); diff++; continue }
  const sa = new Set(t.iA.flat().map(v => v.join(','))), sb = new Set(u.iA.flat().map(v => v.join(',')))
  const ch = [...[...sa].filter(v => !sb.has(v)), ...[...sb].filter(v => !sa.has(v))].map(v => v.split(',').map(Number))
  if (!ch.length) continue; diff++
  const near = sites.map(s => ({ s, d: Math.min(...ch.map(p => Math.min(Math.hypot(p[0] - s.a[0], p[1] - s.a[1]), ...(s.cut || []).map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))))) })).sort((x, y) => x.d - y.d)[0]
  const far = Math.max(...ch.map(p => Math.min(...sites.filter(s => s.kind === 'capped').flatMap(s => [s.a, s.b, ...(s.cut || [])]).map(q => Math.hypot(p[0] - q[0], p[1] - q[1])))))
  console.log(`tile ${k}: ${ch.length} ② vertices changed · nearest nose ${near?.s.kind} at (${near?.s.a.map(c => c.toFixed(2))}) ${near?.d.toFixed(2)} m · farthest changed vertex from any capped site ${far.toFixed(2)} m`) }
for (const k of b.keys()) if (!a.has(k)) { console.log('tile new', k); diff++ }
console.log(diff ? `${diff} tile(s) differ` : 'identical tiles')
