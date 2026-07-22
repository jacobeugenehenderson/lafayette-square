// cap-mouthleg-probe.mjs — the Idea-A corner treatment (concentric cMin ring +
// the deep-leg slide) is gated on a corner having TWO legs. At a dead-end MOUTH
// the through road is suppressed as a through-node, so the spur's corner has
// ONE leg and the `mouths` block must synthesise the second. If that misses, the
// corner gets no cMin and no slide — a mixed SW-outer/TL-outer joint renders
// with a hard step. Count how often it misses.
import fs from 'fs'
import { buildTileGround, resolvePedDepths } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0, emitArtifact: true })
console.log = o
let mouths = 0, oneApex = 0, noThrough = 0
for (const st of (g._shapeArtifact || [])) {
  for (const m of (st.mouths || [])) {
    mouths++
    const apexes = [m.apexA, m.apexB].filter(Boolean)
    if (apexes.length < 2) oneApex++
    // can the synthesis find a through run-end on each apex's side?
    if (!m.dir) { noThrough++; continue }
    const sideOf = (p) => { const cx = p[0] - m.mid[0], cy = p[1] - m.mid[1]; return (m.dir[0] * cy - m.dir[1] * cx) >= 0 ? 'left' : 'right' }
    for (const apex of apexes) {
      const apexSide = sideOf(apex)
      let found = false
      for (const run of (st.runs || [])) {
        if (run.skelId === m.spurSkel) continue
        for (const ix of [0, run.poly.length - 1]) {
          const end = run.poly[ix]
          if (Math.hypot(end[0] - m.mid[0], end[1] - m.mid[1]) >= 1) continue
          const nb = run.poly[ix === 0 ? 1 : run.poly.length - 2]
          if (nb && sideOf(nb) === apexSide) found = true
        }
      }
      if (!found) { noThrough++; console.log(`  NO SECOND LEG  spur=${m.spurSkel} apex=[${apex.map(v => v.toFixed(1))}] side=${apexSide}`) }
    }
  }
}
console.log(`\n${mouths} dead-end mouths · ${oneApex} with only ONE apex · ${noThrough} apex corner(s) where the through leg is NOT found → no cMin, no slide`)
