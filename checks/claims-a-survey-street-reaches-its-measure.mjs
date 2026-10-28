#!/usr/bin/env node
// claims-a-survey-street-reaches-its-measure.mjs — DOES THE STREET THE DESIGNER HOLDS REACH `chainMeasure` WITH ITS TOWN'S
// RIBBONS AND ITS OWN CLASS, OR IS THE TOWN REFUSED BY NAME?
//
// ⭐ The defect (LS Survey, Jacob live, 2026-10-28): selecting a street threw `chainMeasure: street Carroll Street carries no
// class` and lost the WebGL context. Two causes, each a claim here:
//   ① THE RIBBONS ARE THE TOWN'S OWN. `serve.js#mapDataPaths` read every town's ribbons at clean/ribbons.json; LS declares
//      pour.ribbons = src/data/ribbons.json, so its file was "missing". The route must ask `scene.js#ribbonsPathOf` (the one
//      answer). Read from the source: for every town with a home Look, mapDataPaths(scene).ribbons === ribbonsPathOf(scene).
//   ② A MISSING DERIVED ARTIFACT IS NEVER AN EMPTY TOWN. The route answered a missing ribbons 200 with `{"streets":[]}`. Its
//      `EMPTY` table (read from the source) may hold only the operator's own files (markers, measurements, centerlines,
//      overlay), never skeleton, ribbons, map, geography or boundary, which go 404 by name.
//   ③ THE STREET CARRIES ITS CLASS. `sceneStreets.js#mergeSceneStreet` (the store's per-chain merge) copied no `class`, so a
//      street with no measure threw. A planted classed chain with no overlay, legacy or ribbon must reach chainMeasure and get
//      a measure; a planted UNclassed one must still throw (no residential default: Layer 0). And every chain of every town
//      with ribbons, merged with its own ribbon, reaches chainMeasure without a throw.
// ⭐ MUTANTS (--mutants), each RED: mapDataPaths back on clean/ · `ribbons` back in EMPTY · the class not copied.
//   node checks/claims-a-survey-street-reaches-its-measure.mjs [<scene> …] [--mutants]
// Read-only. Exits 1 on any claim false or a mutant not seen.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { scenes, ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'
import { ribbonsPathOf, mapCleanDir } from '../cartograph/scene.js'
import { chainMeasure } from '../src/cartograph/measureModel.js'
const MUTANTS = process.argv.includes('--mutants')
const DERIVED = ['skeleton', 'ribbons', 'map', 'geography', 'boundary'], OPERATOR = ['markers', 'measurements', 'centerlines', 'overlay']

const pathsOf = async (tag, transform) => (await importSource('cartograph/serve.js', { span: { functions: ['mapDataPaths'] },
  prefix: "import { join } from 'node:path'\nimport { mapRawDir, mapCleanDir, ribbonsPathOf } from './config.js'", suffix: `export { mapDataPaths } // ${tag}`, transform })).mapDataPaths
const emptyOf = async (tag, transform) => (await importSource('cartograph/serve.js', { span: { from: '  const EMPTY = {', to: '  // Reserved top-level prefixes' },
  suffix: `export { EMPTY } // ${tag}`, transform: (t) => { const u = t.replace(/^ {2}const EMPTY/m, 'const EMPTY'); return transform ? transform(u) : u } })).EMPTY
const mergeOf = async (tag, transform) => (await importSource('src/cartograph/sceneStreets.js', { suffix: `// ${tag}`, transform })).mergeSceneStreet
const mutate = (from, to) => (t) => { if (!t.includes(from)) throw new Error(`[mutant] the text it mutates is gone ("${from.slice(0, 50)}") — re-aim it`); return t.replace(from, to) }
const throws = (f) => { try { f(); return null } catch (e) { return e.message } }

const towns = scenes('cartograph/data/<scene>/clean/skeleton.json', { has: (s) => existsSync(join(mapCleanDir(s), 'skeleton.json')) })
function claims(mapDataPaths, EMPTY, merge) {
  const out = []
  // ① every town's ribbons are its own
  for (const t of towns) { const got = mapDataPaths(t).ribbons, want = ribbonsPathOf(t); if (got !== want) out.push(`① ${t}: the route reads ribbons at ${got.replace(ROOT, '')}, the town's are at ${want.replace(ROOT, '')}`) }
  // ② no derived artifact has an empty default; every operator file does
  for (const v of DERIVED) if (v in EMPTY) out.push(`② a missing ${v} is served as ${EMPTY[v]} (an empty town), not a 404`)
  for (const v of OPERATOR) if (!(v in EMPTY)) out.push(`② the operator's ${v} has no empty default (nothing authored yet is empty)`)
  // ③ a planted classed chain reaches chainMeasure with its class; an unclassed one still throws
  const chain = (extra) => ({ id: 'planted-street-0', name: 'Planted Street', highway: 'residential', oneway: false, points: [{ x: 0, z: 0 }, { x: 50, z: 0 }], ...extra })
  const m = merge(chain({ class: 'local', lanes: 2 }), undefined, undefined, undefined)
  if (m.class !== 'local') out.push(`③ the merged street carries class ${JSON.stringify(m.class)}, the skeleton's is "local"`)
  const e1 = throws(() => chainMeasure(m)); if (e1) out.push(`③ a classed street with no measure does not reach a measure: ${e1}`)
  if (!throws(() => chainMeasure(merge(chain({}), undefined, undefined, undefined)))) out.push('③ an UNclassed street with no measure got a measure: a default stood in for the class')
  return out
}

let bad = 0
const real = claims(await pathsOf('real'), await emptyOf('real'), await mergeOf('real'))
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log(`✅ ① the route reads each town's own ribbons (${towns.length} town(s)) · ② no derived artifact is served empty · ③ a classed street reaches chainMeasure; an unclassed one throws`)
// ③, on the towns: every chain merged with its own ribbon reaches chainMeasure
const merge = await mergeOf('towns')
for (const t of towns) {
  const p = ribbonsPathOf(t); if (!existsSync(p)) { console.log(`   ${t}: no ribbons at ${p.replace(ROOT, '')} — its Designer refuses by name (not measured here)`); continue }
  const rb = new Map((JSON.parse(readFileSync(p, 'utf8')).streets || []).map(r => [r.skelId, r]))
  const sk = JSON.parse(readFileSync(join(mapCleanDir(t), 'skeleton.json'), 'utf8')).streets || []
  const failed = sk.map(s => ({ s, e: throws(() => chainMeasure(merge(s, undefined, undefined, rb.get(s.id)))) })).filter(x => x.e)
  if (failed.length) bad++
  console.log(`${failed.length ? '⛔' : '✅'} ${t}: ${sk.length} chain(s) merged with their ribbons, ${failed.length} reach chainMeasure with no measure${failed.length ? `: ${failed.slice(0, 4).map(x => `${x.s.id} (${x.e})`).join(' · ')}` : ''}`)
}
if (MUTANTS) {
  const muts = [
    ['the route reads ribbons at clean/ again', await pathsOf('clean', mutate('ribbonsPathOf(scene),', "join(clean, 'ribbons.json'),")), await emptyOf('m1'), await mergeOf('m1')],
    ['a missing ribbons served empty again', await pathsOf('m2'), await emptyOf('empty', mutate("    overlay:      '{\"version\":1,\"streets\":{}}',", "    overlay:      '{\"version\":1,\"streets\":{}}',\n    ribbons:      '{\"streets\":[]}',")), await mergeOf('m2')],
    ['the class not copied', await pathsOf('m3'), await emptyOf('m3'), await mergeOf('noclass', mutate('    class: s.class,\n', ''))],
  ]
  for (const [what, p, e, m] of muts) { const got = claims(p, e, m), red = got.length > real.length
    if (!red) bad++
    console.log(`   mutant · ${what}: ${red ? `RED, as it must be (${got.filter(g => !real.includes(g))[0]})` : '⛔ still clean — the check cannot see it'}`) }
}
console.log(bad ? '\n⛔ RED — a Designer street does not reach its town\'s measure, or a missing artifact is served as an empty town' : '\n✅ GREEN — every Designer street reaches its own town\'s ribbons and class; a missing derived artifact is refused')
process.exit(bad ? 1 : 0)
