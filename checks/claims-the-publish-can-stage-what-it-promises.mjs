#!/usr/bin/env node
/**
 * claims-the-publish-can-stage-what-it-promises — no path the Publish button stages is
 * gitignored.
 *
 * ⛔⛔ AN IGNORED PATHSPEC MAKES A PUBLISH THAT SHIPS NOTHING AND SAYS OK. This is not a
 * hypothesis: `cartograph/serve.js#slabPathspecs` carries a comment explaining why
 * `public/baked/<id>` is DELIBERATELY ABSENT from that list — staging an ignored path
 * means `git add` matches nothing and `git status --porcelain` reports nothing, and
 * because the other specs keep `specs.length` non-zero the "no slab files found" guard
 * never fires. The button returns `{ ok: true }` having committed nothing.
 *
 * ⭐ AND IT HAPPENED ANYWAY, one directory over, 2026-09-22. A blanket `public/photos/`
 * ignore — added to keep ~1 GB of photo libraries out of git — swept up
 * `public/photos/og-preview.jpg`, the 164 KB link-preview image that IS a deployed
 * artifact and IS staged on every publish. Jacob hit "git add failed: the following paths
 * are ignored" on Publish to Staging. ⚠️ It failed LOUDLY only by luck: `git add` exits
 * non-zero on an explicitly named ignored path, and shrugs at a glob. One spelling of the
 * same mistake is a dead button; the other is a silent no-op.
 *
 * ⭐⭐ THE REAL DEFECT IS A DIRECTORY THAT MIXES A DEPLOYED ARTIFACT WITH A BULK LIBRARY,
 * and no reading of `.gitignore` alone would catch it — the rule looks entirely reasonable
 * until you know one file under it is load-bearing. So the check reads the PATHSPECS OUT
 * OF THE SERVER and asks git about each: the two facts are in different files and only
 * their intersection is the bug.
 *
 * ⚠️ A gotcha this cost an iteration to find: git CANNOT re-include a file whose parent
 * DIRECTORY is excluded. So ignoring the directory and then negating the one file inside it
 * silently does nothing — git never descends far enough to read the negation, and the
 * negation line sits there looking correct. The fix is to ignore the SUBDIRECTORIES (a
 * `dir` + slash + star + slash pattern) so git still descends into `dir` itself. An
 * exception that looks right and does nothing is exactly what this check is for.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
let failed = 0
const bad = (m) => { failed++; console.log(`  ⛔ ${m}`) }
const ok = (m) => console.log(`  ✅ ${m}`)

console.log('\nThe publish can stage what it promises')

// ⛔ READ THE SPECS FROM THE SERVER, never restate them. A copy here would go stale the
// first time someone adds a pathspec, and the check would pass while the new one is
// ignored — which is the exact failure mode it exists to catch.
const src = readFileSync(path.join(ROOT, 'cartograph/serve.js'), 'utf8')
const fn = src.match(/function slabPathspecs\s*\([^)]*\)\s*\{[\s\S]*?\n\}/)
if (!fn) { bad('slabPathspecs not found in cartograph/serve.js — re-point this check'); process.exit(1) }

// Template literals with `${id}` become a concrete look so git can be asked about a real
// path. Any look works: the question is whether the RULE ignores that shape.
const looks = JSON.parse(readFileSync(path.join(ROOT, 'public/looks/index.json'), 'utf8')).looks || []
const probe = looks[0]?.id
if (!probe) { bad('no looks in public/looks/index.json — cannot build a concrete pathspec'); process.exit(1) }

const specs = [...fn[0].matchAll(/^\s*`([^`]+)`\s*,/gm)].map(m => m[1].replace(/\$\{id\}/g, probe))
if (!specs.length) { bad('no pathspecs parsed out of slabPathspecs — the parse is wrong, not the code'); process.exit(1) }
ok(`${specs.length} pathspec(s) read from slabPathspecs (probe look: ${probe})`)

// ⛔⛔ `--no-index` IS LOAD-BEARING AND THE CHECK WAS USELESS WITHOUT IT. Plain
// `git check-ignore` consults the index, so once a file is TRACKED it answers "not
// ignored" no matter what the rules say — and the first version of this check therefore
// passed a mutation that restored the exact bug it was written for. ⭐ Two mutations went
// green before that was noticed, which is the only reason it was noticed at all.
// ⚠️ `git add --dry-run` gives the same answer and is arguably the truer test, since it
// is literally what the publish runs; `--no-index` is preferred only because it cannot
// touch the index even by accident.
for (const spec of specs) {
  let ignored = false
  try { execFileSync('git', ['check-ignore', '-q', '--no-index', '--', spec], { cwd: ROOT }); ignored = true }
  catch { /* exit 1 = not ignored */ }
  if (ignored) {
    bad(`the publish stages \`${spec}\`, and .gitignore excludes it.\n` +
        `       \`git add\` refuses it outright (dead button), or — if the rule is a glob rather than an\n` +
        `       explicit path — matches nothing and the publish reports ok having committed nothing.\n` +
        `     ▶ Narrow the ignore rule. ⛔ A \`!\` negation will NOT work if a parent DIRECTORY is\n` +
        `       excluded: exclude \`<dir>/*/\` rather than \`<dir>/\` so git still descends.`)
  }
}
if (!failed) ok('none of them is gitignored')

console.log(failed ? `\n⛔ ${failed} failed\n` : '\n✅ all passed\n')
process.exit(failed ? 1 : 0)
