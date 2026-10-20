// t2-tangent.mjs — T2's near-tangent seam, the 18th/Dolman clamp case (`RIBBONS §1`, tileGround.js's miter-clamp comment:
// "a 1.4369 m width step across a 3.24° turn puts the intersection 26.15 m out").
//   (1) TODAY's LS: the ① vertex where west-18th-street meets dolman-street-2, both sides (found by owner, never by place),
//       local Hausdorff Clipper2 vs ours, as poured.
//   (2) THE CANON's numbers, synthetic: a block whose one side turns 3.24° at a vertex where the depth steps 1.4369 m, both
//       ways round (the wider edge before / after) and both turn senses. Ours vs Clipper2 per mode; the offset vertices near
//       the seam printed, so a step, a ramp or a spike can be read off them.
import { readFileSync } from 'fs'
import { c2Offset, hausdorff } from './c2.mjs'
import { offsetRingByRects } from './tileGround.probe.mjs'
const MODES = ['vertex', 'stub-min', 'stub-max']
const IN = JSON.parse(readFileSync(new URL('./in-lafayette-square.json', import.meta.url), 'utf8'))
const nm = (l) => { const o = IN.owners[l]; return o ? o.skelId : '?' }
console.log('(1) LS today, west-18th-street × dolman-street-2')
for (const b of IN.blocks) { const n = b.ring.length
  for (let j = 0; j < n; j++) { const a = nm(b.labs[b.e[(j - 1 + n) % n]]), c = nm(b.labs[b.e[j]])
    if (!(a !== c && /18th/.test(a + c) && /dolman/.test(a + c))) continue
    const ours = offsetRingByRects(b.ring, (q) => b.depth[q], false, {}, null, 0.005, { e: b.e, v: b.v, hwy: b.hwy, own: b.own })
    const at = b.ring[j], dep = Math.max(...[b.depth[(j - 1 + n) % n], b.depth[j]].flat())
    console.log(`  block ${b.k} v${j} ${a} → ${c}  depth ${JSON.stringify(b.depth[(j - 1 + n) % n])} → ${JSON.stringify(b.depth[j])}  ` +
      MODES.map(m => `${m} H(local) ${hausdorff(c2Offset(b.ring, b.depth, false, m), ours, at, 2 * dep + 2).toFixed(3)}`).join(' · ')) } }
console.log('\n(2) synthetic: 3.24° turn at (0,0) on the bottom side of a 200 m block, depth step 1.4369 m')
const T = 3.24 * Math.PI / 180, fmt = (R, at) => R.flatMap(r => r).filter(p => Math.hypot(p[0] - at[0], p[1] - at[1]) < 40).map(p => `(${p[0].toFixed(2)},${p[1].toFixed(2)})`).join(' ')
for (const sense of [1, -1]) for (const [d0, d1] of [[4.0, 4.0 + 1.4369], [4.0 + 1.4369, 4.0]]) {
  // CCW block: bottom side runs (-100,0) → (0,0) → turns `sense`·3.24° → (100cosT, 100·sense·sinT); then up and back
  const B = [100 * Math.cos(T), sense * 100 * Math.sin(T)]
  const ring = [[-100, 0], [0, 0], B, [B[0], 150], [-100, 150]], depth = [d0, d1, 4, 4, 4]
  const ours = offsetRingByRects(ring, (q) => depth[q], false, {}, null, 0)
  console.log(`  turn ${sense > 0 ? 'toward the block' : 'away from it'} · ${d0.toFixed(4)} → ${d1.toFixed(4)}`)
  console.log(`    ours      ${fmt(ours, [0, 0])}`)
  for (const m of MODES) { const R = c2Offset(ring, depth, false, m)
    console.log(`    ${m.padEnd(9)} H ${hausdorff(R, ours).toFixed(3)}  ${fmt(R, [0, 0])}`) }
}
