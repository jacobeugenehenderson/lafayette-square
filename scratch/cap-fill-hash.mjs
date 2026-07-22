// cap-fill-hash.mjs — whole-map FILL fingerprint. Run before/after a change to
// prove the untouched paths are byte-identical (no-customs = the fast path;
// with design.json = the authored map as it ships).
//   node scratch/cap-fill-hash.mjs [plain|design]
import fs from 'fs'
import crypto from 'crypto'
import { buildTileGround } from '../src/lib/tileGround.js'
const mode = process.argv[2] || 'plain'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
let design = {}
try { design = JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json', 'utf8')) } catch {}
const o = console.log; console.log = () => {}
const g = buildTileGround(ribbons, {
  smooth: 0,
  blockCustoms: mode === 'design' ? (design.blockCustoms || null) : null,
  curbWidth: mode === 'design' ? (design.curbWidth ?? 0.15) : undefined,
})
console.log = o
const h = (rings) => {
  const s = (rings || []).map(r => r.map(p => p[0].toFixed(4) + ',' + p[1].toFixed(4)).join(';')).join('|')
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12) + ` (${(rings || []).length} rings)`
}
console.log(`mode=${mode}`)
console.log('  asphalt  ', h(g.asphalt))
console.log('  curb     ', h(g.curb))
console.log('  sidewalk ', h(g.sidewalk))
for (const k of Object.keys(g.treelawnByLu || {}).sort()) console.log(`  treelawn[${k}]`.padEnd(22), h(g.treelawnByLu[k]))
