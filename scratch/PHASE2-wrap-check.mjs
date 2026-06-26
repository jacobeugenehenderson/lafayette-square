// PHASE 2 — confirm the FILL builds a bent sector at BOTH mouth corners on every
// spur tile that was spliced, AND simple/crossing tiles are byte-identical.
// Mirrors the sectionPass corner gate (:1124) against the regenerated runs.
import fs from 'fs'
import { buildTileGround, sectionPassTile } from '../src/lib/tileGround.js'
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
let un = silence()
const on = buildTileGround(ribbons, { ...baseOpts, deadEndMouthSplice: true })._shapeArtifact
un()

const D = x => +x.toFixed(2)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const tipKey = p => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000)

// for each spur mouth, count distinct cornerT keys that PASS the sector gate at distinct fillets
function wrapsBoth(t, mouthSkel) {
  const fillets = t.fillets || []
  const tips = new Set((t.roundTips || []).concat(t.bluntTips || []).map(x => tipKey(x.p)))
  const ends = new Map()
  for (const r of t.runs) for (const p of [r.poly[0], r.poly[r.poly.length - 1]]) { const k = tipKey(p); if (!ends.has(k)) ends.set(k, new Set()); ends.get(k).add(r.skelId) }
  // corner keys near the spliced corners (now AT fillet apexes)
  const rs = t.runs.filter(r => r.skelId === mouthSkel)
  const keys = new Map()
  for (const r of rs) for (const p of [r.poly[0], r.poly[r.poly.length - 1]]) { const k = tipKey(p); if (tips.has(k)) continue; keys.set(k, p) }
  let pass = 0; const used = new Set()
  for (const p of keys.values()) {
    let best = null, bd = Infinity
    for (const f of fillets) { const d = dist(f.apex, p); if (d < bd) { bd = d; best = f } }
    const ok = best && bd <= best.r + 1
    const ak = best ? tipKey(best.apex) : 'x'
    if (ok && !used.has(ak)) { used.add(ak); pass++ }
  }
  return pass
}

const spurTiles = [2, 3, 10, 11, 12, 23, 25, 30, 38, 39, 42, 43, 66, 69, 80]
console.log('=== bent-sector wrap per spliced spur tile (corner at fillet apex → gate PASS) ===')
for (const ti of spurTiles) {
  const t = on[ti]
  const skels = [...new Set(t.runs.map(r => r.skelId))].filter(sk => {
    const rs = t.runs.filter(r => r.skelId === sk); return rs.some(r => r.side === 'left') && rs.some(r => r.side === 'right')
  })
  const parts = []
  for (const sk of skels) { const w = wrapsBoth(t, sk); parts.push(`${sk}:${w}${w >= 2 ? '✅' : ''}`) }
  console.log(`  tile[${ti}] ${parts.join('  ')}`)
}

// also: render proxy area at the named sites (Albion×Missouri = tile[53]) — confirm SW grew the second corner
import { CURB_WIDTH as CW } from '../src/cartograph/streetProfiles.js'
