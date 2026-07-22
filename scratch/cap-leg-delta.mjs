// cap-leg-delta.mjs — does a LEG material flip actually change the FILL near a
// dead-end cap? Renders buildTileGround three ways (baseline / leg-flipped /
// cap-flipped) and reports the sidewalk area within 20 m of the tip.
//   node scratch/cap-leg-delta.mjs [skelId:capEnd] [side] [segOrd]
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { CAP_SEGORD } from '../src/lib/feCustomKey.js'

const arg = process.argv[2] || 'preston-place:end'
const side = process.argv[3] || 'left'
const segOrd = Number(process.argv[4] ?? 0)
const [skelId, capEnd] = arg.split(':')
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))

let tip = null
for (const t of ribbons.tiles) for (const c of (t.caps || [])) if (c.skelId === skelId && c.capEnd === capEnd) tip = t.ring[c.vertexIdx]
if (!tip) { console.error('no cap', arg); process.exit(1) }

const area = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1] } return a / 2 }
const nearTip = (r) => r.some(p => Math.hypot(p[0] - tip[0], p[1] - tip[1]) < 20)
const swArea = (g) => (g.sidewalk || []).filter(nearTip).reduce((s, r) => s + area(r), 0)

const run = (bc, label) => {
  const orig = console.log; console.log = () => {}
  const g = buildTileGround(ribbons, { smooth: 0, blockCustoms: bc })
  console.log = orig
  return { label, a: swArea(g) }
}

const base = run(null, 'baseline')
const legFlip = run({ [skelId]: { [side]: { [segOrd]: { materials: { outer: 'SW', inner: 'LU' } } } } }, `leg ${side}|${segOrd} materials outer:SW inner:LU`)
const legFlip2 = run({ [skelId]: { [side]: { [segOrd]: { materials: { outer: 'LU', inner: 'SW' } } } } }, `leg ${side}|${segOrd} materials outer:LU inner:SW`)
const capF = run({ [skelId]: { [side]: { [CAP_SEGORD[capEnd]]: { capFlip: true } } } }, `cap flip`)

for (const r of [base, legFlip, legFlip2, capF]) {
  console.log(`${r.label.padEnd(44)} sidewalk area near tip = ${r.a.toFixed(3)}  Δ=${(r.a - base.a).toFixed(3)}`)
}
