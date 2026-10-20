// nest-rules.mjs — the ONE bounded attempt to reproduce the PolyTree's nesting EXACTLY from flat Paths (Boz, 2026-10-14).
// Clipper's parent is FirstLeft: born from the sweep (SetHoleState: the outrec of the edge to the LEFT in the AEL, and
// IsHole from the count of edges to the left — topology, not winding), re-settled by Poly2ContainsPoly1 only for rings
// whose FirstLeft was the ring that just split (FixupFirstLefts1/2/3, PolyTree mode only); BuildResult2 then nests by
// FirstLeft after FixHoleLinkage. Flat Paths carry neither FirstLeft nor IsHole, so the rebuild can only use geometry.
// Tried here, each against the tree's parent per contour: R1 winding + containment (Poly2ContainsPoly1's rule, all-ON ⇒
// contained) · R2 the same, all-ON ⇒ NOT contained · R3 no winding, all-ON ⇒ NOT contained. Reports
// mismatches per rule, and for each tree-vs-rule mismatch the ring's area and what its points are to both parents. Reads only.
//   node nest-rules.mjs <dump.json>
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const C = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')('clipper-lib')
const d = JSON.parse(readFileSync(process.argv[2], 'utf8')), P = (a) => a.map(q => q.map(([X, Y]) => ({ X, Y })))
const run = (out) => { const c = new C.Clipper(); c.StrictlySimple = true
  c.AddPaths(P(d.mine), C.PolyType.ptSubject, true); c.AddPaths(P(d.acc), C.PolyType.ptClip, true)
  c.Execute(C.ClipType.ctDifference, out, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftNonZero) }
const tree = new C.PolyTree(); run(tree)
const nodes = tree.m_AllPolys, idx = new Map(nodes.map((n, i) => [n, i]))
const tParent = nodes.map(n => (n.m_Parent && idx.has(n.m_Parent)) ? idx.get(n.m_Parent) : -1)
const paths = new C.Paths(); run(paths)
const R = paths.filter(q => q.length >= 3)
if (JSON.stringify(R) !== JSON.stringify(nodes.map(n => n.m_polygon))) throw new Error('the Paths contours are not the tree\'s, in order — the comparison below would be meaningless')
const sA = R.map(q => C.Clipper.Area(q)), A = sA.map(Math.abs)
const box = R.map(q => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of q) { if (p.X < x0) x0 = p.X; if (p.X > x1) x1 = p.X; if (p.Y < y0) y0 = p.Y; if (p.Y > y1) y1 = p.Y } return [x0, y0, x1, y1] })
const inBox = (j, i) => { const a = box[j], b = box[i]; return !(b[0] < a[0] || b[1] < a[1] || b[2] > a[2] || b[3] > a[3]) }
const contains = (outer, inner, allOn) => { for (const p of inner) { const r = C.Clipper.PointInPolygon(p, outer); if (r !== -1) return r === 1 } return allOn }
const rule = (wind, allOn) => R.map((q, i) => { let best = -1
  for (let j = 0; j < R.length; j++) { if (j === i || !(A[j] > A[i]) || !inBox(j, i)) continue
    if (wind && (sA[j] > 0) === (sA[i] > 0)) continue
    if ((best < 0 || A[j] < A[best]) && contains(R[j], q, allOn)) best = j } return best })
const rules = { 'R1 winding, all-ON ⇒ in': rule(true, true), 'R2 winding, all-ON ⇒ out': rule(true, false), 'R3 no winding, all-ON ⇒ out': rule(false, false) }
const pts = (o, q) => { let i = 0, on = 0, x = 0; for (const p of q) { const r = C.Clipper.PointInPolygon(p, R[o]); r === 1 ? i++ : r === -1 ? on++ : x++ } return `${i}/${on}/${x} in/on/out` }
for (const [name, par] of Object.entries(rules)) {
  const miss = par.map((p, i) => p === tParent[i] ? -1 : i).filter(i => i >= 0)
  console.log(`[${name}] ${miss.length} of ${R.length} contours differ from the tree`)
  for (const i of miss.slice(0, 6)) console.log(`  contour ${i}: ${R[i].length} v · ${(sA[i] / 1e6).toFixed(6)} m² · tree parent ${tParent[i]} (${tParent[i] >= 0 ? pts(tParent[i], R[i]) + ', ' + (sA[tParent[i]] > 0 ? '+' : '−') : 'root'}) · rule parent ${par[i]} (${par[i] >= 0 ? pts(par[i], R[i]) + ', ' + (sA[par[i]] > 0 ? '+' : '−') : 'root'})`)
}
