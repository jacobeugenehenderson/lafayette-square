#!/usr/bin/env node
// ⛔ DOES A RE-POUR CHANGE THE MAP? Run it; do not quote anyone's memory of it.
//
// WHY THIS EXISTS. `promote-ribbons.js` and `ROADMAP A01` both carried a standing alarm that a
// fresh `pipeline.js` produced a MATERIALLY DIFFERENT LS map and that promoting it "destroyed his
// map". That alarm cost real time — it was raised as a blocker on 2026-09-06 against a re-pour
// Jacob had already settled ("we've been over the false alarm of the promote repeatedly"), because
// the doc still read as live. A01 had ALREADY established the pipeline is deterministic and the
// COMMITTED artifact is the stale one; the alarming prose outlived its own retraction.
// ⭐ So the number does not belong in a doc at all — the command does.
//
// USE: pour, then diff against what is committed.
//   node cartograph/skeleton.js  --scene=<scene>
//   node cartograph/pipeline.js  --scene=<scene> [--skip-elevation]
//   node scratch/claims-repour-changes-nothing.mjs <scene>
// ⛔ Compares the LAYERS the map is made of, key by key — never counts. A same-count
// different-geometry pour is exactly what `promote-ribbons.js`'s guard cannot see.
import { execSync } from 'child_process'
import fs from 'fs'
const scene = process.argv[2] || 'lafayette-square'
const P = `cartograph/data/${scene}/clean/map.json`
if (!fs.existsSync(P)) { console.log(`⛔ ${P} missing — pour first. NOT a pass.`); process.exit(1) }
const cur = JSON.parse(fs.readFileSync(P, 'utf8'))
let old
try { old = JSON.parse(execSync(`git show HEAD:${P}`, { maxBuffer: 1e9 }).toString()) }
catch { console.log(`⛔ ${P} is not committed at HEAD — nothing to compare. NOT a pass.`); process.exit(1) }
const a = old.layers?.ribbons || {}, b = cur.layers?.ribbons || {}
const J = (x) => JSON.stringify(x)
const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
let differing = [], added = [], removed = []
for (const k of keys) {
  if (!(k in a)) { added.push(k); continue }
  if (!(k in b)) { removed.push(k); continue }
  if (J(a[k]) !== J(b[k])) differing.push(k)
}
console.log(`\n${scene}: fresh pour vs the committed artifact, layer by layer`)
console.log(`  identical : ${keys.filter(k => k in a && k in b && J(a[k]) === J(b[k])).join(', ') || '(none)'}`)
console.log(`  DIFFERENT : ${differing.join(', ') || '(none)'}`)
console.log(`  added     : ${added.join(', ') || '(none)'}`)
console.log(`  removed   : ${removed.join(', ') || '(none)'}`)
// ⭐ An ADDED key is additive and cannot move the map; a DIFFERING one can and is the thing to look at.
const bad = differing.length || removed.length
console.log(bad
  ? `\n⛔ ${differing.length} layer(s) CHANGED — look at those before promoting. This is what the count guard cannot see.`
  : `\n✅ Nothing the map is made of moved. Any added key is additive.\n   ⇒ the promote is a non-event for this scene, today. Re-run rather than quoting this.`)
process.exit(bad ? 1 : 0)
