// Deep-dive one fold-at-join: which construction step manufactures the spike?
// Dumps: the chains near the node, the tile rings + runs (extractFaces output),
// the merge/median clips, the per-tile aFill boundary, iA.
import { build, R, turnDeg } from './voussoir-setup.mjs'
const J = process.argv[2] ? process.argv[2].split(',').map(Number) : [481.9, 272.1]
const RAD = Number(process.argv[3] || 25)
const near = (p, r = RAD) => Math.hypot(p[0] - J[0], p[1] - J[1]) < r
console.log('node', J)
// 1. chains at the node
for (const s of R.streets) {
  if (!s.points?.some(p => near(p, 1))) continue
  const ph = s.phase || {}
  const m = s.measure
  console.log(`chain ${s.skelId} role=${ph.role || '-'} anchor=${s.anchor || '-'} innerSign=${s.innerSign ?? '-'}`,
    `hwL=${m?.left?.pavementHW?.toFixed(2)} hwR=${m?.right?.pavementHW?.toFixed(2)}`,
    `spineAtStart=${ph.spineAtStart || '-'} spineAtEnd=${ph.spineAtEnd || '-'}`)
  // taper geometry: points within RAD of node
  const pts = s.points.filter(p => near(p))
  console.log('   pts near:', pts.map(p => `[${p[0].toFixed(1)},${p[1].toFixed(1)}]`).join(' '))
}
// 2. medians/merge near node
for (const m of (R.medians || [])) {
  if (!m.ring?.some(p => near(p))) continue
  const xs = m.ring.map(p => p[0]), zs = m.ring.map(p => p[1])
  console.log(`median kind=${m.kind} ${m.name} chains=${m.chains?.join('+')} bbox x[${Math.min(...xs).toFixed(0)},${Math.max(...xs).toFixed(0)}] z[${Math.min(...zs).toFixed(0)},${Math.max(...zs).toFixed(0)}] (${m.ring.length}pt)`)
}
const g = build()
const art = g._shapeArtifact
// 3. tiles touching node region
art.forEach((st, ti) => {
  if (!st.ring.some(p => near(p))) return
  const spikes = []
  for (let i = 0; i < st.ring.length; i++) {
    if (!near(st.ring[i])) continue
    const t = turnDeg(st.ring[(i - 1 + st.ring.length) % st.ring.length], st.ring[i], st.ring[(i + 1) % st.ring.length])
    if (t > 60) spikes.push(`[${st.ring[i][0].toFixed(1)},${st.ring[i][1].toFixed(1)}]${t.toFixed(0)}°`)
  }
  const iaSpikes = []
  for (const ia of (st.iA || [])) for (let i = 0; i < ia.length; i++) {
    if (!near(ia[i])) continue
    const t = turnDeg(ia[(i - 1 + ia.length) % ia.length], ia[i], ia[(i + 1) % ia.length])
    if (t > 90) iaSpikes.push(`[${ia[i][0].toFixed(1)},${ia[i][1].toFixed(1)}]${t.toFixed(0)}°`)
  }
  console.log(`TILE#${ti} ring=${st.ring.length}pt med=${st.med ? 'Y' : 'n'} runs=[${st.runs.map(r => r.skelId + '/' + r.side).join(' ')}]`)
  if (spikes.length) console.log('   RING turns>60° near node:', spikes.join(' '))
  if (iaSpikes.length) console.log('   iA spikes>90°:', iaSpikes.join(' '))
})
// 4. asphalt boundary spikes near node — locate exactly
for (const r of g.asphalt) {
  for (let i = 0; i < r.length; i++) {
    if (!near(r[i])) continue
    const t = turnDeg(r[(i - 1 + r.length) % r.length], r[i], r[(i + 1) % r.length])
    if (t > 150) {
      const a = r[(i - 1 + r.length) % r.length], c = r[(i + 1) % r.length]
      console.log(`ASPHALT spike ${t.toFixed(0)}° at [${r[i][0].toFixed(2)},${r[i][1].toFixed(2)}] prev[${a[0].toFixed(2)},${a[1].toFixed(2)}] next[${c[0].toFixed(2)},${c[1].toFixed(2)}]`)
    }
  }
}
