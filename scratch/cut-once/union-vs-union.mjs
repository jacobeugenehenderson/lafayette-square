// Is the +0.0135 m² against the source in the OPEN or in the REFERENCE? P (the source unioned through the exact noding and the
// face walk, what cand3 opens) against clipper's union of the same inputs (compare.mjs's 'source'). node scratch/cut-once/union-vs-union.mjs
import fs from 'fs'
import clipperLib from 'clipper-lib'
const W = new URL('./', import.meta.url).pathname
const C3 = await import(W + 'cand3.mjs')
const { IntPoint, Clipper, ClipType, PolyType, PolyFillType, Paths } = clipperLib
const d = JSON.parse(fs.readFileSync(W + 'fixtures/ptown-deck-inputs.json', 'utf8')), src = d.inputs.flat().map(p => p.map(q => new IntPoint(q.X, q.Y)))
const P = C3.arrange([src.map(p => p.map(q => ({ X: q.X, Y: q.Y })))], w => w[0] !== 0, 'P').rings
const c = new Clipper(), o = new Paths(); c.AddPaths(src, PolyType.ptSubject, true); c.Execute(ClipType.ctUnion, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
const holes = (rs, A) => rs.map(A).filter(a => a < 0).map(a => +(a / 1e6).toFixed(4))
console.log('exact-noded union P holes', JSON.stringify(holes(P, C3.area)), '| clipper union holes', JSON.stringify(holes(o, r => Clipper.Area(r))))
const x = C3.arrange([P, o.map(r => r.map(q => ({ X: q.X, Y: q.Y })))], w => (w[0] > 0) !== (w[1] > 0), 'xor').rings
console.log('P xor clipper-union, m²:', +(x.reduce((t, r) => t + Math.abs(C3.area(r)), 0) / 1e6).toFixed(4), 'rings', x.length)
// …and the OUTPUT's hole straight off the face walk's rings, against the same output re-unioned by clipper (as compare.mjs measures)
const r = C3.openCloseProvenance(src, d.fineM, 'a deck')
const c2 = new Clipper(), o2 = new Paths(); c2.AddPaths(r.paths, PolyType.ptSubject, true); c2.Execute(ClipType.ctUnion, o2, PolyFillType.pftNonZero, PolyFillType.pftNonZero)
console.log('output holes, facesOf rings', JSON.stringify(holes(r.rings, C3.area)), '| the same re-unioned by clipper', JSON.stringify(holes(o2, q => Clipper.Area(q))))
// the books must balance: area(out) − area(P) = |out − P| − |P − out|, all off the face walk
const A = (rs) => rs.reduce((t, q) => t + C3.area(q), 0) / 1e6
const add = C3.arrange([r.rings, P], w => w[0] > 0 && !(w[1] > 0), 'add').rings, rem = C3.arrange([P, r.rings], w => w[0] > 0 && !(w[1] > 0), 'rem').rings
console.log(JSON.stringify({ areaP: +A(P).toFixed(4), areaOut: +A(r.rings).toFixed(4), diff: +(A(r.rings) - A(P)).toFixed(4), added: +A(add).toFixed(4), removed: +A(rem).toFixed(4),
  outRings: r.rings.length, outRingAreas: r.rings.map(q => +(C3.area(q) / 1e6).toFixed(4)).sort((x, y) => x - y) }))
// an independent reference for the two differences: clipper's integer booleans (exact on integer input, as a CHECK only)
const ip = (rs) => rs.map(q => q.map(v => new IntPoint(v.X, v.Y)))
const cd = (a, b) => { const k = new Clipper(), o = new Paths(); k.AddPaths(ip(a), PolyType.ptSubject, true); k.AddPaths(ip(b), PolyType.ptClip, true); k.Execute(ClipType.ctDifference, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o }
const cA = (o) => o.reduce((t, q) => t + Clipper.Area(q), 0) / 1e6
const cRem = cd(P, r.rings), cAdd = cd(r.rings, P)
console.log(JSON.stringify({ clipper: { removed: +cA(cRem).toFixed(4), removedPieces: cRem.length, removedAt: cRem.slice(0, 6).map(q => [q[0].X / 1e3, q[0].Y / 1e3, +(Clipper.Area(q) / 1e6).toFixed(5)]), added: +cA(cAdd).toFixed(4) },
  outWinding: 'nonzero self-union of out vs its plain sum', outUnionArea: +cA((() => { const k = new Clipper(), o = new Paths(); k.AddPaths(ip(r.rings), PolyType.ptSubject, true); k.Execute(ClipType.ctUnion, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return o })()).toFixed(4) }))
// does each ring set's plain sum equal its own union (no ring of it overlapping another)?
const selfU = (rs) => { const k = new Clipper(), o = new Paths(); k.AddPaths(ip(rs), PolyType.ptSubject, true); k.Execute(ClipType.ctUnion, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return cA(o) }
console.log(JSON.stringify({ P: { sum: +A(P).toFixed(4), union: +selfU(P).toFixed(4), rings: P.length, ringAreas: P.map(q => +(C3.area(q) / 1e6).toFixed(4)).sort((x, y) => x - y) } }))
// where is the 0.0135 m²? part 4's output hole minus P's hole, both as positive regions; then: is that sliver in P, in out?
const hP = P.find(q => Math.abs(C3.area(q) / 1e6 + 1988.2296) < 1e-3), hO = r.rings.find(q => Math.abs(C3.area(q) / 1e6 + 1988.2431) < 1e-3)
const pos = (q) => [q.slice().reverse()]
const sl = cd(pos(hO), pos(hP))
const inR = (x, y, q) => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const a = q[i], b = q[j]; if ((a.Y > y) !== (b.Y > y) && x < (b.X - a.X) * (y - a.Y) / (b.Y - a.Y) + a.X) c = !c } return c }
const wind = (rs, x, y) => rs.reduce((t, q) => t + (inR(x, y, q) ? Math.sign(C3.area(q)) : 0), 0)
console.log(JSON.stringify({ sliver: sl.map(q => { let cx = 0, cy = 0; for (const v of q) { cx += v.X; cy += v.Y } cx /= q.length; cy /= q.length
  return { m2: +(Clipper.Area(q) / 1e6).toFixed(5), n: q.length, centroid: [cx / 1e3, cy / 1e3], windP: wind(P, cx, cy), windOut: wind(r.rings, cx, cy), pts: q.slice(0, 8).map(v => [v.X / 1e3, v.Y / 1e3]) } }) }))
// is the output hole ring SIMPLE? its shoelace area against the area of its own union, and its repeated vertices
const one = (q) => { const k = new Clipper(), o = new Paths(); k.AddPaths(ip(pos(q)), PolyType.ptSubject, true); k.Execute(ClipType.ctUnion, o, PolyFillType.pftNonZero, PolyFillType.pftNonZero); return cA(o) }
const rep = (q) => { const m = new Map(); q.forEach((v, i) => { const k = v.X + ',' + v.Y; (m.get(k) || m.set(k, []).get(k)).push(i) }); return [...m].filter(([, l]) => l.length > 1).map(([k, l]) => ({ at: k.split(',').map(v => +v / 1e3), visits: l })) }
console.log(JSON.stringify({ outHole: { shoelace: +(-C3.area(hO) / 1e6).toFixed(4), ownUnion: +one(hO).toFixed(4), n: hO.length, repeated: rep(hO).slice(0, 6) }, pHole: { shoelace: +(-C3.area(hP) / 1e6).toFixed(4), ownUnion: +one(hP).toFixed(4), n: hP.length, repeated: rep(hP).slice(0, 6) } }))
const kP = new Set(hP.map(v => v.X + ',' + v.Y)), kO = new Set(hO.map(v => v.X + ',' + v.Y))
console.log(JSON.stringify({ onlyInP: hP.filter(v => !kO.has(v.X + ',' + v.Y)).map(v => [v.X / 1e3, v.Y / 1e3]), onlyInOut: hO.filter(v => !kP.has(v.X + ',' + v.Y)).map(v => [v.X / 1e3, v.Y / 1e3]), hOminushP: cA(cd(pos(hO), pos(hP))), hPminushO: cA(cd(pos(hP), pos(hO))) }))
const big = (q) => { let a = 0n; for (let i = 0; i < q.length; i++) { const p = q[i], s = q[(i + 1) % q.length]; a += BigInt(p.X) * BigInt(s.Y) - BigInt(s.X) * BigInt(p.Y) } return Number(a) / 2 / 1e6 }
console.log(JSON.stringify({ hP: { C3: C3.area(hP) / 1e6, clipper: Clipper.Area(ip([hP])[0]) / 1e6, exact: big(hP) }, hO: { C3: C3.area(hO) / 1e6, clipper: Clipper.Area(ip([hO])[0]) / 1e6, exact: big(hO) } }))
const { crossOf } = await import('../../src/lib/latticeNode.js')
const selfX = (q) => { const o = []; for (let i = 0; i < q.length; i++) for (let j = i + 2; j < q.length; j++) { if (i === 0 && j === q.length - 1) continue
  const s = { a: [q[i].X, q[i].Y], b: [q[(i + 1) % q.length].X, q[(i + 1) % q.length].Y] }, t = { a: [q[j].X, q[j].Y], b: [q[(j + 1) % q.length].X, q[(j + 1) % q.length].Y] }, X = crossOf(s, t); if (X) o.push({ i, j, at: X.map(v => v / 1e3) }) } return o }
console.log(JSON.stringify({ hPselfCrossings: selfX(hP), hOselfCrossings: selfX(hO) }))
const nb = (q, x, y) => { const i = q.findIndex(v => v.X === x && v.Y === y); return [-2, -1, 0, 1, 2].map(k => { const v = q[(i + k + q.length) % q.length]; return [v.X / 1e3, v.Y / 1e3] }) }
console.log(JSON.stringify({ at241: { P: nb(hP, 241520, 270460), out: nb(hO, 242209, 271040) }, at281: { P: nb(hP, 281690, 335340), out: nb(hO, 282455, 335983) } }))
// the output hole ring ALONE, noded against itself and walked (winding ≠ 0): its region, against its shoelace
const { nodeCrossings } = await import('../../src/lib/latticeNode.js'), { facesOf } = await import('../../src/lib/latticeFaces.js')
for (const [nm, q] of [['hO', hO], ['hP', hP]]) { const R = nodeCrossings([{ p: q.map(v => [v.X / 1e3, v.Y / 1e3]), tag: nm }], { pairs: () => true, self: true, who: nm })
  const E = []; R[0].forEach((v, k) => { const w = R[0][(k + 1) % R[0].length]; E.push({ a: v.k, b: w.k, set: 0 }) })
  const F = facesOf(E, w => w[0] !== 0, { sets: 1, who: nm }), wn = facesOf(E, w => Math.abs(w[0]) >= 2, { sets: 1, who: nm })
  console.log(nm, JSON.stringify({ shoelace: +(C3.area(q) / 1e6).toFixed(4), nodedVerts: R[0].length, inserted: R.crossings, regionRings: F.rings.map(x => +(C3.area(x) / 1e6).toFixed(4)), windingTwiceRings: wn.rings.map(x => ({ m2: +(C3.area(x) / 1e6).toFixed(5), at: [x[0].X / 1e3, x[0].Y / 1e3] })) })) }
