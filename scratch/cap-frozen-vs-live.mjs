// cap-frozen-vs-live.mjs — is the FROZEN shape.json (what Section/Measure read)
// carrying the same finger widths the LIVE build now produces? A fix in the
// shape pass is invisible until the artifact is re-baked.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const skelId = process.argv[2] || 'nicholson-place'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const frozen = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const s = ribbons.streets.find(x => (x.skelId || x.name) === skelId)
const A = s.points[0], B = s.points[s.points.length - 1]
const dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz)
const nx = -dz / L, nz = dx / L
const cx = A[0] + dx * 0.5, cz = A[1] + dz * 0.5
const inside = (rings, x, z) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { if ((r[i][1] > z) !== (r[j][1] > z) && x < (r[j][0] - r[i][0]) * (z - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c } return c }
// distance from the centreline out to the asphalt-inner ring (iA) on each side
const reachIA = (rings, sgn) => { let last = 0; for (let d = 0.05; d <= 14; d += 0.05) if (!inside(rings, cx + nx * sgn * d, cz + nz * sgn * d)) last = d; else break; return last }
const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, { smooth: 0, emitArtifact: true })
console.log = o
console.log(`${skelId}: authored L=${s.measure?.left?.pavementHW?.toFixed(2)} R=${s.measure?.right?.pavementHW?.toFixed(2)}`)
const near = (st) => (st.roundTips || []).concat(st.bluntTips || []).some(t => t.skelId === skelId)
for (const [label, tiles] of [['LIVE  (buildTileGround now)', g._shapeArtifact], ['FROZEN(public/baked/.../shape.json)', frozen.tiles]]) {
  const st = (tiles || []).find(near)
  if (!st) { console.log(`  ${label}: no tile found`); continue }
  const iA = st.iA || []
  console.log(`  ${label}: iA reach  -normal=${reachIA(iA, -1).toFixed(2)}  +normal=${reachIA(iA, 1).toFixed(2)}`)
}
