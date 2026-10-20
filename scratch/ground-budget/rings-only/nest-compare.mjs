// nest-compare.mjs — can the flatten's PolyTree be rebuilt from the flat Paths? (Boz, 2026-10-14). On a dump (mine + acc),
// the flatten's difference (StrictlySimple ON) runs twice: into a PolyTree (the bake's) and into flat Paths. The Paths
// are then nested by containment — each ring's parent is the smallest-|area| ring OF THE OTHER WINDING that contains it (Clipper's own
// Poly2ContainsPoly1 rule: the first vertex not ON the candidate decides) — children kept in output order, which is the
// order BuildResult2 adds them (both builders walk m_PolyOuts by index). Then BOTH go through the flatten's own walk
// (bake-ground.js flattenPaintStack: { outer, holes: Childs()' contours } per child, recursing into each hole's children,
// rings and holes kept at ≥ 3 points) and are compared as JSON, byte for byte; every difference is listed.
// Reads only.   node nest-compare.mjs <dump.json>
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const C = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json')('clipper-lib')
const d = JSON.parse(readFileSync(process.argv[2], 'utf8')), P = (a) => a.map(q => q.map(([X, Y]) => ({ X, Y })))
const run = (out) => { const c = new C.Clipper(); c.StrictlySimple = true
  c.AddPaths(P(d.mine), C.PolyType.ptSubject, true); c.AddPaths(P(d.acc), C.PolyType.ptClip, true)
  const t0 = performance.now(), ok = c.Execute(C.ClipType.ctDifference, out, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftNonZero)
  if (!ok) throw new Error('difference refused'); return (performance.now() - t0) / 1000 }
const ring = (path) => path.map(p => [p.X, p.Y])               // the flatten's _pathToRing, in clipper units (no rescale)
// ── the bake's: PolyTree, walked as flattenPaintStack walks it ──
const tree = new C.PolyTree(), tTree = run(tree)
const fromTree = []
const walkT = (node) => { for (const ch of node.Childs()) { const r = ring(ch.m_polygon)
  if (r.length >= 3) fromTree.push({ outer: r, holes: ch.Childs().map(h => ring(h.m_polygon)).filter(x => x.length >= 3) })
  for (const h of ch.Childs()) walkT(h) } }
walkT(tree)
// ── flat Paths, nested by containment ──
const paths = new C.Paths(), tPaths = run(paths)
const t0 = performance.now()
const R = paths.filter(q => q.length >= 3)                      // BuildResult2 keeps a closed contour at ≥ 3 points
const box = R.map(q => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of q) { if (p.X < x0) x0 = p.X; if (p.X > x1) x1 = p.X; if (p.Y < y0) y0 = p.Y; if (p.Y > y1) y1 = p.Y } return [x0, y0, x1, y1] })
const sArea = R.map(q => C.Clipper.Area(q)), area = sArea.map(Math.abs)   // Clipper winds an output outer +, a hole −
const contains = (outer, inner) => { for (const p of inner) { const r = C.Clipper.PointInPolygon(p, outer); if (r !== -1) return r === 1 } return true }
const parent = R.map((q, i) => { let best = -1
  for (let j = 0; j < R.length; j++) { if (j === i || !(area[j] > area[i]) || (sArea[j] > 0) === (sArea[i] > 0)) continue   // a parent winds the other way
    const a = box[j], b = box[i]; if (b[0] < a[0] || b[1] < a[1] || b[2] > a[2] || b[3] > a[3]) continue
    if ((best < 0 || area[j] < area[best]) && contains(R[j], q)) best = j }
  return best })
const kids = new Map(); R.forEach((_, i) => { const k = parent[i]; (kids.get(k) || kids.set(k, []).get(k)).push(i) })
const fromPaths = []
const walkP = (k) => { for (const i of kids.get(k) || []) { const r = ring(R[i])
  fromPaths.push({ outer: r, holes: (kids.get(i) || []).map(h => ring(R[h])).filter(x => x.length >= 3) })
  for (const h of kids.get(i) || []) walkP(h) } }
walkP(-1)
const tNest = (performance.now() - t0) / 1000
// ── compare ──
const a = JSON.stringify(fromTree), b = JSON.stringify(fromPaths)
console.log(`[time] PolyTree ${tTree.toFixed(2)} s · Paths ${tPaths.toFixed(2)} s + nesting ${tNest.toFixed(2)} s`)
console.log(`[size] tree: ${fromTree.length} pieces · ${fromTree.reduce((n, x) => n + x.holes.length, 0)} holes · paths-nested: ${fromPaths.length} pieces · ${fromPaths.reduce((n, x) => n + x.holes.length, 0)} holes · raw: tree ${tree.m_AllPolys.length} contours, paths ${paths.length} (${R.length} at ≥ 3 points)`)
// the raw contour lists, in output order (both builders walk m_PolyOuts by index)
const rawT = JSON.stringify(tree.m_AllPolys.map(n => ring(n.m_polygon))), rawP = JSON.stringify(R.map(ring))
console.log(`[raw] the contours themselves, in order: ${rawT === rawP ? 'IDENTICAL' : 'DIFFER'}`)
if (a === b) console.log(`[compare] the flatten's visible list: IDENTICAL (${a.length} bytes of JSON)`)
else { let n = 0
  console.log(`[compare] the flatten's visible list: DIFFERS`)
  for (let i = 0; i < Math.max(fromTree.length, fromPaths.length); i++) { const x = JSON.stringify(fromTree[i]), y = JSON.stringify(fromPaths[i])
    if (x !== y) { if (n++ < 20) console.log(`  piece ${i}: tree ${fromTree[i] ? `${fromTree[i].outer.length} v, ${fromTree[i].holes.length} holes, starts ${fromTree[i].outer[0]}` : '—'} · paths ${fromPaths[i] ? `${fromPaths[i].outer.length} v, ${fromPaths[i].holes.length} holes, starts ${fromPaths[i].outer[0]}` : '—'}`) } }
  console.log(`  ${n} piece(s) differ`) }
