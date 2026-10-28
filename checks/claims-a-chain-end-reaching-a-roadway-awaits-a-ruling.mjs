#!/usr/bin/env node
// claims-a-chain-end-reaching-a-roadway-awaits-a-ruling.mjs — A QUESTION FOR JACOB, KEPT RED UNTIL HE RULES: a chain end that is
// no node, lies OUTSIDE another street's roadway, and whose OWN roadway reaches it (b′). Is it a T?
//
// ⭐ Boz, 2026-10-27 (BRIEF-a-chain-end-in-a-roadway-is-a-T §1): the ruling `r-a-chain-end-in-a-roadway-is-a-T` covers an end
// INSIDE the other roadway (claims-a-chain-end-in-a-roadway-is-a-node, joined at mintInputs). (b′) is NOT joined. Split from that
// check on Zob's read, so (a) can gate GREEN while this stays RED on a question, not a defect. When Jacob rules, this check is
// either folded into the (a) check (joined) or re-founded as the claim that (b′) ends are drawn as ends (not joined).
// How an end is judged, and what is set aside by name: `_chainEnds.mjs`.
// ⭐ MUTANT (--mutants): a noded T end pulled back along its own last leg to just past the through street's roadway (by half its
// own half-width) → a new (b′) row.
//   node checks/claims-a-chain-end-reaching-a-roadway-awaits-a-ruling.mjs [<scene> …] [--mutants]
// Read-only. Exits 1 on any (b′) end, or a mutant the check cannot see.
import { scenes } from './_scenes.mjs'
import { loadTown, judge, printRow, pullBackTEnd } from './_chainEnds.mjs'
const MUTANTS = process.argv.includes('--mutants')

let bad = 0
for (const scene of scenes('cartograph/data/<scene>/clean/skeleton.json')) {
  const town = loadTown(scene), J = judge(town), n = J.reach.length
  if (n) bad++
  console.log(`${n ? '⛔' : '✅'} ${scene}: ${J.ends} end(s) that are no node · (b′) its own roadway REACHES another's ${n} · set aside: outside the disc ${J.aside.outsideDisc}, no ribbon ${J.aside.noRibbon}, a grade-separated pair ${J.aside.gradeSep.length}`)
  for (const r of J.reach) printRow(r, '(b′)')
  if (MUTANTS) {
    const M = pullBackTEnd(town), m = M?.J, red = m && m.reach.length > n
    if (!red) bad++
    console.log(`   mutant · a noded T end pulled back past the through street's roadway: ${!M ? '⛔ no straight, near-perpendicular T found to mutate' : red ? `RED, as it must be (${M.what}; reach ${n} → ${m.reach.length})` : `⛔ still ${m.reach.length} (${M.what}) — the check cannot see it`}`)
  }
}
console.log(bad ? `\n⛔ RED — (b′) ends await Jacob's ruling (BRIEF-a-chain-end-in-a-roadway-is-a-T §1): a question, not a defect the join fixes` : '\n✅ GREEN — no chain end that is no node reaches another street\'s roadway from outside it')
process.exit(bad ? 1 : 0)
