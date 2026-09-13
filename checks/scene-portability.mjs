#!/usr/bin/env node
/**
 * CAN A CHECK BE POINTED AT ANOTHER TOWN? — the input for the portability ticket.
 *
 * ⛔ NOT A PASS/FAIL GATE. It sizes a known class and prints the split; the fix is a separate,
 *    larger ticket. It exists because `CLAUDE.md` forbids writing a count into a doc without the
 *    command that reproduces it — quoting "58 of 157" for months is exactly how this corpus rotted.
 *
 * A check that names one town and gives the caller no way to choose another answers Layer 0's
 * first question — "what does this do for town #2?" — with "nothing."
 *
 * ▶ node checks/scene-portability.mjs [--list]
 * ⛔ Read-only.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyAll, stripComments, ROOT } from './tier.mjs'

// Four conventions are in use. That IS the finding: a caller cannot learn one and use it.
const CONVENTIONS = [
  ['--scene', /--scene\b|['"]scene['"]|SCENE\b/],
  ['--only', /--only\b/],
  ['--look', /--look\b|LOOK\b/],
  ['argv[n]', /argv\[[23]\]/],
]
const NAMES_LS = /lafayette-square|lafayette_square|'lafayette'|"lafayette"/i

const rows = classifyAll().map(r => {
  const code = stripComments(readFileSync(join(ROOT, r.file), 'utf8'), r.file.endsWith('.sh'))
  return {
    ...r,
    namesLS: NAMES_LS.test(code),
    convs: CONVENTIONS.filter(([, re]) => re.test(code)).map(([n]) => n),
  }
})

const pinned = rows.filter(r => r.namesLS && !r.convs.length)
const param = rows.filter(r => r.convs.length)
const safe = rows.filter(r => r.tier === 'safe')

console.log(`${rows.length} checks · ${safe.length} in the safe tier (npm test)\n`)
console.log(`⛔ NAME LAFAYETTE SQUARE WITH NO WAY TO CHOOSE A SCENE: ${pinned.length}`)
console.log(`   of which in the safe tier: ${pinned.filter(r => r.tier === 'safe').length}`)
console.log(`\nPARAMETERISED: ${param.length} — and they do not agree on how:`)
for (const [n] of CONVENTIONS) {
  const all = param.filter(r => r.convs.includes(n))
  console.log(`   ${n.padEnd(9)} ${String(all.length).padStart(3)}   (safe tier: ${all.filter(r => r.tier === 'safe').length})`)
}
const multi = param.filter(r => r.convs.length > 1)
console.log(`   ⚠️ ${multi.length} accept more than one, so the conventions are not even disjoint per file.`)
console.log(`\nNEITHER (scene-agnostic, or the scene is implicit): ${rows.length - pinned.length - param.length}`)

if (process.argv.includes('--list')) {
  console.log(`\n── pinned to LS ──`)
  for (const r of pinned) console.log(`   [${r.tier}] ${r.file}`)
}
