#!/usr/bin/env node
/**
 * claims-every-measurable-town-is-declared — A TOWN THE KIT CAN MEASURE IS A TOWN THE KIT DECLARES.
 *
 * THE CLAIM: `public/looks/index.json` and the baked corpus agree in BOTH directions. Every town
 * with artifacts is declared; every declared town is accounted for.
 *
 * ⛔ WHY THIS IS NOT A DUPLICATE OF `checks/_scenes.mjs`. That module carries the same test and it
 *    is the right place for it — it is what stops a scene-reading check from skipping a town. But
 *    it `console.log`s and does not fail, and it only speaks when a scene-reading check happens to
 *    RUN. In a 126-check suite those two facts compound: the warning prints inside another check's
 *    output, scrolls past, and changes no exit code. ⭐ A warning nobody's exit code depends on is
 *    a comment. This file makes it a CLAIM, with its own name and its own red.
 *
 * WHY IT MATTERS (2026-09-13). 45 checks each ended with a typed roster —
 * `['lafayette-square', 'hipointe-demun']` — a skip list distributed across 45 files that nobody
 * had named one. Pour a new town and every one of them ignored it, and nothing failed. That class
 * was closed by deriving the roster from this manifest, which makes the manifest LOAD-BEARING for
 * the whole suite: a town missing from it is now invisible to every check at once. The blast radius
 * went from "one check is wrong" to "the suite silently measures the wrong set of towns."
 *
 * ⭐ The coupling is still correct, because the manifest is WRITTEN BY THE POUR
 *   (`cartograph/bake-target.js`, `cartograph/serve.js`) and not hand-maintained — a poured town
 *   declares itself. This check is what keeps that true, and it is the thing that fires if the
 *   manifest ever becomes something a human edits.
 *
 * ⛔ Layer 0: this must fail LOUDLY on a town nobody has looked at. An undeclared town is exactly
 *    the silent, plausible-looking pass the kit cannot afford — the operator sees a green suite and
 *    never learns their town was never in it.
 *
 * ▶ node checks/claims-every-measurable-town-is-declared.mjs
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = 'public/looks/index.json'
const BAKED = 'public/baked'

// ⛔ Not a skip list — a named status. These two are dead by ruling (2026-08-27) and are absent from
//    the manifest on purpose; reporting them would be noise, and noise is how a check gets ignored.
const CHILLERED = new Set(['centrum', 'ksi-y-m-yn'])
// `default` is a shared fallback corpus, not a town. It is the trap that makes "has artifacts"
// alone an insufficient test for townhood.
const NOT_A_TOWN = new Set(['default'])

console.log('THE LOOK MANIFEST vs THE BAKED CORPUS — do they agree in both directions?\n')

const mp = join(ROOT, MANIFEST)
if (!existsSync(mp)) {
  console.error(`⛔ ${MANIFEST} is missing. The scene roster is unknowable and every scene-reading`)
  console.error('   check now derives from it. ⛔ NOT CHECKED — this is a failure to check, not a pass.')
  process.exit(2)
}
if (!existsSync(join(ROOT, BAKED))) {
  console.error(`⛔ ${BAKED}/ is missing — nothing to compare. NOT CHECKED.`)
  process.exit(2)
}

const declared = JSON.parse(readFileSync(mp, 'utf8')).looks.map(l => l.id)
// "Measurable" means it carries the artifact the shape checks actually read. A bare directory is
// not a town: `public/baked/` holds `default/`, which carries most artifacts and is not one.
const measurable = readdirSync(join(ROOT, BAKED))
  .filter(d => !NOT_A_TOWN.has(d) && !CHILLERED.has(d))
  .filter(d => existsSync(join(ROOT, BAKED, d, 'shape.json')))
  .sort()

const undeclared = measurable.filter(s => !declared.includes(s))
const unbuilt = declared.filter(s => !measurable.includes(s))

console.log(`  declared in ${MANIFEST}: ${declared.join(', ') || '(none)'}`)
console.log(`  measurable (has ${BAKED}/<town>/shape.json): ${measurable.join(', ') || '(none)'}\n`)

let failed = false

if (undeclared.length) {
  failed = true
  console.log(`⛔ ${undeclared.length} MEASURABLE TOWN(S) NOT DECLARED: ${undeclared.join(', ')}`)
  console.log('   Every scene-reading check derives its roster from the manifest, so these are')
  console.log('   invisible to ALL of them at once — not checked, and not even reported as')
  console.log('   unchecked. Declare the town, or retire it explicitly. ⛔ Never leave it silent.\n')
}

if (unbuilt.length) {
  // Reported, not failed: a declared town with no bake is a normal state (never poured, or the
  // artifacts are gitignored and this is a fresh clone). It is only dangerous when unspoken.
  console.log(`⚠️  ${unbuilt.length} declared town(s) with no ${BAKED}/<town>/shape.json: ${unbuilt.join(', ')}`)
  console.log('   Not a failure — a town can be declared before it is poured, and public/baked/ is')
  console.log('   gitignored, so a fresh clone sees none of them. Stated so it is never assumed.\n')
}

if (!failed) console.log('✅ PASS — every measurable town is declared. The roster cannot silently shrink.')
else console.log('⛔ FAIL — the suite is measuring a different set of towns than the kit contains.')

process.exit(failed ? 1 : 0)
