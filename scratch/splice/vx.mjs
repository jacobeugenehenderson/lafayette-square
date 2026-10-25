// Splice probe (5a): for a pair of chains, on the MINT's polylines (the skeleton tessellated as remint.mjs does), each
// vertex of A within R of B's centreline: its distance to B, the parameter t along B's segment, and whether it is an
// end or interior; and where the two centrelines cross (segment parameters).
//   CARTOGRAPH_SCENE=<s> node scratch/splice/vx.mjs --data=<root> A B [--r=0.05]
import fs from 'fs'; import { join } from 'path'
const scene = process.env.CARTOGRAPH_SCENE, root = process.argv.find(a => a.startsWith('--data='))?.slice(7) || '.'
const R = +(process.argv.find(a => a.startsWith('--r='))?.slice(4) || 0.05), [Aid, Bid] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const { tessellateAdaptive } = await import('../../cartograph/derive.js')
const sk = JSON.parse(fs.readFileSync(join(root, 'cartograph/data', scene, 'clean/skeleton.json'), 'utf8'))
const T = (id) => { const st = sk.streets.find(s => s.id === id); return tessellateAdaptive(st.points.map(q => (Array.isArray(q) ? [q[0], q[1]] : [q.x, q.z])), st.segments) }
const A = T(Aid), B = T(Bid)
const proj = (q, P) => { let best = [Infinity]; for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, t = L2 ? ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / L2 : 0, tc = Math.max(0, Math.min(1, t)), d = Math.hypot(a[0] + tc * dx - q[0], a[1] + tc * dz - q[1]); if (d < best[0]) best = [d, i, t] } return best }
for (const [X, Y, nx, ny] of [[A, B, Aid, Bid], [B, A, Bid, Aid]]) X.forEach((q, i) => { const [d, j, t] = proj(q, Y); if (d <= R) console.log(`${nx} v${i}/${X.length - 1}${i === 0 || i === X.length - 1 ? ' (END)' : ''} is ${(d * 1000).toFixed(2)} mm from ${ny} seg ${j} at t=${t.toFixed(4)}`) })
for (let i = 0; i + 1 < A.length; i++) for (let j = 0; j + 1 < B.length; j++) { const p = A[i], r = [A[i + 1][0] - p[0], A[i + 1][1] - p[1]], q = B[j], s = [B[j + 1][0] - q[0], B[j + 1][1] - q[1]], den = r[0] * s[1] - r[1] * s[0]; if (!den) continue
  const t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den, u = ((q[0] - p[0]) * r[1] - (q[1] - p[1]) * r[0]) / den
  if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) console.log(`centrelines cross: ${Aid} seg ${i} t=${t.toFixed(4)} (${(t * Math.hypot(...r) * 1000).toFixed(1)} mm from v${i}, ${((1 - t) * Math.hypot(...r) * 1000).toFixed(1)} mm from v${i + 1}) × ${Bid} seg ${j} u=${u.toFixed(4)} (${(u * Math.hypot(...s) * 1000).toFixed(1)} / ${((1 - u) * Math.hypot(...s) * 1000).toFixed(1)} mm)`) }
