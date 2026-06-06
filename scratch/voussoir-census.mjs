// Census: post-E2 state of every divided transition end — fold spikes in the
// BLOCK polygon (iA) and the asphalt boundary near each node. Re-runs
// Alidade's pre-E2 join census (14/24 nodes folding) on the post-E2 build.
import { build, transitionEnds, turnDeg } from './voussoir-setup.mjs'
const g = build()
const art = g._shapeArtifact
const ends = transitionEnds()
// dedup to nodes
const nodes = new Map()
for (const e of ends) {
  const k = e.p[0].toFixed(1) + ',' + e.p[1].toFixed(1)
  if (!nodes.has(k)) nodes.set(k, { p: e.p, ends: [] })
  nodes.get(k).ends.push(e.id + ':' + e.end + '->' + e.spine)
}
console.log('transition ends:', ends.length, ' distinct nodes:', nodes.size)
const RAD = 22
let folding = 0
for (const [k, nd] of nodes) {
  const near = (p) => Math.hypot(p[0] - nd.p[0], p[1] - nd.p[1]) < RAD
  // block-polygon spikes (iA) near node, across all tiles
  const spikes = []
  for (const st of art) {
    for (const ia of (st.iA || [])) {
      for (let i = 0; i < ia.length; i++) {
        if (!near(ia[i])) continue
        const t = turnDeg(ia[(i - 1 + ia.length) % ia.length], ia[i], ia[(i + 1) % ia.length])
        if (t > 120) spikes.push({ p: ia[i], t })
      }
    }
  }
  // asphalt boundary spikes near node
  const aspikes = []
  for (const r of g.asphalt) {
    for (let i = 0; i < r.length; i++) {
      if (!near(r[i])) continue
      const t = turnDeg(r[(i - 1 + r.length) % r.length], r[i], r[(i + 1) % r.length])
      if (t > 120) aspikes.push({ p: r[i], t })
    }
  }
  if (spikes.length || aspikes.length) folding++
  console.log(
    (spikes.length || aspikes.length ? 'FOLD ' : 'ok   ') + k.padEnd(16),
    'iA>120°:', spikes.length, spikes.slice(0, 3).map(s => `[${s.p[0].toFixed(1)},${s.p[1].toFixed(1)}]${s.t.toFixed(0)}°`).join(' '),
    '| asphalt>120°:', aspikes.length, aspikes.slice(0, 3).map(s => `[${s.p[0].toFixed(1)},${s.p[1].toFixed(1)}]${s.t.toFixed(0)}°`).join(' '),
    '|', nd.ends.join(' '))
}
console.log('\nnodes with >120° spikes within ' + RAD + 'm:', folding, '/', nodes.size)
