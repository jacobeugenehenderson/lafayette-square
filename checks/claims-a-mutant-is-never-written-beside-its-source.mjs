/**
 * A MUTANT IS NEVER WRITTEN BESIDE ITS SOURCE (Boz's one-loader ruling, 2026-10-30).
 *
 * A check that mutates a repo module runs it through checks/_importSource.mjs (in memory: span, transform, and a redirect
 * for a dependent's import of it), or, when it must SPAWN the mutated script, checks/_sourceFile.mjs (a fresh dir under the
 * OS temp dir). ⛔ Never a `.mutant-*` copy beside the original: a copy in the live checkout survives a SIGKILL (its finally
 * never runs) and is seen by node --watch and vite. Four checks did it (the BACKLOG item said five; four were found); all ported.
 *
 * Reads every check's source for a `.mutant-` file name: the shape every beside-copy took. MUTANT, every run: a planted
 * check naming one → RED.
 *
 *   node checks/claims-a-mutant-is-never-written-beside-its-source.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = import.meta.dirname, SELF = 'claims-a-mutant-is-never-written-beside-its-source.mjs'
// a `.mutant-` name opening a string or a template's text: the beside-copy's file name
const BESIDE = /[`'"/]\.mutant-|\$\{[^}]*\}\/?\.mutant-/
const offenders = (files) => files.filter(([, src]) => BESIDE.test(src)).map(([n]) => n)

const files = readdirSync(DIR).filter((n) => /\.(mjs|js)$/.test(n) && n !== SELF).map((n) => [n, readFileSync(join(DIR, n), 'utf8')])
let failed = 0
console.log('A mutant is never written beside its source\n')
const bad = offenders(files)
if (bad.length) { failed++; console.error(`  ⛔ these checks name a .mutant- file beside a source — use _importSource (in memory) or _sourceFile (temp):\n     ${bad.join('\n     ')}`) }
else console.log(`  ✅ none of ${files.length} checks names a .mutant- file`)
const planted = [['claims-planted.mjs', "const copy = join(dirname(P[which]), `.mutant-${basename(P[which])}`)\nwriteFileSync(copy, src)"]]
if (offenders(planted).length === 1) console.log('  ✅ mutant: a planted check writing a beside-copy → RED, as it must be')
else { failed++; console.error('  ⛔ mutant: a planted beside-copy reads green — this check cannot see one') }
console.log(failed ? `\n${failed} FAILED` : '\nall held')
process.exit(failed ? 1 : 0)
