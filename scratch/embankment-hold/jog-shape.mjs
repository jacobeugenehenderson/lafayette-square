// READ-ONLY: each remaining deck edge ≤ 2 u after the cut-once open/close: the turns at both its ends, and each end's distance
// to the SOURCE boundary (the inputs' union) and to the RE-OFFSET boundary (the cut line)
import clipperLib from 'clipper-lib'
import { readFileSync } from 'node:fs'
const ROOT = new URL('../../', import.meta.url).pathname, D = ROOT.replace(/\.claude\/worktrees\/shore\/$/, '') + 'cartograph/data'
const S = await import(ROOT + 'cartograph/structures.mjs')
const { Clipper, ClipperOffset, Paths, PolyType, ClipType, PolyFillType, JoinType, EndType } = clipperLib
const [t, step] = [process.argv[2] || 'provincetown', +(process.argv[3] || 0.9987867588490528)]
const g = JSON.parse(readFileSync(`${D}/${t}/raw/osm.json`, 'utf8')).ground, { paths } = S.deckInputs(g)
const c = new Clipper(), u = new Paths(); c.AddPaths(paths, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, u, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
const off = (src, d) => { const co = new ClipperOffset(), o = new Paths(); co.AddPaths(src, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, d); return o }
const h = step / 2 * 1000, re = off(off(u, -h), h), reC = off(off(u, h), -h)
const segD = (q, a, b) => { const dx = b.X - a.X, dz = b.Y - a.Y, L2 = dx * dx + dz * dz, s = L2 ? Math.max(0, Math.min(1, ((q.X - a.X) * dx + (q.Y - a.Y) * dz) / L2)) : 0; return Math.hypot(q.X - a.X - s * dx, q.Y - a.Y - s * dz) }
const dTo = (q, ps) => { let m = Infinity; for (const p of ps) for (let i = 0; i < p.length; i++) m = Math.min(m, segD(q, p[i], p[(i + 1) % p.length])); return m }
const turn = (a, o, b) => Math.atan2((o.X - a.X) * (b.Y - o.Y) - (o.Y - a.Y) * (b.X - o.X), (o.X - a.X) * (b.X - o.X) + (o.Y - a.Y) * (b.Y - o.Y)) * 180 / Math.PI
const fp = S.deckFootprints(g, step)
for (const p of fp.paths) { const n = p.length; p.forEach((q, i) => { const b = p[(i + 1) % n]; if (Math.hypot(b.X - q.X, b.Y - q.Y) > 2) return
  const A = p[(i - 1 + n) % n], B = p[(i + 2) % n]
  console.log(`(${q.X}, ${q.Y})→(${b.X}, ${b.Y}) · turns ${turn(A, q, b).toFixed(1)}° / ${turn(q, b, B).toFixed(1)}° · to source ${dTo(q, u).toFixed(2)} / ${dTo(b, u).toFixed(2)} u · to the open's cut ${dTo(q, re).toFixed(2)} / ${dTo(b, re).toFixed(2)} u · to the close's ${dTo(q, reC).toFixed(2)} / ${dTo(b, reC).toFixed(2)} u · legs ${Math.hypot(q.X - A.X, q.Y - A.Y).toFixed(0)} / ${Math.hypot(B.X - b.X, B.Y - b.Y).toFixed(0)} u`) }) }
