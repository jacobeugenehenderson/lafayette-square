// cap-legcustom-trace.mjs — does the LEG custom reach the strip? Calls
// sectionPassTile directly on the frozen cap tile with/without a leg material
// override, and reports each run's identity + the resulting sidewalk area.
//   node scratch/cap-legcustom-trace.mjs [skelId:capEnd] [side] [segOrd]
import fs from 'fs'
import { buildTileGround, sectionPassTile } from '../src/lib/tileGround.js'

const arg = process.argv[2] || 'preston-place:end'
const side = process.argv[3] || 'left'
const segOrd = Number(process.argv[4] ?? 0)
const [skelId, capEnd] = arg.split(':')
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const orig = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0, emitArtifact: true })
console.log = orig

const st = (g._shapeArtifact || []).find(t => (t.roundTips || []).some(t2 => t2.skelId === skelId && t2.capEnd === capEnd))
if (!st) { console.error('no tile'); process.exit(1) }
console.log('runs on this tile matching skelId:', st.runs.filter(r => r.skelId === skelId).map(r => `${r.side}|${r.segOrd}`).join(', '))

const area = (rs) => rs.reduce((s, r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1] } return s + a / 2 }, 0)
const go = (bc, label) => {
  const out = sectionPassTile(st, 0.15, { outer: 'LU', inner: 'SW' }, bc)
  console.log(label.padEnd(40), 'Wacc area =', area(out.Wacc).toFixed(3))
}
go(null, 'baseline')
go({ [skelId]: { [side]: { [segOrd]: { materials: { outer: 'LU', inner: 'SW' } } } } }, `leg ${side}|${segOrd} → LU outer`)
