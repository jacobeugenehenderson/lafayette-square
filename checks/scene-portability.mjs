#!/usr/bin/env node
/**
 * WILL THIS CHECK SEE TOWN #2? — sizing the portability class, correctly.
 *
 * ⛔ NOT A PASS/FAIL GATE. It sizes a class and prints the split. It exists because `CLAUDE.md`
 *    forbids writing a count into a doc without the command that reproduces it.
 *
 * ⚠️ THIS INSTRUMENT WAS WRONG ON ITS FIRST DAY (2026-09-13) AND THE CORRECTION IS THE POINT.
 *    v1 asked "does this check name Lafayette Square?" and answered "54 are pinned to it, and 58
 *    are parameterised four different ways." Both figures were artefacts of the detector: it
 *    matched `argv[2]` but not `process.argv.slice(2)`, which is the convention most of the corpus
 *    actually uses. Measured properly, **107 of 158 already accept a scene argument.** The class
 *    was never "checks that only run on LS."
 *
 * ⭐ THE REAL DEFECT, AND IT IS NARROWER AND WORSE. 47 checks accept a scene argument and then
 *    fall back to a scene roster TYPED INTO THE FILE — `['lafayette-square', 'hipointe-demun', …]`.
 *    A town poured tomorrow is invisible to every one of them until a human edits 47 files. That
 *    is a skip list, distributed across the corpus and invisible because each copy looks like a
 *    sensible default. Only 18 discover their scenes from disk.
 *
 *    ⇒ So the fix is not "parameterise them." It is: STOP TYPING THE ROSTER (`checks/_scenes.mjs`).
 *
 * ▶ node checks/scene-portability.mjs [--list]
 * ⛔ Read-only.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyAll, stripComments, ROOT } from './tier.mjs'

// Every way the corpus lets a caller name a scene. ⛔ Keep this list honest: a convention missing
// from it reads as "this check is pinned," which is precisely how v1 produced a phantom class.
const ARG_CONVENTIONS = [
  // ⭐ The helper counts as BOTH a convention and discovery — it takes the scene argument and
  //    derives the roster. Omitting it made the 2026-09-13 port read as a REGRESSION: 45 files
  //    stopped containing `process.argv.slice(2)` because the helper now does it for them, and
  //    this instrument scored that as 36 checks losing their scene argument. An instrument blind
  //    to the fix reports the fix as damage.
  ['checks/_scenes.mjs', /\b(ribbonScenes|feedScenes)\s*\(|from '[^']*_scenes\.mjs'/],
  ['process.argv.slice(2)', /process\.argv\.slice\(\s*2\s*\)/],
  ['--scene', /--scene\b/],
  ['argv[2..3]', /argv\[\s*[23]\s*\]/],
  ['--only', /--only\b/],
  ['--look', /--look\b/],
]
// A roster typed into the file: an array (or pushes) of scene-name string literals.
const TYPED_ROSTER = /(\[|push\()\s*['"](lafayette-square|toy|hipointe-demun|altadena)['"]/
// Scenes read off disk — the shape that survives a new pour.
const DISCOVERS = /readdirSync\s*\([^)]*(looks|baked|data)|looks\/index\.json|\b(ribbonScenes|feedScenes|scenes)\s*\(|from '[^']*_scenes\.mjs'/

const rows = classifyAll().map(r => {
  const code = stripComments(readFileSync(join(ROOT, r.file), 'utf8'), r.file.endsWith('.sh'))
  return {
    ...r,
    convs: ARG_CONVENTIONS.filter(([, re]) => re.test(code)).map(([n]) => n),
    typed: TYPED_ROSTER.test(code),
    discovers: DISCOVERS.test(code),
  }
})

const takesArg = rows.filter(r => r.convs.length)
const typedOnly = rows.filter(r => r.typed && !r.discovers)
const discovers = rows.filter(r => r.discovers)
const noArgNoDiscover = rows.filter(r => !r.convs.length && !r.discovers)
const pct = (n) => `${((n / rows.length) * 100).toFixed(0)}%`

console.log(`${rows.length} checks · ${rows.filter(r => r.tier === 'safe').length} in the safe tier\n`)
console.log(`A caller CAN name a scene:            ${String(takesArg.length).padStart(3)}  ${pct(takesArg.length)}`)
console.log(`Scenes DISCOVERED from disk:          ${String(discovers.length).padStart(3)}  ${pct(discovers.length)}   ← the shape that survives a new pour`)
console.log(`⛔ Default roster TYPED into the file: ${String(typedOnly.length).padStart(3)}  ${pct(typedOnly.length)}   ← THE CLASS. A town poured tomorrow is invisible to these.`)
console.log(`   of which in the safe tier:         ${String(typedOnly.filter(r => r.tier === 'safe').length).padStart(3)}`)
console.log(`Neither arg nor discovery:            ${String(noArgNoDiscover.length).padStart(3)}  ${pct(noArgNoDiscover.length)}   (scene-agnostic, or the scene is implicit)`)

console.log(`\nHow a caller names a scene — ⚠️ ${ARG_CONVENTIONS.length} conventions, not one:`)
for (const [n] of ARG_CONVENTIONS) {
  const all = takesArg.filter(r => r.convs.includes(n))
  if (all.length) console.log(`   ${n.padEnd(22)} ${String(all.length).padStart(3)}   (safe tier: ${all.filter(r => r.tier === 'safe').length})`)
}
console.log(`   ⚠️ ${takesArg.filter(r => r.convs.length > 1).length} accept more than one, so they are not even disjoint per file.`)

if (process.argv.includes('--list')) {
  console.log(`\n── typed roster, no discovery (the class) ──`)
  for (const r of typedOnly) console.log(`   [${r.tier}] ${r.file}`)
}
