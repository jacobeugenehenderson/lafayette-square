#!/usr/bin/env node
// CLAIM — ② MAKES AT MOST ONE CORNER WHERE THE EXACT INK HAS A SUB-INK EDGE, AND ONLY IF THE GROUND THERE TURNS. Where two
// centrelines cross near a vertex, the exact ε ink has a sub-ink edge between the two owners (checks/_true-geometry.mjs;
// BRIEF-the-ink-meets-inside-the-ink §5a). The fold that dropped such edges before ② (`offsetRingByRects`) is deleted, so a
// real corner can now arrive split over a sub-ink edge: a gentle vertex then the crossing's corner (HPDM primary-link-124,
// JH diversity-plaza: −5° then −78°/−84°, one real corner); and a notch can arrive as two corners that cancel (JH 99th-street:
// ±45°, net 0°, a radius at both ends: faked).
// ⭐ THE INVARIANT (Boz, 2026-10-25): a CLUSTER (ring vertices joined by sub-ink edges) that holds a site's edge yields at
// most ONE corner (R > 0 at no more than one of its vertices), and only when the cluster's NET turn (from the edge entering it
// to the edge leaving it) reaches the code's own corner threshold, `FILLET_TURN_TOL`, read out of tileGround.js, never copied.
// ⭐ WHY A CHECK AND NOT THE FOLD (Boz): safety is proven, not kept by a post-union absorption. If this is RED after the
// folds go, that is a ② defect and a stop, not a reason to restore the fold.
// READS the painter, per town: `tileGround.js#buildTileGround` built through the one feed (scratch/_proto-feed.mjs) from a
// COPY of tileGround.js with one capture after the `rSrc` statement (each outer block ring's per-vertex corner radius from
// `protoRAt`, the radius `easeAt` hands the offset). Hole rings take no ease (their offset passes none), so they cannot corner.
// The site predicate is the SAME module claims-no-sub-ink-edge-between-two-owners reads, so the two cannot drift.
//
//   node checks/claims-no-corner-at-a-true-geometry-edge.mjs [scene …] [--ribbons=path] [--mutants]
//     --ribbons=path (with one scene): build on that ribbons (e.g. a re-mint) in place of the scene's own.
//     --fixture-only: the mutant fixture and the anchors, no build (light; the town runs need the heavy slot).
//
// ⭐ MUTANTS (--mutants), on fixtures at a site: the 99th-street notch (±45°, net 0) with R at both ends goes RED, and with R
// at one end still RED (net below the threshold); a real crossing corner (gentle vertex, then ~85°) with R at the corner
// only is GREEN; the same with R at both of its vertices goes RED (two corners). ⚠️ Heavy: one ② build per town.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { ROOT } from './_scenes.mjs'
import { subInkOf, trueGeometrySites, siteOf } from './_true-geometry.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)

// ⭐ The corner threshold, READ from the source (it is a module constant, not exported): the `FILLET_TURN_TOL` statement's
// expression, evaluated. ⛔ Absent or unreadable ⇒ NOT CHECKED, never a default.
const SRC = join(ROOT, 'src/lib/tileGround.js')
const TOL_DEG = (() => {
  const m = readFileSync(SRC, 'utf8').match(/^(?:export )?const FILLET_TURN_TOL = ([0-9.\s*/+\-()]+|[0-9.\s*/+\-()]*Math\.PI[0-9.\s*/+\-()]*)$/m)
  const v = m ? Function(`return (${m[1]})`)() : NaN
  return Number.isFinite(v) && v > 0 ? v * 180 / Math.PI : null
})()
if (TOL_DEG == null) { console.log('⛔ NOT CHECKED — FILLET_TURN_TOL is not a readable statement in src/lib/tileGround.js'); process.exit(2) }

const dir = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0])
const turnDeg = (a1, a2) => { const t = a2 - a1; return Math.atan2(Math.sin(t), Math.cos(t)) * 180 / Math.PI }

/** Clusters holding a site's edge that break the invariant: { sites, judged, bad: [{ at, a, b, net, rs }] }. */
function judge(captured, owners, streets, eps) {
  const sub = subInkOf(eps), sites = trueGeometrySites(streets, eps), bad = []
  let judged = 0
  for (const { ring, labs, rSrc } of captured) {
    const n = ring.length
    const short = ring.map((p, i) => { const q = ring[(i + 1) % n]; return Math.hypot(q[0] - p[0], q[1] - p[1]) < sub })
    if (short.every(Boolean)) continue                     // a ring of nothing but sub-ink edges has no edge to enter by
    const seen = new Set()
    for (let i = 0; i < n; i++) {
      if (!short[i] || seen.has(i)) continue
      let s = i; while (short[(s - 1 + n) % n]) s = (s - 1 + n) % n          // the cluster's first sub-ink edge
      let e = s, edges = []; while (short[e % n] && edges.length < n) { edges.push(e % n); seen.add(e % n); e++ }
      const vs = [...edges, (edges[edges.length - 1] + 1) % n]               // the cluster's vertices
      let site = null
      for (const k of edges) { const oa = owners[labs[k]], ob = owners[labs[(k + 1) % n]]
        if (oa?.skelId && ob?.skelId && oa.skelId !== ob.skelId) site ||= siteOf(sites, oa.skelId, ob.skelId, ring[k], ring[(k + 1) % n]) && { a: oa.skelId, b: ob.skelId } }
      if (!site) continue
      judged++
      const v0 = vs[0], v1 = vs[vs.length - 1]
      const net = Math.abs(turnDeg(dir(ring[(v0 - 1 + n) % n], ring[v0]), dir(ring[v1], ring[(v1 + 1) % n])))
      const rs = vs.map(v => rSrc[v] || 0), corners = rs.filter(r => r > 0).length
      if (corners > 1 || (corners === 1 && net < TOL_DEG)) bad.push({ at: ring[v0], ...site, net, rs })
    }
  }
  return { sites: sites.length, judged, bad }
}

// the capture: one statement after `rSrc`, in a copy of tileGround.js; the live file is never written
// the anchor is the `rSrc` statement itself: its first line, then the line that calls `protoRAt(` (its body may change; it
// must bind `ring`, `labs` and `rSrc`). Not found exactly once ⇒ NOT CHECKED.
const ANCHOR = /\n([ \t]*)const rSrc = ring\.map\([^\n]*\n[^\n]*protoRAt\([^\n]*\n/g
const capturedModule = () => {
  const src = readFileSync(SRC, 'utf8'), hits = [...src.matchAll(ANCHOR)]
  if (hits.length !== 1) return null
  const D = join(ROOT, 'src/lib'), [m, ind] = hits[0]
  return src.replace(m, m + `${ind};(globalThis.__rSrcCapture ||= []).push({ ring, labs, rSrc })\n`)
    .replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from '${pathToFileURL(join(D, r)).href}'`)
    .replace(/from 'clipper-lib'/g, `from '${import.meta.resolve('clipper-lib')}'`)
}

let red = 0
if (process.argv.includes('--mutants')) {
  // a site: x along z = 0 with a vertex at (10, 0), y crossing it 1 mm away. Each fixture ring runs along x's ε side.
  const eps = 0.005, owners = [{ skelId: 'x', side: 'left' }, { skelId: 'y', side: 'right' }]
  const streets = [{ skelId: 'x', points: [[0, 0], [10, 0], [20, 0]] }, { skelId: 'y', points: [[10.001, -5], [10.001, 5]] }]
  const at = (ring, labs, rSrc) => judge([{ ring, labs, rSrc }], owners, streets, eps)
  // the notch: along the side, out 45° and back 45° over two sub-ink edges, then on (net 0°)
  const notch = [[0, 0.005], [10, 0.005], [10.002, 0.007], [10.004, 0.005], [20, 0.005], [20, 10], [0, 10]], nL = [0, 0, 1, 1, 1, 1, 0]
  const notchBoth = at(notch, nL, [0, 3, 0, 3, 0, 0, 0]), notchOne = at(notch, nL, [0, 3, 0, 0, 0, 0, 0])
  // the real crossing corner: a gentle vertex (−5°), a sub-ink edge, then the corner (~85°) turning up y's side
  const real = [[0, 0.005], [10, 0.005], [10.004, 0.00535], [10.004, 10], [0, 10]], rL = [0, 0, 1, 1, 0]
  const realOne = at(real, rL, [0, 0, 3, 0, 0]), realBoth = at(real, rL, [0, 3, 3, 0, 0])
  const ok = notchBoth.judged === 1 && notchBoth.bad.length === 1 && notchOne.bad.length === 1 && realOne.judged === 1 && !realOne.bad.length && realBoth.bad.length === 1
  console.log(`   ${ok ? '✅' : '⛔'} mutant fixture (corner threshold ${TOL_DEG.toFixed(1)}°, read) · notch net ${notchBoth.bad[0]?.net.toFixed(1) ?? '?'}° with R at both ends → ${notchBoth.bad.length} (must be 1, RED) · at one end → ${notchOne.bad.length} (must be 1, RED) · real corner net ${realBoth.bad[0]?.net.toFixed(1) ?? '?'}° with R at the corner only → ${realOne.bad.length} (GREEN) · R at both its vertices → ${realBoth.bad.length} (must be 1, RED)`)
  if (!ok) red++
}

const modSrc = capturedModule()
if (!modSrc) { console.log('⛔ NOT CHECKED — the rSrc statement this check captures after is not in src/lib/tileGround.js (re-aim the anchor)'); process.exit(2) }
if (process.argv.includes('--fixture-only')) { console.log(red ? '⛔ fixture RED' : '✅ fixture GREEN · anchors found'); process.exit(red ? 1 : 0) }
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
  console.log(`${bad.length ? '⛔' : '✅'} ${scene}: ${sites} true-geometry site(s) · ${judged} site cluster(s) on ② block rings · ${bad.length} break the invariant (more than one corner, or a corner where the net turn < ${TOL_DEG.toFixed(1)}°)`
    + (bad.length ? `\n     ${bad.slice(0, 4).map(b => `(${b.at.map(v => v.toFixed(3)).join(', ')}) ${b.a} | ${b.b} · net ${b.net.toFixed(1)}° · R ${b.rs.map(r => r.toFixed(2)).join(' / ')} m`).join(' · ')}` : ''))
}
console.log(red ? '\n⛔ RED — ② fakes a corner at a true-geometry sub-ink cluster (protoRAt), or a town was not checked, or the fixture failed'
  : '\n✅ GREEN — every true-geometry sub-ink cluster yields at most one corner, and only where the ground turns')
process.exit(red ? 1 : 0)
