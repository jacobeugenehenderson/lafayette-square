#!/usr/bin/env node
// CLAIM — ② MAKES NO CORNER AT A TRUE-GEOMETRY SUB-INK EDGE. Where two centrelines cross near a vertex, the exact ε ink has a
// sub-ink edge between the two owners (checks/_true-geometry.mjs; BRIEF-the-ink-meets-inside-the-ink §5a). The fold that
// used to drop such edges before ② (`offsetRingByRects`) is deleted, so ② now sees them. ⛔ A corner there is a faked one:
// a radius eased into a millimetre edge, the class of PTown Stable Path's 121° (its flatten refusal).
// ⭐ WHY A CHECK AND NOT THE FOLD (Boz, 2026-10-25): safety is proven, not kept by a post-union absorption. If this is RED
// after the folds go, that is a ② defect and a stop, not a reason to restore the fold.
// READS the painter, per town: `tileGround.js#buildTileGround` built through the one feed (scratch/_proto-feed.mjs) from a
// COPY of tileGround.js with one capture after the `rSrc` statement (each outer block ring's per-vertex corner radius from
// `protoRAt`, the radius `easeAt` hands the offset). For every sub-ink edge on that ring that the shared predicate places at a
// site, both of its end vertices must have R = 0. Hole rings take no ease (their offset passes none), so they cannot corner.
// The site predicate is the SAME module claims-no-sub-ink-edge-between-two-owners reads, so the two cannot drift.
//
//   node checks/claims-no-corner-at-a-true-geometry-edge.mjs [scene …] [--ribbons=path] [--mutants]
//     --ribbons=path (with one scene): build on that ribbons (e.g. a re-mint) in place of the scene's own.
//     --fixture-only: the mutant fixture and the anchor, no build (light; the town runs need the heavy slot).
//
// ⭐ MUTANT (--mutants): the judge on a fixture ring with a site's edge goes RED when either end vertex carries a radius, and
// GREEN when both are 0. ⚠️ Heavy: one ② build per town (the heavy slot).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { ROOT } from './_scenes.mjs'
import { subInkOf, trueGeometrySites, siteOf } from './_true-geometry.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)

/** Site edges on captured rings whose end vertices carry a radius: { sites, judged, bad: [{ at, a, b, r0, r1 }] }. */
function judge(captured, owners, streets, eps) {
  const sub = subInkOf(eps), sites = trueGeometrySites(streets, eps), bad = []
  let judged = 0
  for (const { ring, labs, rSrc } of captured) {
    const n = ring.length
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n]
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= sub) continue
      const oa = owners[labs[i]], ob = owners[labs[(i + 1) % n]]
      if (!oa?.skelId || !ob?.skelId || oa.skelId === ob.skelId) continue
      if (!siteOf(sites, oa.skelId, ob.skelId, p, q)) continue
      judged++
      const r0 = rSrc[i] || 0, r1 = rSrc[(i + 1) % n] || 0
      if (r0 > 0 || r1 > 0) bad.push({ at: p, a: oa.skelId, b: ob.skelId, r0, r1 })
    }
  }
  return { sites: sites.length, judged, bad }
}

// the capture: one statement after `rSrc`, in a copy of tileGround.js; the live file is never written
const SRC = join(ROOT, 'src/lib/tileGround.js')
const ANCHOR = '? 0 : protoRAt(labs, i, ring.length, depthAt(i), turnOf(ring, i)))\n'
const capturedModule = () => {
  const src = readFileSync(SRC, 'utf8')
  if (src.split(ANCHOR).length !== 2) return null
  const D = join(ROOT, 'src/lib')
  return src.replace(ANCHOR, ANCHOR + '        ;(globalThis.__rSrcCapture ||= []).push({ ring, labs, rSrc })\n')
    .replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from '${pathToFileURL(join(D, r)).href}'`)
    .replace(/from 'clipper-lib'/g, `from '${import.meta.resolve('clipper-lib')}'`)
}

let red = 0
if (process.argv.includes('--mutants')) {
  // a site: x along z = 0 with a vertex at (10, 0), y crossing it 1 mm away; the fixture ring carries the exact ink's edge there
  const eps = 0.005, owners = [{ skelId: 'x', side: 'left' }, { skelId: 'y', side: 'right' }]
  const streets = [{ skelId: 'x', points: [[0, 0], [10, 0], [20, 0]] }, { skelId: 'y', points: [[10.001, -5], [10.001, 5]] }]
  const ring = [[0, 0.005], [10, 0.005], [10.001, 0.006], [10, 10], [0, 10]], labs = [0, 0, 1, 1, 0]
  const at = (rSrc) => judge([{ ring, labs, rSrc }], owners, streets, eps)
  const none = at([0, 0, 0, 0, 0]), radius = at([0, 3, 0, 0, 0]), far = at([0, 0, 3, 0, 0])
  const ok = none.judged === 1 && !none.bad.length && radius.bad.length === 1 && far.bad.length === 1
  console.log(`   ${ok ? '✅' : '⛔'} mutant fixture · site edge judged ${none.judged} · R = 0 at both ends → ${none.bad.length} · R at its first end → ${radius.bad.length} (must be 1, RED) · R at its second end → ${far.bad.length} (must be 1, RED)`)
  if (!ok) red++
}

const modSrc = capturedModule()
if (!modSrc) { console.log('⛔ NOT CHECKED — the rSrc statement this check captures after is not in src/lib/tileGround.js (re-aim the anchor)'); process.exit(2) }
if (process.argv.includes('--fixture-only')) { console.log(red ? '⛔ fixture RED' : '✅ fixture GREEN · anchor found'); process.exit(red ? 1 : 0) }
const file = join(mkdtempSync(join(tmpdir(), 'no-corner-tg-')), 'tileGround.js'); writeFileSync(file, modSrc)
const tg = await import(pathToFileURL(file).href)
const scenes = feedScenes().filter(a => !a.startsWith('--'))
if (arg('ribbons') && scenes.length !== 1) { console.log('⛔ NOT CHECKED — --ribbons takes exactly one scene'); process.exit(2) }
for (const scene of scenes) {
  const f = feed(scene); if (!f) { red++; continue }
  if (arg('ribbons')) f.ribbons = JSON.parse(readFileSync(arg('ribbons'), 'utf8'))
  const P = f.ribbons.protopolygon
  if (!P || !Array.isArray(f.ribbons.streets)) { console.log(`⛔ ${scene}: NOT CHECKED — no protopolygon or no streets`); red++; continue }
  globalThis.__rSrcCapture = []
  buildProto(f, { tg })
  const cap = globalThis.__rSrcCapture
  if (!cap.length) { console.log(`⛔ ${scene}: NOT CHECKED — the build captured no block ring (the capture site was not reached)`); red++; continue }
  const { sites, judged, bad } = judge(cap, P.owners, f.ribbons.streets, P.eps)
  if (bad.length) red++
  console.log(`${bad.length ? '⛔' : '✅'} ${scene}: ${sites} true-geometry site(s) · ${judged} site edge(s) on ② block rings · ${bad.length} with a corner radius at an end`
    + (bad.length ? `\n     ${bad.slice(0, 4).map(b => `(${b.at.map(v => v.toFixed(3)).join(', ')}) ${b.a} | ${b.b} · R ${b.r0.toFixed(2)} / ${b.r1.toFixed(2)} m`).join(' · ')}` : ''))
}
console.log(red ? '\n⛔ RED — ② puts a corner at a true-geometry sub-ink edge (protoRAt), or a town was not checked, or the fixture failed'
  : '\n✅ GREEN — ② makes no corner at any true-geometry sub-ink edge')
process.exit(red ? 1 : 0)
