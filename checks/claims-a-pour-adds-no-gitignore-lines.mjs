#!/usr/bin/env node
/**
 * "DOES A POUR ADD LINES TO .gitignore?" — the standing guard on scene tracking.
 *
 * WHY THIS EXISTS (2026-09-13). `.gitignore` ignored `cartograph/data/*` wholesale and
 * re-admitted each town through a hand-written ~20-line allow-list. Towns poured after the last
 * person edited that file were never given one, so their ENTIRE input set was ignored. The kit
 * presented seven scenes; three could not be re-poured from a clone, and nothing errored. That is
 * the Layer 0 silent substitution, and it failed worst on the towns nobody looks at — LS, the town
 * everyone looks at, was fine.
 *
 * ⭐ The fix was one scene-generic rule (git's `*` matches a single path segment, so
 *    `cartograph/data/<star>/raw/osm.json` reads every town at once). This check is what keeps it
 *    generic. A rule that must be re-typed per town is a rule that will be forgotten for town #2 —
 *    and the forgetting is silent, which is why prose in a runbook could never have held it.
 *
 * WHAT IT CHECKS
 *   1. NO SCENE NAMES IN A cartograph/data/ RULE. A town's name in a rule line means the generic
 *      rule did not cover it and someone patched the instance instead of the class.
 *   2. EVERY SCENE EITHER TRACKS ITS INPUTS OR DECLARES ITSELF RETIRED. A scene that is neither is
 *      a freshly poured town going silently untracked — the defect this all exists to close.
 *
 * ⛔ Scenes are enumerated by READING `cartograph/data/`, never from a list. A hardcoded list in
 *    the check is the same disease as a hardcoded list in the ignore file: just as silent for
 *    town #8. For the same reason, retirement is read from a marker the town carries
 *    (`RETIRED.md`), not from a set of names kept here.
 *
 * A scene is a directory under `cartograph/data/` carrying `neighborhood_boundary.json` — the
 * pour's root input. `cartograph/data/clean/` and `cartograph/data/raw/` are pre-per-scene-layout
 * relics and carry none, so they are correctly not scenes.
 *
 * ⛔ Read-only. Writes nothing.
 *
 * ▶ node checks/claims-a-pour-adds-no-gitignore-lines.mjs
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, resolve } from 'node:path'

const ROOT = resolve(process.env.REPO_ROOT ?? process.cwd())
const DATA_DIR = join(ROOT, 'cartograph', 'data')
const IGNORE_FILE = join(ROOT, '.gitignore')

/** The pour's root input. A directory carrying it is a scene; one that doesn't, isn't. */
const SCENE_MARKER = 'neighborhood_boundary.json'
/** A retired town declares itself, in its own directory. Read, never listed here. */
const RETIRED_MARKER = 'RETIRED.md'

const fail = []
const note = []
const roll = []

// ── Enumerate scenes from the filesystem. Never a list. ──────────────────────────────────────
const scenes = readdirSync(DATA_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .filter(name => existsSync(join(DATA_DIR, name, SCENE_MARKER)))
  .sort()

if (scenes.length === 0) {
  console.error(`FAIL  no scenes found under ${DATA_DIR} — a directory carrying ${SCENE_MARKER} is a scene.`)
  console.error('      Either the data dir moved or the marker changed; this check is now blind.')
  process.exit(1)
}

// ── 1. No scene name may appear in a cartograph/data/ RULE ───────────────────────────────────
// Scope is rule lines only: a comment ignores nothing, and the historical note in the data block
// names the towns this check was written for on purpose. Scope is cartograph/data/ only —
// `public/photos/<scene>/` is a different policy and out of this check's bounds, so it is a note.
// The name must match as a delimited token, so a short scene name ("toy") cannot trip on an
// unrelated word that merely contains it.
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ignoreLines = readFileSync(IGNORE_FILE, 'utf-8').split('\n')

for (const [i, raw] of ignoreLines.entries()) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  for (const scene of scenes) {
    if (!new RegExp(`(^|[^A-Za-z0-9_-])${esc(scene)}([^A-Za-z0-9_-]|$)`).test(line)) continue
    const where = `.gitignore:${i + 1} names the scene "${scene}" — ${JSON.stringify(line)}`
    if (line.includes('cartograph/data/')) {
      fail.push(
        `${where}\n` +
        `      A pour must add NO lines to .gitignore. Git's \`*\` matches one path segment:\n` +
        `      write cartograph/data/<star>/<the path> so the rule reads every town.\n` +
        `      To retire a town, give it a ${RETIRED_MARKER} instead — see an existing one.`
      )
    } else {
      note.push(`  NOTE ${where}\n       (outside cartograph/data/ — same class, different policy; not this check's bounds)`)
    }
  }
}

// ── 2. Every scene tracks its inputs, or declares itself retired ─────────────────────────────
// ⭐ Written as ONE command literal on purpose: `checks/tier.mjs` classifies a check by reading the
// command it runs, and only a literal can be read. An execFileSync('git', [...]) form is opaque to
// it and tiers `live [unreadable]`, which would keep this check out of `npm test` — a guard that
// does not run. ⛔ Fix the call site, never the tierer's bias toward live.
const tracked = execSync('git ls-files -z -- cartograph/data', { cwd: ROOT, maxBuffer: 1e9 })
  .toString().split('\0').filter(Boolean)

// Retirement bookkeeping — the marker and the per-scene ignore file. ⛔ These are NOT inputs and
// must never count as "this scene is tracked": a retired town that loses its RETIRED.md still has
// a tracked .gitignore, and counting that would report the scene as fine while its entire input
// set stays ignored. That is the exact silent substitution this check exists to catch, and the
// check was blind to it until the mutation test put it there (2026-09-13).
const isBookkeeping = p => p.endsWith(`/${RETIRED_MARKER}`) || p.endsWith('/.gitignore')

for (const scene of scenes) {
  const prefix = `cartograph/data/${scene}/`
  const mine = tracked.filter(p => p.startsWith(prefix) && !isBookkeeping(p))
  const retired = existsSync(join(DATA_DIR, scene, RETIRED_MARKER))

  if (retired) {
    // A retired town keeps its marker tracked and nothing else. Tracked inputs beside a
    // RETIRED.md mean the retirement half-landed — the town is one `git add` from coming back.
    const strays = mine
    if (strays.length) {
      fail.push(
        `scene "${scene}" carries ${RETIRED_MARKER} but still tracks ${strays.length} input file(s).\n` +
        `      Retirement half-landed. Finish it:  git rm --cached -r ${prefix}\n` +
        `      then re-add the marker. (Non-destructive — history keeps every version.)\n` +
        `      First stray: ${strays[0]}`
      )
    } else {
      roll.push(`  ${scene.padEnd(26)} RETIRED (${RETIRED_MARKER})`)
    }
    continue
  }

  if (mine.length === 0) {
    fail.push(
      `scene "${scene}" has ${SCENE_MARKER} on disk but tracks ZERO files.\n` +
      `      Its inputs exist on one disk and in no repository — it cannot be re-poured from a\n` +
      `      clone, and nothing will tell you so. Either the generic rule missed it:\n` +
      `        git check-ignore -v ${prefix}${SCENE_MARKER}\n` +
      `      or the town is meant to be retired, in which case give it a ${RETIRED_MARKER}.`
    )
  } else {
    roll.push(`  ${scene.padEnd(26)} ${String(mine.length).padStart(3)} tracked`)
  }
}

// ── Report ───────────────────────────────────────────────────────────────────────────────────
console.log(`Scenes under cartograph/data/ (by ${SCENE_MARKER}): ${scenes.length}`)
if (roll.length) console.log(roll.join('\n'))
if (note.length) console.log(note.join('\n'))
console.log()

if (fail.length) {
  for (const f of fail) console.error(`FAIL  ${f}`)
  console.error(`\n${fail.length} failure(s).`)
  process.exit(1)
}

console.log('PASS  no scene is named in a cartograph/data/ rule; every scene tracks its inputs or declares itself retired.')
