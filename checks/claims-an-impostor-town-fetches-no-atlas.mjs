#!/usr/bin/env node
/**
 * "DOES AN ALL-IMPOSTOR TOWN LEAVE THE ATLAS ALONE — AND A TOWN WITH A MODEL TREE STILL GET IT?"
 *
 * WHY (Jacob, 2026-09-28): "We need to maintain the ability to have model trees, but for now, all
 * trees are impostors." Hero impostors draw from the atlas MANIFEST alone; only a model tree (the
 * Arborist's mesh bar) or a legacy layer card draws through the atlas PNGs + material. Before this
 * the player fetched the PNGs for every town and gated EVERY tree on them, and Publish uploaded the
 * model GLBs nothing could draw (222 MB on huron, ARCHITECTURE §Tree-render reality).
 *
 * Asserts:
 *   1. the one rule (src/lib/treeGeometry.js#slabTreeGeometry): all-impostor ⇒ not needed; a model
 *      tree, a species with no hero impostor, an unstamped mesh bar, an out-of-roster placement, no
 *      roster, no hero impostors, or the scene switching them off ⇒ needed.
 *   2. the runtime loads the material only on demand: InstancedTrees reads the manifest
 *      (useTreeManifest), asks useTreeMaterials only when a mesh group or layer card exists, and
 *      draws those only once the material is ready.
 *   3. the upload plan (scripts/upload-baked-to-r2.mjs#plan) leaves an all-impostor town's GLBs and
 *      atlas PNGs out and keeps its hero-impostor pages — and publishes them all once a tree is a model.
 *   4. the verifier asks the same rule.
 *   5. an impostor capture no atlas record names (the authoring PNG beside each KTX2) is withheld, and every file a hero
 *      layer or overhead band names is published (src/lib/treeGeometry.js#namedImpostorFiles; the runtime fetches only those).
 * ⛔ Mutation-tested 2026-09-28: drawsThroughAtlas ignoring the mesh bar → (1) and (3) go red.
 * ⭐ MUTANT (--mutants), must go RED: the publish rule without its record-name filter → (5).
 * ⚠️ (2) reads source; no browser runs here. The first dev render is the behavioural proof.
 *
 * Usage: node checks/claims-an-impostor-town-fetches-no-atlas.mjs [--mutants]
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { ROOT } from './_scenes.mjs'
import { slabTreeGeometry } from '../src/lib/treeGeometry.js'

const fails = []
const roster = [{ species: 'oak', variantId: 1 }]
const HERO_KTX = '/trees/hero-impostor/oak/az0_leaf0.albedo.ktx2', HERO_AO = '/trees/hero-impostor/oak/az0_leaf0.ao.png'
const OVER_KTX = '/trees/overhead/oak/branch.albedo.ktx2', OVER_AO = '/trees/overhead/oak/branch.ao.ktx2'
const hero = { oak: { pages: 1, layers: [{ albedo: HERO_KTX, ao: HERO_AO }] } }
const overhead = { oak: { bands: [{ albedo: OVER_KTX, ao: OVER_AO }] } }
// the capture's authoring sources, beside the named files: no record names them
const UNNAMED = ['trees/hero-impostor/oak/az0_leaf0.albedo.png', 'trees/hero-impostor/oak/az0_leaf0.ao.ktx2', 'trees/overhead/oak/branch.albedo.png', 'trees/overhead/oak/branch.ao.png']
const base = (instOver = {}, extra = {}) => ({
  trees: { meshTierStamped: true, instances: [{ species: 'oak', variantId: 1, meshTier: false, ...instOver }] },
  atlasManifest: { roster, heroImpostorBySpecies: hero }, scene: {}, look: 'fx', ...extra,
})
const want = (what, args, needed) => {
  const got = slabTreeGeometry(args)
  if (got.needed !== needed) fails.push(`rule: ${what} → needed=${got.needed} (${got.why}), want ${needed}`)
}

// 1. The rule.
want('every placement a hero impostor', base(), false)
want('a model tree (meshTier true)', base({ meshTier: true }), true)
want('a species with no hero impostor', base({ species: 'elm' }, { atlasManifest: { roster: [...roster, { species: 'elm', variantId: 1 }], heroImpostorBySpecies: hero } }), true)
want('a pre-stamp slab (meshTier absent)', { ...base(), trees: { instances: [{ species: 'oak', variantId: 1 }] } }, true)
want('an out-of-roster placement', base({ variantId: 9 }), true)
want('no roster', base({}, { atlasManifest: { heroImpostorBySpecies: hero } }), true)
want('no hero impostors baked', base({}, { atlasManifest: { roster } }), true)
want('the scene switches hero impostors off', base({}, { scene: { heroImpostor: false } }), true)
want('no trees.json', { ...base(), trees: null }, true)

// 2. The runtime.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const trees = code(readFileSync(join(ROOT, 'src/components/InstancedTrees.jsx'), 'utf8'))
const need = [
  [/const atlas = useTreeManifest\(lookName\)/, 'InstancedTrees reads the manifest with useTreeManifest'],
  [/needsMaterials = !!groups && \(groups\.meshGroups\.size > 0 \|\| groups\.impostors\.size > 0\)/, 'needsMaterials is "a mesh group or a layer card exists"'],
  [/useTreeMaterials\(lookName, needsMaterials\)/, 'the material is asked for only when needed'],
  [/mats\.status === 'ready' && !treeDbg\('noMesh'\)/, 'model trees draw only once the material is ready'],
  [/mats\.status === 'ready' && !treeDbg\('noImpostor'\)/, 'layer cards draw only once the material is ready'],
  [/drawsThroughAtlas\(/, 'the routing asks src/lib/treeGeometry.js'],
]
for (const [re, what] of need) if (!re.test(trees)) fails.push(`runtime: ${what} — not found`)
if (/useTreeAtlas\(|atlas\.treeMaterial|heroGeom|heroDbhCut|useBakedBand/.test(trees)) fails.push('runtime: InstancedTrees still loads the whole atlas or keeps the retired height split')

// 3. The upload plan.
const up = await import('../scripts/upload-baked-to-r2.mjs')
const root = mkdtempSync(join(tmpdir(), 'impostor-town-'))
try {
  const town = join(root, 'fx')
  const put = (rel, body) => { mkdirSync(join(town, rel, '..'), { recursive: true }); writeFileSync(join(town, rel), body) }
  put('trees-atlas.json', JSON.stringify({ roster, heroImpostorBySpecies: hero, overheadBySpecies: overhead }))
  put('trees-atlas-color.png', 'PNG'); put('trees-atlas-bark-detail-color.png', 'PNG')
  put('trees/oak/skeleton-1-lod1.glb', 'GLB')
  for (const f of [HERO_KTX, HERO_AO, OVER_KTX, OVER_AO]) put(f.slice(1), 'CAP')
  for (const f of UNNAMED) put(f, 'SRC')
  put('scene.json', '{}')
  // the slab carries its own name (T1, scripts/slab-name-rule.mjs): the uploader refuses a fixture whose stamps don't say 'fx'
  put('manifest.json', JSON.stringify({ town: 'fx' })); put('ground.json', JSON.stringify({ look: 'fx' }))
  const keys = (meshTier) => {
    put('trees.json', JSON.stringify(base({ meshTier }).trees))
    return up.plan({ look: 'fx', prefix: 'staging/', root }).files.map((f) => f.key.replace('staging/baked/fx/', ''))
  }
  const imp = keys(false)
  for (const f of ['trees-atlas-color.png', 'trees-atlas-bark-detail-color.png', 'trees/oak/skeleton-1-lod1.glb']) if (imp.includes(f)) fails.push(`upload: an all-impostor town still publishes ${f}`)
  for (const f of ['trees/hero-impostor/oak/az0_leaf0.albedo.ktx2', 'trees-atlas.json', 'trees.json']) if (!imp.includes(f)) fails.push(`upload: an all-impostor town lost ${f}`)
  const model = keys(true)
  for (const f of ['trees-atlas-color.png', 'trees/oak/skeleton-1-lod1.glb']) if (!model.includes(f)) fails.push(`upload: a town with a model tree does not publish ${f}`)
  // 5. the impostor captures: named ⇒ published, unnamed ⇒ withheld (in the plan, and in the rule the plan reads)
  for (const f of UNNAMED) if (imp.includes(f) || model.includes(f)) fails.push(`upload: publishes ${f}, which no atlas record names`)
  for (const f of [HERO_KTX, HERO_AO, OVER_KTX, OVER_AO]) if (!imp.includes(f.slice(1))) fails.push(`upload: lost ${f.slice(1)}, which an atlas record names`)
  const capturesRow = (notPublished) => {
    const why = notPublished(town, 'fx'), out = []
    for (const f of UNNAMED) if (!why(f)) out.push(`rule: publishes ${f}, which no atlas record names`)
    for (const f of [HERO_KTX, HERO_AO, OVER_KTX, OVER_AO]) if (why(f.slice(1))) out.push(`rule: withholds ${f.slice(1)} (${why(f.slice(1))})`)
    return out
  }
  const RULE = join(ROOT, 'scripts/slab-publish-rule.mjs')
  fails.push(...capturesRow((await import(pathToFileURL(RULE).href)).notPublished))

  // ── MUTANT: the rule without its record-name filter. Imports re-aimed at the repo, so the mutant runs the real readers.
  if (process.argv.includes('--mutants')) {
    const src = readFileSync(RULE, 'utf8')
    const abs = (s) => s.replace(/from '\.\.\/([^']+)'/g, (_, r) => `from '${pathToFileURL(join(ROOT, r)).href}'`)
      .replace(/from '\.\/([^']+)'/g, (_, r) => `from '${pathToFileURL(join(ROOT, 'scripts', r)).href}'`)
    const mut = src.replace(/^\s*if \(IMPOSTOR_CAPTURE_FILE\(p\) && !named\.has\([^\n]*\n/m, '')
    const ran = mut !== src, f = join(root, 'mutant-rule.mjs')
    let red = false
    if (ran) { writeFileSync(f, abs(mut)); red = capturesRow((await import(pathToFileURL(f).href)).notPublished).length > 0 }
    console.log(`   mutant · the rule without its record-name filter: ${!ran ? '⛔ not run (the site moved — re-aim the mutant)' : red ? 'RED, as it must be' : '⛔ still GREEN'}`)
    if (!ran || !red) fails.push('mutant: the record-name filter mutant did not go RED')
  }
} finally { rmSync(root, { recursive: true, force: true }) }

// 4. The verifier asks the same rule.
const verify = code(readFileSync(join(ROOT, 'scripts/verify-baked-in-r2.mjs'), 'utf8'))
if (!/treeGeometryOfTown\(/.test(verify) || !/ATLAS_ONLY_FILE\(/.test(verify)) fails.push('verify-baked-in-r2.mjs does not ask the runtime rule which files an all-impostor town omits')
if (!/impostorFilesOfTown\(/.test(verify) || !/IMPOSTOR_CAPTURE_FILE\(/.test(verify)) fails.push('verify-baked-in-r2.mjs does not ask which impostor captures an atlas record names')

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log('✅ an all-impostor town fetches and publishes no atlas PNG or model GLB; a town with a model tree gets both; only the impostor captures an atlas record names are published')
