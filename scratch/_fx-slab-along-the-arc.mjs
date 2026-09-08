// ⛔ DOES THE SHIPPED SLAB'S CORNER CARRY GRASS ACROSS THE ARC, OR ONLY AT ITS FLANKS?
// `_fx-slab-corner-spec.mjs` samples the arc MIDPOINT — which is exactly where an ADA ramp sits,
// so it cannot tell "solid concrete quadrant" from "the walk wraps and a ramp crosses the grass".
// This walks the arc tangent→tangent at N stations and reports where grass sits at the kerb.
// ⛔ Reads the slab only; the build is used ONLY to say where the arcs are.
// ▶ node scratch/_fx-slab-along-the-arc.mjs <slabdir> [scene]
import { feed, buildProto } from './_proto-feed.mjs'
import { matAt } from './_fx-slab-xsection.mjs'
const scene = process.argv[3] || 'lafayette-square'
const f = feed(scene)
const prev = console.log; console.log = () => {}
const T = buildProto(f, { protoArtifact: true }).protoShapeTiles
console.log = prev
const N = 7                                    // stations across the arc, inclusive of both tangents
const profile = (px, pz, nx, nz) => {
  const seq = []
  for (let d = -2; d <= 10; d += 0.05) seq.push([d, matAt(px + nx * d, pz + nz * d)])
  const i0 = seq.findIndex(([, m]) => m === 'walk' || m === 'grass')
  if (i0 < 0) return null
  return seq[i0][1]                            // the FIRST material off the kerb
}
const both = (P, tx, tz) => {
  for (const [nx, nz] of [[-tz, tx], [tz, -tx]]) { const r = profile(P[0], P[1], nx, nz); if (r) return r }
  return null
}
const unit = (a, b) => { const dx = b[0]-a[0], dz = b[1]-a[1], L = Math.hypot(dx,dz)||1; return [dx/L, dz/L] }
const cfg = {}
for (const st of T) {
  const iA = st.iaFull || []
  for (let ri = 0; ri < iA.length; ri++) {
    const ring = iA[ri], n = ring.length, mark = st.iaCorner?.[ri], arc = st.iaArc?.[ri]
    if (!mark || !arc) continue
    const seen = new Set()
    for (let q = 0; q < n; q++) {
      if (!mark[q] || arc[q] == null || seen.has(arc[q])) continue
      seen.add(arc[q])
      let s = q; while (arc[(s-1+n)%n] === arc[q]) { s = (s-1+n)%n; if (s === q) break }
      let e = q; while (arc[(e+1)%n] === arc[q]) { e = (e+1)%n; if (e === q) break }
      const len = ((e - s + n) % n) || 1
      // the two legs, 10 m out past each tangent, to classify the config off the SLAB itself
      const march = (from, dir) => { let i = from, d = 0
        for (let k = 0; k < n; k++) { const j = (i+dir+n)%n
          d += Math.hypot(ring[j][0]-ring[i][0], ring[j][1]-ring[i][1]); i = j; if (d >= 10) break } return i }
      const ia = march(s,-1), ib = march(e,+1)
      const tan = (i) => unit(ring[(i-1+n)%n], ring[(i+1)%n])
      const kindOf = (i) => { const t = tan(i); const m = both(ring[i], t[0], t[1]); return m === 'walk' ? 'SW' : m === 'grass' ? 'TL' : null }
      const A = kindOf(ia), B = kindOf(ib); if (!A || !B) continue
      const key = [A,B].sort().join('↔')
      const a = cfg[key] || (cfg[key] = { n: 0, station: Array(N).fill(0), seen: Array(N).fill(0) })
      a.n++
      for (let k = 0; k < N; k++) {
        // ⛔ STRICTLY INSIDE THE ARC. The tangent VERTICES are shared with the legs, so a station
        // placed on them reads the LEG's cross-section and reports it as the corner's — which is
        // how a "dip" appears in data that has none. Stations run over the arc's interior only.
        const idx = (s + 1 + Math.round(k * Math.max(0, len - 2) / (N-1))) % n
        const t = tan(idx), m = both(ring[idx], t[0], t[1])
        if (!m) continue
        a.seen[k]++; if (m === 'grass') a.station[k]++
      }
    }
  }
}
console.log(`SHIPPED SLAB — first material off the kerb, sampled ACROSS each corner arc (${N} stations, tangent→tangent)\n`)
for (const key of Object.keys(cfg).sort()) {
  const a = cfg[key]
  console.log(`══ ${key} · ${a.n} corners`)
  console.log('   station:      tA' + '      '.repeat(0) + [...Array(N-2)].map((_,i)=>`  ${i+1}  `).join('') + '   tB')
  console.log('   grass at kerb: ' + a.station.map((v,i)=> a.seen[i] ? String(Math.round(100*v/a.seen[i])).padStart(4)+'%' : '   –').join(''))
}
