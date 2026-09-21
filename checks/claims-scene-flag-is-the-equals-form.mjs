/**
 * claims-scene-flag-is-the-equals-form
 *
 * ⭐ CLASS D WEARING A FLAG. `--scene <id>` does not error. `cartograph/scene.js`
 * parses `/^--scene=(.+)$/` and nothing else, so the space form goes UNPARSED and
 * falls through to DEFAULT_MAP — 'lafayette-square'. A caller written that way
 * therefore WORKS ON EXACTLY ONE TOWN, by accident, and is refused on every other.
 *
 * Instance: `cartograph/serve.js`'s one-button pour built `--scene ${scene}` for the
 * tree bake. huron's Publish-to-Staging died `code=2` there on 2026-09-21 — the
 * first time anyone pressed it on a town that was not Lafayette Square.
 *
 * ⭐ The refusal is the kit working, and it is why this was loud instead of silent:
 * bake-trees.js writes `public/baked/<scene>/trees.json`, so the default would have
 * overwritten Lafayette Square's census with huron's run. `requireExplicitMap()`
 * refused instead. ⛔ This check protects the CALLERS; the guard already protects
 * the artifact, and neither replaces the other.
 *
 * ⭐ THE SUBJECT LIST IS READ, NEVER LISTED: a tool is "strict" iff it imports
 * `scene.js`. Add a new strict writer and this check covers it with no edit here.
 * ⚠️ The list is used to PROVE the resolver is still there and still equals-only —
 * ⛔ NOT to decide which lines to flag. The first draft of this check required the
 * tool's filename and the flag on the SAME LINE, and serve.js builds its flag array
 * fifteen lines above the command: it passed the exact bug it was written for, twice,
 * and only the mutation test said so. Any space-form --scene in a pour path is a
 * finding, because nothing in these roots has a legitimate use for it.
 *
 * ⛔ NOT scanned: .md prose (a documentation-conformance job — several arborist
 * tables still print the space form, tracked on the board) and code comments.
 * Failing those here would train people to ignore the check.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOTS = ['cartograph', 'arborist', 'scripts', 'src', 'checks']
const EXT = new Set(['.js', '.mjs', '.jsx'])
const SELF = 'claims-scene-flag-is-the-equals-form.mjs'

function* walk(dir) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '_archive' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (EXT.has(path.extname(e.name)) && e.name !== SELF) yield p
  }
}

// ── Who is strict? Ask the source. A tool that imports scene.js gets its scene
// from the one resolver, and that resolver is equals-only.
const files = [...ROOTS.flatMap((r) => [...walk(r)])]
const strict = new Set()
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  if (/from\s+['"][^'"]*\/scene\.js['"]/.test(src) || /from\s+['"]\.\/scene\.js['"]/.test(src)) {
    strict.add(path.basename(f))
  }
}
if (strict.size === 0) {
  console.error('FAIL claims-scene-flag-is-the-equals-form')
  console.error('  ⛔ found NO importers of scene.js. The check cannot see its subject — the resolver')
  console.error('     moved or the import shape changed. Fix the check; do not delete it.')
  process.exit(1)
}

// ── Any space-form --scene in a pour path is a finding.
// ⛔ NOT keyed to the tool's filename: a command is routinely assembled across many
// lines (serve.js builds `flags` as an array, then interpolates it into the command),
// so "same line as bake-trees.js" is blind to the real shape of the defect.
const STRIP_TRAILING_COMMENT = /\s\/\/.*$/
const hits = []
for (const f of files) {
  if (f.startsWith('checks' + path.sep)) continue   // checks own their argv; they are not pours
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const t = line.trim().replace(STRIP_TRAILING_COMMENT, '')
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
    if (!/--scene\s+[^=\s]/.test(t)) return
    hits.push(`${f}:${i + 1}  ${t.slice(0, 100)}`)
  })
}

if (hits.length) {
  console.error(`FAIL claims-scene-flag-is-the-equals-form (${files.length} files, ${strict.size} strict tools)`)
  console.error('  \u26d4 the SPACE form does not error \u2014 it falls through to the default scene, so these')
  console.error("     command strings work on Lafayette Square and are refused on every other town:")
  for (const h of hits) console.error('  ' + h)
  console.error('  \u25b6 write --scene=<id>, or set CARTOGRAPH_SCENE. Ruling: cartograph/scene.js.')
  process.exit(1)
}
console.log(`PASS claims-scene-flag-is-the-equals-form \u2014 ${files.length} files scanned, ${strict.size} strict tools, no space-form caller`)
