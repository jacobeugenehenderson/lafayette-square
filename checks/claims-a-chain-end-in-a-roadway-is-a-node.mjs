#!/usr/bin/env node
// claims-a-chain-end-in-a-roadway-is-a-node.mjs — DOES EVERY CHAIN END THAT LIES INSIDE ANOTHER STREET'S ROADWAY MEET IT AT A NODE?
//
// ⭐ THE RULING (Jacob, 2026-10-27; registry `r-a-chain-end-in-a-roadway-is-a-T`, BRIEF-a-chain-end-in-a-roadway-is-a-T §1): a
// chain end that is no node and lies inside another street's roadway is a T, joined by rule at mintInputs, judged by THAT
// street's own half-width. Until the join is built, every such end is drawn as a round cap inside the other street.
//   · NODE: the skeleton's own reading, `skeleton.js#buildNodeGraph` over `vKey` (run from the source, never restated). An end
//     whose key has degree 1 is no node.
//   · THE OTHER STREET'S LINE: the line ① is minted from, the skeleton's points through `derive.js#tessellateAdaptive` with its
//     `segments` (the same call `mintInputs.mjs#mintInputs` makes).
//   · ITS HALF-WIDTH: the POUR's measure, `tileGround.js#resolveProtoMeasure(run, null, …)` on the ribbons' base measure, for
//     the SIDE of that street the end lies on. ⛔ The Wall: the pour is blind to authoring (`claims-proto-wall` claim A), so no
//     blockCustoms is read here. (The pour's base also goes through `effectiveMeasure`, which zeroes only an inboard side's
//     ped depths; pavementHW passes through it unchanged.)
//   · (a) inside: the end is within that half-width of the other street's line. (b′) reaching: not inside, but the end's own
//     roadway (its own half-width, the narrower side) reaches the other's. ⭐ (b′) is NOT joined (Boz, 2026-10-27): it is RED as
//     a QUESTION for Jacob, so the check stays red on it after the join lands, until he rules.
//   · Judged: every ribbon chain, and ends inside the drawing (the disc, discOf); an end set aside is counted, by reason. A
//     row where either chain is GRADE-SEPARATED is labelled so: mintInputs mints those apart (`gradeSep`), so whether such an
//     end is a T is a question, not a verdict (a nodeless CROSSING is claims-a-nodeless-crossing-is-grade-separated's).
//   · A same-name pair is the false-dead-end class: named as such (claims-false-deadend-census asks by name). A question, not
//     a verdict; it still counts.
// ⭐ MUTANT (--mutants): a noded T end is moved 0.5 m along the through street, off its vertex and still on its line → RED.
//   node checks/claims-a-chain-end-in-a-roadway-is-a-node.mjs [<scene> …] [--mutants]
// Read-only. Exits 1 on any end that is (a) or (b′), or on a mutant the check cannot see.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scenes, ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
import { ribbonsPathOf, mapCleanDir, mapDir } from '../cartograph/scene.js'
import { tessellateAdaptive } from '../cartograph/derive.js'
import { resolveProtoMeasure } from '../src/lib/tileGround.js'
import { splitBoundary, discOf } from '../cartograph/boundaryRecords.mjs'

const { vKey } = await importSource('cartograph/skeleton.js', { span: { from: 'function vKey(p)', to: 'function reverse(coords)' }, suffix: 'export { vKey }' })
const { buildNodeGraph } = await importSource('cartograph/skeleton.js', { span: { functions: ['buildNodeGraph'] }, prefix: `const vKey = ${vKey.toString()}`, suffix: 'export { buildNodeGraph }' })
const MUTANTS = process.argv.includes('--mutants')
const f2 = (v) => v.toFixed(2)

// the ends a skeleton holds that are no node, judged against the ribbons' at-grade roadways
function judge(sk, rib, disc) {
  const { degree } = buildNodeGraph(sk)
  const R = new Map(rib.map(r => [r.skelId, r]))
  const hwOf = (id, side) => { const r = R.get(id); return r ? resolveProtoMeasure({ skelId: id, side, segOrd: null, baseMeasure: r.measure, hwy: false }, null, 0)?.pavementHW ?? null : null }
  const at = sk.filter(c => c.points?.length >= 2 && R.has(c.id))
  const lines = at.map(c => ({ c, pts: tessellateAdaptive(c.points.map(q => [q.x, q.z]), c.segments) }))
  const G = 50, grid = new Map()
  lines.forEach((L, li) => { for (let k = 0; k + 1 < L.pts.length; k++) { const a = L.pts[k], b = L.pts[k + 1]
    for (let x = Math.floor(Math.min(a[0], b[0]) / G); x <= Math.floor(Math.max(a[0], b[0]) / G); x++) for (let z = Math.floor(Math.min(a[1], b[1]) / G); z <= Math.floor(Math.max(a[1], b[1]) / G); z++) {
      const key = x + ',' + z; (grid.get(key) || grid.set(key, []).get(key)).push([li, k]) } } })
  const out = { ends: 0, inside: [], reach: [], noHW: new Set(), aside: { outsideDisc: 0, noRibbon: 0 } }
  for (const c of sk) { if (!(c.points?.length >= 2)) continue
    for (const ix of [0, c.points.length - 1]) { const p = c.points[ix]
      if (degree.get(vKey(p)) !== 1) continue
      out.ends++
      if (!R.has(c.id)) { out.aside.noRibbon++; continue }
      if (disc.dist(p.x, p.z) > disc.R) { out.aside.outsideDisc++; continue }
      const own = Math.min(hwOf(c.id, 'left') ?? Infinity, hwOf(c.id, 'right') ?? Infinity)
      if (!Number.isFinite(own)) out.noHW.add(c.id)
      let best = null
      for (let x = Math.floor((p.x - 60) / G); x <= Math.floor((p.x + 60) / G); x++) for (let z = Math.floor((p.z - 60) / G); z <= Math.floor((p.z + 60) / G); z++) for (const [li, k] of grid.get(x + ',' + z) || []) {
        const L = lines[li]; if (L.c.id === c.id) continue
        const a = L.pts[k], b = L.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; if (!L2) continue
        const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / L2)), d = Math.hypot(p.x - a[0] - t * dx, p.z - a[1] - t * dz)
        const side = dx * (p.z - a[1]) - dz * (p.x - a[0]) > 0 ? 'left' : 'right'
        const hw = hwOf(L.c.id, side); if (!Number.isFinite(hw)) { out.noHW.add(L.c.id); continue }
        if (!best || d - hw < best.d - best.hw) best = { d, hw, side, into: L.c } }
      if (!best) continue
      const row = { id: c.id, name: c.name, into: best.into.id, intoName: best.into.name, d: best.d, hw: best.hw, side: best.side, own, p, sameName: !!c.name && c.name === best.into.name, gs: [R.get(c.id).gradeSeparated && c.id, R.get(best.into.id).gradeSeparated && best.into.id].filter(Boolean) }
      if (best.d <= best.hw) out.inside.push(row)
      else if (Number.isFinite(own) && best.d - best.hw <= own) out.reach.push(row) } }
  return out
}

// the mutant: a T whose end sits on an interior vertex of a through chain, moved 0.5 m along that chain, off its vertex
function moveTEnd(sk, rib, disc) {
  const R = new Map(rib.map(r => [r.skelId, r])), ok = (c) => c.points?.length >= 2 && R.has(c.id) && !R.get(c.id).gradeSeparated
  const interior = new Map()
  for (const c of sk) if (ok(c)) c.points.forEach((q, i) => { if (i > 0 && i + 1 < c.points.length) interior.set(vKey(q), { c, i }) })
  for (const c of sk) { if (!ok(c)) continue
    for (const ix of [0, c.points.length - 1]) { const p = c.points[ix], th = interior.get(vKey(p))
      if (!th || th.c === c || disc.dist(p.x, p.z) > disc.R - 10 || th.c.segments?.[th.i]?.type === 'bezier') continue
      const n = th.c.points[th.i + 1], dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz); if (l < 2) continue
      const moved = { x: p.x + 0.5 * dx / l, z: p.z + 0.5 * dz / l }
      return { sk: sk.map(x => x === c ? { ...c, points: c.points.map((q, i) => i === ix ? moved : q) } : x), what: `${c.id}'s end on ${th.c.id}` } } }
  return null
}

let bad = 0
for (const scene of scenes('cartograph/data/<scene>/clean/skeleton.json')) {
  const sk = JSON.parse(readFileSync(join(mapCleanDir(scene), 'skeleton.json'), 'utf8')).streets || []
  const rib = JSON.parse(readFileSync(ribbonsPathOf(scene), 'utf8')).streets || []
  const { disc: d0 } = splitBoundary(JSON.parse(readFileSync(join(mapDir(scene), 'neighborhood_boundary.json'), 'utf8')), `${scene}'s neighborhood_boundary.json`)
  const disc = discOf(d0, scene)
  const J = judge(sk, rib, disc), n = J.inside.length + J.reach.length
  if (n) bad++
  console.log(`${n ? '⛔' : '✅'} ${scene}: ${sk.length} chain(s) · ${J.ends} end(s) that are no node · (a) INSIDE another roadway ${J.inside.length} · (b′) its own roadway REACHES another's ${J.reach.length} · set aside: outside the disc ${J.aside.outsideDisc}, no ribbon ${J.aside.noRibbon}`)
  if (J.noHW.size) { bad++; console.log(`   ⛔ ${J.noHW.size} chain(s) with no pour half-width: ${[...J.noHW].slice(0, 6).join(' · ')}`) }
  const line = (r, tag) => console.log(`   ${tag} ${r.id} (${r.name || 'unnamed'}) → ${r.into} (${r.intoName || 'unnamed'}): ${f2(r.d)} m from its line, its ${r.side} half-width ${f2(r.hw)} m${tag === '(b′)' ? `, own ${f2(r.own)} m` : ''} @(${r.p.x.toFixed(1)}, ${r.p.z.toFixed(1)})${r.sameName ? ' · SAME NAME: the false-dead-end class, a question (claims-false-deadend-census)' : ''}${r.gs.length ? ` · GRADE-SEPARATED (${r.gs.join(', ')}): minted apart, a question` : ''}`)
  for (const r of J.inside) line(r, '(a)')
  for (const r of J.reach) line(r, '(b′)')
  if (J.reach.length) console.log(`   (b′) is not joined: a question for Jacob (BRIEF §1), not a defect the join fixes`)
  if (MUTANTS) {
    const M = moveTEnd(sk, rib, disc), m = M && judge(M.sk, rib, disc), red = m && m.inside.length > J.inside.length
    if (!red) bad++
    console.log(`   mutant · a noded T end moved 0.5 m along the through street: ${!M ? '⛔ no straight-segment T found to mutate' : red ? `RED, as it must be (${M.what}; inside ${J.inside.length} → ${m.inside.length})` : `⛔ still ${m.inside.length} (${M.what}) — the check cannot see it`}`)
  }
}
console.log(bad ? `\n⛔ RED — a chain end lies in another street's roadway and is no node (or the check could not see its mutant)` : '\n✅ GREEN — no chain end that is no node lies in, or reaches, another street\'s roadway')
process.exit(bad ? 1 : 0)
