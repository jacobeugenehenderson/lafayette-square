#!/usr/bin/env node
/**
 * claims-intake-absence-is-loud.mjs
 *
 * ⛔⛔ THE CLASS THIS CATCHES, in one sentence: **a town's missing input arriving
 * downstream as a confident value instead of as an absence.**
 *
 * `CLAUDE.md` Layer 0 q2 — no fallbacks, a failed pour fails loudly — and its
 * `INTAKE-CATALOGUE §0` form: *"absence does not degrade to nothing — it degrades to
 * Lafayette Square."* Every assertion below is a place where that was true on
 * 2026-09-20 and is no longer.
 *
 * ⭐⭐ THIS CHECK READS THE SOURCE, IT DOES NOT RESTATE IT (`CLAUDE.md`, prune-as-you-go:
 * *"a check must READ the source, never restate it"*). It parses the zoning table out
 * of `categories.js` and counts the copies by grepping the tree, so it cannot go stale
 * the way a doc that quotes "four copies" does — which is exactly how
 * `INTAKE-CATALOGUE §3.6 G3` came to be wrong about its own line numbers.
 *
 * ⛔⛔ MUTATION-TESTED, AND SEEN TO FAIL BY NAME. `MEMORY §C`: a passing check proves
 * nothing until it has been seen to fail. Run `--self-test` to have it mutate its own
 * inputs in memory and assert that each assertion actually goes red:
 *     node checks/claims-intake-absence-is-loud.mjs --self-test
 *
 * Usage:
 *     node checks/claims-intake-absence-is-loud.mjs
 *     node checks/claims-intake-absence-is-loud.mjs --self-test
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

const results = []
const assert = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); return !!ok }

/**
 * ⛔⛔ MATCH CODE, NEVER COMMENTS — and this is not a nicety, it is the defect this file
 * exists to catch, committed by the file itself.
 *
 * Every fix here left a comment QUOTING the defect it removed (`|| 'residential'`,
 * `['stl_parcels.json', 'city']`, `|| '#ff66cc'`) because the record of why a line is
 * shaped the way it is is worth more than the line. A naive grep then finds its own
 * documentation and reports the defect as live — which is exactly the failure named in
 * `MEMORY §C` and in this brief: on 2026-09-20 a check in this repo passed for the wrong
 * reason, a lazy regex matching 3 of N. ⭐ It caught itself here on the first run, which
 * is the argument for writing the mutation harness before trusting the green.
 *
 * ⛔ The answer is NOT to delete the comments so the grep goes quiet. That would trade a
 * false positive for the loss of the only record of the bug.
 */
function codeLines(src) {
  let inBlock = false
  return src.split('\n').filter(line => {
    const t = line.trim()
    if (inBlock) { if (t.includes('*/')) inBlock = false; return false }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlock = true; return false }
    return !t.startsWith('//') && !t.startsWith('*')
  }).join('\n')
}

// ── The sources under test, loaded ONCE so --self-test can mutate them in memory ──
function loadSources() {
  return {
    categories: read('src/tokens/categories.js'),
    useListings: read('src/hooks/useListings.js'),
    sceneNeon: read('src/components/SceneNeon.jsx'),
    neonBands: read('src/components/NeonBands.jsx'),
    bakeContent: read('cartograph/bake-content.js'),
    placeCard: read('src/components/PlaceCard.jsx'),
    fetchJs: read('cartograph/fetch.js'),
    consumers: readConsumers(),
  }
}

/**
 * ⭐ EVERY code file that could consume a parcel well — not a list of the ones we know
 * about. Until 2026-09-24 the assessor assertion read `bake-content.js` alone, and the
 * identical St. Louis tuple sat in `derive.js` and `serve.js` with this check green.
 */
function readConsumers() {
  const out = {}
  const walk = (rel) => {
    for (const d of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      if (['_archive', 'data', 'node_modules'].includes(d.name)) continue
      const r = `${rel}/${d.name}`
      if (d.isDirectory()) walk(r)
      else if (/\.(m?js|jsx)$/.test(d.name)) out[r] = read(r)
    }
  }
  walk('cartograph'); walk('src')
  return out
}

/**
 * ⭐ The zoning table is PARSED out of categories.js, not copied here. If someone adds a
 * district, deletes one, or changes D back to commercial, this reads the change — a
 * hardcoded expectation would quietly go on asserting yesterday's table.
 */
function parseStlZoning(src) {
  const m = src.match(/export const STL_ZONING = \{([\s\S]*?)\n\}/)
  if (!m) return null
  const out = {}
  for (const line of m[1].split('\n')) {
    const r = line.match(/^\s*([A-Z]):\s*\{\s*category:\s*(null|'[a-z]+')\s*,\s*subcategory:\s*(null|'[a-z]+')/)
    if (r) out[r[1]] = { category: r[2] === 'null' ? null : r[2].slice(1, -1) }
  }
  return out
}

function run(S) {
  results.length = 0

  // ── 1. The zoning table has ONE home, and the copies are gone ──────────────────
  const zoning = parseStlZoning(S.categories)
  assert('zoning-table/one-home',
    zoning && Object.keys(zoning).length >= 10,
    zoning ? `STL_ZONING parsed: ${Object.keys(zoning).join('')}` : 'STL_ZONING not found in src/tokens/categories.js')

  // ⛔ A local `const ZONING_CAT = {` / `ZONING_SUB` / `ZONING_LABELS` anywhere but the
  // home is a re-forked copy. This is the defect returning, not a style preference:
  // five copies existed and no two agreed.
  for (const [file, src] of [['useListings.js', S.useListings], ['PlaceCard.jsx', S.placeCard], ['bake-content.js', S.bakeContent]]) {
    assert(`zoning-table/no-copy-in-${file}`,
      !/^\s*const ZONING_(CAT|SUB|LABELS)\s*=\s*\{/m.test(codeLines(src)),
      `${file} defines its own zoning table — the home is src/tokens/categories.js#STL_ZONING`)
  }

  // ⭐ Against the AUTHORITY, not against the other copies. St. Louis Revised Code Title
  // 26: C/D/E are Multiple-Family Dwelling (residential); F/G/H/I are commercial. Four
  // agreeing copies said D was commercial and H residential, and all four were wrong.
  if (zoning) {
    assert('zoning-table/D-is-residential-per-title-26',
      zoning.D?.category === 'residential',
      `STL_ZONING.D is "${zoning.D?.category}"; Title 26 makes D a Multiple-Family Dwelling district`)
    assert('zoning-table/H-is-commercial-per-title-26',
      zoning.H?.category === 'commercial',
      `STL_ZONING.H is "${zoning.H?.category}"; Title 26 makes H the Area Commercial district`)
  }

  // ── 2. No `|| 'residential'` fallback survives anywhere ────────────────────────
  // ⛔ The town-#2 killer, in its literal written form. A town with no St. Louis zoning
  // letter got every building residential and every neon tube sage.
  for (const [file, src] of [['useListings.js', S.useListings], ['SceneNeon.jsx', S.sceneNeon], ['bake-content.js', S.bakeContent]]) {
    const live = [...codeLines(src).matchAll(/\|\|\s*'residential'/g)]
    assert(`no-fallback/${file}`, live.length === 0,
      `${file} still substitutes 'residential' for an unknown zoning (${live.length} live site(s))`)
  }

  // ── 3. Unknown has a colour, and it is not a category ──────────────────────────
  assert('unknown-hex/exists',
    /export const UNKNOWN_HEX\s*=\s*'#[0-9a-fA-F]{6}'/.test(S.categories),
    'UNKNOWN_HEX is not exported from src/tokens/categories.js')
  // ⛔ It must not be reachable as a browsable category — "unknown" is the absence of a
  // category, and giving it a slot in the taxonomy makes it a thing to filter by.
  const hexBlock = S.categories.match(/export const CATEGORY_HEX = [\s\S]*?\n\)/)?.[0] || ''
  assert('unknown-hex/not-a-category',
    !/UNKNOWN_HEX/.test(hexBlock),
    'UNKNOWN_HEX has leaked into CATEGORY_HEX — it would appear as a browsable category')
  assert('unknown-hex/painted-by-neon',
    /UNKNOWN_HEX/.test(S.sceneNeon) && /UNKNOWN_HEX/.test(S.neonBands),
    'both neon paths must paint UNKNOWN_HEX; otherwise an unclassified town renders as a normal or an empty night')
  // ⛔ The magenta debug default was itself a silent substitution wearing a bright colour.
  assert('unknown-hex/no-debug-magenta',
    !/\|\|\s*'#ff66cc'/.test(codeLines(S.neonBands)),
    "NeonBands still falls back to the '#ff66cc' debug magenta for an unknown category")

  // ── 4. Intake keeps what it fetches ────────────────────────────────────────────
  // ⛔ `fetch.js` threw every tagged node's tags away at ingest, in every town ever
  // poured. `HEAVY_NODES` has carried `amenity` since forever, so this was never about
  // the tag list.
  assert('node-poi/tags-kept-at-ingest',
    /if \(el\.tags\) taggedNodes\.push\(el\)/.test(S.fetchJs),
    'fetch.js#ingestElements no longer keeps tagged nodes — the node discard has returned')
  assert('node-poi/own-bucket-not-ground',
    /^\s*pois,?\s*$/m.test(S.fetchJs) && !/bucket\(\{[\s\S]{0,200}osmType: 'node'/.test(S.fetchJs),
    'point features must be a top-level sibling of `ground`, never bucketed into it (snap.js drops <2 coords; skeleton.js reads ground.highway as polylines)')
  assert('node-poi/consumed-by-bake',
    /Array\.isArray\(j\.pois\)/.test(S.bakeContent),
    'bake-content.js#loadOsmPois does not read .pois — intake would keep the nodes and nothing would use them')

  // ── 5. The assessor path is declared, not hardcoded ────────────────────────────
  // ⛔ `INTAKE-CATALOGUE §0`'s LS-bleed in the acquisition path: every non-St-Louis town
  // printed "missing stl_parcels.json" and matched 0 parcels.
  const hardcoded = Object.entries({ ...S.consumers, 'cartograph/bake-content.js': S.bakeContent })
    .filter(([, src]) => /['"`](stl|stlco)_parcels\.json['"`]/.test(codeLines(src))).map(([f]) => f)
  assert('assessor/no-hardcoded-filenames',
    hardcoded.length === 0,
    `a St. Louis parcel filename is hardcoded in code, not read from sources.json: ${hardcoded.join(', ')}`)
  assert('assessor/reads-the-declaration',
    /readSources\(scene\)/.test(S.bakeContent) && existsSync(join(ROOT, 'cartograph/sources.js')),
    'bake-content.js does not read a per-town sources declaration')

  // ⭐ Every scene with a data dir must have DECIDED — declared wells, or declared none
  // with a reason. Undeclared is the state this whole record exists to make impossible.
  const dataDir = join(ROOT, 'cartograph/data')
  const scenes = readdirSync(dataDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(dataDir, d.name, 'raw')))
    .map(d => d.name)
  const undeclared = scenes.filter(s => !existsSync(join(dataDir, s, 'sources.json')))
  assert('assessor/every-scene-has-decided',
    undeclared.length === 0,
    `scene(s) with raw data and no sources.json: ${undeclared.join(', ')} — undeclared is not the same as "no assessor"`)

  // ⛔ A declaration that provides nothing and explains nothing is undeclared wearing a
  // filename. `provides`/`absent` must partition the schema — enforced in sources.js,
  // asserted here so the enforcement itself cannot be quietly removed.
  assert('assessor/declaration-is-validated',
    /accounts for neither provides nor absent/.test(read('cartograph/sources.js')),
    'sources.js no longer rejects a declaration that leaves a parcel field unaccounted for')

  // ── 6. A dead join FAILS, it does not warn ─────────────────────────────────────
  // ⛔ `frame-alignment: 0/3678 (0%)` used to warn and bake on, producing a roster whose
  // every address was null on a town that looked surveyed.
  assert('frame-alignment/zero-match-throws',
    /parcels\.length && contained === 0/.test(S.bakeContent) &&
    /throw new Error\(`frame-alignment/.test(S.bakeContent),
    'bake-content.js warns rather than throws when parcels load and NOT ONE building matches')

  // ── 7. A land-use code is not read in a taxonomy nobody declared ───────────────
  // ⛔ Ohio's `500: Res-Vacant Land` stripped to 500 landed in St. Louis's
  // `400 <= n < 700 => commercial, confidence HIGH`. A residential vacant lot reported
  // as a confident commercial building is worse than the 0% it replaced.
  assert('land-use/format-must-be-declared',
    /fmt !== 'stl-assessor-numeric'/.test(S.bakeContent),
    "bake-content.js#classifyUse applies St. Louis numeric ranges without checking the scene's declared code format")

  return results
}

// ── Mutation self-test ──────────────────────────────────────────────────────────
// ⭐⭐ Each entry re-introduces ONE defect into the in-memory source and asserts that the
// NAMED assertion goes red. A check that has only ever been seen green is a check nobody
// has any reason to trust — and on 2026-09-20 a check in this repo passed for the wrong
// reason, a lazy regex matching 3 of N and reporting green.
const MUTATIONS = [
  { name: 'no-fallback/useListings.js',
    apply: (S) => ({ ...S, useListings: S.useListings.replace('const zoned = classifyZoning', "const _x = ZONING_CAT[z] || 'residential'\n      const zoned = classifyZoning") }) },
  { name: 'no-fallback/SceneNeon.jsx',
    apply: (S) => ({ ...S, sceneNeon: S.sceneNeon.replace('return _NEON_ZONING_CATEGORY[zoning] || null', "return _NEON_ZONING_CATEGORY[zoning] || 'residential'") }) },
  { name: 'zoning-table/D-is-residential-per-title-26',
    apply: (S) => ({ ...S, categories: S.categories.replace("D: { category: 'residential'", "D: { category: 'commercial'") }) },
  { name: 'zoning-table/H-is-commercial-per-title-26',
    apply: (S) => ({ ...S, categories: S.categories.replace("H: { category: 'commercial'", "H: { category: 'residential'") }) },
  { name: 'zoning-table/no-copy-in-useListings.js',
    apply: (S) => ({ ...S, useListings: S.useListings.replace('let _landmarkBids', "const ZONING_CAT = { A: 'residential' }\nlet _landmarkBids") }) },
  { name: 'unknown-hex/exists',
    apply: (S) => ({ ...S, categories: S.categories.replace(/export const UNKNOWN_HEX\s*=\s*'#[0-9a-fA-F]{6}'/, "export const UNKNOWN_HEX = null") }) },
  { name: 'unknown-hex/no-debug-magenta',
    apply: (S) => ({ ...S, neonBands: S.neonBands.replace('CATEGORY_HEX[key] || UNKNOWN_HEX', "CATEGORY_HEX[key] || '#ff66cc'") }) },
  { name: 'unknown-hex/painted-by-neon',
    apply: (S) => ({ ...S, neonBands: S.neonBands.replace(/UNKNOWN_HEX/g, 'CATEGORY_HEX.residential') }) },
  { name: 'node-poi/tags-kept-at-ingest',
    apply: (S) => ({ ...S, fetchJs: S.fetchJs.replace('if (el.tags) taggedNodes.push(el)', '// discarded') }) },
  { name: 'node-poi/consumed-by-bake',
    apply: (S) => ({ ...S, bakeContent: S.bakeContent.replace('Array.isArray(j.pois)', 'false') }) },
  { name: 'assessor/no-hardcoded-filenames',
    apply: (S) => ({ ...S, bakeContent: S.bakeContent.replace('function loadParcels(scene) {', "function loadParcels(scene) {\n  for (const [file, jur] of [['stl_parcels.json', 'city']]) {}") }) },
  { name: 'assessor/no-hardcoded-filenames',
    apply: (S) => ({ ...S, consumers: { ...S.consumers, 'cartograph/serve.js': S.consumers['cartograph/serve.js'] + "\nconst P = join(raw, 'stl_parcels.json')" } }) },
  { name: 'assessor/reads-the-declaration',
    apply: (S) => ({ ...S, bakeContent: S.bakeContent.replace(/readSources\(scene\)/g, 'noSources(scene)') }) },
  { name: 'frame-alignment/zero-match-throws',
    apply: (S) => ({ ...S, bakeContent: S.bakeContent.replace('throw new Error(`frame-alignment', 'console.warn((`frame-alignment') }) },
  { name: 'land-use/format-must-be-declared',
    apply: (S) => ({ ...S, bakeContent: S.bakeContent.replace("fmt !== 'stl-assessor-numeric'", 'false') }) },
]

function selfTest() {
  const base = loadSources()
  const green = run(base)
  const stillRed = green.filter(r => !r.ok)
  if (stillRed.length) {
    console.log('⛔ SELF-TEST ABORTED — the check is not green on the real tree, so a mutation proves nothing:')
    for (const r of stillRed) console.log(`   ✗ ${r.name}: ${r.detail}`)
    return 1
  }
  console.log(`baseline: ${green.length} assertion(s), all green. Mutating ${MUTATIONS.length}:\n`)
  let bad = 0
  for (const m of MUTATIONS) {
    const res = run(m.apply(base))
    const hit = res.find(r => r.name === m.name)
    if (!hit) { console.log(`  ⛔ ${m.name} — NO SUCH ASSERTION (renamed? deleted?)`); bad++; continue }
    if (hit.ok) { console.log(`  ⛔ ${m.name} — defect re-introduced and the check STAYED GREEN`); bad++; continue }
    // ⭐ Also require that the mutation did not simply break everything: a check that
    // goes red for all the wrong reasons is not evidence either.
    const collateral = res.filter(r => !r.ok && r.name !== m.name)
    console.log(`  ✓ ${m.name} — went red${collateral.length ? ` (+${collateral.length} collateral)` : ''}`)
  }
  console.log(bad ? `\n⛔ ${bad} mutation(s) did not produce a failure.` : `\n✅ every mutation produced its named failure.`)
  return bad ? 1 : 0
}

// ── main ────────────────────────────────────────────────────────────────────────
if (process.argv.includes('--self-test')) {
  process.exit(selfTest())
}
const res = run(loadSources())
const failed = res.filter(r => !r.ok)
for (const r of res) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`)
console.log(`\n${res.length - failed.length}/${res.length} green`)
if (failed.length) {
  console.log(`⛔ ${failed.length} assertion(s) failed — an intake absence is degrading to a confident value again.`)
  process.exit(1)
}
