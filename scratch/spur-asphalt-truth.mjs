// spur-asphalt-truth.mjs — what does the RENDER actually do at a dead-end spur today?
//
// C1's revert (`dd4ddb6d`) says dead-ends "render clean woven" and that asphalt is
// TILE-SOURCED — so any change to a spur's ring is a render risk, not just a topology
// change. `asphalt = tile − roundedInner` (tileGround.js:1831/3434): each tile
// contributes the OUTER strip hugging the grout, and two tiles across a street union
// into the full road. At a zero-width spur ONE tile wraps both sides, so its outer
// strip has to cover the whole carriageway on its own.
//
// This probe asks: at each dead-end tip, is the asphalt actually full road width?
// If yes, the slit is load-bearing for the render and the fix must replace what it does.
import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
import { loadRibbons } from './coupler-fold-legs.mjs'

const rib = loadRibbons()
const o = console.log; console.log = () => {}
const g = buildTileGround(rib, { smooth: 0 })
console.log = o

const streetById = new Map(rib.streets.map(s => [s.skelId, s]))
const inRing = (x, z, r) => {
  let ins = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) ins = !ins
  }
  return ins
}
// EVEN-ODD across every ring — `unionRings` returns holes as their own rings, so a
// point-in-ANY-ring test reads a hole as solid (it did, and reported 33 m of asphalt
// on a 11 m street).
const inAsphalt = (x, z) => {
  let n = 0
  for (const r of (g.asphalt || [])) if (inRing(x, z, r)) n++
  return (n % 2) === 1
}

// Sample a perpendicular transect across the chain, a few metres back from the tip,
// and measure how wide the asphalt actually is there.
const rows = []
// ⚠️ Take the tips from junctionMap's pendant-tip stamps, NOT from tiles[].caps.
// A cap only exists where the freeze FAILED to close a polygon, so once the spur is
// asserted with width the caps vanish — and a caps-driven probe silently stops measuring
// the very spurs the fix repaired (it dropped from 50 rows to 7 and looked like a pass).
const tips = (rib.junctionMap?.nodes || [])
  .filter(n => n.kinds.includes('pendant-tip'))
  .map(n => ({ skelId: n.legs[0]?.chain, capEnd: n.legs[0]?.end }))
  .filter(t => t.skelId && t.capEnd)
for (const f of tips) {
  const s = streetById.get(f.skelId)
  if (!s) continue
  const p = s.points
  const [tip, prev] = f.capEnd === 'start' ? [p[0], p[1]] : [p[p.length - 1], p[p.length - 2]]
  const L = Math.hypot(prev[0] - tip[0], prev[1] - tip[1]) || 1
  const t = [(prev[0] - tip[0]) / L, (prev[1] - tip[1]) / L]
  const n = [-t[1], t[0]]
  const BACK = 6                                   // m in from the tip, past the cap bulb
  const c = [tip[0] + t[0] * BACK, tip[1] + t[1] * BACK]
  const hw = Math.max(s.measure?.left?.pavementHW || 0, s.measure?.right?.pavementHW || 0)
  const expect = (s.measure?.left?.pavementHW || 0) + (s.measure?.right?.pavementHW || 0)
  let hit = 0
  const STEP = 0.1, SPAN = Math.max(12, hw * 3)
  for (let d = -SPAN; d <= SPAN; d += STEP) if (inAsphalt(c[0] + n[0] * d, c[1] + n[1] * d)) hit++
  const measured = hit * STEP
  rows.push({
    spur: `${f.skelId}[${f.capEnd}]`,
    expectedW: +expect.toFixed(2),
    measuredW: +measured.toFixed(2),
    delta: +(measured - expect).toFixed(2),
    ok: Math.abs(measured - expect) < 1.5 ? 'OK' : 'GAP',
  })
}
rows.sort((a, b) => a.delta - b.delta)
console.table(rows)
const ok = rows.filter(r => r.ok === 'OK').length
console.log(`\nasphalt is full road width ${BACKLABEL()} the tip: ${ok} / ${rows.length}`)
function BACKLABEL() { return '6 m back from' }
