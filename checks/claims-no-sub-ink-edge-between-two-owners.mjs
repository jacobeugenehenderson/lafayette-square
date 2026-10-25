#!/usr/bin/env node
// CLAIM — ① HAS NO EDGE SHORTER THAN ITS INK IS WIDE BETWEEN TWO CHAINS. ① is every chain stroked to ε and united, so its ink
// is 2ε wide and no leg of it is shorter than that. ⭐ The one 2ε edge is a dead-end butt, where ONE chain's two sides meet; it
// is excluded by the rule (same skelId), never by a constant.
// ⭐ FOUND 2026-10-22 (Zob; BACKLOG 3d9c171f): `mintProtopolygon` strokes each chain at ε, then unions. Where a stroke ENDS at a
// node, its butt corners (end ± its own normal × ε) can sit < 1 grid step outside the neighbours' ink, and the union keeps them.
// The result is a sub-step ring edge between two owners, which `turnOf` reads as a turn (PTown Stable Path: 121°, PTown's
// flatten refusal). `offsetRingByRects` drops these edges after the fact (`subInkLen`); other readers of ① do not.
// The fix belongs in the mint (Boz's ruling, 2026-10-24: join chain cuts before stroking; build a real node's outline once;
// never a post-union snap). This check is that fix's acceptance check.
// ASSERTS, per town, file only: no block-ring edge (outer + holes) shorter than 2ε less two Clipper grid steps (rounding) has
// owners on its two ends with different skelIds. ε is read off the artifact (`protopolygon.eps`), the grid off
// src/lib/lattice.js (`CLIP_SCALE`). An end with no owner (rim, water) is not judged.
//
//   node checks/claims-no-sub-ink-edge-between-two-owners.mjs [scene…] [--ribbons=path] [--mutants]
//
// ⭐ MUTANT (--mutants): the judge runs on a fixture block. It must go RED on a 1 mm edge between two chains, and stay GREEN on
// a 2ε butt between one chain's two sides and on the clean block. The live mutant is the current mint: on 2026-10-24 every
// town reads RED.
import { readFileSync, existsSync } from 'node:fs'
import { ribbonsPathOf } from '../cartograph/scene.js'
import { scenes } from './_scenes.mjs'
import { CLIP_SCALE as SCALE } from '../src/lib/lattice.js'   // the partition's grid, from its one home

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))

/** The sub-ink edges between two chains in one protopolygon: [{ at, L, a, b }]. */
function judge(P) {
  if (!(P?.eps > 0)) throw new Error('protopolygon carries no ε (eps) — NOT CHECKED')
  const sub = 2 * P.eps - 2 / SCALE, O = P.owners, bad = []
  const rings = [...P.blocks.map((r, k) => [r, P.blockLabels[k]]), ...(P.blockHoles || []).flatMap((hs, k) => (hs || []).map((h, j) => [h, P.blockHoleLabels?.[k]?.[j]]))]
  for (const [r, lab] of rings) {
    if (!lab) throw new Error('a block ring carries no labels — NOT CHECKED')
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (L >= sub) continue
      const oa = O[lab[i]], ob = O[lab[(i + 1) % r.length]]
      if (!oa?.skelId || !ob?.skelId || oa.skelId === ob.skelId) continue
      bad.push({ at: a, L, a: `${oa.skelId}|${oa.side}`, b: `${ob.skelId}|${ob.side}` })
    }
  }
  return bad
}

let red = 0
const list = arg('ribbons') ? named : scenes('cartograph/data/<scene>/clean/ribbons.json', { has: (s) => existsSync(ribbonsPathOf(s)), label: 'ribbons.json' })
for (const scene of list) {
  const path = arg('ribbons') || ribbonsPathOf(scene)
  const P = JSON.parse(readFileSync(path, 'utf8')).protopolygon
  if (!P) { console.log(`⛔ ${scene}: NOT CHECKED — ${path} carries no protopolygon`); red++; continue }
  const bad = judge(P)
  if (bad.length) red++
  console.log(`${bad.length ? '⛔' : '✅'} ${scene}: ${bad.length} sub-ink edge(s) between two chains (< ${((2 * P.eps - 2 / SCALE) * 1000).toFixed(1)} mm)`
    + (bad.length ? `\n     first: ${bad.slice(0, 3).map(x => `(${x.at.map(v => v.toFixed(3)).join(', ')}) ${(x.L * 1000).toFixed(2)} mm ${x.a} → ${x.b}`).join(' · ')}` : ''))
}

if (process.argv.includes('--mutants')) {
  const eps = 0.005, own = [{ skelId: 'x', side: 'left' }, { skelId: 'y', side: 'right' }, { skelId: 'x', side: 'right' }]
  const fx = (ring, labels) => judge({ eps, owners: own, blocks: [ring], blockLabels: [labels] })
  const clean = fx([[0, 0], [10, 0], [10, 10], [0, 10]], [0, 1, 1, 0])
  const poke = fx([[0, 0], [10, 0], [10.001, 0], [10, 10], [0, 10]], [0, 0, 1, 1, 0])
  const butt = fx([[0, 0], [10, 0], [10, 2 * eps], [0, 2 * eps]], [0, 0, 2, 2])
  const ok = !clean.length && poke.length === 1 && !butt.length
  console.log(`   ${ok ? '✅' : '⛔'} mutant fixture · clean ${clean.length} · 1 mm edge between two chains ${poke.length} (must be 1, RED) · 2ε butt of one chain ${butt.length}`)
  if (!ok) red++
}

console.log(red ? '\n⛔ RED — ① carries a sub-ink edge between two chains (mintProtopolygon), or the fixture failed'
  : '\n✅ GREEN — no ① edge shorter than its ink is wide lies between two chains')
process.exit(red ? 1 : 0)
