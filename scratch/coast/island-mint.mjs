// Synthetic: does ① close an island when its shore is stroked as a CLOSED chain? Seam on a corner vs mid-edge. (Tern)
import { mintProtopolygon } from '../../src/lib/tileGround.js'
const area = r => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
const bb = { x0: -500, x1: 500, z0: -500, z1: 500 }
const water = [[-500, -500], [0, -500], [0, 500], [-500, 500]]
const shore = [[0, -500], [0, 500]]
const sq = (c) => [[-275, -25], [-225, -25], [-225, 25], [-275, 25]]
const run = (label, isle, holeInWater) => {
  const closed = [...isle, isle[0]]
  const hole = [...isle].reverse()
  const disc = Array.from({ length: 256 }, (_, i) => [480 * Math.cos(i / 256 * 2 * Math.PI), 480 * Math.sin(i / 256 * 2 * Math.PI)])
  const MP = mintProtopolygon({ streets: [], boundary: disc, coast: holeInWater ? [water, hole] : [water], coastArcs: [shore, closed], bb })
  const blocks = (MP.blocks || []).map((b, k) => ({ a: area(b), holes: (MP.blockHoles?.[k] || []).length }))
  console.log(label.padEnd(34), 'blocks', blocks.map(b => `${Math.round(b.a)} m²${b.holes ? ` (${b.holes} hole)` : ''}`).join(' · ') || '(none)')
}
const isle = sq()
run('seam on a CORNER', isle, true)
run('seam MID-EDGE', [[-250, -25], [-225, -25], [-225, 25], [-275, 25], [-275, -25]], true)
const circ = Array.from({ length: 64 }, (_, i) => [-250 + 25 * Math.cos(i / 64 * 2 * Math.PI), 25 * Math.sin(i / 64 * 2 * Math.PI)])
run('circle (smooth seam)', circ, true)
run('corner seam, island NOT holed in water', isle, false)
