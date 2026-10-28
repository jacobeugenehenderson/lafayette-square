#!/usr/bin/env node
// CLAIM — THE POUR RECORDS ITSELF, ONCE (2026-10-28, LS: Extent's Bake ran its own pour, then the Bake stopped to ask about a
// re-pour). The pour (bake-coast → pipeline → promote-ribbons) was declared three times in serve.js (the Bake, Extent's
// /rescope, its first /pour) and only the Bake recorded what a step read (`bake-reads.json`): after Extent's pour the Bake
// re-ran the lidar coast step and, for a town whose pour is HELD, asked about re-promoting (serve.js `lsAsks`: no
// promote-ribbons record). Now the steps are declared once (cartograph/pourSteps.mjs#pourSteps), every pour runs them through
// runPour, which records each step it runs through the one recorder (#recordStep), and the Bake judges with the same reads.
//   (1) SOURCE: serve.js carries no step command of its own; the Bake reads the one table, judges with stepReads and records with
//       recordStep; /rescope and /pour run runExtentPour (→ runPour).
//   (2) THE TABLE: the pipeline takes the town's `pour.elevation` (an Extent pour skipped elevation always, the Bake did not).
//   (3) THE PLANT: a scene in a temp dir; runPour with a planted runner (no shell). After it, the Bake's own judgement finds coast
//       and promote-ribbons CLEAN, and a held town's promote-ribbons record is there, so the Bake asks no re-pour (no `pipeline`
//       in its plan). The pipeline records nothing here (its reads are map.json's).
//   MUTANT (always run): runPour's record removed → no promote-ribbons record, coast dirty: RED.
//   node checks/claims-the-pour-records-itself-once.mjs
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const PC = await import('../cartograph/pour-code.mjs')

// (1) the source
{ const s = readFileSync(join(ROOT, 'cartograph/serve.js'), 'utf8'), code = s.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  const own = ['node bake-coast.mjs', 'node pipeline.js', 'node promote-ribbons.js'].filter(c => code.includes(c))
  const bake = /const POUR = Object\.fromEntries\(pourSteps\(bakeScene,/.test(s) && /stepReads\(inputs, bakeScene\)/.test(s) && /recordStep\(MAP_JSON, \[id\], label, inputs, bakeScene\)/.test(s)
  const extent = (s.match(/await runExtentPour\(scene, \{ cwd: here, env \}\)/g) || []).length === 2 && /return runPour\(pour\.steps,/.test(s)
  row(!own.length && bake && extent, `(1) serve.js: its own step commands ${own.length ? own.join(', ') : 'none'} · the Bake reads the table, judges with stepReads, records with recordStep (${bake}) · /rescope and /pour run runExtentPour → runPour (${extent})`) }

// (2) the table
const P = await import('../cartograph/pourSteps.mjs')
const dir0 = mkdtempSync(join(tmpdir(), 'pourrec-')), raw = join(dir0, 'raw'), clean = join(dir0, 'clean'); mkdirSync(raw); mkdirSync(clean)
const paths = { raw, clean, map: join(clean, 'map.json'), geography: join(dir0, 'geography.json'), boundary: join(dir0, 'neighborhood_boundary.json'),
  measurements: join(raw, 'measurements.json'), centerlines: join(raw, 'centerlines.json'), overlay: join(clean, 'overlay.json'), skeleton: join(clean, 'skeleton.json') }
for (const [f, b] of [[join(raw, 'osm.json'), '{"ways":[]}'], [paths.map, '{"poured":1}'], [paths.geography, '{"lat":1}'], [paths.boundary, '{"radius":892}']]) writeFileSync(f, b)
const RIB = join(clean, 'ribbons.json'), SCENE = 'lafayettesquare', LOOK = 'lafayettesquare'
{ const on = P.pourSteps(SCENE, paths, RIB, { elevation: true }).find(s => s.label === 'pipeline').cmd, off = P.pourSteps(SCENE, paths, RIB, { elevation: false }).find(s => s.label === 'pipeline').cmd
  row(!/--skip-elevation/.test(on) && /--skip-elevation/.test(off), `(2) the pipeline reads the town's pour.elevation: elevation → "${on}" · none → "${off}"`) }

// (3) the plant: runPour, then the Bake's own judgement of what it recorded
const plant = async (M) => { rmSync(join(clean, 'bake-reads.json'), { force: true }); const ran = []
  const steps = M.pourSteps(SCENE, paths, RIB, { elevation: true })
  const out = await M.runPour(steps, { scene: SCENE, mapJson: paths.map, lookIds: [LOOK], run: async (st, onLine) => { ran.push(st.label); if (onLine) onLine('PROMOTE-DIFF {"streets":[419,419]}') } })
  const reads = P.readBakeReads(paths.map), dirty = {}
  for (const st of steps.filter(s => s.judge !== 'mtime')) { const was = reads[`${LOOK}:${st.label}`], { code, data } = P.stepReads(st.inputs, SCENE), who = `step "${st.label}"`
    dirty[st.label] = was ? [...PC.contentChanged(was.code, code, who), ...PC.contentChanged(was.data, data, who)] : PC.contentChanged(undefined, [], who) }
  const asks = !reads[`${LOOK}:promote-ribbons`]   // serve.js lsAsks, for a held town
  return { ran, out, dirty, asks, pass: ran.join() === 'coast,pipeline,promote-ribbons' && !dirty.coast.length && !dirty['promote-ribbons'].length && !asks && !reads[`${LOOK}:pipeline`] && out.promoteDiff?.streets?.[0] === 419 } }
const say = (J) => `ran ${J.ran.join(' → ')} · the Bake then finds coast ${J.dirty.coast.length ? 'DIRTY' : 'clean'}, promote-ribbons ${J.dirty['promote-ribbons'].length ? 'DIRTY' : 'clean'} · a held town ${J.asks ? 'ASKS to re-pour (pipeline in its plan)' : 'asks nothing'}`
try {
  { const J = await plant(P); row(J.pass, `(3) an Extent pour, planted: ${say(J)}`) }
  // MUTANT: runPour's record removed
  { const src1 = readFileSync(join(ROOT, 'cartograph/pourSteps.mjs'), 'utf8'), ANCHOR1 = "    if (st.judge !== 'mtime') recordStep(mapJson, lookIds, st.label, st.inputs, scene)\n"
    if (src1.split(ANCHOR1).length !== 2) row(false, 'mutant (the record skipped): the anchor is not in pourSteps.mjs once — re-aim it')
    else { const dir1 = mkdtempSync(join(tmpdir(), 'pourrec-m-'))
      try { writeFileSync(join(dir1, 'pourSteps.mjs'), src1.replace(ANCHOR1, '').replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(ROOT, 'cartograph', r)).href}"`))
        const J = await plant(await import(pathToFileURL(join(dir1, 'pourSteps.mjs')).href))
        row(!J.pass, `mutant: the record skipped → ${say(J)} — ${!J.pass ? 'RED as it must be' : 'the row proves nothing'}`)
      } finally { rmSync(dir1, { recursive: true, force: true }) } } }
} finally { rmSync(dir0, { recursive: true, force: true }) }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the pour records itself, once')
process.exit(red ? 1 : 0)
