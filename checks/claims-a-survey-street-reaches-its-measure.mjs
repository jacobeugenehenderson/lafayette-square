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
// Read-only. Exits 1 on any claim false or a mutant not seen; exits 2 (NOT CHECKED, named) for a town whose skeleton predates the
// classifier (re-pour owed), and only then.
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
const notChecked = []
const real = claims(await pathsOf('real'), await emptyOf('real'), await mergeOf('real'))
for (const r of real) console.log(`⛔ ${r}`)
if (real.length) bad++
else console.log(`✅ ① the route reads each town's own ribbons (${towns.length} town(s)) · ② no derived artifact is served empty · ③ a classed street reaches chainMeasure; an unclassed one throws`)
// ③, on the towns: every chain merged with its own ribbon reaches chainMeasure
const merge = await mergeOf('towns')
// one town's verdict: every chain merged with its own ribbon (or none, `noRibbons`) must reach chainMeasure
function townVerdict(t, merge, noRibbons = false) {
  const p = ribbonsPathOf(t); if (!existsSync(p)) return { v: 'absent', p }
  const rb = noRibbons ? new Map() : new Map((JSON.parse(readFileSync(p, 'utf8')).streets || []).map(r => [r.skelId, r]))
  const sk = JSON.parse(readFileSync(join(mapCleanDir(t), 'skeleton.json'), 'utf8')).streets || []
  const failed = sk.map(s => ({ s, e: throws(() => chainMeasure(merge(s, undefined, undefined, rb.get(s.id)))) })).filter(x => x.e)
  // ⚠️ a skeleton with NO classed chain predates the classifier: RE-POUR OWED, the corpus's convention (OPERATIONS, as the H-3
  // checks read): NOT CHECKED, named, exit 2 — never RED by design (Boz, 2026-10-28). A classed skeleton that fails is RED.
  const v = !failed.length ? 'green' : sk.every(c => !c.class) ? 'notChecked' : 'red'
  return { v, p, sk, failed }
}
for (const t of towns) {
  const r = townVerdict(t, merge)
  if (r.v === 'absent') { console.log(`   ${t}: no ribbons at ${r.p.replace(ROOT, '')} — its Designer refuses by name (not measured here)`); continue }
  if (r.v === 'notChecked') { notChecked.push(t); console.log(`⚠️ NOT CHECKED — ${t}: its skeleton predates the classifier (0 of ${r.sk.length} chains classed): re-pour owed. ${r.failed.length} chain(s) with no ribbon would reach chainMeasure with no measure.`); continue }
  if (r.v === 'red') bad++
  console.log(`${r.failed.length ? '⛔' : '✅'} ${t}: ${r.sk.length} chain(s) merged with their ribbons, ${r.failed.length} reach chainMeasure with no measure${r.failed.length ? `: ${r.failed.slice(0, 4).map(x => `${x.s.id} (${x.e})`).join(' · ')}` : ''}`)
}
if (MUTANTS) {
  const muts = [
    ['the route reads ribbons at clean/ again', await pathsOf('clean', mutate('ribbonsPathOf(scene),', "join(clean, 'ribbons.json'),")), await emptyOf('m1'), await mergeOf('m1')],
    ['a missing ribbons served empty again', await pathsOf('m2'), await emptyOf('empty', mutate("    overlay:      '{\"version\":1,\"streets\":{}}',", "    overlay:      '{\"version\":1,\"streets\":{}}',\n    ribbons:      '{\"streets\":[]}',")), await mergeOf('m2')],
    ['the class not copied', await pathsOf('m3'), await emptyOf('m3'), await mergeOf('noclass', mutate('    class: s.class,\n', ''))],
  ]
  // a CLASSED town is never laundered into "re-pour owed": with its ribbons withheld, the real merge seeds each chain from its
  // class, except the designed refusals (a highway or highway-link has no class-constant width: defaultSideMeasure says so; its
  // section rides the ribbons); with the class not copied, every chain fails, and the town must read RED, not NOT CHECKED
  const classed = towns.find(t => existsSync(ribbonsPathOf(t)) && townVerdict(t, merge).v === 'green' && townVerdict(t, merge, true).sk.some(c => c.class))
  if (!classed) { bad++; console.log('   ⛔ mutant not made: no classed town with ribbons') }
  else { const base = townVerdict(classed, merge, true), mut = townVerdict(classed, await mergeOf('noclass-town', mutate('    class: s.class,\n', '')), true)
    const designed = base.failed.every(x => /has no class-constant width/.test(x.e)), red = mut.v === 'red' && mut.failed.length > base.failed.length
    if (!designed || !red) bad++
    console.log(`   mutant · ${classed} with its ribbons withheld: the real merge seeds ${base.sk.length - base.failed.length} of ${base.sk.length} chains from their class${designed ? ` (the other ${base.failed.length}: highways, no class-constant width, by design)` : ` ⛔ and ${base.failed.filter(x => !/has no class-constant width/.test(x.e)).length} fail for another reason`} · the class not copied: ${red ? `RED, as it must be (${mut.failed.length} fail; not laundered into "re-pour owed")` : `⛔ ${mut.v}`}`) }
  for (const [what, p, e, m] of muts) { const got = claims(p, e, m), red = got.length > real.length
    if (!red) bad++
    console.log(`   mutant · ${what}: ${red ? `RED, as it must be (${got.filter(g => !real.includes(g))[0]})` : '⛔ still clean — the check cannot see it'}`) }
}
console.log(bad ? '\n⛔ RED — a Designer street does not reach its town\'s measure, or a missing artifact is served as an empty town'
  : notChecked.length ? `\n⚠️ NOT CHECKED — ${notChecked.join(', ')}: re-pour owed (not a pass). Every other town's streets reach their measure.`
  : '\n✅ GREEN — every Designer street reaches its own town\'s ribbons and class; a missing derived artifact is refused')
process.exit(bad ? 1 : notChecked.length ? 2 : 0)
