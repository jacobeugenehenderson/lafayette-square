// truth.mjs — which nesting is RIGHT where the PolyTree (HEAD) and R1 disagree (Boz's ruling (iii), 2026-10-14). The region
// a step should paint is, by definition, mine (EvenOdd) − acc (NonZero), straight off the step's raw inputs; no tree.
// Per dumped step: each version's region (each item: outer − its holes; the union of the items — what earcut fills), their
// XOR, and per XOR piece a few points strictly inside it (the piece inset by 2 grid steps, ClipperOffset): each tested
// against the inputs (in mine by EvenOdd, not in acc by NonZero) and against each version's region.
// Verdict per piece: TREE right · R1 right · BOTH wrong · MIXED (points disagree) · TOO THIN (nothing survives the inset).
// Reads only.   node truth.mjs <inputs dump> <HEAD flatten dump> <R1 flatten dump>
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const C = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')('clipper-lib')
const [fi, ft, fr] = process.argv.slice(2), IN = JSON.parse(readFileSync(fi, 'utf8')), TR = JSON.parse(readFileSync(ft, 'utf8')), R1 = JSON.parse(readFileSync(fr, 'utf8')), S = 1000
const P = (a) => a.map(q => q.map(([X, Y]) => ({ X, Y })))
const path = (r) => r.map(([x, z]) => ({ X: Math.round(x * S), Y: Math.round(z * S) }))
const region = (items) => { const u = new C.Clipper()
  for (const it of items) { const outer = Array.isArray(it) ? it : it.outer, holes = Array.isArray(it) ? [] : (it.holes || []); if (!outer || outer.length < 3) continue
    const c = new C.Clipper(); c.AddPath(path(outer), C.PolyType.ptSubject, true); for (const h of holes) if (h.length >= 3) c.AddPath(path(h), C.PolyType.ptClip, true)
    const o = new C.Paths(); c.Execute(C.ClipType.ctDifference, o, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero); u.AddPaths(o, C.PolyType.ptSubject, true) }
  const out = new C.Paths(); u.Execute(C.ClipType.ctUnion, out, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero); return out }
const wind = (pt, ps) => { let w = 0; for (const q of ps) if (C.Clipper.PointInPolygon(pt, q) === 1) w += C.Clipper.Orientation(q) ? 1 : -1; return w }
const inEvenOdd = (pt, ps) => { let n = 0; for (const q of ps) if (C.Clipper.PointInPolygon(pt, q) === 1) n++; return n % 2 === 1 }
const tally = {}
for (const [key, { mine, acc }] of Object.entries(IN)) {
  const M = P(mine), A = P(acc), rt = region(TR[key] || []), rr = region(R1[key] || [])
  const x = new C.Clipper(); x.AddPaths(rt, C.PolyType.ptSubject, true); x.AddPaths(rr, C.PolyType.ptClip, true)
  const xo = new C.PolyTree(); x.Execute(C.ClipType.ctXor, xo, C.PolyFillType.pftNonZero, C.PolyFillType.pftNonZero)
  const pieces = []; const walk = (n) => { for (const ch of n.Childs()) { pieces.push({ outer: ch.m_polygon, holes: ch.Childs().map(h => h.m_polygon) }); for (const h of ch.Childs()) walk(h) } }; walk(xo)
  console.log(`${key}: ${pieces.length} XOR piece(s)`)
  for (const pc of pieces) {
    const area = (C.Clipper.Area(pc.outer) - pc.holes.reduce((s, h) => s + Math.abs(C.Clipper.Area(h)), 0)) / S / S
    const co = new C.ClipperOffset(); co.AddPaths([pc.outer, ...pc.holes], C.JoinType.jtMiter, C.EndType.etClosedPolygon)
    const ins = new C.Paths(); co.Execute(ins, -2)
    const pts = []; for (const q of ins) for (let i = 0; i < q.length && pts.length < 6; i += Math.max(1, Math.floor(q.length / 3))) pts.push(q[i])
    let verdict
    if (!pts.length) verdict = 'TOO THIN'
    else { const v = pts.map(pt => { const truth = inEvenOdd(pt, M) && wind(pt, A) === 0, t = wind(pt, rt) !== 0, r = wind(pt, rr) !== 0; return (t === truth ? 'T' : '') + (r === truth ? 'R' : '') })
      const allT = v.every(s => s.includes('T')), allR = v.every(s => s.includes('R'))
      verdict = allT && !allR ? 'TREE right' : allR && !allT ? 'R1 right' : !v.some(s => s) ? 'BOTH wrong' : allT && allR ? 'BOTH agree (?)' : 'MIXED' }
    tally[verdict] = (tally[verdict] || []).concat([area])
    const p0 = pc.outer[0]
    console.log(`  ${verdict.padEnd(10)} ${area.toFixed(6)} m² · ${pc.outer.length} v at (${(p0.X / S).toFixed(2)}, ${(p0.Y / S).toFixed(2)}) · ${pts.length} point(s) tested${pts.length ? ` (first at (${(pts[0].X / S).toFixed(3)}, ${(pts[0].Y / S).toFixed(3)}))` : ""} · tree paints it: ${pts.length ? wind(pts[0], rt) !== 0 : '-'} · R1 paints it: ${pts.length ? wind(pts[0], rr) !== 0 : '-'}`) } }
console.log('[truth] ' + Object.entries(tally).map(([k, v]) => `${k} ${v.length} (${v.reduce((a, b) => a + b, 0).toFixed(6)} m²)`).join(' · '))
