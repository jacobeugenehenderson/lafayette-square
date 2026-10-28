#!/usr/bin/env node
// claims-a-chain-end-in-a-roadway-is-a-node.mjs — DOES EVERY CHAIN END THAT LIES INSIDE ANOTHER STREET'S ROADWAY MEET IT AT A NODE?
//
// ⭐ THE RULING (Jacob, 2026-10-27; registry `r-a-chain-end-in-a-roadway-is-a-T`, BRIEF-a-chain-end-in-a-roadway-is-a-T §1): a
// chain end that is no node and lies inside another street's roadway is a T, joined by rule at mintInputs
// (`cartograph/chainJoins.mjs#joinChainEnds`), judged by THAT street's own half-width.
// Per town:
//   ① the skeleton's (a) ends, judged independently of the join (`_chainEnds.mjs#judge`: skeleton.js's own node rule);
//   ② the two node rules agree: skeleton.js#vKey (1 cm) and the mint's lattice key (chainJoins.mjs#nodeKey) name the same ends
//      as no node, over the chains ① strokes;
//   ③ the join, run on ①'s input streets (`_chainEnds.mjs#mintStreetsOf`): every (a) end is JOINED — it ends on a vertex its
//      through street carries, and its cap is the node's (not a degree-1 round end). An (a) end the join refused (an authored
//      slot it would re-key, an acute corner) is RED by name: the refusal is loud, and Jacob or Boz decides it;
//   ④ the frozen record: where ribbons.json's ① carries `chainJoins`, its joined set equals the computed one. A ① frozen before
//      the join carries none and is printed as such (re-pour to freeze it).
// How an end is judged, and what is set aside by name: `_chainEnds.mjs` (shared with the (b′) question,
// `scratch/chain-ends/claims-a-chain-end-reaching-a-roadway-awaits-a-ruling`, which is not this check's: it is not joined).
// ⭐ MUTANTS (--mutants), each on the town with one noded T end moved 0.5 m along its through street (so every town has an (a)
// end to join): the move is seen as (a) · the join off · the foot not inserted into the through street · the cap left round ·
// an authored slot planted past the foot (the join must refuse) — each → RED.
//   node checks/claims-a-chain-end-in-a-roadway-is-a-node.mjs [<scene> …] [--mutants]
// Read-only. Exits 1 on any (a) end not joined, a node-rule disagreement, a frozen record that differs, or a mutant not seen.
import { readFileSync } from 'node:fs'
import { scenes } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
import { loadTown, judge, printRow, movedTEnds, mintStreetsOf, vKey } from './_chainEnds.mjs'
import { joinChainEnds, nodeKey } from '../cartograph/chainJoins.mjs'
import { townBlockCustoms } from '../cartograph/mintInputs.mjs'
import { ribbonsPathOf } from '../cartograph/scene.js'
const MUTANTS = process.argv.includes('--mutants')

// the join, or a mutation of it (read from the source, its literal span named)
const mutated = async (tag, from, to) => (await importSource('cartograph/chainJoins.mjs', { transform: (t) => { if (!t.includes(from)) throw new Error(`[mutant ${tag}] chainJoins.mjs no longer holds the text it mutates — re-aim it`); return t.replace(from, to) }, suffix: `// ${tag}` })).joinChainEnds
const MUT = MUTANTS ? {
  'the join off': await mutated('join-off', '  return { streets: out, joins }', "  return { streets, joins: joins.map(j => ({ ...j, joined: false, why: 'the join off (mutant)' })) }"),
  'the foot not inserted': await mutated('no-insert', '      if (atVertex < 0) (inserts.get(ti) || inserts.set(ti, []).get(ti)).push({ k, t: best.t, p: F })', ''),
  'the cap left round': await mutated('cap-round', "    for (const j of myJoins) if (caps) caps[j.end] = { ...(caps[j.end] || {}), cap: 'butt', degree: j.degree }", ''),
} : null

// ③: the (a) ends the join leaves unjoined, by name
function unjoined(rows, mint, J) {
  const out = [], byId = new Map(J.streets.map(s => [s.skelId, s])), gsById = new Map(mint.gradeSep.map(s => [s.skelId, s]))
  for (const r of rows) {
    const j = J.joins.find(x => x.street === r.id && x.end === r.end)
    if (!j) { out.push({ r, why: 'the join did not see it' }); continue }
    if (!j.joined) { out.push({ r, why: `not joined: ${j.why}` }); continue }
    const s = byId.get(r.id), t = byId.get(j.into) || gsById.get(j.into), P = s.points, E = r.end === 'start' ? P[0] : P[P.length - 1]
    if (!t?.points.some(q => nodeKey(q) === nodeKey(E))) { out.push({ r, why: `joined, but its end (${E.map(v => v.toFixed(3)).join(', ')}) is no vertex of ${j.into}` }); continue }
    const cap = s.caps?.[r.end]
    if (!cap || cap.degree === 1 || cap.cap === 'round') out.push({ r, why: `joined, but its cap is still a dead end's (${JSON.stringify(cap)})` }) }
  return out
}

let bad = 0
for (const scene of scenes('cartograph/data/<scene>/clean/skeleton.json')) {
  const town = loadTown(scene), J0 = judge(town), rows = J0.inside, mint = mintStreetsOf(town), bc = townBlockCustoms(scene, 'claims-a-chain-end-in-a-roadway-is-a-node')
  // ② the node rules agree, over the chains ① strokes
  const mintIds = new Set([...mint.streets, ...mint.gradeSep].map(s => s.skelId)), sk1 = town.sk.filter(c => mintIds.has(c.id))
  const dv = new Map(), dl = new Map()
  for (const c of sk1) c.points.forEach((p, i, P) => { const w = i === 0 || i === P.length - 1 ? 1 : 2; dv.set(vKey(p), (dv.get(vKey(p)) || 0) + w); const k = nodeKey([p.x, p.z]); dl.set(k, (dl.get(k) || 0) + w) })
  const disagree = sk1.flatMap(c => [0, c.points.length - 1].map(i => c.points[i]).filter(p => (dv.get(vKey(p)) === 1) !== (dl.get(nodeKey([p.x, p.z])) === 1)).map(p => `${c.id} @(${p.x}, ${p.z})`))
  const J = joinChainEnds({ ...mint, discAt: town.disc, blockCustoms: bc }), miss = unjoined(rows, mint, J)
  // ④ the frozen record
  const proto = JSON.parse(readFileSync(ribbonsPathOf(scene), 'utf8')).protopolygon, set = (js) => js.filter(j => j.joined).map(j => `${j.street}.${j.end}→${j.into}`).sort().join(' · ')
  const frozen = !proto ? 'no frozen ①' : !Array.isArray(proto.chainJoins) ? 'frozen ① predates the join (no chainJoins): re-pour to freeze it' : set(proto.chainJoins) === set(J.joins) ? 'frozen chainJoins match' : null
  const n = miss.length + disagree.length + (frozen ? 0 : 1)
  if (n) bad++
  console.log(`${n ? '⛔' : '✅'} ${scene}: ${J0.ends} end(s) that are no node · (a) INSIDE another roadway ${rows.length}, joined ${rows.length - miss.length} · NOT joined ${miss.length} · node rules disagree ${disagree.length} · ${frozen ?? '⛔ FROZEN chainJoins DIFFER from the computed joins'} · set aside: outside the disc ${J0.aside.outsideDisc}, no ribbon ${J0.aside.noRibbon}, a grade-separated pair ${J0.aside.gradeSep.length}`)
  if (J0.noHW.size) { bad++; console.log(`   ⛔ ${J0.noHW.size} chain(s) with no pour half-width: ${[...J0.noHW].slice(0, 6).join(' · ')}`) }
  for (const r of rows) { const m = miss.find(x => x.r === r); printRow(r, m ? `⛔ (a) ${m.why} ·` : '(a) joined ·') }
  for (const d of disagree) console.log(`   ⛔ the node rules disagree (skeleton.js vKey vs the mint's lattice): ${d}`)
  if (frozen === null) console.log(`   frozen: ${set(proto.chainJoins) || '—'}\n   computed: ${set(J.joins) || '—'}`)
  for (const r of J0.aside.gradeSep) printRow(r, `set aside ${r.kind}`)
  if (MUTANTS) {
    // the first true T whose moved end the judge sees as (a) and the REAL join joins onto that same through street
    let M = null, t2, j2, m2, base
    for (const c of movedTEnds(town)) { t2 = { ...town, sk: c.sk, rib: c.rib }; j2 = judge(t2); m2 = mintStreetsOf(t2)
      const J2 = joinChainEnds({ ...m2, discAt: town.disc, blockCustoms: bc })
      if (j2.inside.some(r => r.id === c.id && r.end === c.end) && J2.joins.some(j => j.joined && j.street === c.id && j.end === c.end && j.into === c.into)) { M = c; base = unjoined(j2.inside, m2, J2); break } }
    if (!M) { bad++; console.log('   ⛔ mutants not made: no true T whose moved end the judge sees and the real join joins'); continue }
    console.log(`   mutant · ${M.what}, moved 0.5 m along it: seen as (a), RED as it must be (${rows.length} → ${j2.inside.length}), and the real join joins it`)
    const tries = [...Object.entries(MUT).map(([k, f]) => [k, () => f({ ...m2, discAt: town.disc, blockCustoms: bc })]),
      ['an authored slot planted past the foot', () => { const tgt = M.into   // the moved end's through street
        return joinChainEnds({ ...m2, discAt: town.disc, blockCustoms: { ...bc, [tgt]: { ...(bc[tgt] || {}), left: { ...(bc[tgt]?.left || {}), 999: { pavementHW: 6 } } } } }) }]]
    for (const [k, run] of tries) { const got = unjoined(j2.inside, m2, run()), red = got.length > base.length
      if (!red) bad++
      console.log(`   mutant · ${k}: ${red ? `RED, as it must be (${got.filter(x => !base.some(b => b.r === x.r)).map(x => `${x.r.id}.${x.r.end}: ${x.why}`).join(' · ')})` : '⛔ still joined — the check cannot see it'}`) }
  }
}
console.log(bad ? `\n⛔ RED — a chain end lies inside another street's roadway and is not joined as a T (or a check of it could not be made)` : '\n✅ GREEN — every chain end inside another street\'s roadway is joined as a T')
process.exit(bad ? 1 : 0)
