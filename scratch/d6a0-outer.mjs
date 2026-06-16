// D6a.0b — does the OUTER EDGE run straight through the node?
// The welded centerline bends ~14° because carriageways are inner-edge anchored
// (full width 6.86) and the spine is center anchored (half width). Offset each
// piece from ITS OWN reference at ITS OWN width on the shared physical outboard
// side, then measure the bend of the resulting outer-edge line at the node.
import fs from 'fs'
const r = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const byId = new Map(r.streets.map(s => [s.skelId, s]))
const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3
const ang = (dx, dy) => Math.atan2(dy, dx) * 180 / Math.PI
function bend(prev, node, next) {
  let d = ang(next[0] - node[0], next[1] - node[1]) - ang(node[0] - prev[0], node[1] - prev[1])
  while (d > 180) d -= 360; while (d < -180) d += 360; return d
}
// one-sided offset of a polyline: each vertex shifted along its bisector normal.
// sign = +1 → left of travel, -1 → right of travel.
function offsetSide(pts, width, sign) {
  const n = pts.length, out = []
  const segN = []
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1]
    const L = Math.hypot(dx, dy) || 1
    segN.push([-dy / L * sign, dx / L * sign]) // left-normal * sign
  }
  for (let i = 0; i < n; i++) {
    let nx, ny
    if (i === 0) [nx, ny] = segN[0]
    else if (i === n - 1) [nx, ny] = segN[n - 2]
    else { nx = segN[i - 1][0] + segN[i][0]; ny = segN[i - 1][1] + segN[i][1]
           const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L
           const cos = nx * segN[i][0] + ny * segN[i][1]; const k = cos > 0.2 ? 1 / cos : 1; nx *= k; ny *= k }
    out.push([pts[i][0] + nx * width, pts[i][1] + ny * width])
  }
  return out
}

const NODE = [166.5, 221.9]
const carA = byId.get('lafayette-avenue-5')   // inner-edge, full width right=6.858
const spine = byId.get('lafayette-avenue-3')  // center, right=7.90 / left=10.59
const carB = byId.get('lafayette-avenue-6')

// physical outboard = away from the OTHER carriageway (median is between A and B).
// determine the sign for carA at the node by testing which side moves away from carB's near point.
const carBnearNode = carB.points.reduce((b, p) => Math.hypot(p[0]-NODE[0],p[1]-NODE[1]) < Math.hypot(b[0]-NODE[0],b[1]-NODE[1]) ? p : b, carB.points[0])
function outboardSign(pts, width) {
  // test both signs at the vertex nearest NODE; outboard = farther from carBnearNode
  const i = pts.reduce((bi, p, idx) => Math.hypot(p[0]-NODE[0],p[1]-NODE[1]) < Math.hypot(pts[bi][0]-NODE[0],pts[bi][1]-NODE[1]) ? idx : bi, 0)
  const oL = offsetSide(pts, width, +1)[i], oR = offsetSide(pts, width, -1)[i]
  const dL = Math.hypot(oL[0]-carBnearNode[0], oL[1]-carBnearNode[1])
  const dR = Math.hypot(oR[0]-carBnearNode[0], oR[1]-carBnearNode[1])
  return dL > dR ? +1 : -1
}

const carAhw = carA.measure.right.pavementHW          // 6.858 full width (inner-edge anchored)
const spineHwR = spine.measure.right.pavementHW        // 7.90 half width (center anchored)
const spineHwL = spine.measure.left.pavementHW         // 10.59

const signA = outboardSign(carA.points, carAhw)
console.log('outboard sign for carriageway-A:', signA, '(width', carAhw.toFixed(2), ')')

// carriageway-A outer edge near node (last 2 verts approaching node, since carA starts at node)
const aOuter = offsetSide(carA.points, carAhw, signA)
// spine outer edge: spine ends at node; physical-outboard side = same physical side as carA.
// test both spine widths/signs, pick the offset whose node-point is nearest carA-outer node-point.
const aOuterNode = aOuter[0]  // carA.points[0] === NODE
const spineEndsAtNode = same(spine.points[spine.points.length-1], NODE)
console.log('spine ends at node?', spineEndsAtNode)
const cand = []
for (const sign of [+1,-1]) for (const [lbl,w] of [['R',spineHwR],['L',spineHwL]]) {
  const o = offsetSide(spine.points, w, sign)
  const end = o[o.length-1]
  cand.push({ sign, lbl, w, end, d: Math.hypot(end[0]-aOuterNode[0], end[1]-aOuterNode[1]) })
}
cand.sort((a,b)=>a.d-b.d)
console.log('spine outer-edge candidates (nearest carA-outer node first):')
for (const c of cand) console.log(`  sign ${c.sign} ${c.lbl} w=${c.w.toFixed(2)}  endsAt [${c.end[0].toFixed(1)}, ${c.end[1].toFixed(1)}]  gap=${c.d.toFixed(2)}m`)

const best = cand[0]
const spineOuter = offsetSide(spine.points, best.w, best.sign)
// bend of the OUTER edge at the node: spine-outer second-to-last → node-region → carA-outer second
const prev = spineOuter[spineOuter.length-2]
const nodeOuter = aOuterNode
const next = aOuter[1]
console.log('\nOUTER-EDGE bend at node:', bend(prev, nodeOuter, next).toFixed(1), '°   (vs 14.4° centerline weld)')
console.log('gap between spine-outer end and carA-outer start:', best.d.toFixed(2), 'm   (0 = clean outer continuity)')
