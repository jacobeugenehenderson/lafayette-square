// DERIVATION-FIRST PROBE (tile[53] Albion×Missouri) — confirm the mechanism the
// prompt asserts, against the REAL engine on HEAD ribbons:
//   (1) at the collapsed mouth, Missouri's leg-sectors COVER albion's corner wedge
//       (so bandRem is empty there → the bent sector can't build).
//   (2) giving the mouth real WIDTH in the face SEPARATES albion's runs from
//       Missouri's runs → the wedge (bandRem) is freed at each mouth corner.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { STREET_SMOOTH } from '../src/lib/smoothCenterline.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'

const root = new URL('../', import.meta.url)
const ribbons = JSON.parse(fs.readFileSync(new URL('src/data/ribbons.json', root)))
const design = JSON.parse(fs.readFileSync(new URL('public/looks/lafayette-square/design.json', root)))
const baseOpts = {
  curbWidth: CURB_WIDTH, smooth: STREET_SMOOTH, blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null, emitArtifact: true,
}
const silence = () => { const log = console.log; console.log = () => {}; return () => { console.log = log } }
const un = silence()
const art = buildTileGround(ribbons, baseOpts)._shapeArtifact
un()

const st = art[53]
console.log(`tile[53]: ring=${st.ring.length} runs=${st.runs.length} fillets=${(st.fillets||[]).length}`)
const D = x => +x.toFixed(2)
const MOUTH = [-177.5, -78.7]
const dist = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])

// Albion runs + their ends
console.log('\n-- albion runs --')
for (let i=0;i<st.runs.length;i++){
  const r=st.runs[i]; if(!/albion/.test(r.skelId)) continue
  const p0=r.poly[0],pN=r.poly[r.poly.length-1]
  console.log(`  run[${i}] ${r.skelId}/${r.side} start=${p0.map(D)} (d2mouth=${D(dist(p0,MOUTH))}) end=${pN.map(D)} (d2mouth=${D(dist(pN,MOUTH))})`)
}
console.log('\n-- missouri runs --')
for (let i=0;i<st.runs.length;i++){
  const r=st.runs[i]; if(!/missouri/.test(r.skelId)) continue
  const p0=r.poly[0],pN=r.poly[r.poly.length-1]
  console.log(`  run[${i}] ${r.skelId}/${r.side} start=${p0.map(D)} (d2mouth=${D(dist(p0,MOUTH))}) end=${pN.map(D)} (d2mouth=${D(dist(pN,MOUTH))})`)
}
console.log('\n-- fillets near mouth --')
for (const f of (st.fillets||[])) if (dist(f.apex,MOUTH) < 30) console.log(`  apex=${f.apex.map(D)} r=${D(f.r)} d2mouth=${D(dist(f.apex,MOUTH))}`)
