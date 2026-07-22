// cap-asym-census.mjs — which dead-end fingers have legs that resolve
// DIFFERENTLY by default (no customs)? Those are exactly the caps the per-side
// claim changes: previously one leg's group swallowed the whole finger.
import fs from 'fs'
import { buildTileGround, resolvePedDepths } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
let design = {}; try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const mode = process.argv[2] || 'plain'
const bc = mode === 'design' ? (design.blockCustoms || null) : null
const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0, emitArtifact: true, blockCustoms: bc })
console.log = o
const tipKey = (p) => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)
let asym = 0, total = 0
for (const st of (g._shapeArtifact || [])) {
  const tips = [...(st.roundTips || []), ...(st.bluntTips || [])]
  for (const t of tips) {
    const legs = (st.runs || []).filter(r => {
      const last = r.poly[r.poly.length - 1]
      return tipKey(r.poly[0]) === tipKey(t.p) || tipKey(last) === tipKey(t.p)
    })
    if (legs.length !== 2) continue
    total++
    const d = legs.map(r => {
      const c = bc?.[r.skelId]?.[r.side]?.[r.segOrd] || null
      const ped = resolvePedDepths(r.baseMeasure, r.side, c)
      const oo = ped.hasTL ? ped.tl : ped.sw
      return `${oo.toFixed(2)}|${(ped.tl + ped.sw).toFixed(2)}|${ped.hasTL}`
    })
    if (d[0] !== d[1]) { asym++; console.log(`  ASYM ${t.skelId}:${t.capEnd}  ${legs[0].side}=${d[0]}  ${legs[1].side}=${d[1]}`) }
  }
}
console.log(`\n${mode}: ${asym} of ${total} two-legged caps resolve asymmetrically`)
