// does the crossing pass make the frozen evidence DISJOINT? per HPDM tile with overlapping evidence (between classes):
// the overlap m² before, and after every ring of the piece's evidence has passed through `crossingsOnce` together.
import { readFileSync } from 'fs'
import { createRequire } from 'module'
import { crossingsOnce } from './crossings-once.mjs'
const require = createRequire('/Users/jacobhenderson/Desktop/lafayette-square.nosync/package.json'), cl = require('clipper-lib'), S = 1000
const town = process.argv[2] || 'hipointedemun'
const T = JSON.parse(readFileSync(`/Users/jacobhenderson/Desktop/lafayette-square.nosync/public/baked/${town}/shape.json`, 'utf8')).tiles
const toI = (r) => r.map(([x, z]) => [Math.round(x * S), Math.round(z * S)]), P = (r) => r.map(([X, Y]) => ({ X, Y }))
const ov = (A, B) => { const c = new cl.Clipper(); c.AddPaths(A.map(P), cl.PolyType.ptSubject, true); c.AddPaths(B.map(P), cl.PolyType.ptClip, true)
  const o = new cl.Paths(); c.Execute(cl.ClipType.ctIntersection, o, cl.PolyFillType.pftNonZero, cl.PolyFillType.pftNonZero); return Math.abs(o.reduce((t, q) => t + cl.Clipper.Area(q), 0)) / (S * S) }
let before = 0, after = 0, pieces = 0, pairsLeft = 0, maxRounds = 0
for (const t of T) for (const ev of t.evidenceByPiece || []) { if (!Array.isArray(ev) || ev.length < 2) continue
  const groups = ev.map(e => e.rings.map(toI)); let b = 0
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) if (ev[i].lu !== ev[j].lu) b += ov(groups[i], groups[j])
  if (!(b > 0)) continue
  pieces++; before += b
  const flat = groups.flatMap((g, gi) => g.map(r => ({ gi, r }))), res = crossingsOnce(flat.map(x => x.r)); maxRounds = Math.max(maxRounds, res.rounds)
  const g2 = groups.map(() => []); res.rings.forEach((r, k) => g2[flat[k].gi].push(r))
  let a = 0; for (let i = 0; i < g2.length; i++) for (let j = i + 1; j < g2.length; j++) if (ev[i].lu !== ev[j].lu) { const m = ov(g2[i], g2[j]); a += m; if (m > 0) pairsLeft++ }
  after += a }
console.log(`${town}: pieces whose evidence overlaps between classes ${pieces} · overlap BEFORE the crossing pass ${before.toFixed(4)} m² · AFTER ${after.toFixed(4)} m² (${pairsLeft} pair(s) still overlapping) · rounds ≤ ${maxRounds}`)
