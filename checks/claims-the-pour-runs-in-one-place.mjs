#!/usr/bin/env node
// CLAIM — THE POUR RUNS IN ONE PLACE: THE FOUNDRY. (Was "the pour records itself, once", 2026-10-28: Extent's Bake ran its own
// pour, outside the Foundry, and the Foundry then asked to re-pour. That fix had every pour record itself through runPour.)
// 2026-11-01, Boz's ruling (one button per step): Extent ends at its own work and Publish runs nothing, so there is no pour outside
// the Foundry left to record: runPour, runExtentPour and the /<scene>/pour route are deleted, and /rescope writes its records only.
// The Foundry sees an Extent edit as owed (the boundary and overrides are the pour's recorded data reads, pour-code.mjs#pourDataReads).
//   (1) SOURCE: serve.js carries no step command of its own; the Foundry reads the one table (pourSteps.mjs#pourSteps), judges with
//       stepReads and records with recordStep; no runExtentPour, no runPour, no /pour route, and the /rescope route runs no step.
//   (2) THE TABLE: the pipeline takes the town's `pour.elevation`.
//   (3) AN EXTENT EDIT IS OWED: neighborhood_boundary.json and building-overrides.json are among pourDataReads.
//   MUTANTS (always run): a pour back in /rescope → (1) RED · runPour back in pourSteps → (1) RED · the boundary dropped from the
//   pour's data reads → (3) RED.
//   node checks/claims-the-pour-runs-in-one-place.mjs
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

// (1) the source
function oneSource(s, ps) {
  const code = s.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  const own = ['node bake-coast.mjs', 'node pipeline.js', 'node promote-ribbons.js'].filter(c => code.includes(c))
  const bake = /const POUR = Object\.fromEntries\(pourSteps\(bakeScene,/.test(s) && /stepReads\(inputs\)/.test(s) && /recordStep\(MAP_JSON, \[id\], label, inputs\)/.test(s)
  const outside = [/\brunExtentPour\b/, /\brunPour\b/, /\\\/pour\$\//].filter(re => re.test(code)).map(String)
  const r0 = s.indexOf("path.match(/^\\/([a-z0-9][a-z0-9-]*)\\/rescope$/)"), r1 = s.indexOf('_seedsInFlight.delete(scene)', r0)
  const rescope = r0 >= 0 && r1 > r0 ? s.slice(r0, r1) : null
  const rescopeRuns = rescope == null ? ['(the /rescope route was not found)'] : ['runShell(', 'runStep(', 'runExtentPour(', 'runPour('].filter(c => rescope.includes(c))
  const psRunPour = /export async function runPour\b/.test(ps)
  return { ok: !own.length && bake && !outside.length && !rescopeRuns.length && !psRunPour,
    say: `serve.js's own step commands: ${own.join(', ') || 'none'} · the Foundry reads the table, stepReads, recordStep: ${bake} · a pour outside it: ${outside.join(', ') || 'none'} · /rescope runs: ${rescopeRuns.join(', ') || 'nothing'} · pourSteps exports runPour: ${psRunPour}` }
}
const S = read('cartograph/serve.js'), PS = read('cartograph/pourSteps.mjs')
{ const r = oneSource(S, PS); row(r.ok, `(1) ${r.say}`) }

// (2) the table
const P = await import('../cartograph/pourSteps.mjs')
const dir0 = mkdtempSync(join(tmpdir(), 'pourone-')), raw = join(dir0, 'raw'), clean = join(dir0, 'clean'); mkdirSync(raw); mkdirSync(clean)
const paths = { raw, clean, map: join(clean, 'map.json'), geography: join(dir0, 'geography.json'), boundary: join(dir0, 'neighborhood_boundary.json'),
  measurements: join(raw, 'measurements.json'), centerlines: join(raw, 'centerlines.json'), overlay: join(clean, 'overlay.json'), skeleton: join(clean, 'skeleton.json') }
for (const [f, b] of [[join(raw, 'osm.json'), '{"ways":[]}'], [paths.map, '{"poured":1}'], [paths.geography, '{"lat":1}'], [paths.boundary, '{"radius":892}']]) writeFileSync(f, b)
const RIB = join(clean, 'ribbons.json'), SCENE = 'lafayettesquare'
try {
  const on = P.pourSteps(SCENE, paths, RIB, { elevation: true }).find(s => s.label === 'pipeline').cmd, off = P.pourSteps(SCENE, paths, RIB, { elevation: false }).find(s => s.label === 'pipeline').cmd
  row(!/--skip-elevation/.test(on) && /--skip-elevation/.test(off), `(2) the pipeline reads the town's pour.elevation: elevation → "${on}" · none → "${off}"`)
} finally { rmSync(dir0, { recursive: true, force: true }) }

// (3) an Extent edit is owed: what Extent writes is what the pour reads, so the Foundry's plan lists it
const PC = await import('../cartograph/pour-code.mjs')
const owedBy = (reads) => ['neighborhood_boundary.json', 'building-overrides.json'].filter(f => !reads.some(p => p.endsWith(`/${f}`)))
{ const miss = owedBy(PC.pourDataReads(SCENE)); row(!miss.length, `(3) an Extent edit is the Foundry's to see: ${miss.length ? `NOT read by the pour: ${miss.join(', ')}` : "the boundary and the building overrides are the pour's recorded data reads"}`) }

// mutants
{ const m1 = oneSource(S.replace("clearApplySnapshot(scene, 'prebak-rescope')", "await runExtentPour(scene, { cwd: here, env })\n        clearApplySnapshot(scene, 'prebak-rescope')"), PS)
  row(!m1.ok, `mutant: a pour back in /rescope → ${!m1.ok ? 'RED as it must be' : 'the row proves nothing'}`)
  const m2 = oneSource(S, PS + '\nexport async function runPour(steps) { return {} }\n')
  row(!m2.ok, `mutant: runPour back in pourSteps → ${!m2.ok ? 'RED as it must be' : 'the row proves nothing'}`)
  const m3 = owedBy(PC.pourDataReads(SCENE).filter(p => !p.endsWith('/neighborhood_boundary.json')))
  row(m3.length > 0, `mutant: the boundary dropped from the pour's data reads → ${m3.length ? 'RED as it must be' : 'the row proves nothing'}`) }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ the pour runs in one place: the Foundry')
process.exit(red ? 1 : 0)
