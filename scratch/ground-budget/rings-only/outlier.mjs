// outlier.mjs — the one ring whose PolyTree depth disagrees with its winding: its area, its points, and whether the
// region the difference produces (the flat Paths, read with Clipper's own NonZero fill of its output) covers it.
// Reads only.   node outlier.mjs <dump.json>
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const C = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')('clipper-lib')
const d = JSON.parse(readFileSync(process.argv[2], 'utf8')), P = (a) => a.map(q => q.map(([X, Y]) => ({ X, Y })))
const run = (out) => { const c = new C.Clipper(); c.StrictlySimple = true
  c.AddPaths(P(d.mine), C.PolyType.ptSubject, true); c.AddPaths(P(d.acc), C.PolyType.ptClip, true)
  c.Execute(C.ClipType.ctDifference, out, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftNonZero) }
const tree = new C.PolyTree(); run(tree)
const nodes = tree.m_AllPolys, idx = new Map(nodes.map((n, i) => [n, i]))
const depth = (n) => { let k = 0; for (let p = n.m_Parent; p && idx.has(p); p = p.m_Parent) k++; return k }
const S = 1000
nodes.forEach((n, i) => { const a = C.Clipper.Area(n.m_polygon), dd = depth(n)
  if ((dd % 2 === 1) === (a < 0)) return
  console.log(`[outlier] contour ${i}: ${n.m_polygon.length} v · signed area ${(a / S / S).toFixed(6)} m² · tree depth ${dd} (${dd % 2 ? 'hole' : 'outer'}) · IsHoleNode ${n.IsHoleNode()}`)
  console.log(`  points (m): ${n.m_polygon.map(p => `(${(p.X / S).toFixed(3)}, ${(p.Y / S).toFixed(3)})`).join(' ')}`)
  // the region: winding number of the whole output at the ring's centroid-ish interior point, under NonZero
  const cx = n.m_polygon.reduce((s, p) => s + p.X, 0) / n.m_polygon.length, cy = n.m_polygon.reduce((s, p) => s + p.Y, 0) / n.m_polygon.length
  const pt = { X: Math.round(cx), Y: Math.round(cy) }
  const inThis = C.Clipper.PointInPolygon(pt, n.m_polygon)
  let wind = 0; for (const m of nodes) if (C.Clipper.PointInPolygon(pt, m.m_polygon) === 1) wind += C.Clipper.Area(m.m_polygon) > 0 ? 1 : -1
  const containers = nodes.map((m, j) => [j, m]).filter(([j, m]) => j !== i && C.Clipper.PointInPolygon(pt, m.m_polygon) === 1).map(([j, m]) => `${j}(${C.Clipper.Area(m.m_polygon) > 0 ? '+' : '−'}, depth ${depth(m)})`)
  console.log(`  at its mean point (${(pt.X / S).toFixed(3)}, ${(pt.Y / S).toFixed(3)}): inside this ring ${inThis} · the output's winding there (+1 per outer, −1 per hole containing it) ${wind} · containers ${containers.join(' ') || 'none'}`)
  // and the subject itself there: is the point in mine (EvenOdd) and not in acc (NonZero)?
  let mineCount = 0; for (const q of P(d.mine)) if (C.Clipper.PointInPolygon(pt, q) === 1) mineCount++
  let accW = 0; for (const q of P(d.acc)) if (C.Clipper.PointInPolygon(pt, q) === 1) accW += C.Clipper.Orientation(q) ? 1 : -1
  console.log(`  the inputs there: inside ${mineCount} of mine's paths (EvenOdd: ${mineCount % 2 ? 'IN' : 'OUT'}) · acc winding ${accW} (NonZero: ${accW ? 'IN' : 'OUT'}) ⇒ the difference ${mineCount % 2 && !accW ? 'PAINTS' : 'does NOT paint'} it`) })
