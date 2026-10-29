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

// (3a) today's integer path (structures.mjs#openCloseAtStep, cut once, the deck call): does part 4's hole survive as a hole, and
// is the wall at the pinch kept? (3b) the wall's width along the outer's 4.77 m edge: each point's distance to the hole's ring.
const { openCloseAtStep } = await import('../../cartograph/structures.mjs')
const oc = openCloseAtStep(d.inputs.flat().map(p => p.map(q => new IntPoint(q.X, q.Y))), d.fineM, 'a deck')
const c2 = new Clipper(), t2 = new PolyTree(); c2.AddPaths(oc.paths, PolyType.ptSubject, true); c2.Execute(ClipType.ctUnion, t2, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
const outRings = []; const w2 = (n, depth) => { for (const ch of n.Childs()) { outRings.push({ r: ch.Contour(), hole: ch.IsHole(), m2: +(Clipper.Area(ch.Contour()) / 1e6).toFixed(2) }); w2(ch, depth + 1) } }; w2(t2, 0)
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a.Y > y) !== (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X) c = !c } return c }
const segD = (p, a, b) => { const dx = b.X - a.X, dy = b.Y - a.Y, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((p[0] - a.X) * dx + (p[1] - a.Y) * dy) / L2)); return Math.hypot(p[0] - a.X - t * dx, p[1] - a.Y - t * dy) }
const ringD = (p, R) => { let m = Infinity; for (let i = 0; i < R.length; i++) m = Math.min(m, segD(p, R[i], R[(i + 1) % R.length])); return m }
const holeArea = partOf[5].m2, holesOut = outRings.filter(o => o.hole).map(o => o.m2)
// the hole's interior point nearest the pinch, and the outside point just across the wall: same region after the open?
const pin = [281690, 335340], holeNear = outRings.filter(o => o.hole && ringD(pin, o.r) < 5000)
const widths = []; for (let k = 0; k <= 20; k++) { const p = [a1.X + (b1.X - a1.X) * k / 20, a1.Y + (b1.Y - a1.Y) * k / 20]; widths.push(+ringD(p, SRC[5]).toFixed(3)) }
console.log(JSON.stringify({ a_integerToday: { sourceHoleM2: holeArea, outputHolesM2: holesOut, aHoleWithin5mOfThePinch: holeNear.map(o => o.m2),
  outputRingsNearPinch: outRings.filter(o => ringD(pin, o.r) < 50).map(o => ({ hole: o.hole, m2: o.m2, distU: +ringD(pin, o.r).toFixed(3) })) },
  b_wallWidthU_alongTheOuterEdge_21pts: widths }))
// (3b, exact) the wall's NARROWEST width: the least distance between the outer's ring and the hole's ring (vertex to segment, both ways)
let best = { d: Infinity }
for (const [A, B] of [[SRC[4], SRC[5]], [SRC[5], SRC[4]]]) for (const p of A) for (let i = 0; i < B.length; i++) { const dd = segD([p.X, p.Y], B[i], B[(i + 1) % B.length]); if (dd < best.d) best = { d: dd, at: [p.X / 1e3, p.Y / 1e3] } }
console.log(JSON.stringify({ narrowestWallM: +(best.d / 1e3).toFixed(4), at: best.at, twoH_M: +d.fineM.toFixed(4), wallMinus2hMm: +(best.d - d.fineM * 1e3).toFixed(3) }))
// …and NEAR the instance (the eroded segment at (281.633, 334.640)): the least ring-to-ring distance among vertices within 10 m
const P0 = [281633, 334640]; let near = { d: Infinity }
for (const [A, B] of [[SRC[4], SRC[5]], [SRC[5], SRC[4]]]) for (const p of A) { if (Math.hypot(p.X - P0[0], p.Y - P0[1]) > 10000) continue
  for (let i = 0; i < B.length; i++) { const dd = segD([p.X, p.Y], B[i], B[(i + 1) % B.length]); if (dd < near.d) near = { d: dd, at: [p.X / 1e3, p.Y / 1e3] } } }
console.log(JSON.stringify({ nearInstance: { narrowestWallM: +(near.d / 1e3).toFixed(4), at: near.at, wallMinus2hMm: +(near.d - d.fineM * 1e3).toFixed(3) } }))
