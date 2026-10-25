#!/usr/bin/env node
// CLAIM — ① HAS NO EDGE SHORTER THAN ITS INK IS WIDE BETWEEN TWO OWNERS, EXCEPT WHERE THE EXACT INK HAS ONE. ① is every
// stroke at ε, united, so its ink is 2ε wide and no leg is shorter than that. ⭐ The one 2ε edge is a dead-end butt (ONE
// chain's two sides meet), excluded by the rule (same skelId), never by a constant.
// ⭐ FOUND 2026-10-22 (Zob; BACKLOG 3d9c171f): strokes butted at a node or a chain cut left corners poking past the
// neighbour's ink, and the union kept them as sub-ink edges between two owners (PTown Stable Path's 121° faked corner, its
// flatten refusal). The mint now strokes cuts through and builds one outline per node (BRIEF-the-ink-meets-inside-the-ink),
// and the fold that hid these edges downstream (`offsetRingByRects`) is deleted, so any sub-ink edge left reaches ②.
// ⭐⭐ WHY SOME ARE ALLOWED (Boz, 2026-10-25, the brief's §5a): where two centrelines CROSS with no shared vertex within
// 2ε + 2 grid steps (the REACH, derived in checks/_true-geometry.mjs) of a vertex or end of one of them, the EXACT ink can
// have a sub-ink edge there; removing it needs a mm tolerance, so it
// stays. Such an edge is allowed only by an exact predicate computed from the mint's input polylines (`ribbons.json`
// streets), never a site list: checks/_true-geometry.mjs, the SAME predicate claims-no-corner-at-a-true-geometry-edge reads
// to prove ② makes no corner there. Allowed edges print on their own "true geometry" line, counted.
// ASSERTS, per town, file only: every block-ring edge (outer + holes) shorter than subInk = 2ε − 2 grid steps (ε off
// `protopolygon.eps`, the grid off src/lib/lattice.js; refuses by name if either is missing) whose two ends' owners have
// different skelIds is a true-geometry site's edge. The rim (`__boundary__`) and water (`__water__`) are judged and are never
// a site.
//
//   node checks/claims-no-sub-ink-edge-between-two-owners.mjs [scene…] [--ribbons=path] [--mutants]
//
// ⭐ MUTANTS (--mutants), on a fixture: a 1 mm edge between two chains that do not cross goes RED; a 2ε butt of one chain and
// the clean block stay GREEN; at a crossing 1 mm from a vertex the exact ink's edge is ALLOWED, and a planted butt residue
// beside that site, between a chain of the site and one that does not cross there, still goes RED; and a sub-ink edge at a
// crossing 13 mm from a vertex (past REACH) goes RED.
import { readFileSync, existsSync } from 'node:fs'
import { ribbonsPathOf } from '../cartograph/scene.js'
import { scenes } from './_scenes.mjs'
import { subInkOf, reachOf, trueGeometrySites, siteOf } from './_true-geometry.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const named = process.argv.slice(2).filter(a => !a.startsWith('--'))

/** The sub-ink edges between two owners: [{ at, L, a, b, chains, site }] (site: the true-geometry site it belongs to, or null). */
function judge(P, streets) {
  const sub = subInkOf(P?.eps), O = P.owners, bad = [], sites = trueGeometrySites(streets, P.eps)
  const rings = [...P.blocks.map((r, k) => [r, P.blockLabels[k]]), ...(P.blockHoles || []).flatMap((hs, k) => (hs || []).map((h, j) => [h, P.blockHoleLabels?.[k]?.[j]]))]
  for (const [r, lab] of rings) {
    if (!lab) throw new Error('a block ring carries no labels — NOT CHECKED')
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (L >= sub) continue
      const oa = O[lab[i]], ob = O[lab[(i + 1) % r.length]]
      if (!oa?.skelId || !ob?.skelId || oa.skelId === ob.skelId) continue
      const chains = !oa.skelId.startsWith('__') && !ob.skelId.startsWith('__')
      bad.push({ at: a, L, a: `${oa.skelId}|${oa.side}`, b: `${ob.skelId}|${ob.side}`, chains, site: chains ? siteOf(sites, oa.skelId, ob.skelId, a, b) : null })
    }
  }
  return bad
}

let red = 0
const list = arg('ribbons') ? named : scenes('cartograph/data/<scene>/clean/ribbons.json', { has: (s) => existsSync(ribbonsPathOf(s)), label: 'ribbons.json' })
for (const scene of list) {
  const path = arg('ribbons') || ribbonsPathOf(scene)
  const j = JSON.parse(readFileSync(path, 'utf8')), P = j.protopolygon
  if (!P) { console.log(`⛔ ${scene}: NOT CHECKED — ${path} carries no protopolygon`); red++; continue }
  if (!Array.isArray(j.streets)) { console.log(`⛔ ${scene}: NOT CHECKED — ${path} carries no streets (the mint's input polylines)`); red++; continue }
  const all = judge(P, j.streets), tg = all.filter(x => x.site), bad = all.filter(x => !x.site)
  if (bad.length) red++
  const rim = bad.filter(x => !x.chains), fmt = (x) => `(${x.at.map(v => v.toFixed(3)).join(', ')}) ${(x.L * 1000).toFixed(2)} mm ${x.a} → ${x.b}${x.site ? ` (crossing ${(x.site.d * 1000).toFixed(1)} mm from a vertex)` : ''}`
  console.log(`${bad.length ? '⛔' : '✅'} ${scene}: ${bad.length - rim.length} sub-ink edge(s) between two chains · ${rim.length} with the rim or water (< ${(subInkOf(P.eps) * 1000).toFixed(1)} mm)`
    + `\n     true geometry (allowed, a crossing within ${(reachOf(P.eps) * 1000).toFixed(1)} mm of a vertex): ${tg.length}${tg.length ? ` — ${tg.map(fmt).join(' · ')}` : ''}`
    + (rim.length ? `\n     rim/water: ${rim.map(fmt).join(' · ')}` : '')
    + (bad.length ? `\n     first: ${bad.slice(0, 3).map(fmt).join(' · ')}` : ''))
}

if (process.argv.includes('--mutants')) {
  const eps = 0.005, own = [{ skelId: 'x', side: 'left' }, { skelId: 'y', side: 'right' }, { skelId: 'x', side: 'right' }]
  const own2 = [...own, { skelId: 'w', side: 'left' }, { skelId: 'x2', side: 'left' }, { skelId: 'y2', side: 'right' }]
  // x runs along z = 0 with a vertex at (10, 0); y crosses it at (10.001, 0), 1 mm from that vertex: a true-geometry site. w is far.
  // and along z = 20, y2 crosses x2 13 mm from x2's vertex at (10, 20): past REACH (12 mm at ε = 5 mm), so no site.
  const streets = [{ skelId: 'x', points: [[0, 0], [10, 0], [20, 0]] }, { skelId: 'y', points: [[10.001, -5], [10.001, 5]] }, { skelId: 'w', points: [[50, -5], [50, 5]] },
                   { skelId: 'x2', points: [[0, 20], [10, 20], [20, 20]] }, { skelId: 'y2', points: [[10.013, 15], [10.013, 25]] }]
  const fx = (ring, labels) => judge({ eps, owners: own2, blocks: [ring], blockLabels: [labels] }, streets).filter(x => !x.site).length
  const clean = fx([[0, 0], [10, 0], [10, 10], [0, 10]], [0, 1, 1, 0])
  const poke = fx([[30, 0], [40, 0], [40.001, 0], [40, 10], [30, 10]], [0, 0, 1, 1, 0])
  const butt = fx([[0, 0], [10, 0], [10, 2 * eps], [0, 2 * eps]], [0, 0, 2, 2])
  const site = fx([[0, 0.005], [10, 0.005], [10.001, 0.006], [10, 10], [0, 10]], [0, 0, 1, 1, 0])
  const planted = fx([[0, 0.005], [10, 0.005], [10.001, 0.006], [10, 10], [0, 10]], [0, 0, 3, 3, 0])
  const far = fx([[0, 20.005], [10.010, 20.005], [10.013, 20.006], [10, 30], [0, 30]], [4, 4, 5, 5, 4])
  const ok = !clean && poke === 1 && !butt && !site && planted === 1 && far === 1
  console.log(`   ${ok ? '✅' : '⛔'} mutant fixture · clean ${clean} · 1 mm edge between two chains that do not cross ${poke} (must be 1, RED) · 2ε butt of one chain ${butt} · the exact ink's edge at a site ${site} (allowed) · a planted butt residue beside the site ${planted} (must be 1, RED) · a sub-ink edge at a crossing past REACH ${far} (must be 1, RED)`)
  if (!ok) red++
}

console.log(red ? '\n⛔ RED — ① carries a sub-ink edge between two owners (mintProtopolygon), or the fixture failed'
  : '\n✅ GREEN — no ① edge shorter than its ink is wide lies between two owners')
process.exit(red ? 1 : 0)
