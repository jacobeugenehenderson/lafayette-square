// nest-diagnose.mjs — where the containment rebuild and the PolyTree disagree on a ring's parent, which one the
// geometry supports: each ring's orientation (Clipper's output winds outers +, holes −), and how many of its vertices
// lie inside / on / outside each candidate parent. Reads only.   node nest-diagnose.mjs <dump.json>
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
const R = nodes.map(n => n.m_polygon), area = R.map(q => C.Clipper.Area(q)), absA = area.map(Math.abs)
const pipAll = (outer, inner) => { let i = 0, o = 0, x = 0; for (const p of inner) { const r = C.Clipper.PointInPolygon(p, outer); r === 1 ? i++ : r === -1 ? o++ : x++ } return `${i} in / ${o} on / ${x} out` }
const contains = (outer, inner) => { for (const p of inner) { const r = C.Clipper.PointInPolygon(p, outer); if (r !== -1) return r === 1 } return true }
const mParent = R.map((q, i) => { let best = -1; for (let j = 0; j < R.length; j++) { if (j === i || !(absA[j] > absA[i])) continue
  if ((best < 0 || absA[j] < absA[best]) && contains(R[j], q)) best = j } return best })
const depth = (par, i) => { let k = 0; for (let p = par[i]; p >= 0; p = par[p]) k++; return k }
let n = 0; const tally = {}
R.forEach((q, i) => { if (tParent[i] === mParent[i]) return
  const td = depth(tParent, i), md = depth(mParent, i), key = `orient ${area[i] > 0 ? '+' : '−'} · tree depth ${td} (${td % 2 ? 'hole' : 'outer'}) · rebuilt depth ${md} (${md % 2 ? 'hole' : 'outer'})`
  tally[key] = (tally[key] || 0) + 1
  if (n++ < 12) console.log(`  ring ${i}: ${q.length} v, area ${(area[i] / 1e6).toFixed(3)} m² · tree parent ${tParent[i]} [${tParent[i] >= 0 ? pipAll(R[tParent[i]], q) : '—'}] · rebuilt parent ${mParent[i]} [${mParent[i] >= 0 ? pipAll(R[mParent[i]], q) : '—'}]`) })
console.log(`[diagnose] ${n} of ${R.length} rings have a different parent`); for (const [k, v] of Object.entries(tally)) console.log(`  ${v} × ${k}`)
// orientation vs tree depth, over ALL rings: does the tree's hole flag agree with each ring's winding?
let agreeT = 0, agreeM = 0; R.forEach((_, i) => { if ((depth(tParent, i) % 2 === 1) === (area[i] < 0)) agreeT++; if ((depth(mParent, i) % 2 === 1) === (area[i] < 0)) agreeM++ })
console.log(`[orient] hole ⇔ negative winding: tree ${agreeT}/${R.length} · rebuilt ${agreeM}/${R.length}`)
