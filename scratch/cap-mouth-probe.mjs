// cap-mouth-probe.mjs — the corner inputs at a dead-end MOUTH: the frozen mouth
// disc radius (which trims the THROUGH road's run back) vs the fillet tangent
// the corner pad's sector actually starts at. If those two disagree, the leg
// strips stop somewhere the pad doesn't begin → a squared step in the band.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const skelId = process.argv[2] || 'simpson-place'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0, emitArtifact: true })
console.log = o
const f2 = (p) => `[${p[0].toFixed(1)},${p[1].toFixed(1)}]`
for (const st of (g._shapeArtifact || [])) {
  const ms = st.mouths || []
  for (const m of ms) {
    if (m.spurSkel !== skelId) continue
    console.log(`MOUTH spur=${m.spurSkel} mid=${f2(m.mid)} R=${m.R?.toFixed(3)}`)
    console.log(`  apexA=${m.apexA ? f2(m.apexA) : '(none)'}  apexB=${m.apexB ? f2(m.apexB) : '(none)'}`)
    for (const apex of [m.apexA, m.apexB].filter(Boolean)) {
      let best = null, bd = Infinity
      for (const f of (st.fillets || [])) { const d = Math.hypot(f.apex[0] - apex[0], f.apex[1] - apex[1]); if (d < bd) { bd = d; best = f } }
      if (!best) { console.log(`   apex ${f2(apex)} — NO FILLET (sharp corner: pad is skipped entirely)`); continue }
      const dTA = Math.hypot(best.tA[0] - m.mid[0], best.tA[1] - m.mid[1])
      const dTB = Math.hypot(best.tB[0] - m.mid[0], best.tB[1] - m.mid[1])
      console.log(`   apex ${f2(apex)} → fillet apex ${f2(best.apex)} r=${best.r.toFixed(2)} (dist ${bd.toFixed(2)})`)
      console.log(`      tangents from the MOUTH NODE: tA=${dTA.toFixed(2)} m, tB=${dTB.toFixed(2)} m   |  mouth trim R=${m.R?.toFixed(2)} m`)
    }
  }
}
