// prep-gate.mjs — GATE-ONLY copies of bake-ground (Boz's clear, 2026-10-14, option (b)): HEAD's (git show <rev>) and this
// branch's, with the SAME two edits applied to each, so the flatten fix can be gated while every town's bake refuses on the
// deformer's unowned ped vertices (a separate class; Tern's). Written beside this file only — never into src/ or cartograph/.
//   1. `if (deformTally.unowned.size) throw new Error(` → a printed count: `[gate-only] unowned refusal suppressed: …`
//   2. the manifest is stamped `gateOnly: "gate-only: unowned refusal suppressed"`, so the slab cannot pass for a bakeable one
//   node prep-gate.mjs [rev=55cf53ab]
import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
const W = new URL('.', import.meta.url).pathname, WT = new URL('../../../', import.meta.url).pathname
const rev = process.argv[2] || '55cf53ab'
const edit = (src, tag) => {
  const one = (s, a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`${tag}: anchor found ${n}× — ${a}`); return s.replace(a, b) }
  src = one(src, 'if (deformTally.unowned.size) throw new Error(', 'if (deformTally.unowned.size) console.log(`  [gate-only] unowned refusal suppressed: ${deformTally.unowned.size}`) ; if (false) throw new Error(')
  src = one(src, '  const manifest = {', '  const manifest = {\n    gateOnly: "gate-only: unowned refusal suppressed",')
  return src
}
writeFileSync(W + 'bake-ground.gate-HEAD.js', edit(execSync(`git -C ${WT} show ${rev}:cartograph/bake-ground.js`, { encoding: 'utf8', maxBuffer: 1 << 28 }), 'HEAD'))
writeFileSync(W + 'bake-ground.gate-branch.js', edit(readFileSync(WT + 'cartograph/bake-ground.js', 'utf8'), 'branch'))
console.log(`[prep-gate] bake-ground.gate-HEAD.js (${rev}) + bake-ground.gate-branch.js written, the same two edits each`)
