// make-gate.mjs — the GATE-ONLY copy of a bake-ground.js, the same two edits as flatten-r1/prep-gate.mjs (Boz's clear,
// 2026-10-14, option (b)): the deformer's unowned-ped throw printed as a count, and the manifest stamped gateOnly so the
// slab cannot pass for a bakeable one. Written beside this file; never into src/ or cartograph/.
//   node make-gate.mjs <bake-ground.js> → bake-ground.gate.js
import { readFileSync, writeFileSync } from 'fs'
const one = (s, a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error(`make-gate: anchor found ${n}× — ${a}`); return s.replace(a, b) }
let src = readFileSync(process.argv[2], 'utf8')
src = one(src, 'if (deformTally.unowned.size) throw new Error(', 'if (deformTally.unowned.size) console.log(`  [gate-only] unowned refusal suppressed: ${deformTally.unowned.size}`) ; if (false) throw new Error(')
src = one(src, '  const manifest = {', '  const manifest = {\n    gateOnly: "gate-only: unowned refusal suppressed",')
writeFileSync(new URL('bake-ground.gate.js', import.meta.url), src)
