#!/usr/bin/env node
/**
 * CLAIM: a scene whose listings base is EXTERNAL survives `bake-content` — the
 *        base is re-produced from its own artifact, not silently destroyed.
 *
 * ⛔⛔ THE REGRESSION THIS PINS IS REAL AND IT HAS ALREADY HAPPENED. Baking a
 * town whose listings came from Overture Places, after an Extent edit, took its
 * `listings.json` FROM 84 RECORDS TO 5 (2026-07-20). The OSM join yields ~0 on a
 * town whose base is external, so the write kept only the surviving hand-authored
 * adds and threw the rest away — and it did it while printing a perfectly normal
 * census. That is the worst failure a kit can have: a plausible-looking success.
 *
 * ⭐ WHY A FIXTURE AND NOT A REAL TOWN. The two scenes that had an external base
 * were excised on 2026-09-19, so the regression has no home left to be pinned
 * on. A check that can only run where the bug once lived protects nobody
 * (`CLAUDE.md` Layer 0 q1 — what does this do for town #2?). The fixture is a
 * complete, minimal town built and torn down by this file, so the claim is
 * testable on any machine, forever, with no scene on disk.
 *
 * ⛔ IT EXERCISES THE PRODUCTION PATH, NOT A MOCK OF IT. `bakeContent` is
 * imported and run — the same function the operator runs. A mock of the guard
 * would prove the mock works.
 *
 * ⛔⛔ IT IS TIERED `live`/**unreadable**, WHICH MEANS IT DOES NOT RUN IN ANY
 * DEFAULT SUITE, AND THAT IS A KNOWN COST — say it out loud rather than let
 * someone discover a green they never earned. It contacts NOTHING; `unreadable`
 * is the tier's own second reason class, for code the parser cannot read, and
 * `tier.mjs` is explicit that the tier name overstates it. Two separate reasons
 * put it there, neither of them this check's to fix:
 *   1. Importing the bake pulls in `scene.js`, reported as "child_process with a
 *      non-literal command". ⚠️ FALSE POSITIVE — `scene.js:56` is
 *      `/^--scene=(.+)$/.exec(a)`, a RegExp `.exec`, not `child_process.exec`.
 *      It taints every module importing scene.js, i.e. every writer in
 *      cartograph/.
 *   2. Spawning the CLI instead runs `node <script>`, and `LOCAL_CMD`
 *      (`tier.mjs:77`) allows `node -e` but not `node <script>`.
 * ⛔ NEITHER IS WORKED AROUND HERE. `tier.mjs`'s header says "do not 'improve'
 * this by resolving ambiguity in favour of safe", and routing through `node -e`
 * to land on the allow-list would defeat the gate rather than satisfy it —
 * a check that games its own classifier is worth less than no check.
 * ⇒ RUN IT DELIBERATELY, and run it after any change to the listings base path:
 *   ▶ node checks/claims-an-external-base-survives-a-bake.mjs
 * It writes a fixture scene and its slab, and cleans both up, including on
 * failure.
 */
// ⛔⛔ IT DRIVES THE CLI WITH A LITERAL COMMAND, AND THE TIER IS THE REASON.
// `checks/tier.mjs` classifies by READING this source, and it cannot read
// through an import: importing `bake-content.js` pulls in `scene.js`, which the
// parser reports as "child_process with a non-literal command", so ANY check
// that imports the bake is tiered `live` — opt-in, and therefore never run.
// ⭐ A regression pin that does not run is decorative.
//
// ⚠️ THAT REPORT IS A FALSE POSITIVE AND IT IS WORTH KNOWING ABOUT: `scene.js:56`
// is `/^--scene=(.+)$/.exec(a)` — a RegExp `.exec`, not `child_process.exec`.
// It taints every module that imports scene.js, which is every writer in
// cartograph/. ⛔ NOT FIXED HERE ON PURPOSE. tier.mjs says in its own header:
// "do not 'improve' this by resolving ambiguity in favour of safe" — loosening
// a classifier to make one's own check run is how a check ends up in `safe`
// that should never have been, and the cost of that mistake is asymmetric.
// Reported instead; the remedy belongs with whoever owns the classifier.
//
// ⇒ So this spawns the real CLI, with a literal command the parser can read.
// That is also the more honest test: it is the gesture the operator performs.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FX = '_fixture-external-base'
const sceneDir = join(ROOT, 'cartograph', 'data', FX)
const slabDir = join(ROOT, 'public', 'baked', FX)
const listingsPath = join(sceneDir, 'content', 'listings.json')

const fails = []
const fail = (m) => { fails.push(m); console.error(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✓ ${m}`)

// ── the fixture: four buildings, four external places, no OSM POIs at all ───
// ⭐ ZERO OSM POIs IS THE POINT. It reproduces the exact condition that made the
// regression possible — an OSM join that yields nothing — so a bake that falls
// back to the OSM producer produces an EMPTY base and the destruction is
// unmistakable rather than a subtle diff.
function buildFixture() {
  rmSync(sceneDir, { recursive: true, force: true })
  rmSync(slabDir, { recursive: true, force: true })
  for (const d of ['clean', 'raw', 'content']) mkdirSync(join(sceneDir, d), { recursive: true })
  mkdirSync(slabDir, { recursive: true })

  const W = (p, o) => writeFileSync(p, JSON.stringify(o, null, 1) + '\n')
  const sq = (x, z, r = 8) => [[x - r, z - r], [x + r, z - r], [x + r, z + r], [x - r, z + r]]
  const ids = [1, 2, 3, 4]
  const at = (i) => [i * 60, 0]

  W(join(sceneDir, 'geography.json'), {
    lat: 41.4, lon: -82.5, timezone: 'America/New_York',
    lonToMeters: 83509, latToMeters: 111000,
    bbox: { minLat: 41.39, maxLat: 41.41, minLon: -82.51, maxLon: -82.49 },
  })
  W(join(sceneDir, 'clean', 'map.json'), {
    buildings: ids.map(i => ({ osmId: i, ring: sq(...at(i)).map(([x, z]) => ({ x, z })) })),
  })
  W(join(slabDir, 'buildings.json'), {
    buildings: ids.map(i => ({ id: `osm-${i}`, stories: 1 })),
  })
  // An OSM extract with NO named POIs — the OSM producer would yield zero here.
  W(join(sceneDir, 'raw', 'osm.json'), { bbox: {}, ground: {}, pois: [], buildings: [] })
  // ⭐ The town DECLARES it has no assessor, which is an honest zero rather than
  // an undeclared one — otherwise the bake correctly shouts about it and the
  // check's output is noise (`cartograph/sources.js`, DECLARED-NONE).
  W(join(sceneDir, 'sources.json'), {
    parcels: [], parcels_absent_reason: 'fixture town — exercises the listings base only, no assessor is in scope',
    // ⭐ DECLARED-none, not undeclared. With no parcel wells there is no code
    // vocabulary to decode, and `null` says a human established that — which is
    // what stops the bake shouting at this fixture on every run. Silencing it by
    // leaving the field out would be the undeclared case, i.e. the thing the
    // declaration exists to catch.
    landUseCodes: null,
  })
  W(join(sceneDir, 'raw', 'overture-places.json'), {
    meta: { scene: FX, source: 'overture-places', release: 'fixture', count: ids.length },
    places: ids.map(i => ({
      id: `fixture-place-${i}`, name: `Fixture Place ${i}`,
      category: 'restaurant', hierarchy: ['food_and_drink', 'restaurant'],
      confidence: 0.9, operating_status: 'open',
      lon: -82.5, lat: 41.4, x: at(i)[0], z: at(i)[1],
      address: `${i} Fixture St`, website: null, phone: null, socials: [],
      sources: ['meta'],
    })),
  })
  W(join(sceneDir, 'content', 'listings.overrides.json'), {
    meta: { baseSource: 'overture' }, adds: [], patches: {},
  })
}

/**
 * Run the production entry point exactly as the operator does.
 * ⛔ Returns the error text rather than throwing, because one assertion below is
 * that the bake REFUSES — a refusal is the expected result there, not a crash.
 */
function bake({ force = false } = {}) {
  const args = ['cartograph/bake-content.js', `--scene=${FX}`]
  if (force) args.push('--force')
  try { return { ok: true, out: execFileSync('node', args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }) } }
  catch (e) { return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` } }
}

const countListings = () => {
  if (!existsSync(listingsPath)) return null
  return JSON.parse(readFileSync(listingsPath, 'utf8')).listings.length
}

try {
  buildFixture()

  // ── 1. the base is PRODUCED, not skipped ─────────────────────────────────
  bake()
  const first = countListings()
  const firstBytes = existsSync(listingsPath) ? readFileSync(listingsPath, 'utf8') : ''
  if (first === null) fail('first bake wrote no listings.json at all — the external base was SKIPPED, not produced')
  else if (first !== 4) fail(`first bake produced ${first} listings, expected 4 — the external base did not reach the write`)
  else ok(`the external base is produced by the bake (${first} listings from 4 acquired places)`)

  // ── 2. THE PIN — a second bake does not destroy it ───────────────────────
  bake()
  const second = countListings()
  const secondBytes = existsSync(listingsPath) ? readFileSync(listingsPath, 'utf8') : ''
  if (second !== first) fail(`re-baking took listings from ${first} to ${second} — THIS IS THE 84→5 REGRESSION`)
  else if (firstBytes !== secondBytes) fail('re-baking changed listings.json byte-for-byte — the base is not stable across bakes')
  else ok(`re-baking is byte-identical (${second} listings) — the 84→5 regression cannot recur silently`)

  // ── 3. an unknown declared base FAILS LOUD, never falls back ─────────────
  writeFileSync(join(sceneDir, 'content', 'listings.overrides.json'),
    JSON.stringify({ meta: { baseSource: 'not-a-real-producer' }, adds: [], patches: {} }, null, 1))
  const refused = bake()
  if (refused.ok) fail('a declared base with NO PRODUCER did not refuse — it fell through silently, which is how "an external base is supported" read as true for months')
  else if (!/no producer/i.test(refused.out)) fail(`refused, but not about the missing producer: ${refused.out.slice(0, 200)}`)
  else ok('a declared base with no producer fails LOUD, and does not fall back to OSM')

  // ── 4. the mutation, run FOR REAL — prove the check can SEE destruction ──
  // ⛔ A passing check proves nothing until it has been seen to fail. `--force`
  // is the deliberate destructive path, so this runs the actual 84→5 gesture and
  // asserts the check's own instrument notices. If this block ever stops
  // detecting the loss, assertion 2 above is decorative.
  writeFileSync(join(sceneDir, 'content', 'listings.overrides.json'),
    JSON.stringify({ meta: { baseSource: 'overture' }, adds: [], patches: {} }, null, 1))
  bake({ force: true })
  const forced = countListings()
  if (forced === first) fail(`MUTATION DID NOT BITE: --force left ${forced} listings, so this check cannot tell a destroyed base from a surviving one and assertion 2 proves nothing`)
  else ok(`mutation bites: --force destroys the base (${first} → ${forced}), so assertion 2 is load-bearing`)

} catch (e) {
  fail(`the check itself threw: ${e.message}`)
} finally {
  rmSync(sceneDir, { recursive: true, force: true })
  rmSync(slabDir, { recursive: true, force: true })
}

console.log('')
if (fails.length) {
  console.error(`⛔ FAIL — ${fails.length} problem(s) with the external-base path.\n`)
  process.exit(1)
}
console.log('✅ PASS — an external listings base is produced, survives a re-bake byte-identically,')
console.log('   fails loud when its producer is unknown, and the destruction is detectable.')
