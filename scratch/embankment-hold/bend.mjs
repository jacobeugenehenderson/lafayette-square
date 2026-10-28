// READ-ONLY: the Breakwater's tessellated centreline near a point (vertex turns, leg lengths), and the footprint ring's vertices there
import { readFileSync } from 'node:fs'
const ROOT = new URL('../../', import.meta.url).pathname, [x, z, r = 8] = process.argv.slice(2).map(Number)
const Dv = await import(ROOT + 'cartograph/derive.js'), S = await import(ROOT + 'cartograph/structures.mjs'), SP = await import(ROOT + 'src/cartograph/streetProfiles.js')
const d = ROOT.replace(/\.claude\/worktrees\/shore\/$/, '') + 'cartograph/data/provincetown'
const sk = JSON.parse(readFileSync(d + '/clean/skeleton.json', 'utf8')).streets, st = sk.find(s => s.id === 'breakwater')
const pts = Dv.tessellateAdaptive(st.points.map(q => [q.x, q.z]), st.segments)
const turn = (a, o, b) => Math.atan2((o[0] - a[0]) * (b[1] - o[1]) - (o[1] - a[1]) * (b[0] - o[0]), (o[0] - a[0]) * (b[0] - o[0]) + (o[1] - a[1]) * (b[1] - o[1])) * 180 / Math.PI
console.log(`centreline: ${pts.length} pts (skeleton ${st.points.length}); segments ${st.segments ? st.segments.filter(g => g.type === 'bezier').length + ' bezier' : 'none'}`)
pts.forEach((p, i) => { if (i && i < pts.length - 1 && Math.hypot(p[0] - x, p[1] - z) < r * 3) console.log(`  c${i} (${p.map(v => v.toFixed(3)).join(', ')}) turn ${turn(pts[i - 1], p, pts[i + 1]).toFixed(2)}° · legs ${Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]).toFixed(3)} / ${Math.hypot(pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]).toFixed(3)} m`) })
const e = S.embankmentFootprints(sk, { overlay: {}, std: () => { throw new Error('no swept') }, tessellate: Dv.tessellateAdaptive, stepM: 0.9987867588490528 })
for (const ring of e.rings) ring.forEach((p, i) => { if (Math.hypot(p[0] - x, p[1] - z) < r) { const a = ring[(i - 1 + ring.length) % ring.length], b = ring[(i + 1) % ring.length]
  console.log(`  f${i} (${p.map(v => v.toFixed(3)).join(', ')}) turn ${turn(a, p, b).toFixed(2)}° · legs ${(Math.hypot(p[0] - a[0], p[1] - a[1]) * 1000).toFixed(1)} / ${(Math.hypot(b[0] - p[0], b[1] - p[1]) * 1000).toFixed(1)} mm`) } })
