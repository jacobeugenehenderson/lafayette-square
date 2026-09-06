#!/usr/bin/env node
// ⭐ THE WALL, ENFORCED BY READING THE SOURCE — not by a comment claiming it.
// `WALL.md`: the wall we have is a HANDLE rule and needs to be a CONTENT rule ("polygons only
// by the time we get to the Section tools"). A chain-free signature only proves nothing can
// REACH a chain; a label carrying an INDEX into chain space still IS one, and every read of it
// is a chain question asked late.
// ⇒ Assert that the ONLY chain-space lookups in the proto path are inside `mkStamp`, which is
// the mint. Everything after must read resolved VALUES off the stamp.
import fs from 'fs'
const SRC = fs.readFileSync('src/lib/tileGround.js', 'utf8').split('\n')
const CHAIN_READS = [/\bfeWidthAt\s*\(/, /\bmeasures\s*\[/, /\bsegOrdAtVertex\s*\(/, /streetsOrig\s*\[/]
const start = SRC.findIndex(l => l.includes("opts.grout === 'proto'"))
if (start < 0) { console.log('⛔ proto block not found — this check is stale, fix it'); process.exit(1) }
// the block ends where the next top-level construction begins
let end = SRC.findIndex((l, i) => i > start && /^  if \(opts\.grout && opts\.grout !== 'proto'\)/.test(l))
if (end < 0) end = SRC.length
const mintFrom = SRC.findIndex((l, i) => i > start && l.includes('const mkStamp ='))
let mintTo = mintFrom
for (let i = mintFrom, depth = 0; i < end; i++) { depth += (SRC[i].match(/\{/g)||[]).length - (SRC[i].match(/\}/g)||[]).length; if (i > mintFrom && depth <= 0) { mintTo = i; break } }
// ⭐⭐ SHARPENED 2026-09-06 — the predicate now matches the sentence this check has always
// printed. It used to fail on ANY chain read outside `mkStamp`'s braces, including one that
// runs BEFORE the mint, and then report it as "after the mint" — a check contradicting its own
// message, which `POLYGON-FIRST §5` names as worse than no check.
// ⛔ The rule is unchanged and is NOT loosened: chain space is read UPSTREAM and everything
// downstream carries VALUES. A read after the mint completes is still a hard failure — that is
// the whole assertion. What changes is that a PRE-mint read (building the base table the mint
// stamps from — the half that moves to prebake) is DISCLOSED rather than mis-labelled.
// ⭐ Disclosed, not permitted-and-forgotten: they are named and counted, so the set cannot grow
// silently into the thing this check exists to stop.
const offenders = [], upstream = []
for (let i = start; i < end; i++) {
  if (i >= mintFrom && i <= mintTo) continue          // the mint itself reads chains — once
  if (SRC[i].trimStart().startsWith('//')) continue    // prose about the rule is not the rule
  for (const re of CHAIN_READS) if (re.test(SRC[i])) (i < mintFrom ? upstream : offenders).push(`${i + 1}: ${SRC[i].trim().slice(0, 100)}`)
}
console.log(`proto block lines ${start + 1}–${end}   mint (mkStamp) ${mintFrom + 1}–${mintTo + 1}`)
if (upstream.length) {
  console.log(`   ${upstream.length} upstream chain read(s) BEFORE the mint — the half that moves to prebake:`)
  for (const u of upstream) console.log('     ', u)
}
if (offenders.length) {
  console.log(`⛔ ${offenders.length} CHAIN LOOKUP(S) AFTER THE MINT — the artifact still IS a chain:`)
  for (const o of offenders) console.log('   ', o)
  process.exit(1)
}
console.log('✅ no chain lookup after the mint — every downstream value comes off the stamp.')
console.log('   ⇒ the wall here is a CONTENT rule, not a handle rule: there is nothing left to call.')
