#!/usr/bin/env node
// ⭐⭐⭐ THE EASE IS THE CORNER TEST. `iaCorner` used to be "① TURNS *and* the owner changes" — a
// chain identity (`protoOwners[].skelId`) overruling a question about a SHAPE. This scores the two
// against each other: of the arcs the EASE actually made, how many does the label license?
// ⛔ It READS both sides off the artifact and restates neither: the arcs come from `iaArc` (stamped
// by the ease that made them) and the licence from `iaCorner`. It cannot go stale against a rule
// change because it never encodes the rule.
// ▶ node scratch/claims-the-ease-is-the-corner.mjs [scene]
import { feed, buildProto } from './_proto-feed.mjs'
const scene = process.argv[2] || 'lafayette-square'
const f = feed(scene); if (!f) process.exit(1)
const prev = console.log; console.log = () => {}
const R = buildProto(f, { quiet: true, protoArtifact: true }); console.log = prev
const ang = (a, b, c) => { const u = [b[0]-a[0], b[1]-a[1]], v = [c[0]-b[0], c[1]-b[1]]
  return Math.acos(Math.max(-1, Math.min(1, (u[0]*v[0]+u[1]*v[1]) / ((Math.hypot(...u)||1)*(Math.hypot(...v)||1))))) * 180/Math.PI }
const L = [], Rf = []
for (const st of R.protoShapeTiles) {
  const iA = st.iaFull || []
  for (let ri = 0; ri < iA.length; ri++) {
    const ring = iA[ri], n = ring.length, mark = st.iaCorner?.[ri], arc = st.iaArc?.[ri]
    if (!arc) continue
    const byArc = new Map()
    for (let q = 0; q < n; q++) { const id = arc[q]; if (id == null) continue
      const e = byArc.get(id) || byArc.set(id, { turn: 0, ok: false }).get(id)
      e.turn += ang(ring[(q-1+n)%n], ring[q], ring[(q+1)%n])
      if (mark?.[q]) e.ok = true }
    for (const [, e] of byArc) (e.ok ? L : Rf).push(e.turn)
  }
}
const tot = L.length + Rf.length
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length-1, Math.floor(b.length*p))] : NaN }
const line = (nm, a) => console.log(`   ${nm.padEnd(24)} ${String(a.length).padStart(5)} (${(100*a.length/tot).toFixed(1)}%)  turn: p10 ${q(a,.1).toFixed(0)}° · median ${q(a,.5).toFixed(0)}° · p90 ${q(a,.9).toFixed(0)}°`)
console.log(`${scene}: ${tot} arcs the EASE made`)
line('licensed ⇒ a ramp', L)
line('⛔ REFUSED ⇒ no ramp', Rf)
// ⛔ THE POINT OF THE TURN COLUMN: a refusal is only defensible if the refused arcs are NOT corners.
// When the two rows carry the same median turn, the label is vetoing square street corners.
if (Rf.length) {
  const same = Math.abs(q(L,.5) - q(Rf,.5)) < 15
  console.log(same
    ? `   ⛔ the refused arcs turn like the licensed ones (${q(Rf,.5).toFixed(0)}° vs ${q(L,.5).toFixed(0)}°) — these are CORNERS, and a refusal is a MISSING ADA RAMP.`
    : `   ⚠️ refused arcs turn ${q(Rf,.5).toFixed(0)}° against ${q(L,.5).toFixed(0)}° licensed — inspect before assuming either way.`)
} else console.log('   ✅ every arc the ease made carries a ramp.')
