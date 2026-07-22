// cap-probe.mjs — print the FILL inputs around one dead-end cap: the tile's runs
// (identity + resolved ped depths + materials), the cap tip params, and the
// tile-wide band maxima. Read-only diagnosis for the cap-slope/leg-flip work.
//   node scratch/cap-probe.mjs [skelId:capEnd]
import fs from 'fs'
import { buildTileGround, resolvePedDepths } from '../src/lib/tileGround.js'
import { CAP_SEGORD } from '../src/lib/feCustomKey.js'

const arg = process.argv[2] || 'preston-place:end'
const [skelId, capEnd] = arg.split(':')
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const orig = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0, emitArtifact: true })
console.log = orig

const tiles = g._shapeArtifact || []
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.5
let hit = null
for (const st of tiles) {
  for (const t of (st.roundTips || [])) if (t.skelId === skelId && t.capEnd === capEnd) hit = { st, t }
}
if (!hit) { console.error('no round tip for', arg, '— tiles:', tiles.length); process.exit(1) }
const { st, t } = hit
console.log('CAP', arg, 'segOrd=', CAP_SEGORD[capEnd])
console.log('tip', t.p.map(v => v.toFixed(2)), 'hw', t.hw, 'tl', t.tl, 'sw', t.sw)
console.log('tile: tl', st.tl, 'sw', st.sw, 'cap', st.cap, 'bandJoin', st.bandJoin, 'runs', st.runs.length)
for (const run of st.runs) {
  const ped = resolvePedDepths(run.baseMeasure, run.side, null)
  const ends = [run.poly[0], run.poly[run.poly.length - 1]]
  const atTip = ends.some(p => near(p, t.p))
  console.log(
    ` run skelId=${run.skelId} side=${run.side} segOrd=${run.segOrd} n=${run.poly.length}` +
    ` tl=${ped.tl.toFixed(2)} sw=${ped.sw.toFixed(2)} hasTL=${ped.hasTL}` +
    ` total=${(ped.tl + ped.sw).toFixed(2)} outer=${(ped.hasTL ? ped.tl : ped.sw).toFixed(2)}` +
    (atTip ? '   <-- CAP OWNER' : ''))
}
