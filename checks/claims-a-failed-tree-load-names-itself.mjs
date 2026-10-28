#!/usr/bin/env node
// claims-a-failed-tree-load-names-itself.mjs — WHEN THE GROVE'S ATLAS (OR THE TREE MATERIALS) FAIL TO LOAD, DOES THE REVEAL SAY SO?
//
// ⭐ LS's black Stage (2026-10-28): public/baked/<look>/trees-atlas.json was absent, InstancedTrees' atlas went to status 'error',
// and the trees neither marked prepared NOR failed — the RevealGate held the town hidden behind a silent sky. HeroImpostorTrees
// and OverheadTrees already name theirs (markFailed('trees', …)). The decision is now one pure function,
// src/components/treesReveal.js#treesRevealVerdict, which InstancedTrees.jsx's effect applies (#applyTreesReveal):
//   ① a planted atlas with status 'error' → the verdict is { failed }, and once applied, src/lib/startupMarks.js#failureOf('trees')
//      names it (what the gate reads); the same for the materials;
//   ② a load still arriving → null (no mark); every page, material and model in → prepared;
//   ③ InstancedTrees.jsx applies that verdict in its effect (read from the source).
// ⭐ MUTANTS (--mutants), each RED: the atlas's error branch removed · the materials' error branch removed · the effect no longer
// applying the verdict.
//   node checks/claims-a-failed-tree-load-names-itself.mjs [--mutants]
// Read-only. Exits 1 on any claim false or a mutant not seen.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
import { failureOf, MARK_PREFIX } from '../src/lib/startupMarks.js'
const MUTANTS = process.argv.includes('--mutants')
const reveal = async (tag, transform) => importSource('src/components/treesReveal.js', { suffix: `// ${tag}`, transform })
const mutate = (from, to) => (t) => { if (!t.includes(from)) throw new Error(`[mutant] the text it mutates is gone ("${from.slice(0, 50)}") — re-aim it`); return t.replace(from, to) }
const clear = () => performance.clearMarks(MARK_PREFIX + 'failed:trees')

const groups = { meshGroups: new Map(), impostors: new Map() }
const base = { drawsNoTrees: false, groups, pagesIn: true, meshKeys: [], meshLoaded: new Set(), lookName: 'planted-look' }
function claims({ treesRevealVerdict, applyTreesReveal }, effectSrc) {
  const out = []
  for (const [what, args] of [['the grove\'s atlas', { atlas: { status: 'error', error: new Error('HTTP 404 trees-atlas.json') }, mats: { status: 'ready' } }],
    ['the tree materials', { atlas: { status: 'ready' }, mats: { status: 'error', error: new Error('a shader did not compile') } }]]) {
    clear()
    const v = treesRevealVerdict({ ...base, ...args })
    if (!v?.failed) { out.push(`① a failed load of ${what} is not named (verdict ${JSON.stringify(v)})`); continue }
    applyTreesReveal(v)
    if (!failureOf('trees')) out.push(`① ${what}: the verdict names it, but the reveal records no failure for trees`)
  }
  clear()
  if (treesRevealVerdict({ ...base, atlas: { status: 'loading' }, mats: { status: 'loading' } }) !== null) out.push('② a load still arriving is not a wait')
  if (!treesRevealVerdict({ ...base, atlas: { status: 'ready' }, mats: { status: 'ready' } })?.prepared) out.push('② every load in is not prepared')
  if (!/applyTreesReveal\(treesRevealVerdict\(\{[^}]*atlas[^}]*mats[^}]*\}\)\)/.test(effectSrc)) out.push('③ InstancedTrees.jsx does not apply treesRevealVerdict in its effect')
  return out
}

const SRC = readFileSync(join(ROOT, 'src/components/InstancedTrees.jsx'), 'utf8')
let bad = 0
const real = claims(await reveal('real'), SRC)
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log('✅ a failed atlas or materials load is named to the reveal (failureOf("trees")); a load arriving waits; one in is prepared; InstancedTrees applies it')
if (MUTANTS) for (const [what, mod, src] of [
  ['the atlas\'s error branch removed', await reveal('no-atlas', mutate("  if (atlas?.status === 'error') return { failed:", "  if (false) return { failed:")), SRC],
  ['the materials\' error branch removed', await reveal('no-mats', mutate("  if (mats?.status === 'error') return { failed:", "  if (false) return { failed:")), SRC],
  ['the effect no longer applying the verdict', await reveal('m3'), SRC.replace('applyTreesReveal(treesRevealVerdict(', 'void (treesRevealVerdict(')],
]) { const got = claims(mod, src), red = got.length > real.length
  if (!red) bad++
  console.log(`   mutant · ${what}: ${red ? `RED, as it must be (${got[0]})` : '⛔ still clean — the check cannot see it'}`) }
clear()
console.log(bad ? '\n⛔ RED — a failed tree load is not named to the reveal' : '\n✅ GREEN — a failed tree load names itself; the town is held hidden WITH a reason')
process.exit(bad ? 1 : 0)
