/**
 * claims-a-look-keyed-tool-is-called-with-its-look — every spawn of a Look-strict tool passes `--look`.
 *
 * ⛔⛔ A GUARD THAT REFUSES AN IMPLICIT LOOK IS ONLY HALF A FIX. THE OTHER HALF IS
 * EVERY CALLER, AND NOTHING WAS CHECKING THEM.
 *
 * Instance, 2026-09-20→21: `generate-salon.js` was hardcoding
 * `syncLookRoster('lafayette-square', …)` — it edited LS's `design.json` whichever town
 * you were in. Ruled a Class C bleed, and `requireLookArg` was added to refuse an
 * implicit Look (58a91317). Correct, and it stays. But `arborist/serve.js` spawned it
 * with no `--look` from TWO endpoints, and the Grove's own store called one of those with
 * no `?look=`, so from that commit **every Grove "Bake → Slab" died at step 1, on every
 * town**, reporting only "regenerate-from-source failed (generate-salon)" with the real
 * refusal buried in a stderr field the header never shows. The fix closed a bleed and
 * opened an outage in the same breath, and the outage was invisible for a day.
 *
 * ⭐ THE SUBJECT LIST IS READ, NEVER LISTED: a tool is "Look-strict" iff its own source
 * calls `requireLookArg(`. Add the guard to a second tool and this check covers its
 * callers the same day, with no edit here. ⛔ Do not hardcode `generate-salon.js`.
 *
 * ⭐ AND IT READS THE WHOLE CALL, NOT THE LINE. `claims-scene-flag-is-the-equals-form`
 * learned this the hard way: a command is assembled across many lines, so a same-line
 * test passes the very bug it was written for. This walks from the spawn callee to its
 * balanced closing paren and asks whether `--look` is anywhere inside.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const ROOTS = ['arborist', 'cartograph', 'scripts', 'src', 'checks']
const EXT = new Set(['.js', '.mjs', '.jsx'])
const SELF = path.basename(import.meta.filename)
const SPAWNERS = /\b(execAsync|execFileAsync|execFile|execSync|spawnSync|spawn|exec)\s*\(/g

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

const files = ROOTS.flatMap((r) => [...walk(path.join(ROOT, r))])

// ── Who is Look-strict? Ask the source.
const strict = new Set()
for (const f of files) {
  if (/requireLookArg\s*\(/.test(fs.readFileSync(f, 'utf8'))) strict.add(path.basename(f))
}
if (strict.size === 0) {
  console.error('FAIL claims-a-look-keyed-tool-is-called-with-its-look')
  console.error('  ⛔ no tool in the scanned roots calls `requireLookArg(` — either the refusal was')
  console.error('     removed (the LS-roster bleed is back: see generate-salon.js’s header) or this')
  console.error('     check has stopped finding its subjects. Both are findings. Fix the reader.')
  process.exit(1)
}

// ── The balanced-paren span of the call a match sits inside.
function callSpan(src, openParenIdx) {
  let depth = 0
  for (let i = openParenIdx; i < src.length; i++) {
    const c = src[i]
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return src.slice(openParenIdx, i + 1) }
  }
  return src.slice(openParenIdx)              // unbalanced ⇒ take the rest; better loud than blind
}

const hits = []
for (const f of files) {
  if (f.includes(`${path.sep}checks${path.sep}`)) continue   // checks own their argv
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(SPAWNERS)) {
    const span = callSpan(src, m.index + m[0].length - 1)
    const tool = [...strict].find((t) => span.includes(t))
    if (!tool) continue
    if (/--look\b/.test(span)) continue
    const line = src.slice(0, m.index).split('\n').length
    hits.push(`${path.relative(ROOT, f)}:${line}  ${m[1]}( … ${tool} … ) — no --look`)
  }
}

if (hits.length) {
  console.error(`FAIL claims-a-look-keyed-tool-is-called-with-its-look (${files.length} files, ${strict.size} Look-strict tool(s): ${[...strict].join(', ')})`)
  console.error('  ⛔ these spawn a tool that REFUSES without an explicit Look, and pass none — so the')
  console.error('     call cannot succeed, on any town, ever:')
  for (const h of hits) console.error('  ' + h)
  console.error('  ▶ pass `--look <id>` from the Look the request is about. ⛔ Do NOT remove the')
  console.error('    refusal to make this pass — it is what stops the tool editing Lafayette Square’s')
  console.error('    design.json from inside another town (generate-salon.js header).')
  process.exit(1)
}
console.log(`PASS claims-a-look-keyed-tool-is-called-with-its-look — ${files.length} files scanned, ` +
  `${strict.size} Look-strict tool(s) (${[...strict].join(', ')}), every spawn passes --look`)
