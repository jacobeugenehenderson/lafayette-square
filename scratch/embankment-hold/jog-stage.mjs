// READ-ONLY: which stage makes the 1 mm Z at a near-straight bend: the butt offset, the open, or the close?
import clipperLib from 'clipper-lib'
import { readFileSync } from 'node:fs'
const ROOT = new URL('../../', import.meta.url).pathname, [x, z, r = 0.02] = process.argv.slice(2).map(Number)
const Dv = await import(ROOT + 'cartograph/derive.js'), S = await import(ROOT + 'cartograph/structures.mjs'), { CLIP_SCALE: SC } = await import(ROOT + 'src/lib/lattice.js')
const { ClipperOffset, Clipper, Paths, Path, IntPoint, JoinType, EndType, PolyType, ClipType, PolyFillType } = clipperLib
const d = ROOT.replace(/\.claude\/worktrees\/shore\/$/, '') + 'cartograph/data/provincetown'
const st = JSON.parse(readFileSync(d + '/clean/skeleton.json', 'utf8')).streets.find(s => s.id === 'breakwater')
const pts = Dv.tessellateAdaptive(st.points.map(q => [q.x, q.z]), st.segments), toPath = (r) => { const p = new Path(); for (const [a, b] of r) p.push(new IntPoint(Math.round(a * SC), Math.round(b * SC))); return p }
const near = (paths, label) => { const h = []; paths.forEach((p, k) => p.forEach((q, i) => { if (Math.hypot(q.X / SC - x, q.Y / SC - z) < r) h.push(`(${q.X}, ${q.Y})`) })); console.log(`${label}: ${h.length} vertex(es) within ${r * 1000} mm: ${h.join(' ')}`) }
const co = new ClipperOffset(), raw = new Paths(); co.AddPath(toPath(pts), JoinType.jtMiter, EndType.etOpenButt); co.Execute(raw, 0.91 * SC)
near(raw, 'butt offset')
const oc = S.openCloseAtStep(raw, 0.9987867588490528, 'probe')
near(oc.paths, 'after open+close')
// what-if (not a patch): the butt offset alone (no open/close), unioned, through the coast's verifier
const CF = await import(ROOT + 'cartograph/coastFile.mjs'), { outlineCorner, INK_EPS } = await import(ROOT + 'src/lib/tileGround.js')
const acuteAt = (o, p, q) => outlineCorner(o, [{ to: p }, { to: q }], INK_EPS).bad
const c = new Clipper(), u = new Paths(); c.AddPaths(raw, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, u, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
for (const p of u) { const ring = p.map(q => [q.X / SC, q.Y / SC]), L = ring.map((a, i) => Math.hypot(ring[(i + 1) % ring.length][0] - a[0], ring[(i + 1) % ring.length][1] - a[1])), v = CF.ringViolations(ring, acuteAt, 2 * INK_EPS)
  console.log(`butt offset alone: ring ${ring.length} v · edges < 10 mm ${L.filter(x => x < 0.01).length} · < step ${L.filter(x => x < 0.9987867588490528).length} · shortest ${(Math.min(...L) * 1000).toFixed(1)} mm · violations ${v.length} (${[...new Set(v.map(x => x.kind))].map(k => k + ' ' + v.filter(x => x.kind === k).length).join(', ')}) · ${(Math.abs(Clipper.Area(p)) / SC / SC).toFixed(3)} m²`) }
