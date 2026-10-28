// READ-ONLY DIAGNOSTIC (Boz's ruling (1), 2026-10-28): is openCloseAtStep's staircase the opened edge and the source edge
// alternating? Replays its open on one part — off(off(part, −h), h) ∩ part — and, at each output vertex near a site, the distance
// (lattice units) to the SOURCE ring's edges and to the RE-OFFSET ring's edges. Then Clipper.CleanPolygons, as a diagnostic only.
import clipperLib from 'clipper-lib'
import { readFileSync } from 'node:fs'
const ROOT = new URL('../../', import.meta.url).pathname, [x, z, r = 0.02] = process.argv.slice(2).map(Number)
const Dv = await import(ROOT + 'cartograph/derive.js'), { CLIP_SCALE: SC } = await import(ROOT + 'src/lib/lattice.js')
const { ClipperOffset, Clipper, Paths, Path, IntPoint, JoinType, EndType, PolyType, ClipType, PolyFillType } = clipperLib
const d = ROOT.replace(/\.claude\/worktrees\/shore\/$/, '') + 'cartograph/data/provincetown'
const st = JSON.parse(readFileSync(d + '/clean/skeleton.json', 'utf8')).streets.find(s => s.id === 'breakwater')
const pts = Dv.tessellateAdaptive(st.points.map(q => [q.x, q.z]), st.segments), toPath = (rg) => { const p = new Path(); for (const [a, b] of rg) p.push(new IntPoint(Math.round(a * SC), Math.round(b * SC))); return p }
const run = (t, a, b) => { const c = new Clipper(), o = new Paths(); c.AddPaths(a, PolyType.ptSubject, true); if (b) c.AddPaths(b, PolyType.ptClip, true); c.Execute(t, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const off = (src, dd) => { const co = new ClipperOffset(), o = new Paths(); co.AddPaths(src, JoinType.jtMiter, EndType.etClosedPolygon); co.Execute(o, dd); return o }
const co = new ClipperOffset(), raw = new Paths(); co.AddPath(toPath(pts), JoinType.jtMiter, EndType.etOpenButt); co.Execute(raw, 0.91 * SC)
const part = run(ClipType.ctUnion, raw), h = (0.9987867588490528 / 2) * SC
const re = off(off(part, -h), h), open = run(ClipType.ctIntersection, re, part)
const segD = (q, a, b) => { const dx = b.X - a.X, dz = b.Y - a.Y, L2 = dx * dx + dz * dz, t = L2 ? Math.max(0, Math.min(1, ((q.X - a.X) * dx + (q.Y - a.Y) * dz) / L2)) : 0; return Math.hypot(q.X - a.X - t * dx, q.Y - a.Y - t * dz) }
const dTo = (q, ps) => { let m = Infinity; for (const p of ps) for (let i = 0; i < p.length; i++) m = Math.min(m, segD(q, p[i], p[(i + 1) % p.length])); return m }
const isV = (q, ps) => ps.some(p => p.some(v => v.X === q.X && v.Y === q.Y))
const near = (ps) => ps.flatMap(p => p.filter(q => Math.hypot(q.X / SC - x, q.Y / SC - z) < r))
console.log(`source ring vertices near: ${near(part).map(q => `(${q.X}, ${q.Y})`).join(' ')}`)
console.log(`re-offset ring vertices near: ${near(re).map(q => `(${q.X}, ${q.Y})`).join(' ')}`)
for (const q of near(open)) console.log(`  open vertex (${q.X}, ${q.Y}): to SOURCE edge ${dTo(q, part).toFixed(3)} u${isV(q, part) ? ' (a source VERTEX)' : ''} · to RE-OFFSET edge ${dTo(q, re).toFixed(3)} u${isV(q, re) ? ' (a re-offset VERTEX)' : ''}`)
// the whole ring: how many open vertices lie on the source only, on the re-offset only, on both (≤ 0.5 u)
const tag = (q) => (dTo(q, part) <= 0.5 ? 'S' : '') + (dTo(q, re) <= 0.5 ? 'R' : '')
const tags = open.flatMap(p => p.map(tag)), cnt = (k) => tags.filter(t => t === k).length
console.log(`open ring: ${tags.length} vertices · on the source only ${cnt('S')} · on the re-offset only ${cnt('R')} · on both ${cnt('SR')} · on neither ${cnt('')}`)
// runs: a stretch where S-only and R-only vertices alternate is the staircase
let alt = 0; for (const p of open) for (let i = 0; i < p.length; i++) { const a = tag(p[i]), b = tag(p[(i + 1) % p.length]); if ((a === 'S' && b === 'R') || (a === 'R' && b === 'S')) alt++ }
console.log(`  consecutive S↔R switches around the ring: ${alt}`)
const short = (ps) => ps.reduce((t, p) => t + p.filter((q, i) => { const b = p[(i + 1) % p.length]; return Math.hypot(b.X - q.X, b.Y - q.Y) <= 2 }).length, 0)
console.log(`edges ≤ 2 u: source ${short(part)} · re-offset ${short(re)} · open ${short(open)} · open after CleanPolygons(√2, DIAGNOSTIC ONLY) ${short(Clipper.CleanPolygons(open, Math.SQRT2))}`)
