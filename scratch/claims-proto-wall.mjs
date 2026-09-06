#!/usr/bin/env node
// ⭐ THE WALL, ENFORCED BY READING THE SOURCE — not by a comment claiming it.
// `WALL.md`: the wall we have is a HANDLE rule and needs to be a CONTENT rule ("polygons only
// by the time we get to the Section tools"). A chain-free signature only proves nothing can
// REACH a chain; a label carrying an INDEX into chain space still IS one, and every read of it
// is a chain question asked late.
//
// ⭐⭐ RE-ANCHORED + STRENGTHENED 2026-09-06, because ① moved out of `buildTileGround` into
// its own pure function. The old form anchored on `const mkStamp =` inside the proto block;
// when the mint left, that anchor matched nothing and the check CRASHED. ⛔ A crash is not a
// verdict — `POLYGON-FIRST §5` RULE 2: an unmeasurable sample is a LOUD FAILURE, never a
// skipped one, and never a stack trace either. It now refuses with a sentence.
//
// TWO CLAIMS, and the split is the point:
//   A. ① IS WIDTH-FREE. `mintProtopolygon` reads no authored value at all — no `blockCustoms`,
//      no `feWidthAt`, no `resolvePedDepths`, no `curbWidth`. ⭐ THAT is what makes it
//      freezable at PREBAKE, which is blind to `design.json` (`POLYGON-FIRST §3`): the D6b
//      blocker — "freezing it there would bake a bare-defaults curb" — cannot apply to an
//      object that HAS no width. This is the load-bearing claim of the whole prebake move.
//   B. NOTHING DOWNSTREAM ASKS A CHAIN. In `buildTileGround`'s proto block, chain-space reads
//      appear ONLY in the base-measure table (the pre-authoring half, which is itself what
//      moves upstream). Everything after it carries VALUES.
import fs from 'fs'
const SRC = fs.readFileSync('src/lib/tileGround.js', 'utf8').split('\n')
const isProse = (l) => l.trimStart().startsWith('//') || l.trimStart().startsWith('*')
const refuse = (why) => { console.log(`⛔ INSTRUMENT ANCHOR DRIFTED — ${why}\n   A false PASS would read as "the wall holds". Re-anchor this check before trusting it.`); process.exit(1) }

// ── A ─────────────────────────────────────────────────────────────────────────
const AUTHORED = [/\bblockCustoms\b/, /\bfeWidthAt\s*\(/, /\bresolvePedDepths\s*\(/, /\bcurbWidth\b/]
const mFrom = SRC.findIndex(l => /export function mintProtopolygon/.test(l))
if (mFrom < 0) refuse('`export function mintProtopolygon` not found')
let mTo = -1
for (let i = mFrom, depth = 0; i < SRC.length; i++) {
  depth += (SRC[i].match(/\{/g) || []).length - (SRC[i].match(/\}/g) || []).length
  if (i > mFrom && depth <= 0) { mTo = i; break }
}
if (mTo < 0) refuse('could not find the end of `mintProtopolygon`')
const authoredHits = []
for (let i = mFrom; i <= mTo; i++) {
  if (isProse(SRC[i])) continue
  if (AUTHORED.some(re => re.test(SRC[i]))) authoredHits.push(`${i + 1}: ${SRC[i].trim().slice(0, 100)}`)
}

// ── B ─────────────────────────────────────────────────────────────────────────
const CHAIN_READS = [/\bfeWidthAt\s*\(/, /\bmeasures\s*\[/, /\bsegOrdAtVertex\s*\(/, /streetsOrig\s*\[/, /streetsOrig\.forEach/]
const start = SRC.findIndex(l => l.includes("opts.grout === 'proto'"))
if (start < 0) refuse("the proto block (`opts.grout === 'proto'`) not found")
let end = SRC.findIndex((l, i) => i > start && /^  if \(opts\.grout && opts\.grout !== 'proto'\)/.test(l))
if (end < 0) end = SRC.length
// the licensed upstream site: the base-measure table, built before the resolver
const baseFrom = SRC.findIndex((l, i) => i > start && i < end && l.includes('const protoBase = new Map()'))
if (baseFrom < 0) refuse('`const protoBase = new Map()` not found in the proto block')
const baseTo = SRC.findIndex((l, i) => i > baseFrom && i < end && l.includes('const bcOf ='))
if (baseTo < 0) refuse('`const bcOf =` (the end of the base table) not found')
const offenders = [], upstream = []
for (let i = start; i < end; i++) {
  if (isProse(SRC[i])) continue
  if (CHAIN_READS.some(re => re.test(SRC[i]))) ((i >= baseFrom && i < baseTo) ? upstream : offenders).push(`${i + 1}: ${SRC[i].trim().slice(0, 100)}`)
}

console.log(`mintProtopolygon ${mFrom + 1}–${mTo + 1}   proto block ${start + 1}–${end}   base table ${baseFrom + 1}–${baseTo}`)
let bad = false
if (authoredHits.length) {
  bad = true
  console.log(`⛔ A — ① IS NOT WIDTH-FREE: ${authoredHits.length} authored read(s) inside the mint.`)
  for (const h of authoredHits) console.log('   ', h)
  console.log('    ⇒ it cannot be frozen at prebake: the to-code default would bake into the artifact (Layer 0 q3).')
} else {
  console.log('✅ A — ① is WIDTH-FREE: no blockCustoms / feWidthAt / resolvePedDepths / curbWidth in the mint.')
  console.log('   ⇒ prebake-freezable. `POLYGON-FIRST §3`\'s D6b blocker does not apply to an object with no width.')
}
if (upstream.length) {
  console.log(`   B — ${upstream.length} chain read(s) in the base-measure table (the pre-authoring half that moves upstream):`)
  for (const u of upstream) console.log('     ', u)
}
if (offenders.length) {
  bad = true
  console.log(`⛔ B — ${offenders.length} CHAIN LOOKUP(S) OUTSIDE THE BASE TABLE — the artifact still IS a chain:`)
  for (const o of offenders) console.log('   ', o)
} else {
  console.log('✅ B — no chain lookup outside the base table; every downstream value comes off the stamp.')
}
if (bad) process.exit(1)
console.log('   ⇒ the wall here is a CONTENT rule, not a handle rule: there is nothing left to call.')
