// Splice fixture (BRIEF §5b): ONE answer to "does ① turn here", read by every corner reader. A temp copy of tileGround.js
// exporting its internal easeContour + taperWorkingCopy (removed after). Each case runs with the cluster turn and with
// the per-vertex turn (the mutant), and the mutant must differ.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
const src = readFileSync('src/lib/tileGround.js', 'utf8') + '\nexport { easeContour as __ease, taperWorkingCopy as __taper }\n'
writeFileSync('src/lib/__splice_cluster.js', src)
let red = 0
try {
  const T = await import('../../src/lib/__splice_cluster.js'), eps = 0.005
  const dir = (a) => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)], add = (p, d, s) => [p[0] + d[0] * s, p[1] + d[1] * s]
  // a block with one corner split over a 5 mm edge into two 12° turns (net 24°), then three plain 90°-ish corners
  const A = [10, 0], B = add(A, dir(12), 0.005), C = add(B, dir(24), 10), ring = [[0, 0], A, B, C, [0, C[1]]]
  const CL = T.subInkClusters(ring, eps)
  const ok1 = CL.inCluster[1] && CL.inCluster[2] && Math.abs(CL.turn[1] - 24) < 0.01 && CL.carrier.filter((c, i) => c && CL.inCluster[i]).length === 1
  console.log(`${ok1 ? '✅' : '⛔'} 12° + 12° split: cluster ${[1, 2].map(i => `v${i} ${CL.turn[i].toFixed(1)}° ${CL.carrier[i] ? 'corner' : 'member'}`).join(' · ')} (one corner, net 24°)`)
  if (!ok1) red++
  // the ease makes the corner only if it reads the cluster turn: R at the carrier, 0 elsewhere on the cluster
  const at = CL.carrier[1] ? 1 : 2, rAt = (i) => (i === at ? 4.5 : CL.inCluster[i] ? 0 : 4.5), vtx = ring.map((_, i) => i)
  const arcs = (tAt) => { const out = []; T.__ease(ring, rAt, null, out, vtx, null, tAt); return out.length }
  const withCl = arcs((s) => (CL.inCluster[s] ? CL.turn[s] * Math.PI / 180 : null)), mutant = arcs(null)
  const ok2 = withCl === mutant + 1
  console.log(`${ok2 ? '✅' : '⛔'} the ease's corner test: ${withCl} arc(s) reading the cluster turn · ${mutant} reading its own 12° (mutant, must be one fewer: the split corner DROPPED)`)
  if (!ok2) red++
  // an owner change on the cluster's GENTLE vertex, with a width change: a corner, so never a width step
  const D = [10, 0], E = add(D, dir(-5), 0.005), F = add(E, dir(-90), 10), sq = [[0, 0], D, E, F, [0, F[1]]]
  const CQ = T.subInkClusters(sq, eps), gentle = CQ.carrier[1] ? 2 : 1
  const own = (i) => ({ skelId: i === gentle ? 'b-0' : i < gentle ? 'a-0' : 'b-0', side: 'right', gradeSeparated: false })
  const depth = (i) => (own(i).skelId === 'a-0' ? 4 : 6)
  const steps = (tAt) => { const rep = { n: 0, steep: [], overlap: 0 }; T.__taper(sq, depth, own, rep, () => false, tAt); return rep.n }
  const s1 = steps((i) => CQ.turn[i] * Math.PI / 180), s0 = steps(null)
  const ok3 = s1 === 0 && s0 > 0
  console.log(`${ok3 ? '✅' : '⛔'} owner change on the cluster's gentle vertex (−5°, cluster ${CQ.turn[gentle].toFixed(1)}°): ${s1} width step(s) reading the cluster turn · ${s0} reading its own (mutant, must be > 0)`)
  if (!ok3) red++
} finally { unlinkSync('src/lib/__splice_cluster.js') }
console.log(red ? '\n⛔ RED' : '\n✅ GREEN — every corner reader reads the cluster turn, and each mutant (the per-vertex turn) goes RED')
process.exit(red ? 1 : 0)
