// ⛔ THE NEW BUILD AGAINST THE SHIPPED SLAB, AT EVERY CORNER — one enumeration, two testers, the
// same march. The slab is the reference (the map whose corners were correct); the build is what
// `sectionPassProtoTile` paints today. Neither side is restated: both are point-sampled.
// ▶ node scratch/_fx-build-vs-slab.mjs <slabdir> [scene]
import { feed, buildProto } from './_proto-feed.mjs'
import { matAt as slabAt } from './_fx-slab-xsection.mjs'
const SLAB = process.argv[2], scene = process.argv[3] || 'lafayette-square'
const BARE = process.argv.includes('--bare')
const R = buildProto(feed(scene), { protoArtifact: true, bare: BARE })
const T = R.protoShapeTiles

// ── the build's own point tester: even-odd across a layer's rings, bbox-gridded
const mkTester = (rings) => {
  const CELL = 8, idx = new Map(), keep = []
  for (const rg of rings) { if (!rg || rg.length < 3) continue
    const id = keep.length; keep.push(rg)
    const xs = rg.map(p => p[0]), zs = rg.map(p => p[1])
    for (let cx = Math.floor(Math.min(...xs)/CELL); cx <= Math.floor(Math.max(...xs)/CELL); cx++)
      for (let cz = Math.floor(Math.min(...zs)/CELL); cz <= Math.floor(Math.max(...zs)/CELL); cz++) {
        const k = cx+'|'+cz; (idx.get(k) || idx.set(k, []).get(k)).push(id) } }
  const inRing = (rg, x, y) => { let c = false
    for (let i = 0, j = rg.length - 1; i < rg.length; j = i++) { const [a,b] = rg[i], [e,d] = rg[j]
      if ((b > y) !== (d > y) && x < (e-a)*(y-b)/(d-b)+a) c = !c } return c }
  return (x, z) => { let n = 0
    for (const id of idx.get(Math.floor(x/CELL)+'|'+Math.floor(z/CELL)) || []) if (inRing(keep[id], x, z)) n++
    return n % 2 === 1 }
}
const isWalk = mkTester(R.sidewalk || [])
const isGrass = mkTester(Object.values(R.treelawnByLu || {}).flat())
const buildAt = (x, z) => isWalk(x, z) ? 'walk' : isGrass(x, z) ? 'grass' : '-'

const profile = (at, px, pz, nx, nz) => {
  const seq = []
  for (let d = -2; d <= 10; d += 0.05) seq.push([d, at(px + nx*d, pz + nz*d)])
  const i0 = seq.findIndex(([, m]) => m === 'walk' || m === 'grass'); if (i0 < 0) return null
  const z0 = seq[i0][0]
  const span = (cls) => { const h = seq.filter(([d, m]) => m === cls && d >= z0 - 1e-9)
    return h.length ? [h[0][0]-z0, h[h.length-1][0]-z0] : null }
  return { walk: span('walk'), grass: span('grass') }
}
const both = (at, P, t) => { for (const [nx,nz] of [[-t[1],t[0]],[t[1],-t[0]]]) { const r = profile(at,P[0],P[1],nx,nz); if (r) return r } return null }
const unit = (a,b) => { const dx=b[0]-a[0], dz=b[1]-a[1], L=Math.hypot(dx,dz)||1; return [dx/L,dz/L] }

const rows = [], legs = []
for (let ti = 0; ti < T.length; ti++) { const st = T[ti], iA = st.iaFull || []
  for (let ri = 0; ri < iA.length; ri++) {
    const ring = iA[ri], n = ring.length, mark = st.iaCorner?.[ri], arc = st.iaArc?.[ri]
    if (!mark || !arc) continue
    const seen = new Set()
    for (let q = 0; q < n; q++) {
      if (!mark[q] || arc[q] == null || seen.has(arc[q])) continue
      seen.add(arc[q])
      let s = q; while (arc[(s-1+n)%n] === arc[q]) { s = (s-1+n)%n; if (s === q) break }
      let e = q; while (arc[(e+1)%n] === arc[q]) { e = (e+1)%n; if (e === q) break }
      const len = ((e-s+n)%n) || 1, mid = (s + Math.floor(len/2)) % n
      const tanAt = (i) => unit(ring[(i-1+n)%n], ring[(i+1)%n])
      const march = (from, dir) => { let i = from, d = 0
        for (let k = 0; k < n; k++) { const j = (i+dir+n)%n
          d += Math.hypot(ring[j][0]-ring[i][0], ring[j][1]-ring[i][1]); i = j; if (d >= 10) break } return i }
      const ia = march(s,-1), ib = march(e,+1)
      const S = { C: both(slabAt, ring[mid], tanAt(mid)), A: both(slabAt, ring[ia], tanAt(ia)), B: both(slabAt, ring[ib], tanAt(ib)) }
      const B = { C: both(buildAt, ring[mid], tanAt(mid)), A: both(buildAt, ring[ia], tanAt(ia)), B: both(buildAt, ring[ib], tanAt(ib)) }
      if (!S.A?.walk || !S.B?.walk || !S.C?.walk || !B.C?.walk) continue
      const kind = (r) => (r.grass && r.grass[0] < 0.35) ? 'TL' : 'SW'
      // the corner's TURN: the angle between the two legs' directions of travel
      const dA = unit(ring[ia], ring[s]), dB = unit(ring[e], ring[ib])
      const turn = Math.acos(Math.max(-1, Math.min(1, dA[0]*dB[0] + dA[1]*dB[1]))) * 180 / Math.PI
      if (B.A?.walk && B.B?.walk) { legs.push([kind(S.A), kind(B.A)]); legs.push([kind(S.B), kind(B.B)]) }
      rows.push({ turn, V: ring[mid], ti, cfg: [kind(S.A), kind(S.B)].sort().join('↔'), slab: S.C.walk[1], build: B.C.walk[1],
        lo: Math.min(S.A.walk[1], S.B.walk[1]), hi: Math.max(S.A.walk[1], S.B.walk[1]),
        bGrassKerb: !!(B.C.grass && B.C.grass[0] < 0.35), sGrassKerb: !!(S.C.grass && S.C.grass[0] < 0.35) })
    }
  }
}
const med = (a) => a.length ? a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)] : NaN
const bad = rows.filter(r => Math.abs(r.build - r.slab) > 0.30)
console.log(`corners compared: ${rows.length} · diverging >0.30 m: ${bad.length} · AUTHORING ${BARE ? 'OFF (bare / best-guess defaults)' : 'ON (your live design.json)'}\n`)
const bins = [[0,60,'shallow  <60'],[60,80,'  60-80'],[80,100,'SQUARE 80-100'],[100,120,' 100-120'],[120,181,'  >120']]
console.log('   turn angle       corners   diverging   rate')
for (const [lo,hi,lab] of bins) {
  const all = rows.filter(r => r.turn >= lo && r.turn < hi)
  const d = all.filter(r => Math.abs(r.build - r.slab) > 0.30)
  if (all.length) console.log(`   ${lab.padEnd(16)} ${String(all.length).padStart(5)} ${String(d.length).padStart(10)}   ${(100*d.length/all.length).toFixed(0)}%`)
}
console.log('\n   worst, by |build - slab| — shoot these:')
for (const r of bad.sort((x,y)=>Math.abs(y.build-y.slab)-Math.abs(x.build-x.slab)).slice(0,12))
  console.log(`     tile ${String(r.ti).padStart(3)}  ${r.cfg.padEnd(6)} turn ${r.turn.toFixed(0).padStart(3)}°  slab ${r.slab.toFixed(2)}  build ${r.build.toFixed(2)}   --at ${r.V[0].toFixed(1)},${r.V[1].toFixed(1)}`)

// ── THE LEG ARRANGEMENT ITSELF: does the build agree with the shipped map about which side the
// walk is on? ⛔ This is upstream of the corner — a corner between two mis-resolved legs cannot be
// right whatever the corner does.
const tally = {}
for (const [sl, bu] of legs) { const k = `slab ${sl} → build ${bu}`; tally[k] = (tally[k] || 0) + 1 }
console.log('\n══ LEG ARRANGEMENT, slab vs build · ' + legs.length + ' legs')
for (const k of Object.keys(tally).sort()) console.log(`   ${k.padEnd(26)} ${tally[k]}`)
const same = legs.filter(([a,b]) => a === b).length
console.log(`   AGREE ${same} of ${legs.length}  (${(100*same/legs.length).toFixed(0)}%)`)
