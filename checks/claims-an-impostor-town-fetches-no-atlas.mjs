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
 * ⛔ Mutation-tested 2026-09-28: drawsThroughAtlas ignoring the mesh bar → (1) and (3) go red.
 * ⚠️ (2) reads source; no browser runs here. The first dev render is the behavioural proof.
 *
 * Usage: node checks/claims-an-impostor-town-fetches-no-atlas.mjs
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ROOT } from './_scenes.mjs'
import { slabTreeGeometry } from '../src/lib/treeGeometry.js'

const fails = []
const roster = [{ species: 'oak', variantId: 1 }]
const hero = { oak: { pages: 1 } }
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
  put('trees-atlas.json', JSON.stringify({ roster, heroImpostorBySpecies: hero }))
  put('trees-atlas-color.png', 'PNG'); put('trees-atlas-bark-detail-color.png', 'PNG')
  put('trees/oak/skeleton-1-lod1.glb', 'GLB')
  put('trees/hero-impostor/oak/az0_leaf0.albedo.ktx2', 'KTX')
  put('scene.json', '{}')
  const keys = (meshTier) => {
    put('trees.json', JSON.stringify(base({ meshTier }).trees))
    return up.plan({ look: 'fx', prefix: 'staging/', root }).files.map((f) => f.key.replace('staging/baked/fx/', ''))
  }
  const imp = keys(false)
  for (const f of ['trees-atlas-color.png', 'trees-atlas-bark-detail-color.png', 'trees/oak/skeleton-1-lod1.glb']) if (imp.includes(f)) fails.push(`upload: an all-impostor town still publishes ${f}`)
  for (const f of ['trees/hero-impostor/oak/az0_leaf0.albedo.ktx2', 'trees-atlas.json', 'trees.json']) if (!imp.includes(f)) fails.push(`upload: an all-impostor town lost ${f}`)
  const model = keys(true)
  for (const f of ['trees-atlas-color.png', 'trees/oak/skeleton-1-lod1.glb']) if (!model.includes(f)) fails.push(`upload: a town with a model tree does not publish ${f}`)
} finally { rmSync(root, { recursive: true, force: true }) }

// 4. The verifier asks the same rule.
const verify = code(readFileSync(join(ROOT, 'scripts/verify-baked-in-r2.mjs'), 'utf8'))
if (!/treeGeometryOfTown\(/.test(verify) || !/ATLAS_ONLY_FILE\(/.test(verify)) fails.push('verify-baked-in-r2.mjs does not ask the runtime rule which files an all-impostor town omits')

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log('✅ an all-impostor town fetches and publishes no atlas PNG or model GLB; a town with a model tree gets both')
