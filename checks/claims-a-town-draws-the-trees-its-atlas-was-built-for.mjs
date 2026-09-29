#!/usr/bin/env node
/**
 * "DOES A TOWN DRAW THE TREES ITS ATLAS WAS BUILT FOR — READ FROM ITS SLAB?"
 *
 * WHY (BRIEF-slab-loading §⑥, 2026-09-28). The runtime gated trees on `design.json#trees`, fetched
 * through BASE_URL from the authoring tree. Inside The Ward that fetch 404s, the atlas rejects, and
 * `InstancedTrees` draws NO trees. And it was the wrong set anyway: bake-look builds the atlas for
 * the SELECTION (Jacob, 2026-08-25, "one set, three consumers"), so a placement outside the checkbox
 * list was drawn as a substitute species — 2,262 of Huron's, measured 2026-09-28.
 * Now bake-look writes `trees-atlas.json#roster` and `src/lib/treeRoster.js#rosterOf` reads it.
 *
 * Asserts:
 *   1. rosterOf refuses a manifest with no roster, an empty one, or a malformed entry, naming the
 *      town and "re-bake" — never "draw everything" and never an empty set.
 *   2. treeAtlasMaterial.js reads no design.json; bake-look writes `roster:` into the manifest.
 *   3. every town's local slab (public/baked/<town>/trees-atlas.json) carries a roster. A red here
 *      lists the towns to re-bake.
 * ⛔ Mutation-tested 2026-09-28: rosterOf returning an empty Set for a missing roster → (1) goes red.
 *
 * Usage: node checks/claims-a-town-draws-the-trees-its-atlas-was-built-for.mjs [<town> …]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { rosterOf } from '../src/lib/treeRoster.js'

const fails = []

// 1. The reader refuses what it cannot honestly draw.
for (const [what, manifest] of [['no roster', { atlas: {} }], ['an empty roster', { roster: [] }],
  ['a malformed entry', { roster: [{ species: 'quercus_alba' }] }]]) {
  try { rosterOf(manifest, 'fixture-town'); fails.push(`rosterOf accepted a manifest with ${what}`) }
  catch (e) { if (!/fixture-town/.test(e.message) || !/re-bake/i.test(e.message)) fails.push(`rosterOf refused ${what} without naming the town and "re-bake": ${e.message}`) }
}
const ok = rosterOf({ roster: [{ species: 'acer', variantId: 'v1' }, { species: 'acer', variantId: 0 }] }, 'fixture-town')
if (!(ok instanceof Set) || !ok.has('acer:v1') || !ok.has('acer:0') || ok.size !== 2) fails.push(`rosterOf read a good roster as ${JSON.stringify([...(ok || [])])}`)

// 2. The runtime reads the slab, and the bake writes it.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/.*$/gm, '')
const material = code(readFileSync(join(ROOT, 'src/components/treeAtlasMaterial.js'), 'utf8'))
if (/design\.json/.test(material)) fails.push('src/components/treeAtlasMaterial.js still reads design.json')
if (!/rosterOf\(manifest,/.test(material)) fails.push('src/components/treeAtlasMaterial.js does not take its roster from the atlas manifest (rosterOf)')
if (!/\n\s+roster: roster\.map\(/.test(readFileSync(join(ROOT, 'arborist/bake-look.js'), 'utf8'))) fails.push('arborist/bake-look.js does not write `roster` into trees-atlas.json')

// 3. Every local slab carries one.
let towns = []
try { towns = scenes('public/baked/<scene>/trees-atlas.json') } catch (e) { console.error(`⛔ NOT CHECKED — ${e.message}`) }
const rebake = []
for (const t of towns) {
  try { rosterOf(JSON.parse(readFileSync(join(ROOT, 'public/baked', t, 'trees-atlas.json'), 'utf8')), t); console.log(`  ✅ ${t}`) }
  catch { rebake.push(t) }
}
for (const t of rebake) fails.push(`${t}: trees-atlas.json has no roster — ▶ node arborist/bake-look.js --look ${t}`)

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
if (!towns.length) process.exit(2)
console.log(`✅ ${towns.length} town(s) draw the trees their atlas was built for, read from the slab`)
