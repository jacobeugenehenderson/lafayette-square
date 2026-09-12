// ⛔ WHICH STRIP IS AT THE KERB — the build against the shipped slab, town-wide, at fixed stations.
// Depends on nothing but the contour and the painted layers, so it runs at ANY commit: the corner
// stamps (`iaCorner`/`iaArc`) did not exist a day ago and a corner-keyed probe reports 0 there.
// ▶ node scratch/_fx-leg-agreement.mjs <slabdir> [scene] [--bare]
import { feed, buildProto } from './_proto-feed.mjs'
import { buildTileGround as bt } from '../src/lib/tileGround.js'
import { matAt as slabAt } from './_fx-slab-xsection.mjs'
const SLAB = process.argv[2], scene = (process.argv[3] || 'lafayette-square').replace(/^--.*/, 'lafayette-square')
const BARE = process.argv.includes('--bare')
const LEGACY = process.argv.includes('--legacy')
// ⭐ SAME TREE, TWO PAINTERS. `grout: undefined` runs the legacy tile walk — the construction the
// shipped slab was poured from — so the comparison isolates the PAINTER, not a commit.
const R = LEGACY ? (() => { const prev = console.log; console.log = () => {}
    try { return bt(feed(scene).ribbons, { smooth: 0, curbWidth: feed(scene).curbWidth,
      blockCustoms: BARE ? null : feed(scene).blockCustoms }) } finally { console.log = prev } })()
  : buildProto(feed(scene), { protoArtifact: true, bare: BARE })
const mkTester = (rings) => {
  const CELL = 8, idx = new Map(), keep = []
  for (const rg of rings) { if (!rg || rg.length < 3) continue
    const id = keep.length; keep.push(rg)
    const xs = rg.map(p => p[0]), zs = rg.map(p => p[1])
    for (let cx = Math.floor(Math.min(...xs)/CELL); cx <= Math.floor(Math.max(...xs)/CELL); cx++)
      for (let cz = Math.floor(Math.min(...zs)/CELL); cz <= Math.floor(Math.max(...zs)/CELL); cz++) {
        const k = cx+'|'+cz; (idx.get(k) || idx.set(k, []).get(k)).push(id) } }
  const inRing = (rg,x,y) => { let c=false
    for (let i=0,j=rg.length-1;i<rg.length;j=i++){const [a,b]=rg[i],[e,d]=rg[j]
      if ((b>y)!==(d>y) && x<(e-a)*(y-b)/(d-b)+a) c=!c} return c }
  return (x,z) => { let n=0
    for (const id of idx.get(Math.floor(x/CELL)+'|'+Math.floor(z/CELL)) || []) if (inRing(keep[id],x,z)) n++
    return n%2===1 } }
const isWalk = mkTester(R.sidewalk || []), isGrass = mkTester(Object.values(R.treelawnByLu || {}).flat())
const buildAt = (x,z) => isWalk(x,z) ? 'walk' : isGrass(x,z) ? 'grass' : '-'
const kindOf = (at, px, pz, nx, nz) => {
  const seq = []
  for (let d = -2; d <= 8; d += 0.05) seq.push([d, at(px+nx*d, pz+nz*d)])
  const i0 = seq.findIndex(([,m]) => m==='walk' || m==='grass'); if (i0 < 0) return null
  const z0 = seq[i0][0]
  const g = seq.find(([d,m]) => m==='grass' && d>=z0)
  return (g && g[0]-z0 < 0.35) ? 'TL' : 'SW' }
const at2 = (P, t) => { for (const [nx,nz] of [[-t[1],t[0]],[t[1],-t[0]]]) {
    const a = kindOf(slabAt,P[0],P[1],nx,nz), b = kindOf(buildAt,P[0],P[1],nx,nz)
    if (a && b) return [a,b] } return null }
// ⛔⛔ THE STATIONS MUST NOT COME FROM THE BUILD. Derived from `protoShapeTiles`, they exist only
// once ① is the producer — so the probe reported 0 at every commit before the change it is meant
// to bisect, i.e. it was blind exactly where the answer is. Frozen once, reused everywhere: a
// station is a point and a tangent in world space and belongs to neither painter.
// ▶ regenerate with --dump-stations (from a commit that has ①); it is then commit-independent.
import fsx from 'fs'
const STF = 'scratch/_fx-stations.json'
let STATIONS = null
if (fsx.existsSync(STF) && !process.argv.includes('--dump-stations')) STATIONS = JSON.parse(fsx.readFileSync(STF, 'utf8'))
const T = R.protoShapeTiles || R._tiles || []
const tally = {}; let n = 0; const OUT = []
if (STATIONS) {
  for (const [px, pz, tx, tz] of STATIONS) {
    const r = at2([px, pz], [tx, tz]); if (!r) continue
    const k = `slab ${r[0]} → build ${r[1]}`; tally[k] = (tally[k]||0)+1; n++ }
} else
for (const st of T) for (const ring of (st.iaFull || st.iA || [])) {
  if (!ring || ring.length < 3) continue
  let acc = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i+1)%ring.length]
    const L = Math.hypot(b[0]-a[0], b[1]-a[1]); if (L < 1e-6) continue
    const t = [(b[0]-a[0])/L, (b[1]-a[1])/L]
    for (let s = 0; s < L; s += 1) { acc += 1; if (acc < 6) continue; acc = 0     // a station every ~6 m
      const P = [a[0]+t[0]*s, a[1]+t[1]*s]
      OUT.push([P[0], P[1], t[0], t[1]])
      const r = at2(P, t); if (!r) continue
      const k = `slab ${r[0]} → build ${r[1]}`; tally[k] = (tally[k]||0)+1; n++ } } }
if (process.argv.includes('--dump-stations')) { fsx.writeFileSync(STF, JSON.stringify(OUT)); console.log(`froze ${OUT.length} stations → ${STF}`) }
console.log(`stations: ${n} · painter ${LEGACY ? 'LEGACY (the slab\'s own)' : 'PROTO ①'} · AUTHORING ${BARE ? 'OFF' : 'ON'}`)
for (const k of Object.keys(tally).sort()) console.log(`   ${k.padEnd(26)} ${tally[k]}`)
const agree = (tally['slab SW → build SW']||0) + (tally['slab TL → build TL']||0)
console.log(`   AGREE ${agree} of ${n} (${(100*agree/n).toFixed(0)}%)   TL lost: ${tally['slab TL → build SW']||0}   TL gained: ${tally['slab SW → build TL']||0}`)
