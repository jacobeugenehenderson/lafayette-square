// cap-sweep.mjs — map-wide gate: flip EVERY dead-end cap in turn and confirm the
// FILL builds and actually changes. Catches crashes + silent no-ops across the
// whole class, not just the one cap under the eye.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { CAP_SEGORD } from '../src/lib/feCustomKey.js'
const ribbons = JSON.parse(fs.readFileSync('src/data/ribbons.json', 'utf8'))
const shape = JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json', 'utf8'))
const caps = []
for (const t of shape.tiles) for (const v of (t.roundTips || [])) if (v.skelId && v.capEnd) caps.push(v)
const area = (rs) => rs.reduce((s, r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1] } return s + a / 2 }, 0)
const near = (rs, p) => rs.filter(r => r.some(v => Math.hypot(v[0] - p[0], v[1] - p[1]) < 25))
const run = (bc) => { const o = console.log; console.log = () => {}; const g = buildTileGround(ribbons, { smooth: 0, blockCustoms: bc }); console.log = o; return g }
const base = run(null)
let noop = 0, err = 0
for (const c of caps) {
  try {
    const g = run({ [c.skelId]: { left: { [CAP_SEGORD[c.capEnd]]: { capFlip: true } } } })
    const d = area(near(g.sidewalk, c.p)) - area(near(base.sidewalk, c.p))
    if (Math.abs(d) < 1e-6) { noop++; console.log(`  no-op  ${c.skelId}:${c.capEnd}`) }
  } catch (e) { err++; console.log(`  ERROR  ${c.skelId}:${c.capEnd} — ${e.message}`) }
}
console.log(`\n${caps.length} round caps · ${err} errors · ${noop} rendered no change`)
