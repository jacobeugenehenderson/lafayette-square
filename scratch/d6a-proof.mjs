// D6a proof: does carving the curb from BASE per-edge strokes (no junction
// swell) match Jacob's drawn line where today's full-carve bows?
// Target = marker_strokes.json stroke[0] (the long drawn curb by Mississippi×Lafayette).
import fs from 'fs'
import path from 'path'
const ROOT = process.cwd()
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const marks = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/clean/marker_strokes.json')))
const target = Object.values(marks[0]).filter(p => p && typeof p.x === 'number').map(p => [p.x, p.z])   // {0:{x,z},...} → [[x,z],...]

const cap = []
buildTileGround(ribbons, { stencil: null, curbWidth: 0.15, smooth: 0, _iaDebugCapture: cap })
console.log(`tiles captured: ${cap.length}`)

// distance from a point to a set of rings (nearest edge)
function distToRings(pt, rings) {
  let best = Infinity
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length]
    const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1
    let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy)))
  }
  return best
}
// target bbox to find the tile(s) overlapping the drawn line
const tx0 = Math.min(...target.map(p => p[0])) - 20, tx1 = Math.max(...target.map(p => p[0])) + 20
const tz0 = Math.min(...target.map(p => p[1])) - 20, tz1 = Math.max(...target.map(p => p[1])) + 20
const overlaps = (rings) => rings.some(r => r.some(p => p[0] > tx0 && p[0] < tx1 && p[1] > tz0 && p[1] < tz1))

// score each candidate curb against the drawn line: mean/max nearest-distance
function score(rings) {
  const ds = target.map(p => distToRings(p, rings))
  return { mean: ds.reduce((a, b) => a + b, 0) / ds.length, max: Math.max(...ds) }
}

console.log(`\ntarget: drawn curb, ${target.length} pts, x[${tx0.toFixed(0)}..${tx1.toFixed(0)}] z[${tz0.toFixed(0)}..${tz1.toFixed(0)}]`)
console.log('measuring each tile whose curb sits near the drawn line:\n')
let any = false
for (let i = 0; i < cap.length; i++) {
  const t = cap[i]
  if (!overlaps(t.iA_full) && !overlaps(t.iA_base)) continue
  any = true
  const sf = score(t.iA_full), sb = score(t.iA_base)
  console.log(`tile ${i}:`)
  console.log(`   iA_full (today, swelled):   mean ${sf.mean.toFixed(2)}m  max ${sf.max.toFixed(2)}m  off the drawn line`)
  console.log(`   iA_base (no junction swell): mean ${sb.mean.toFixed(2)}m  max ${sb.max.toFixed(2)}m  off the drawn line`)
  const verdict = sb.mean + 0.3 < sf.mean ? '  ✅ base is closer to Jacob’s line' : (sb.mean > sf.mean + 0.3 ? '  ⚠ base is WORSE' : '  ~ no meaningful difference')
  console.log(`  ${verdict}`)
}
if (!any) console.log('(no captured tile overlaps the target bbox — wrong target or tile filter)')
