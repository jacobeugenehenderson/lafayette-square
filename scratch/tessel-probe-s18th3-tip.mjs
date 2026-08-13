// READ-ONLY. What does south-18th-street-3's dead-end actually look like in the
// frozen artifact — ring, edges, caps, and the mouth?  node scratch/tessel-probe-s18th3-tip.mjs
import fs from 'fs'
const o = console.log
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8'))
const TARGET = process.argv[2] || 'south-18th-street-3'

const st = ribbons.streets.find(s => (s.skelId || s.name) === TARGET)
o(`chain ${TARGET}: ${st.points.length} pts, measure L.pav=${st.measure?.left?.pavementHW} R.pav=${st.measure?.right?.pavementHW}`)
o(`  start ${JSON.stringify(st.points[0].map(v => +v.toFixed(2)))}  end ${JSON.stringify(st.points[st.points.length - 1].map(v => +v.toFixed(2)))}`)
const bc = design.blockCustoms?.[TARGET]
o(`  blockCustoms: ${bc ? JSON.stringify(bc) : 'none'}`)

// degree of each endpoint over the face graph
const K = (p) => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4)
const deg = new Map()
for (const s of ribbons.streets) {
  if (!(s.points?.length >= 2) || s.gradeSeparated) continue
  for (let i = 0; i < s.points.length; i++) deg.set(K(s.points[i]), (deg.get(K(s.points[i])) || 0) + ((i === 0 || i === s.points.length - 1) ? 1 : 2))
}
o(`  endpoint degrees: start=${deg.get(K(st.points[0]))}  end=${deg.get(K(st.points[st.points.length - 1]))}`)

ribbons.tiles.forEach((t, ti) => {
  const caps = (t.caps || []).filter(c => c.skelId === TARGET)
  if (!caps.length) return
  o(`\n── tile ${ti}: ${t.ring.length} ring verts, ${t.edges.length} edges, caps ${JSON.stringify(t.caps)}`)
  for (const c of caps) {
    const n = t.ring.length
    o(`   cap at vertexIdx ${c.vertexIdx} (${c.capEnd}) — ring window:`)
    for (let d = -4; d <= 4; d++) {
      const i = (c.vertexIdx + d + n * 2) % n
      const p = t.ring[i], e = t.edges[i]
      const prev = t.ring[(i - 1 + n) % n]
      const seg = Math.hypot(p[0] - prev[0], p[1] - prev[1])
      o(`      ${d === 0 ? '►' : ' '} v${String(i).padStart(3)} (${p[0].toFixed(2)}, ${p[1].toFixed(2)})  d(prev)=${seg.toFixed(3)}  outgoing edge → ${e.skelId} | ${e.side}`)
    }
    // the MOUTH: the other vertex where the same chain's two sides meet the
    // through street — walk outward from the cap until the skelId changes.
    let i = c.vertexIdx
    let fwd = 0; while (t.edges[(c.vertexIdx + fwd) % n]?.skelId === TARGET && fwd < n) fwd++
    let bwd = 0; while (t.edges[(c.vertexIdx - 1 - bwd + n * 2) % n]?.skelId === TARGET && bwd < n) bwd++
    const mOut = (c.vertexIdx + fwd) % n, mIn = (c.vertexIdx - bwd + n * 2) % n
    o(`   spur runs ${bwd} edges in / ${fwd} edges out of the cap`)
    o(`   mouth A v${mIn}  (${t.ring[mIn][0].toFixed(3)}, ${t.ring[mIn][1].toFixed(3)})   incoming edge ${t.edges[(mIn - 1 + n) % n].skelId}|${t.edges[(mIn - 1 + n) % n].side}`)
    o(`   mouth B v${mOut} (${t.ring[mOut][0].toFixed(3)}, ${t.ring[mOut][1].toFixed(3)})   outgoing edge ${t.edges[mOut].skelId}|${t.edges[mOut].side}`)
    o(`   mouth A ≡ mouth B ? ${Math.hypot(t.ring[mIn][0] - t.ring[mOut][0], t.ring[mIn][1] - t.ring[mOut][1]).toFixed(6)} m apart`)
  }
})
