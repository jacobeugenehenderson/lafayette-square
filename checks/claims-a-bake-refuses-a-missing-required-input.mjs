#!/usr/bin/env node
// claims-a-bake-refuses-a-missing-required-input.mjs — DOES THE BAKE REFUSE, BY NAME, A STEP WHOSE REQUIRED INPUT IS MISSING?
//
// ⭐ LS (2026-10-28): the cartograph Bake called the Look 15/15 clean while its `trees` step's input
// public/baked/<look>/trees-atlas.json was MISSING — the player then held the town hidden on the trees. The step's judge hashes
// each input (pour-code.mjs#contentHash), and a missing file hashes to null: absent last time, absent now, null === null, clean.
// ⛔ Not every input is required (the coast's water datums are absent for an inland town), so the rule is a DECLARATION:
// serve.js#runIfDirty takes `requires: [{ path, why }]`, and a missing one throws `[bake] ⛔ <step>: <why> (<path> is missing)`,
// which the Bake answers by name (its catch), plan or run.
//   ① RUN FROM THE SOURCE: runIfDirty's own span (serve.js), with its surroundings stubbed and the step's record CLEAN — a
//      required input that is missing throws, naming the step and the why; present, the clean step is skipped as before.
//   ①b IN THE PLAN (GET …/bake walks the same body, P.plan set): the same missing input is a named BLOCKER entry
//      ({ step, blocker: true, why }) and no throw (Zob's read, 2026-10-28), so Stage's slab age, the stale bar and Publish's
//      staleness get their list; StatusBar.jsx and PreviewApp.jsx read a blocker as "can't bake until" (read from the source).
//   ② DECLARED: the `trees` step requires the grove's atlas (public/baked/<scene>/trees-atlas.json), and `ground-ao` requires the
//      Look's while trees are shown, both "the grove is not baked for this Look: bake it in the Arborist" (read from the source).
// ⭐ MUTANTS (--mutants), each RED: the guard removed (a missing required input is judged clean again) · the trees step's requires
// dropped · the plan branch removed (the plan throws).
//   node checks/claims-a-bake-refuses-a-missing-required-input.mjs [--mutants]
// Read-only (a temp dir for the planted input). Exits 1 on any claim false or a mutant not seen.
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
const MUTANTS = process.argv.includes('--mutants')
const LOCALS = ['force', 'needsRebuild', 'skip', 'P', 'runStep', 'ran', 'stepReads', 'bakeScene', 'bakeReads', 'id', 'contentChanged', 'existsSync', 'REPO_ROOT', 'stagedSlabStep', 'recordStep', 'MAP_JSON']
const spanOf = (tag, transform) => importSource('cartograph/serve.js', { span: { from: '      const runIfDirty = async (label, inputs, outputs, cmd', to: '      // Bake only ACTIVATED content' },
  prefix: `export default function (env) {\n  const { ${LOCALS.join(', ')} } = env`, suffix: `  return runIfDirty\n} // ${tag}`, transform })
const mutate = (from, to) => (t) => { if (!t.includes(from)) throw new Error(`[mutant] the text it mutates is gone ("${from.slice(0, 50)}") — re-aim it`); return t.replace(from, to) }

const dir = mkdtempSync(join(tmpdir(), 'bake-requires-')), present = join(dir, 'trees-atlas.json'), missing = join(dir, 'gone', 'trees-atlas.json')
writeFileSync(present, '{}')
async function runOnce(mod, path, plan = false) {
  const log = { ran: [], skipped: [] }, P = plan ? { plan: { stale: [] } } : {}
  const env = { force: false, needsRebuild: () => false, skip: (l) => log.skipped.push(l), P, runStep: async (P, l) => log.ran.push(l), ran: () => {},
    stepReads: () => ({ code: [], data: [] }), bakeScene: 'planted', bakeReads: { 'planted-look:trees': { code: {}, data: {} } }, id: 'planted-look',
    contentChanged: () => [], existsSync, REPO_ROOT: ROOT, stagedSlabStep: async () => {}, recordStep: () => {}, MAP_JSON: join(dir, 'map.json') }
  const runIfDirty = mod.default(env)
  try { await runIfDirty('trees', [path], [present], 'node arborist/bake-trees.js', { requires: [{ path, why: 'the grove is not baked for this Look: bake it in the Arborist' }] }); return { ...log, threw: null, stale: P.plan?.stale } }
  catch (e) { return { ...log, threw: e.message, stale: P.plan?.stale } }
}
const SRC = readFileSync(join(ROOT, 'cartograph/serve.js'), 'utf8')
// one step's call: from its `await runIfDirty('<label>',` to the next step's call
const stepCall = (src, label) => { const i = src.indexOf(`await runIfDirty('${label}',`); if (i < 0) return ''; const j = src.indexOf('await runIfDirty(', i + 1); return src.slice(i, j < 0 ? src.length : j) }
async function claims(mod, src) {
  const out = []
  const a = await runOnce(mod, missing)
  if (!a.threw) out.push(`① a missing required input was judged ${a.skipped.length ? 'CLEAN (skipped)' : 'and the step ran'}, not refused`)
  else if (!a.threw.includes('trees') || !a.threw.includes('bake it in the Arborist') || !a.threw.includes('is missing')) out.push(`① the refusal does not name the step, the why and the missing path: ${a.threw}`)
  const b = await runOnce(mod, present)
  if (b.threw || !b.skipped.includes('trees')) out.push(`① a present required input on a clean step is not skipped as before (${b.threw || JSON.stringify(b)})`)
  const c = await runOnce(mod, missing, true), bl = c.stale?.find(x => x.step === 'trees' && x.blocker)
  if (c.threw) out.push(`①b the PLAN throws on a missing required input (${c.threw.slice(0, 80)}), so Stage and Publish get an error, not a list`)
  else if (!bl || !bl.why.some(w => w.includes('bake it in the Arborist') && w.includes('is missing'))) out.push(`①b the plan carries no named blocker for the missing input (${JSON.stringify(c.stale)})`)
  const SB = readFileSync(join(ROOT, 'src/cartograph/StatusBar.jsx'), 'utf8'), PV = readFileSync(join(ROOT, 'src/preview/PreviewApp.jsx'), 'utf8')
  if (!/slabAge\?\.stale\?\.filter\(s => s\.blocker\)/.test(SB) || !/The Foundry can't run until/.test(SB)) out.push("①b StatusBar does not read a blocker as \"can't bake until\"")
  if (!/blocker = stale\.filter\(x => x\.blocker\)/.test(PV) || !/The Foundry can't run until/.test(PV)) out.push("①b Publish does not stop on a blocker before it bakes")
  const t = stepCall(src, 'trees'), g = stepCall(src, 'ground-ao')
  if (!/requires:\s*\[\{\s*path:\s*join\(REPO_ROOT, 'public', 'baked', bakeScene, 'trees-atlas\.json'\),\s*why: 'the grove is not baked for this Look: bake it in the Arborist'/.test(t)) out.push("② the trees step does not require public/baked/<scene>/trees-atlas.json")
  if (!/requires:\s*layerOn\('tree'\)\s*\?\s*\[\{\s*path:\s*join\(LOOK_DIR, 'trees-atlas\.json'\)/.test(g)) out.push("② ground-ao does not require the Look's trees-atlas.json while trees are shown")
  return out
}
let bad = 0
const real = await claims(await spanOf('real'), SRC)
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log("✅ a missing required input refuses the Bake by name; present, a clean step is skipped; trees and ground-ao require the grove's atlas")
if (MUTANTS) for (const [what, mod, src] of [
  ['the guard removed', await spanOf('no-guard', mutate('        if (absent.length) { const why = ', '        if (false) { const why = ')), SRC],
  ['the plan branch removed', await spanOf('no-plan', mutate('          if (P.plan) { P.plan.stale.push({ step: label, blocker: true, why }); return }\n', '')), SRC],
  ["the trees step's requires dropped", await spanOf('m2'), SRC.replace("              requires: [{ path: join(REPO_ROOT, 'public', 'baked', bakeScene, 'trees-atlas.json')", "              _dropped: [{ path: join(REPO_ROOT, 'public', 'baked', bakeScene, 'trees-atlas.json')")],
]) { const got = await claims(mod, src), red = got.length > real.length
  if (!red) bad++
  console.log(`   mutant · ${what}: ${red ? `RED, as it must be (${got[0]})` : '⛔ still clean — the check cannot see it'}`) }
rmSync(dir, { recursive: true, force: true })
console.log(bad ? '\n⛔ RED — a Bake can call a step clean while a required input is missing' : '\n✅ GREEN — a required input that is missing refuses the Bake, by name')
process.exit(bad ? 1 : 0)
