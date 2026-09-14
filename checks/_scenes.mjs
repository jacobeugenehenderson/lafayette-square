/**
 * WHICH TOWNS DOES THIS CHECK RUN ON? — asked once, here, instead of typed into 45 files.
 *
 * WHY THIS EXISTS (2026-09-13). 45 checks accepted a scene argument and then fell back to a roster
 * TYPED INTO THE FILE — `['lafayette-square', 'hipointe-demun', …]`. Each copy looks like a sensible
 * default, which is exactly why it survived: the corpus had a skip list distributed across 45 files
 * and nothing named it one. Pour a new town and it is invisible to every one of them until a human
 * remembers to edit 45 files, and nothing fails when they don't — the checks just quietly keep
 * reporting on the towns someone typed in 2026. That is `CLAUDE.md` Layer 0 q1 ("what does this do
 * for town #2?") answered "nothing", and q2 (a silent, plausible-looking pass) at the same time.
 *
 * ⭐ THE ROSTER IS DISCOVERED FROM THE ARTIFACT THE CHECK ACTUALLY NEEDS. Not from a list, and not
 *    from a bare directory listing either: `cartograph/data/` contains `clean/` and `raw/` (not
 *    towns) and `centrum/` + `ksi-y-m-yn/` (dead — `[[project-lodz-ksiezy-mlyn-portability-test]]`
 *    says never to size a class on them). Requiring the artifact excludes all four **without a skip
 *    list**, because a non-town has no `shape.json`, and it stays correct when the dead towns come
 *    back or new ones land.
 *
 * ⛔ NOTHING IS SKIPPED SILENTLY. A scene the look manifest knows about that lacks the artifact is
 *    printed as NOT CHECKED — a real state, never folded into a pass. `claims-ring-partition.mjs`
 *    states the rule this serves: reporting "a perfectly measurable scene as NOT CHECKED [is] a
 *    check lying quietly, which is the defect this suite exists to refuse."
 *
 * USAGE — one convention. Positional scene names, because that is what 70 of the corpus already
 * uses; `--scene x` and `--scene=x` are accepted as spellings of the same thing so existing
 * documented invocations keep working.
 *
 *   import { scenes } from './_scenes.mjs'
 *   for (const scene of scenes('public/baked/<scene>/shape.json')) { … }
 *
 *   node checks/claims-<name>.mjs                        # every town that has the artifact
 *   node checks/claims-<name>.mjs altadena               # just that one
 *   node checks/claims-<name>.mjs --scene=altadena       # same thing
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const MANIFEST = 'public/looks/index.json'

/** Towns the product declares. Declarative, not inferred from a directory's contents. */
export function declaredScenes() {
  const p = join(ROOT, MANIFEST)
  // ⛔ No fallback. If the manifest is gone we do not know what the towns are, and guessing from a
  //    directory listing would answer confidently with `clean`, `raw` and two dead towns.
  if (!existsSync(p)) throw new Error(`⛔ ${MANIFEST} is missing — the scene roster is unknowable. NOT CHECKED.`)
  return JSON.parse(readFileSync(p, 'utf8')).looks.map(l => l.id)
}

/** Scene names the caller asked for, in whichever of the accepted spellings. */
export function requestedScenes(argv = process.argv.slice(2)) {
  const out = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--scene=')) { out.push(a.slice(8)); continue }
    if (a === '--scene' && argv[i + 1]) { out.push(argv[++i]); continue }
    if (!a.startsWith('-')) out.push(a)
  }
  return out
}

/**
 * The towns this check should run on.
 *
 * @param {string} need  path to the artifact the check requires, with `<scene>` standing in for the
 *                       town — e.g. `public/baked/<scene>/shape.json`. Discovery enumerates the
 *                       directory above `<scene>` and keeps the towns that actually have it.
 * @param {object} [opt] `{ argv, quiet }`
 * @returns {string[]} scene names, sorted. Never empty — an empty roster throws.
 */
export function scenes(need, opt = {}) {
  const { argv = process.argv.slice(2), quiet = false, has: customHas, label } = opt
  if (!need.includes('<scene>')) throw new Error(`⛔ scenes(need): "${need}" has no <scene> placeholder`)
  // `has` is overridable because some corpora are not one fixed path — LS's ribbons are bundled
  // elsewhere than every other town's (see ribbonsPath). The DISCOVERY rule stays identical.
  const has = customHas || ((s) => existsSync(join(ROOT, need.replace('<scene>', s))))
  const what = label || need.split('<scene>')[1].replace(/^\//, '')

  const asked = requestedScenes(argv)
  if (asked.length) {
    // ⛔ A town the caller NAMED that has no artifact is an error, not an empty run. Silently
    //    returning [] here would print "0 problems found" and read as a pass.
    const bad = asked.filter(s => !has(s))
    if (bad.length) {
      // ⛔ exit 2 + the words, the corpus convention (`claims-onboarding-guard.sh`: "Exit 2 =
      //    could not run"). A throw exits 1 and the runner would file this as a FINDING, which
      //    would be a claim about the map that nobody measured.
      console.error(`⛔ NOT CHECKED — no ${what} for: ${bad.join(', ')}`)
      console.error(`   Known towns: ${declaredScenes().join(', ')}. This is a failure to check, not a pass.`)
      process.exit(2)
    }
    return asked.sort()
  }

  // ⛔ A TOWN MUST BE BOTH DECLARED AND MEASURABLE. The directory listing alone is not a roster:
  //    `public/baked/` carries a `default/` that is not a town but does carry most artifacts, and
  //    `cartograph/data/` carries `clean/`, `raw/` and two dead towns. The manifest says what a
  //    town IS; the artifact says whether it can be measured here. Neither alone is enough — and
  //    the artifact filter alone LOOKS enough, which is how `default` got counted as a town until
  //    a mutation test asked for an artifact it happened to have.
  const declared = declaredScenes()
  const corpus = dirname(need.split('<scene>')[0] + 'x')
  const onDisk = customHas ? [] : (existsSync(join(ROOT, corpus)) ? readdirSync(join(ROOT, corpus)) : [])
  const found = declared.filter(s => (customHas || onDisk.includes(s)) && has(s)).sort()

  // ⛔ THE OTHER HALF, AND IT IS THE SAME BUG WEARING THE OPPOSITE FACE. `found` and the NOT CHECKED
  //    line below are both derived from `declared`, so a town that HAS the artifact but is MISSING
  //    from the manifest falls out of both: not checked, and not mentioned. That is the silent skip
  //    this file exists to kill, relocated from 45 typed lists into one manifest. It is empty today
  //    — the manifest is written by the pour, so a poured town declares itself — which is exactly
  //    why it would go unnoticed the day it isn't.
  //    (Caught by the session doing doc hygiene, reading this file rather than my description of it.)
  const candidates = new Set(onDisk)
  for (const d of ['cartograph/data', 'public/looks', 'public/baked']) {
    if (existsSync(join(ROOT, d))) for (const e of readdirSync(join(ROOT, d))) candidates.add(e)
  }
  const undeclared = [...candidates].filter(s => !declared.includes(s) && !CHILLERED.has(s) && has(s)).sort()
  if (undeclared.length && !quiet) {
    console.log(`   ⛔ HAS ${what} BUT IS NOT IN ${MANIFEST}: ${undeclared.join(', ')}`)
    console.log(`      NOT CHECKED, and it would not have been mentioned. Declare it or retire it.`)
  }
  if (!found.length) {
    console.error(`⛔ NOT CHECKED — no town has ${what}. Nothing was measured; this is not a pass.`)
    console.error(`   In a fresh clone this is normal: public/baked/ is gitignored.`)
    process.exit(2)
  }

  // Loud about what it did NOT cover, every run.
  const silent = declared.filter(s => !found.includes(s))
  if (silent.length && !quiet) {
    console.log(`   ⚠️ NOT CHECKED (no ${what}): ${silent.join(', ')}`)
  }
  return found
}

// ── The ribbons corpus ───────────────────────────────────────────────────────────────────────
// ⛔ ONE OWNER. This pair was copied into 13 checks as a local `const RIB = (s) => s ===
//    'lafayette-square' ? … : …`, which is the `if (scene === 'X')` branch
//    `cartograph/ARCHITECTURE.md §180` forbids by name — "a scene is a different DATASET, not a
//    different code path" — reproduced thirteen times. Thirteen copies is also why the LS special
//    case cannot be retired: retiring it means finding all thirteen.
// ⚠️ The special case is REAL and is not fixed here: LS's ribbons are the bundled
//    `src/data/ribbons.json` while every other town's are under `cartograph/data/<scene>/`. That
//    asymmetry is `ORIENTATION`'s palimpsest warning (LS lives at the shared default paths) and
//    retiring it is its own ticket. Naming it once is the prerequisite.

/** Where a town's ribbons live. ⛔ Import this; never re-derive it locally. */
export const ribbonsPath = (scene) => scene === 'lafayette-square'
  ? 'src/data/ribbons.json'
  : `cartograph/data/${scene}/clean/ribbons.json`

// ⛔ NOT A SKIP LIST — a NAMED STATUS. These two towns are dead
// (`[[project-lodz-ksiezy-mlyn-portability-test]]`: never size a class on them). A skip list makes
// an unhandled case look handled; this reports them as out of scope, loudly, and they stay
// reachable by naming one explicitly. They are also absent from the look manifest, so discovery
// excludes them anyway — this is belt and braces, and the belt is the manifest.
export const CHILLERED = new Set(['centrum', 'ksi-y-m-yn'])

/** The towns whose ribbons can be measured. The roster for every ribbons-reading check. */
export function ribbonScenes(argv = process.argv.slice(2)) {
  return scenes('<scene>', { argv, has: (s) => !CHILLERED.has(s) && existsSync(join(ROOT, ribbonsPath(s))), label: 'ribbons' })
}

// ── "I have nothing to measure" ──────────────────────────────────────────────────────────────
// ⛔ EXIT 2 AND SAY SO. The corpus already converged on this: 88 checks call `process.exit(2)` and
//    their messages read "NOT MEASURED" / "nothing to check" / "could not run", and
//    `claims-onboarding-guard.sh` documents it — "Exit 2 = could not run." The runner honours the
//    code AND the words together, because one check exits 2 on a real failure and trusting the
//    number alone would launder a finding into "not checked".
//
// ⭐ WHY IT MATTERS MOST IN CI: `public/baked/` is gitignored, so a fresh clone has no slab. A
//    check that CRASHES on the missing file is indistinguishable from a check that found a defect
//    — it reports ENOENT, the run goes red, and nobody can tell which. Crashing is the fallback
//    shape one layer down: it turns "I could not look" into "I looked and it was broken."
//
//   const shape = requireArtifact(`public/baked/${scene}/shape.json`, 'baked shape.json')
export function requireArtifact(rel, what = rel) {
  if (existsSync(join(ROOT, rel))) return join(ROOT, rel)
  console.error(`⛔ NOT MEASURED — no ${what} at ${rel}. Nothing was measured; this is not a pass.`)
  console.error(`   In a fresh clone this is expected: public/baked/ is gitignored. Bake, or name a town that has one.`)
  process.exit(2)
}
