#!/usr/bin/env node
// CLAIM — OFF A PADDED ARC, A LEG ENDS ONLY WHERE THE LADDERS DIFFER (Boz, 2026-10-25, revising his 2026-10-22 ruling; SECTION's
// "a leg ends in exactly two places"). `tileGround.js#sectionPassProtoTile`'s `end(v)`: a change of LABEL whose ladders draw the
// same strips is no seam, and neither is a corner with no pad (square, or one the ease declined): the band bends through, as at
// an unpadded arc (`RIBBONS §1` invariant 1). PTown's stable-path-0 → stable-path-1 dipped to the kerb at a same-ladder label
// change; a cut at ①'s declined corner drew a seam, two legs abutting along the band's own depth.
// READS the painter (SECTION_DUMP rows + the densified ramp), per frozen tile: at every vertex OFF an arc whose two edges'
// ladders (walk + lawn, the dump's own stripLadder) are equal, the ramp may not start or end there (`kS`/`kE` = 0 at an edge
// boundary is a leg end). RED where one does.
//   SECTION_DUMP=1 node checks/claims-a-label-change-ends-no-leg.mjs [scene …] [--mutants]
// ⭐ MUTANTS (--mutants), each must go RED in at least one town of the run:
//   1. the retired frontage rule: any change of LABEL ends a leg;
//   2. the retired cut at a corner with no pad: a leg also ends where the contour turns past FILLET_TURN_TOL off an arc. ⚠️ It
//      reads ②'s own ring turn, not 10-22's carried ① turn (that carry is deleted), so it stands in for the rule, not copies it.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { feed, buildProto, feedScenes } from '../scratch/_proto-feed.mjs'
import { ROOT } from './_scenes.mjs'

if (process.env.SECTION_DUMP !== '1') {
  console.log('⛔ NOT RUN — ▶ SECTION_DUMP=1 node checks/claims-a-label-change-ends-no-leg.mjs [scene …] [--mutants]')
  process.exit(1)
}
const scenes = feedScenes().filter(a => !a.startsWith('--'))
const same = (a, b) => a.walk[0] === b.walk[0] && a.walk[1] === b.walk[1] && a.lawn[0] === b.lawn[0] && a.lawn[1] === b.lawn[1]

/** Off-arc vertices with equal ladders where a leg ends anyway: { bad: [{ at, a, b }], seen, labels } (labels = how many of
 *  the seen vertices are a change of owner, the case PTown's handoff showed). */
async function judge(tg, f) {
  const { sectionPassProtoTile, sectionDump } = tg
  const T = buildProto(f, { tg }).protoShapeTiles || []
  const bad = []
  let seen = 0, labels = 0
  for (const st of T) {
    sectionDump.rows.length = 0; sectionDump.ramp.length = 0
    sectionPassProtoTile(st, f.curbWidth, { outer: 'LU', inner: 'SW' }, f.blockCustoms)
    const rows = new Map(), ends = new Set()
    for (const r of sectionDump.rows) (rows.get(r.ri) || rows.set(r.ri, { si: r.si, e: [] }).get(r.ri)).e[r.i] = r
    // a leg ends at vertex v when a densified piece of edge v starts ramping there, or one of edge v−1 ends ramping there
    const byRi = new Map(); for (const d of sectionDump.ramp) (byRi.get(d.ri) || byRi.set(d.ri, []).get(d.ri)).push(d)
    for (const [ri, D] of byRi) {
      const n = rows.get(ri)?.e.length || 0
      for (let x = 0; x < D.length; x++) {
        const d = D[x], prev = D[(x - 1 + D.length) % D.length], next = D[(x + 1) % D.length]
        if (prev.src !== d.src && d.kS === 0) ends.add(`${ri}|${d.src}`)
        if (next.src !== d.src && d.kE === 0) ends.add(`${ri}|${(d.src + 1) % n}`)
      }
    }
    for (const [ri, { si, e }] of rows) {
      const n = e.length, arc = st.iaArc?.[si], ring = st.iaFull?.[si]
      for (let v = 0; v < n; v++) {
        const A = e[(v - 1 + n) % n], B = e[v]
        if (!A || !B || arc?.[v] != null || !same(A, B)) continue
        seen++; if (A.owner != null && B.owner != null && A.owner !== B.owner) labels++
        if (ends.has(`${ri}|${v}`)) bad.push({ at: ring?.[v], a: A.owner, b: B.owner })
      }
    }
  }
  return { bad, seen, labels }
}

// a copy of the live painter with ONE line replaced (null if that line is gone: the mutant must be re-aimed, never skipped)
const LIVE = '      return !sameLadder(M(p.ri, back), M(p.ri, v))\n'
const mutate = (to) => {
  const src = readFileSync(join(ROOT, 'src/lib/tileGround.js'), 'utf8')
  if (src.split(LIVE).length !== 2) return null
  const D = join(ROOT, 'src/lib')
  return src.replace(LIVE, to)
    .replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from '${pathToFileURL(join(D, r)).href}'`)
    .replace(/from 'clipper-lib'/g, `from '${import.meta.resolve('clipper-lib')}'`)
}
const MUTANTS = [
  { name: 'the retired frontage rule: any change of label ends a leg', src: mutate('      return M(p.ri, back) !== M(p.ri, v)\n'), red: 0 },
  { name: 'the retired cut at a corner with no pad: the contour turning off an arc ends a leg',
    src: mutate(`      if (st.iaArc?.[p.si]?.[v] == null) { const a = ring[back], b = ring[v], c = ring[(v + 1) % n]
        const t = Math.abs(Math.atan2((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])))
        if (t >= FILLET_TURN_TOL) return true }
      return !sameLadder(M(p.ri, back), M(p.ri, v))\n`), red: 0 },
]
const load = async (src, i) => { const file = join(mkdtempSync(join(tmpdir(), `label-change-leg-m${i}-`)), 'tileGround.js'); writeFileSync(file, src); return import(pathToFileURL(file).href) }

const tg = await import('../src/lib/tileGround.js')
const wantMutants = process.argv.includes('--mutants')
let red = 0
for (const scene of scenes) {
  const f = feed(scene); if (!f) { red++; continue }
  const { bad, seen, labels } = await judge(tg, f)
  if (bad.length) red++
  console.log(`${bad.length ? '⛔' : '✅'} ${scene}: ${seen} same-ladder vertex/vertices off an arc (${labels} a change of label) · ${bad.length} end a leg`
    + (bad.length ? `\n     first: ${bad.slice(0, 3).map(b => `(${b.at?.map(v => v.toFixed(3)).join(', ')}) ${b.a} → ${b.b}`).join(' · ')}` : ''))
  if (!wantMutants) continue
  for (const [i, m] of MUTANTS.entries()) {
    if (!m.src) { console.log(`   ⛔ mutant ${i + 1}: end(v) no longer carries the line it replaces — re-aim it`); red++; continue }
    const M = await judge(await load(m.src, i + 1), f)
    if (M.bad.length) m.red++
    console.log(`   ${M.bad.length ? '✅' : '·'} mutant ${i + 1} (${m.name}) → ${M.bad.length ? `RED (${M.bad.length} leg end(s) at equal ladders), as it must be` : 'green in this town'}`)
  }
}
if (wantMutants) for (const [i, m] of MUTANTS.entries()) if (m.src && !m.red) { console.log(`\n⛔ mutant ${i + 1} went RED in NO town of this run — the check cannot see its rule here`); red++ }
console.log(red ? '\n⛔ RED — off an arc a leg ends where the ladders are equal (tileGround.js#sectionPassProtoTile end(v)), or a mutant stayed green everywhere'
  : '\n✅ GREEN — off a padded arc a leg ends only where the ladders differ')
process.exit(red ? 1 : 0)
