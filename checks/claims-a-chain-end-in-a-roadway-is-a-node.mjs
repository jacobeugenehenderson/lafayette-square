#!/usr/bin/env node
// claims-a-chain-end-in-a-roadway-is-a-node.mjs — DOES EVERY CHAIN END THAT LIES INSIDE ANOTHER STREET'S ROADWAY MEET IT AT A NODE?
//
// ⭐ THE RULING (Jacob, 2026-10-27; registry `r-a-chain-end-in-a-roadway-is-a-T`, BRIEF-a-chain-end-in-a-roadway-is-a-T §1): a
// chain end that is no node and lies inside another street's roadway is a T, joined by rule at mintInputs, judged by THAT
// street's own half-width. Until the join is built, every such end is drawn as a round cap inside the other street.
// How an end is judged, and what is set aside by name: `_chainEnds.mjs` (shared with the (b′) question,
// `claims-a-chain-end-reaching-a-roadway-awaits-a-ruling`, which is not this check's: it is not joined).
// ⭐ MUTANT (--mutants): a noded T end is moved 0.5 m along the through street, off its vertex and still on its line → RED.
//   node checks/claims-a-chain-end-in-a-roadway-is-a-node.mjs [<scene> …] [--mutants]
// Read-only. Exits 1 on any (a) end, a chain with no pour half-width, or a mutant the check cannot see.
import { scenes } from './_scenes.mjs'
import { loadTown, judge, printRow, moveTEnd } from './_chainEnds.mjs'
const MUTANTS = process.argv.includes('--mutants')

let bad = 0
for (const scene of scenes('cartograph/data/<scene>/clean/skeleton.json')) {
  const town = loadTown(scene), J = judge(town), n = J.inside.length
  if (n) bad++
  console.log(`${n ? '⛔' : '✅'} ${scene}: ${town.sk.length} chain(s) · ${J.ends} end(s) that are no node · (a) INSIDE another roadway ${n} · set aside: outside the disc ${J.aside.outsideDisc}, no ribbon ${J.aside.noRibbon}, a grade-separated pair ${J.aside.gradeSep.length}`)
  if (J.noHW.size) { bad++; console.log(`   ⛔ ${J.noHW.size} chain(s) with no pour half-width: ${[...J.noHW].slice(0, 6).join(' · ')}`) }
  for (const r of J.inside) printRow(r, '(a)')
  for (const r of J.aside.gradeSep) printRow(r, `set aside ${r.kind}`)
  if (MUTANTS) {
    const M = moveTEnd(town), m = M && judge({ ...town, sk: M.sk }), red = m && m.inside.length > n
    if (!red) bad++
    console.log(`   mutant · a noded T end moved 0.5 m along the through street: ${!M ? '⛔ no straight-segment T found to mutate' : red ? `RED, as it must be (${M.what}; inside ${n} → ${m.inside.length})` : `⛔ still ${m.inside.length} (${M.what}) — the check cannot see it`}`)
  }
}
console.log(bad ? `\n⛔ RED — a chain end lies inside another street's roadway and is no node (or the check could not see its mutant)` : '\n✅ GREEN — no chain end that is no node lies inside another street\'s roadway')
process.exit(bad ? 1 : 0)
