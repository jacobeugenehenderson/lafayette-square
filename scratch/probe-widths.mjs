#!/usr/bin/env node
// Does the carriageway's outboard half-width match the spine half-width it
// continues into? Compute both outer-curb endpoints AT the shared node and the
// gap between them. If they don't coincide, a single-offset weld stroke can't be
// parallel across the join.
import fs from 'fs'
const r = JSON.parse(fs.readFileSync('./src/data/ribbons.json'))
const byId = new Map(r.streets.map(s => [s.skelId, s]))
const k3 = (p) => `${Math.round(p[0]*1000)},${Math.round(p[1]*1000)}`
const eq = (a, b) => k3(a) === k3(b)
const norm = (t) => { const L = Math.hypot(t[0], t[1]) || 1; return [t[0]/L, t[1]/L] }
const perp = (t, side) => side === 'right' ? [-t[1], t[0]] : [t[1], -t[0]]

function tangentAtEnd(pts, atStart) {
  // unit tangent pointing AWAY from the endpoint into the chain
  if (atStart) { const t = norm([pts[1][0]-pts[0][0], pts[1][1]-pts[0][1]]); return t }
  const n = pts.length; const t = norm([pts[n-1][0]-pts[n-2][0], pts[n-1][1]-pts[n-2][1]]); return t
}

for (const cwId of ['lafayette-avenue-2','lafayette-avenue-4','park-avenue-0','park-avenue-3']) {
  const cw = byId.get(cwId), ph = cw.phase
  const end = ph.spineAtEnd ? 'end' : 'start'
  const spId = ph.spineAtEnd || ph.spineAtStart
  const sp = byId.get(spId)
  const node = end === 'end' ? cw.points[cw.points.length-1] : cw.points[0]
  const outboard = cw.innerSign === +1 ? 'left' : 'right'
  const cwHW = cw.measure?.[outboard]?.pavementHW || 0
  // carriageway tangent at the node (forward = along cw.points direction)
  const cwT = end === 'end' ? tangentAtEnd(cw.points, false) : norm([-tangentAtEnd(cw.points, true)[0], -tangentAtEnd(cw.points, true)[1]])
  // actually: forward tangent at node = direction of travel passing THROUGH node.
  // Use segment adjacent to node, oriented along cw.points.
  const fT = end === 'end'
    ? norm([cw.points[cw.points.length-1][0]-cw.points[cw.points.length-2][0], cw.points[cw.points.length-1][1]-cw.points[cw.points.length-2][1]])
    : norm([cw.points[1][0]-cw.points[0][0], cw.points[1][1]-cw.points[0][1]])
  const cwOuter = [node[0] + perp(fT, outboard)[0]*cwHW, node[1] + perp(fT, outboard)[1]*cwHW]

  // spine: which physical side does cwOuter land on? compute both spine curbs at node.
  const spAtStart = eq(sp.points[0], node)
  const spT = spAtStart
    ? norm([sp.points[1][0]-sp.points[0][0], sp.points[1][1]-sp.points[0][1]])
    : norm([sp.points[sp.points.length-1][0]-sp.points[sp.points.length-2][0], sp.points[sp.points.length-1][1]-sp.points[sp.points.length-2][1]])
  const spL = sp.measure?.left?.pavementHW || 0, spR = sp.measure?.right?.pavementHW || 0
  const spLeft  = [node[0]+perp(spT,'left')[0]*spL,  node[1]+perp(spT,'left')[1]*spL]
  const spRight = [node[0]+perp(spT,'right')[0]*spR, node[1]+perp(spT,'right')[1]*spR]
  const dL = Math.hypot(cwOuter[0]-spLeft[0], cwOuter[1]-spLeft[1])
  const dR = Math.hypot(cwOuter[0]-spRight[0], cwOuter[1]-spRight[1])
  const onSide = dL < dR ? 'left' : 'right'
  const matchHW = onSide === 'left' ? spL : spR
  const gap = Math.min(dL, dR)
  console.log(`${cwId.padEnd(20)} outboard=${outboard} cwHW=${cwHW.toFixed(2)}  → spine ${spId} side=${onSide} spineHW=${matchHW.toFixed(2)}  endpoint-gap=${gap.toFixed(2)}m  (ΔHW=${(matchHW-cwHW).toFixed(2)})`)
}
