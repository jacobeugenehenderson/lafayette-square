#!/usr/bin/env node
// CLAIM — ②'s BAND DIFFERENCE NEVER DRAWS ONE LINE TWICE, AND A JOIN LEAVES NO SLIVER. `offsetRingByRects` strikes ② as
// ① minus the union of each edge's band and each vertex's join. ⭐ FOUND 2026-10-25 (Splice; the stamp's antenna refusal
// named the sites): built from separate pieces, each rounding its own copy of a shared corner, the union drew a 2 mm zigzag
// at a 1.9° join (HPDM), a 3.96 m needle where two caps of one line lay a sub-step apart (JH), took a miter 46.5 m behind a
// 2.9 m band (HPDM), and a cone test refused by float noise the miter a depth-0 ① edge needs, leaving a 4.58 m × 46 mm
// sliver of ground (LS). §5d (BRIEF-the-ink-meets-inside-the-ink): each join computed ONCE and both bands built from it; a
// miter only between the caps and only where its piece is simple; else the chord.
// ASSERTS, file only, on joins captured from the pours (checks/fixtures/band-joins-2026-10-25.json, scratch/splice/
// offset-capture.mjs), replayed through the LIVE offsetRingByRects:
//   (a) no ② ring folds on itself within a lattice step (checks/_nearMiss.mjs, its `self` bucket: no constant here)
//   (b) at a convex join beside a depth-0 ① edge whose miter lies between the caps, ② does not reach the ① vertex
//   (c) a planted join whose miter would be a bow-tie takes the chord: ② is one ring, does not fold, does not carry X
//   (d) the cone test is gone from offsetRingByRects (read from the source)
// MUTANT (always run): the same joins through the FROZEN pre-§5d construction (checks/fixtures/band-clips-frozen-c138cc2c.mjs,
// united and subtracted by the same live booleans) must fold (a) and leave the sliver (b).
//   node checks/claims-no-band-union-reversal.mjs [--towns [scene …]]   (--towns: ⚠️ heavy, one ② build per town)
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { offsetRingByRects, unionRings, differenceRings } from '../src/lib/tileGround.js'
import { nearMisses } from './_nearMiss.mjs'
import { bandClipsFrozen } from './fixtures/band-clips-frozen-c138cc2c.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const area = (rs) => rs.reduce((s, r) => { let a = 0; for (let i = 0; i < r.length; i++) { const j = (i + 1) % r.length; a += r[i][0] * r[j][1] - r[j][0] * r[i][1] } return s + a / 2 }, 0)
const folds = (rings) => nearMisses([{ groupKey: '②', items: rings }]).filter(x => x.self).length
const idMapOf = (f) => (f.hwy ? { e: f.ring.map((_, k) => k), v: f.ring.map((_, k) => k), hwy: f.hwy } : null)
const live = (f) => offsetRingByRects(f.ring, (j) => f.depth[j], false, null, null, idMapOf(f))
const frozen = (f) => differenceRings([f.ring], unionRings(bandClipsFrozen(f.ring, (j) => f.depth[j], false, idMapOf(f))))
const hasVertex = (rings, p) => rings.some(r => r.some(q => Math.abs(q[0] - p[0]) < 5e-4 && Math.abs(q[1] - p[1]) < 5e-4))

const { joins } = JSON.parse(readFileSync(join(HERE, 'fixtures/band-joins-2026-10-25.json'), 'utf8'))
for (const f of joins) {
  const L = live(f), F = frozen(f), lf = folds(L), ff = folds(F)
  row(lf === 0, `(a) ${f.scene} block ${f.block} (${f.what.split(':')[0]}): ② folds on itself ${lf} time(s)`)
  // the depth-0 joins of this ring whose ① vertex is the site: the miter piece must cut it away
  const n = f.ring.length, d0 = f.ring.map((v, i) => i).filter(i => { const a = f.depth[(i - 1 + n) % n], b = f.depth[i]
    return Math.hypot(f.ring[i][0] - f.site[0], f.ring[i][1] - f.site[1]) < 1e-3 && (!(a[1] > 0) !== !(b[0] > 0)) })
  for (const i of d0) row(!hasVertex(L, f.ring[i]), `(b) ${f.scene} block ${f.block} w${i}, beside a depth-0 ① edge: ② reaches the ① vertex ${hasVertex(L, f.ring[i])} (the sliver)`)
  // the mutant: the frozen construction folds where this one was found folding, or keeps the sliver
  const caught = ff > 0 || d0.some(i => hasVertex(F, f.ring[i]))
  row(caught, `mutant: ${f.scene} block ${f.block} through the frozen pre-§5d bands: folds ${ff}${d0.length ? ` · reaches the ① vertex ${d0.some(i => hasVertex(F, f.ring[i]))}` : ''} (must show the defect)`)
}
// (c) a planted bow-tie: at (0,0), A from (−16.309, 0) with depth 5.874 → 3.028, S toward −40.69° for 6.624 m with depth
// 5.242 → 5.125 (the ring is clockwise; offsetRingByRects orients its own normals). The curb lines meet between the caps
// (tA 1.342, tS 0.435), but [v, A.Q, X, S.P] crosses itself: it must take the chord. With the miter allowed there (the
// simplicity test switched off in a temp copy, scratch/splice/bowtie-probe.mjs) ② retraced itself through X
// (−3.767, −3.685); here ② is one ring, does not fold, and does not carry X.
{
  const th = -40.69 * Math.PI / 180, c = [6.624 * Math.cos(th), 6.624 * Math.sin(th)]
  const ring = [[-16.309, 0], [0, 0], c, [c[0] - 20, c[1] - 30]].map(p => p.map(x => Math.round(x * 1000) / 1000))
  const L = live({ ring, depth: [[5.874, 3.028], [5.242, 5.125], [0, 0], [0, 0]] }), X = [-3.767, -3.685]
  row(L.length === 1 && folds(L) === 0 && !hasVertex(L, X), `(c) a planted bow-tie join takes the chord: ${L.length} ring(s) · folds ${folds(L)} · carries the bow-tie's X ${hasVertex(L, X)}`)
}
// (d) the cone is gone: read from offsetRingByRects' own body
{
  const src = readFileSync(join(HERE, '../src/lib/tileGround.js'), 'utf8'), at = src.indexOf('export function offsetRingByRects(')
  const body = at < 0 ? '' : src.slice(at, src.indexOf('\n}\n', at))
  row(at >= 0 && !/inCone/.test(body), `(d) offsetRingByRects decides a miter without a cone test: ${at < 0 ? 'NOT CHECKED — offsetRingByRects not found' : !/inCone/.test(body)}`)
}
// --towns (⚠️ HEAVY: one ② build per town, through the one feed): every tile's ② contour (iaFull, iA) in every named town,
// no ring folding on itself; each fold listed with its tile and coordinate (a census, so the sites can be read).
if (process.argv.includes('--towns')) {
  const { feed, buildProto, feedScenes } = await import('../scratch/_proto-feed.mjs')
  for (const scene of feedScenes().filter(a => !a.startsWith('--'))) {
    const f = feed(scene); if (!f) { row(false, `${scene}: NOT CHECKED — the feed refused (above)`); continue }
    let T; try { T = buildProto(f).protoShapeTiles } catch (e) { row(false, `${scene}: NOT CHECKED — the build refused: ${e.message.split('\n')[0].slice(0, 160)}`); continue }
    const hits = []
    T.forEach((t, ti) => { for (const key of ['iaFull', 'iA']) for (const r of t[key] || []) if (r?.length >= 3)
      for (const x of nearMisses([{ groupKey: key, items: [r] }]).filter(x => x.self)) hits.push({ ti, key, at: x.at || x.p }) })
    row(!hits.length, `${scene}: ${T.length} tile(s) · ② rings folding on themselves ${hits.length}${hits.length ? ': ' + hits.slice(0, 12).map(h => `t${h.ti} ${h.key} ${JSON.stringify(h.at).slice(0, 40)}`).join(' · ') : ''}`)
  }
}
console.log(red ? '\n⛔ RED — ②\'s band difference draws a line twice or leaves a join\'s sliver, or the mutant was not caught'
  : '\n✅ GREEN — every captured join is struck once, and the frozen construction is caught')
process.exit(red ? 1 : 0)
