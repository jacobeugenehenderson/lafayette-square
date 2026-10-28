// READ-ONLY (Boz's ruling (3)): where are the Breakwater's raw butt offset's own verifier violations, and what is the centreline there?
import clipperLib from 'clipper-lib'
import { readFileSync } from 'node:fs'
const ROOT = new URL('../../', import.meta.url).pathname
const Dv = await import(ROOT + 'cartograph/derive.js'), { CLIP_SCALE: SC } = await import(ROOT + 'src/lib/lattice.js')
const CF = await import(ROOT + 'cartograph/coastFile.mjs'), { outlineCorner, INK_EPS } = await import(ROOT + 'src/lib/tileGround.js')
const { ClipperOffset, Clipper, Paths, Path, IntPoint, JoinType, EndType, PolyType, ClipType, PolyFillType } = clipperLib
const d = ROOT.replace(/\.claude\/worktrees\/shore\/$/, '') + 'cartograph/data/provincetown'
const st = JSON.parse(readFileSync(d + '/clean/skeleton.json', 'utf8')).streets.find(s => s.id === 'breakwater')
const pts = Dv.tessellateAdaptive(st.points.map(q => [q.x, q.z]), st.segments), toPath = (rg) => { const p = new Path(); for (const [a, b] of rg) p.push(new IntPoint(Math.round(a * SC), Math.round(b * SC))); return p }
const co = new ClipperOffset(), raw = new Paths(); co.AddPath(toPath(pts), JoinType.jtMiter, EndType.etOpenButt); co.Execute(raw, 0.91 * SC)
const c = new Clipper(), u = new Paths(); c.AddPaths(raw, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, u, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
const acuteAt = (o, p, q) => outlineCorner(o, [{ to: p }, { to: q }], INK_EPS).bad
const turn = (a, o, b) => Math.atan2((o[0] - a[0]) * (b[1] - o[1]) - (o[1] - a[1]) * (b[0] - o[0]), (o[0] - a[0]) * (b[0] - o[0]) + (o[1] - a[1]) * (b[1] - o[1])) * 180 / Math.PI
for (const p of u) { const ring = p.map(q => [q.X / SC, q.Y / SC])
  for (const v of CF.ringViolations(ring, acuteAt, 2 * INK_EPS)) { const i = v.b, A = ring[(i - 1 + ring.length) % ring.length], O = ring[i], B = ring[(i + 1) % ring.length]
    let ci = 0, cd = Infinity; pts.forEach((q, k) => { const dd = Math.hypot(q[0] - O[0], q[1] - O[1]); if (dd < cd) { cd = dd; ci = k } })
    const end = ci === 0 ? 'START' : ci === pts.length - 1 ? 'END' : `c${ci} turn ${turn(pts[ci - 1], pts[ci], pts[ci + 1]).toFixed(2)}°`
    console.log(`${v.kind} @(${O.map(x => x.toFixed(3)).join(', ')}) · ring turn ${turn(A, O, B).toFixed(2)}° · legs ${(Math.hypot(O[0] - A[0], O[1] - A[1]) * 1000).toFixed(1)} / ${(Math.hypot(B[0] - O[0], B[1] - O[1]) * 1000).toFixed(1)} mm · nearest centreline point ${cd.toFixed(3)} m: ${end}`) } }
console.log(`centreline ends: start (${pts[0].map(x => x.toFixed(2))}) end (${pts[pts.length - 1].map(x => x.toFixed(2))})`)
