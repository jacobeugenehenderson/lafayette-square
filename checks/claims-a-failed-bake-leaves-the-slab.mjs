#!/usr/bin/env node
// claims-a-failed-bake-leaves-the-slab.mjs — DOES A BAKE WHOSE GROUND FAILS LEAVE THE SLAB EXACTLY AS IT WAS?
//
// ⭐ THE CLASS (Huron, twice, 2026-10-27): the Bake copied the town's new terrain into public/baked/<look>/ before the
// ground ran, so a ground that refused left a new terrain over the old ground: a mix the player refuses by name, and an
// older player draws wrong, silently. The terrain and the ground are now published TOGETHER, after the ground succeeds
// (cartograph/slabStage.mjs, stage then commit).
// RUNS the Bake route's own code: the span of cartograph/serve.js from the terrain-slab decision to the end of the ground
// step, as written, with the route's `runIfDirty` replaced by one that runs the step through slabStage.mjs#stagedSlabStep
// exactly as the route's does (READ below: the route's runIfDirty must hand `stage` to stagedSlabStep with --out-dir).
// The slab is a fixture with a terrain and a ground in it, and the town's clean/ holds a NEW terrain. Then:
//   · FAIL — the ground step writes a partial ground.json into its out dir and throws: every file of the slab is
//     byte-identical afterwards, and the stage is gone;
//   · SUCCEED — the new terrain and the new ground land in the same commit;
//   · SKIPPED — a ground the Bake skips publishes the owed terrain alone (that ground was baked on it).
// READS serve.js for the wiring: every runIfDirty that runs bake-ground.js passes `stage:`, and runIfDirty sends a
// staged step to stagedSlabStep with its output at the stage.
// ⭐ MUTANTS (--mutants), each RED: the old terrain-slab (written before the ground); a publish before the step runs;
// the ground step's `stage:` dropped; runIfDirty running a staged step straight at the slab.
//   node checks/claims-a-failed-bake-leaves-the-slab.mjs [--mutants]
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { importSource, sourceOf } from './_importSource.mjs'

// the route's locals the span reads; anything else is a ReferenceError, which names it
const LOCALS = ['existsSync', 'readFileSync', 'join', 'LOOK_DIR', 'SCENE_TERRAIN_JSON', 'SCENE_TERRAIN_BIN', 'P', 'markStep', 'skip',
  'ranSteps', 'here', 'id', 'runIfDirty', 'publishSlab', 'writeIfChanged', 'mkdirSync', 'MAP_JSON', 'DESIGN', 'SCENE_DESIGN', 'RIBBONS', 'bakePaths',
  'REPO_ROOT', 'bakeScene', 'sceneFlag']
const routeSpan = (transform) => importSource('cartograph/serve.js', { span: { from: '// terrain-slab: the scene terrain is owed', to: '// Shore revetment —' },
  prefix: `export default async function (env) {\n  const { ${LOCALS.join(', ')} } = env`, suffix: '}', transform })
const stageModule = (transform) => importSource('cartograph/slabStage.mjs', { transform })

const hashDir = (d) => existsSync(d) ? Object.fromEntries(readdirSync(d).sort().map(f => [f, createHash('sha256').update(readFileSync(join(d, f))).digest('hex')])) : {}
const sameDir = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** One run of the span on a fresh fixture. ground: 'fail' | 'succeed' | 'skip'. → { before, after, stageLeft } */
async function run(ground, { span = routeSpan, stage = stageModule } = {}) {
  const T = mkdtempSync(join(tmpdir(), 'failed-bake-'))
  try {
    const LOOK_DIR = join(T, 'public', 'baked', 'town'), CLEAN = join(T, 'clean'), here = join(T, 'cartograph')
    mkdirSync(LOOK_DIR, { recursive: true }); mkdirSync(CLEAN, { recursive: true }); mkdirSync(here, { recursive: true })
    for (const [f, v] of [['terrain.json', '{"old":1}'], ['terrain.bin', 'OLDT'], ['ground.json', '{"old":1}'], ['ground.bin', 'OLDG'], ['shape.json', '{"old":1}'], ['scene.json', '{}']])
      writeFileSync(join(LOOK_DIR, f), v)
    writeFileSync(join(CLEAN, 'terrain.json'), '{"new":1}'); writeFileSync(join(CLEAN, 'terrain.bin'), 'NEWT')
    const before = hashDir(LOOK_DIR)
    const { stagedSlabStep, publishSlab } = await stage()
    const P = { steps: [], plan: null }
    // the route's runIfDirty, for a dirty step: a staged step runs through stagedSlabStep with its output at the stage
    const runIfDirty = async (label, inputs, outputs, cmd, { stage: st } = {}) => {
      if (label !== 'ground') throw new Error(`the span ran step "${label}" — re-aim the span`)
      if (ground === 'skip') return
      const step = async (dir) => {
        const out = dir ?? LOOK_DIR
        writeFileSync(join(out, 'ground.json'), '{"partial":1}')
        if (ground === 'fail') throw new Error('step "ground" failed: forced')
        writeFileSync(join(out, 'ground.bin'), 'NEWG'); writeFileSync(join(out, 'shape.json'), '{"new":1}')
      }
      if (st) st.published = await stagedSlabStep({ ...st, step })
      else await step(null)
    }
    const fn = (await span()).default
    let threw = null
    try {
      await fn({ existsSync, readFileSync, join, LOOK_DIR, SCENE_TERRAIN_JSON: join(CLEAN, 'terrain.json'), SCENE_TERRAIN_BIN: join(CLEAN, 'terrain.bin'),
        P, markStep: (P, l, s) => P.steps.push([l, s]), skip: () => {}, ranSteps: [], here, id: 'town', runIfDirty, publishSlab, writeIfChanged: (p, b) => { writeFileSync(p, b); return true },
        mkdirSync, MAP_JSON: '', DESIGN: '', SCENE_DESIGN: '', RIBBONS: '', bakePaths: { boundary: '', raw: '', clean: CLEAN }, REPO_ROOT: T, bakeScene: 'town', sceneFlag: '' })
    } catch (e) { threw = e }
    if (ground !== 'fail' && threw) throw threw
    const read = (f) => existsSync(join(LOOK_DIR, f)) ? readFileSync(join(LOOK_DIR, f), 'utf8') : null
    return { before, after: hashDir(LOOK_DIR), threw, stageLeft: existsSync(join(here, '.bake-stage', 'town')) && readdirSync(join(here, '.bake-stage', 'town')).length > 0,
      terrain: read('terrain.bin'), groundBin: read('ground.bin'), leftovers: readdirSync(LOOK_DIR).filter(f => f.endsWith('.staged')) }
  } finally { rmSync(T, { recursive: true, force: true }) }
}

/** The verdicts on one implementation. → [failed reasons] */
async function judge(opts = {}, serveSrc = sourceOf('cartograph/serve.js')) {
  const bad = []
  try {
    const f = await run('fail', opts)
    if (!f.threw) bad.push('a forced ground failure did not fail the span')
    if (!sameDir(f.before, f.after)) bad.push(`a failed ground changed the slab: ${Object.keys({ ...f.before, ...f.after }).filter(k => f.before[k] !== f.after[k]).join(', ')}`)
    if (f.stageLeft) bad.push('a failed ground left its stage behind')
    const s = await run('succeed', opts)
    if (s.terrain !== 'NEWT' || s.groundBin !== 'NEWG') bad.push(`a ground that succeeds did not publish the terrain and the ground together (terrain ${s.terrain}, ground ${s.groundBin})`)
    if (s.leftovers.length) bad.push(`the commit left ${s.leftovers.join(', ')} in the slab`)
    const k = await run('skip', opts)
    if (k.terrain !== 'NEWT' || k.groundBin !== 'OLDG') bad.push(`a skipped ground did not publish the owed terrain alone (terrain ${k.terrain}, ground ${k.groundBin})`)
  } catch (e) { bad.push(`the span did not run: ${e.message}`) }
  // the wiring the span's stand-in assumes
  const route = serveSrc.slice(serveSrc.indexOf('path.match(/^\\/looks\\/([^/]+)\\/bake$/)'))
  const rid = route.slice(route.indexOf('const runIfDirty = async'), route.indexOf('\n      }\n', route.indexOf('const runIfDirty = async')))
  if (!/if \(stage\) stage\.published = await stagedSlabStep\(\{ \.\.\.stage, step: \(dir\) => runStep\(P, label, `\$\{cmd\} --out-dir="\$\{dir\}"`/.test(rid))
    bad.push("the route's runIfDirty does not run a staged step through stagedSlabStep with --out-dir at the stage")
  let groundSteps = 0
  for (const m of route.matchAll(/runIfDirty\('([\w-]+)',[\s\S]*?\n\s*\{ cwd:[^\n]*\}\)/g)) {
    if (!/node bake-ground\.js/.test(m[0])) continue
    groundSteps++
    if (!/\bstage:/.test(m[0])) bad.push(`step "${m[1]}" runs bake-ground.js straight at the slab (no stage:)`)
  }
  if (groundSteps < 2) bad.push(`the route has ${groundSteps} bake-ground step(s), not 'ground' and 'ground-shore' — update this check`)
  return bad
}

const MUT = [
  ['the old terrain-slab: the terrain written before the ground', { span: () => routeSpan((t) => t.replace(
    "else if (terrainOwed.length) markStep(P, 'terrain-slab', 'waiting'",
    "else if (terrainOwed.length && (terrainOwed.forEach(([n, b]) => writeIfChanged(join(LOOK_DIR, n), b)), true)) markStep(P, 'terrain-slab', 'waiting'")) }],
  ['a publish before the step runs', { stage: () => stageModule((t) => t.replace('    await step(stageDir)\n', '    publishSlab(lookDir, carry)\n    await step(stageDir)\n')) }],
  ["the ground step's stage: dropped", { span: () => routeSpan((t) => t.replace('timeout: 300000, stage: groundFirst }', 'timeout: 300000 }')) }],
  ['runIfDirty runs a staged step straight at the slab', {}, (s) => s.replace('if (stage) stage.published = await stagedSlabStep(', 'if (false) stage.published = await stagedSlabStep(')],
]

console.log('\nA failed Bake leaves the slab as it was (cartograph/slabStage.mjs; serve.js terrain-slab + ground)')
let red = 0
const base = await judge()
for (const b of base) { red++; console.log(`  ⛔ ${b}`) }
if (!base.length) console.log('  ✅ a ground that fails leaves every slab file byte-identical and no stage · one that succeeds publishes terrain and ground together · a skipped ground publishes the owed terrain alone · every bake-ground step is staged')
if (process.argv.includes('--mutants')) {
  for (const [name, opts, serveMut] of MUT) {
    const src = sourceOf('cartograph/serve.js'), m = serveMut ? serveMut(src) : src
    if (serveMut && m === src) { red++; console.log(`  ⛔ mutant: ${name} → could not be applied, update this check`); continue }
    let hits
    try { hits = await judge(opts, m) } catch (e) { hits = [e.message] }
    const caught = hits.length > base.length
    if (!caught) red++
    console.log(`  ${caught ? '✅' : '⛔'} mutant: ${name} → ${caught ? `RED (${hits[0]})` : 'stayed GREEN — the check cannot see it'}`)
  }
}
console.log(red ? '\n⛔ RED' : '\n✅ GREEN')
process.exit(red ? 1 : 0)
