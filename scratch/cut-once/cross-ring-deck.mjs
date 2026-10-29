// Zob's ask (5): PTown's one cross-ring eroded segment ({ring 4, i 1} · {ring 5, i 25}, step0.mjs's global ring ids): the two
// source lines' angle and distance, and the part each ring is (outer or hole, its area). node scratch/cut-once/cross-ring-deck.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, PolyTree } = clipperLib
const d = JSON.parse(fs.readFileSync(new URL('./fixtures/ptown-deck-inputs.json', import.meta.url), 'utf8'))
const c = new Clipper(), t = new PolyTree(); c.PreserveCollinear = true; c.AddPaths(d.inputs.flat().map(p => p.map(q => new IntPoint(q.X, q.Y))), PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, t, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
const SRC = [], partOf = []; let pi = 0
const w = (n) => { for (const ch of n.Childs()) { const part = [ch.Contour(), ...ch.Childs().map(c => c.Contour())]; part.forEach((r, k) => { SRC.push(r); partOf.push({ part: pi, role: k ? 'hole' : 'outer', m2: +(Clipper.Area(r) / 1e6).toFixed(2) }) }); pi++; for (const hh of ch.Childs()) w(hh) } }; w(t)
const seg = (r, i) => { const R = SRC[r], a = R[i], b = R[(i + 1) % R.length]; return [a, b] }
const [a1, b1] = seg(4, 1), [a2, b2] = seg(5, 25)
const u = [b1.X - a1.X, b1.Y - a1.Y], v = [b2.X - a2.X, b2.Y - a2.Y], ang = Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI
const dl = (p, a, b) => Math.abs((p.X - a.X) * (b.Y - a.Y) - (p.Y - a.Y) * (b.X - a.X)) / Math.hypot(b.X - a.X, b.Y - a.Y)
console.log(JSON.stringify({ ring4: { ...partOf[4], edge: [[a1.X / 1e3, a1.Y / 1e3], [b1.X / 1e3, b1.Y / 1e3]], lenM: +(Math.hypot(...u) / 1e3).toFixed(3) },
  ring5: { ...partOf[5], edge: [[a2.X / 1e3, a2.Y / 1e3], [b2.X / 1e3, b2.Y / 1e3]], lenM: +(Math.hypot(...v) / 1e3).toFixed(3) },
  angleDeg: +ang.toFixed(4), sameDirection: ang < 90, distanceU: { ring5endsToLine4: [dl(a2, a1, b1), dl(b2, a1, b1)].map(x => +x.toFixed(3)) } }))
