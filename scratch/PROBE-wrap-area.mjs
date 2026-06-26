// Measure the SIDEWALK (Wacc) coverage near the two albion mouth fillets on HEAD.
// If the wrap is absent (the defect), Wacc area inside a small disc around each
// fillet apex is ~0; a present wrap fills the corner wedge. This is a PROXY area
// measure (the prompt warns proxies are unreliable for the wrap itself) — used
// ONLY to confirm the mechanism direction, NOT to claim success.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { STREET_SMOOTH } from '../src/lib/smoothCenterline.js'
import { CURB_WIDTH } from '../src/cartograph/streetProfiles.js'

const root = new URL('../', import.meta.url)
const ribbons = JSON.parse(fs.readFileSync(new URL('src/data/ribbons.json', root)))
const design = JSON.parse(fs.readFileSync(new URL('public/looks/lafayette-square/design.json', root)))
const opts = {
  curbWidth: CURB_WIDTH, smooth: STREET_SMOOTH, blockLandUse: design.blockLandUse || null,
  cornerRadiusScale: Number.isFinite(design.cornerRadiusScale) ? design.cornerRadiusScale : 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || null,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null,
  blockCustoms: design.blockCustoms || null,
}
const flag = process.argv[2] === 'notch' ? { deadEndMouthWrap: true } : {}
const silence = () => { const log = console.log; console.log = () => {}; return () => { console.log = log } }
const un = silence()
const g = buildTileGround(ribbons, { ...opts, ...flag })
un()

// sidewalk rings → polygon coverage measure: point-in-polygon sampling on a grid
// around each fillet apex (the mouth corners). Counts samples inside the SW rings.
const SW = g.sidewalk || []
function pip(pt, ring) {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c
  }
  return c
}
function covered(pt) { let inside = false; for (const r of SW) if (r.length >= 3 && pip(pt, r)) inside = !inside; return inside }
function areaIn(center, R, n = 40) {
  let hit = 0, tot = 0
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const x = center[0] - R + (2 * R) * i / n, y = center[1] - R + (2 * R) * j / n
    if (Math.hypot(x - center[0], y - center[1]) > R) continue
    tot++; if (covered([x, y])) hit++
  }
  return { frac: hit / tot, hit, tot }
}
const filletA = [-184.68, -85.45], filletB = [-186.47, -74.61]
console.log(`mode: ${process.argv[2] || 'HEAD'}   total SW rings: ${SW.length}`)
for (const [name, c] of [['mouth-corner-A', filletA], ['mouth-corner-B', filletB]]) {
  const r = areaIn(c, 4.0)
  console.log(`  ${name} @${c} : SW coverage within R=4m = ${(r.frac*100).toFixed(1)}%  (${r.hit}/${r.tot})`)
}
