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
//   A′. ①'S INPUT IS WIDTH-FREE TOO (Boz's ruling, 2026-10-28, with the chain join): `mintInputs.mjs#mintInputs` and all of
//      `chainJoins.mjs` read no authored value, with ONE stated exception: `chainJoins.mjs#refuseAuthoredReKey` reads
//      `blockCustoms` and `capEnds`, and it returns nothing (it only throws), so authoring can stop a pour but never shape ①.
//      Outside it, `blockCustoms` is only passed along, never indexed. Mutant (--mutants): an indexed read planted in mintInputs,
//      and a value returned from the refusal → each RED.
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

// ── A′ ────────────────────────────────────────────────────────────────────────
// a function's body by brace depth, from the line declaring it (null when absent)
const bodyOf = (L, decl) => { const f = L.findIndex(l => decl.test(l)); if (f < 0) return null
  for (let i = f, d = 0; i < L.length; i++) { d += (L[i].match(/\{/g) || []).length - (L[i].match(/\}/g) || []).length; if (i > f && d <= 0) return [f, i] } return null }
const INPUT_AUTHORED = [/\bblockCustoms\s*(\[|\.|\?\.)/, /\bcapEnds\b/, /\bfeWidthAt\s*\(/, /\bresolvePedDepths\s*\(/, /\bcurbWidth\b/]
function inputClaim(mi, cj) {
  const MI = mi.split('\n'), CJ = cj.split('\n'), hits = []
  const m = bodyOf(MI, /^export function mintInputs\(/); if (!m) return { anchor: '`export function mintInputs(` not found in cartograph/mintInputs.mjs' }
  const r = bodyOf(CJ, /^function refuseAuthoredReKey\(/); if (!r) return { anchor: '`function refuseAuthoredReKey(` not found in cartograph/chainJoins.mjs' }
  for (let i = m[0]; i <= m[1]; i++) if (!isProse(MI[i]) && INPUT_AUTHORED.some(re => re.test(MI[i]))) hits.push(`mintInputs.mjs ${i + 1}: ${MI[i].trim().slice(0, 100)}`)
  CJ.forEach((l, i) => { if (i >= r[0] && i <= r[1]) return; if (!isProse(l) && INPUT_AUTHORED.some(re => re.test(l))) hits.push(`chainJoins.mjs ${i + 1}: ${l.trim().slice(0, 100)}`) })
  const ret = CJ.slice(r[0], r[1] + 1).filter(l => !isProse(l) && /\breturn\b\s*[^;\s}]/.test(l)), throws = CJ.slice(r[0], r[1] + 1).some(l => /\bthrow\b/.test(l))
  if (ret.length) hits.push(`refuseAuthoredReKey RETURNS a value (${ret[0].trim().slice(0, 80)}): authoring could shape ①`)
  if (!throws) hits.push('refuseAuthoredReKey never throws: the refusal is not fatal')
  return { hits }
}
const MI_SRC = fs.readFileSync('cartograph/mintInputs.mjs', 'utf8'), CJ_SRC = fs.readFileSync('cartograph/chainJoins.mjs', 'utf8')
const A2 = inputClaim(MI_SRC, CJ_SRC)
if (A2.anchor) refuse(A2.anchor)

// ── B ─────────────────────────────────────────────────────────────────────────
const CHAIN_READS = [/\bfeWidthAt\s*\(/, /\bmeasures\s*\[/, /\bsegOrdAtVertex\s*\(/, /streetsOrig\s*\[/, /streetsOrig\.forEach/]
// The proto block: `let proto = null` and the bare `{ … }` block after it, in `buildTileGround` (retire-legacy 80d28a26 made
// ①②③ the only producer, so the old `opts.grout === 'proto'` gate is gone; the block is closed by brace depth).
const pFrom = SRC.findIndex(l => /^  let proto = null$/.test(l))
if (pFrom < 0 || !/^  \{$/.test(SRC[pFrom + 1])) refuse('the proto block (`let proto = null` then `{`) not found')
const start = pFrom + 1
let end = -1
for (let i = start, depth = 0; i < SRC.length; i++) {
  depth += (SRC[i].match(/\{/g) || []).length - (SRC[i].match(/\}/g) || []).length
  if (i > start && depth <= 0) { end = i; break }
}
if (end < 0) refuse('could not find the end of the proto block')
// the licensed upstream site: the base-measure table, built before the resolver
const baseFrom = SRC.findIndex((l, i) => i > start && i < end && l.includes('const protoBase = new Map()'))
if (baseFrom < 0) refuse('`const protoBase = new Map()` not found in the proto block')
const baseTo = SRC.findIndex((l, i) => i > baseFrom && i < end && l.includes('const protoMeasureCache = []'))
if (baseTo < 0) refuse('`const protoMeasureCache = []` (the end of the base table) not found')
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
if (A2.hits.length) {
  bad = true
  console.log(`⛔ A′ — ①'S INPUT READS AUTHORING: ${A2.hits.length} read(s) outside the one throw-only refusal.`)
  for (const h of A2.hits) console.log('   ', h)
} else console.log('✅ A′ — ①\'s input (mintInputs, chainJoins) reads no authored value, except refuseAuthoredReKey, which only throws.')
if (process.argv.includes('--mutants')) {
  const muts = [
    ['an indexed blockCustoms read planted in mintInputs', MI_SRC.replace('  const gradeSep = mapped.filter(', '  const _w = blockCustoms[0]\n  const gradeSep = mapped.filter('), CJ_SRC],
    ['the refusal returns a value', MI_SRC, CJ_SRC.replace('  if (hits.length) throw new Error(', '  if (hits.length) return hits\n  if (hits.length) throw new Error(')],
  ]
  for (const [what, mi, cj] of muts) { const got = (mi === MI_SRC && cj === CJ_SRC) ? null : inputClaim(mi, cj)
    const red = got && !got.anchor && got.hits.length > A2.hits.length; if (!red) bad = true
    console.log(`   mutant · ${what}: ${!got ? '⛔ the mutation did not apply — re-aim it' : red ? 'RED, as it must be' : '⛔ still clean — claim A′ cannot see it'}`) }
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
