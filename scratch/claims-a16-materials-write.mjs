#!/usr/bin/env node
/**
 * A16 GATE — "does a materials flip invent authoring, and did the resolver fix
 * move any geometry?"
 *
 * `SECTION §3.1`/`§5.1`: ADA depths ARE the Revert state and Default IS the
 * calculation, so **absence is the defined state for "not authored."** A
 * one-field strip-material flip must therefore persist the material and nothing
 * else. It used to persist a full measure blob whose `treelawn`/`sidewalk` were
 * `resolvePedDepths`' own constants — inert on the eye, but it converted
 * *unauthored, re-seeds* into *authored, pinned* and made an untouched edge
 * count as an override.
 *
 * ⭐ Reads the SOURCE for both assertions rather than restating them, so this
 *   goes red the day either fix is reverted or refactored away.
 *
 * ⛔ Assertion 3 is the one that decides whether an eye-gate is owed. Making
 *   `resolveSide` merge is only safe-by-construction if no edge that is
 *   ACTUALLY RESOLVED changes. `emitChain` walks `segOrd = 0 .. segments.length`,
 *   so a blob parked on a reserved NEGATIVE slot (the cap slots, `capFlip`) is
 *   never requested through that path and cannot move geometry. Every
 *   non-negative slot must already carry `pavementHW` — those are the only ones
 *   the merge can reach, and for a full blob merge ≡ replace on the one field
 *   the consumer reads.
 *   ⛔ Do NOT weaken this to "no partial blobs exist" — four DO exist
 *   (staging `capFlip` slots). The claim is narrower and must stay narrow.
 *
 * Read-only. Writes nothing.
 */
import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const R = p => readFileSync(resolve(ROOT, p), 'utf8')

// 1 — the write carries no invented ped depths
const src = R('src/cartograph/MeasureOverlay.jsx')
const anchor = src.indexOf('WRITE ONLY WHAT THE GESTURE AUTHORED')
if (anchor < 0) {
  console.log('⛔ FAIL — the A16 write site is gone or renamed. Re-read MeasureOverlay before trusting anything below.')
  process.exit(1)
}
// ⛔ Test the STATEMENT, never the surrounding block: the comment above the
// write quotes the old `treelawn: ped.tl` on purpose, so slicing from the
// anchor to the write matched the explanation and reported a false ⛔ on a
// correct fix. Take the single line that performs the write.
const tail = src.slice(anchor)
const writeLine = tail.split('\n').find(l => l.includes('writeBlockEdgeCustoms') && !l.trimStart().startsWith('//'))
if (!writeLine) {
  console.log('⛔ FAIL — no writeBlockEdgeCustoms statement found after the A16 anchor.')
  process.exit(1)
}
const invents = /treelawn\s*:|sidewalk\s*:/.test(writeLine)
console.log(`1. materials write invents treelawn/sidewalk : ${invents ? '⛔ YES' : '✅ NO'}`)

// 2 — the resolver merges
const rs = R('src/lib/buildBlockGeometryV2.js')
const merged = /const custom = customsResolver && customsResolver\(chainIdx, segOrd, sideKey\)/.test(rs)
  && /\{ \.\.\.\(m\[sideKey\] \|\| \{\}\), \.\.\.custom \}/.test(rs)
console.log(`2. resolveSide merges instead of OR-replace   : ${merged ? '✅ YES' : '⛔ NO'}`)

// 3 — no RESOLVED edge changes
let resolved = 0, partialResolved = [], parked = 0
const looksDir = resolve(ROOT, 'public/looks')
for (const look of readdirSync(looksDir)) {
  const p = resolve(looksDir, look, 'design.json')
  if (!existsSync(p)) continue
  const bc = JSON.parse(readFileSync(p, 'utf8')).blockCustoms || {}
  for (const sk in bc) for (const side in bc[sk]) for (const so in bc[sk][side]) {
    if (Number(so) < 0) { parked++; continue }        // reserved cap slot — emitChain never asks
    resolved++
    if (!Number.isFinite(bc[sk][side][so]?.pavementHW)) partialResolved.push(`${look} ${sk}/${side}/${so}`)
  }
}
console.log(`3. resolved slots ${resolved} (+${parked} parked on reserved negative slots)`)
console.log(`   partial among the RESOLVED ones          : ${partialResolved.length ? '⛔ ' + partialResolved.length : '✅ 0'}`)
partialResolved.slice(0, 5).forEach(x => console.log('     ', x))

const pass = !invents && merged && !partialResolved.length
console.log(`\n${pass
  ? '✅ PASS — depths no longer invented · resolver merges · every resolved slot is full\n   ⇒ merge ≡ replace on the only field read (pavementHW) ⇒ NO geometry moved, NO eye-gate owed.'
  : '⛔ FAIL'}`)
console.log('→ SECTION §3.1/§3.3/§5.1 · SURVEY §0 · ROADMAP A16 · [[feedback_customs_resolver_wholesale_not_merge]]')
process.exit(pass ? 0 : 1)
