// a vs b: median distance from a's vertices to b's polyline, share of a's length within 1 m of b, and whether they run the same way.
import fs from 'fs'
const DATA = '/Users/jacobhenderson/Desktop/lafayette-square.nosync', CODE = DATA + '/.claude/worktrees/census-202'
const [,, scene, ...pairs] = process.argv
const r = JSON.parse(fs.readFileSync(scene === 'lafayette-square' ? CODE + '/src/data/ribbons.json' : `${DATA}/cartograph/data/${scene}/clean/ribbons.json`, 'utf8'))
const by = new Map(r.streets.map(s => [s.skelId || s.name, s]))
const foot = (p, pts) => { let best = [Infinity, 0]; for (let i = 1; i < pts.length; i++) { const A = pts[i - 1], B = pts[i], dx = B[0] - A[0], dz = B[1] - A[1], l = dx * dx + dz * dz; let t = l ? ((p[0] - A[0]) * dx + (p[1] - A[1]) * dz) / l : 0; t = Math.max(0, Math.min(1, t)); const d = Math.hypot(p[0] - A[0] - t * dx, p[1] - A[1] - t * dz); if (d < best[0]) best = [d, i - 1 + t] } return best }
for (const pr of pairs) { const [a, b] = pr.split(':').map(k => by.get(k))
  const ds = a.points.map(p => foot(p, b.points)), sorted = ds.map(d => d[0]).sort((x, y) => x - y)
  const within = ds.filter(d => d[0] <= 1).length, idx = ds.map(d => d[1]), same = idx.at(-1) >= idx[0]
  console.log(`${pr.padEnd(52)} median ${sorted[Math.floor(sorted.length / 2)].toFixed(2)} m · ${within}/${ds.length} vertices ≤1 m · ${same ? 'same' : 'opposite'} direction · ways a=${JSON.stringify(a.roadId)} b=${JSON.stringify(b.roadId)} · oneway ${a.oneway}/${b.oneway} · role ${a.phase?.role}/${b.phase?.role}`) }
