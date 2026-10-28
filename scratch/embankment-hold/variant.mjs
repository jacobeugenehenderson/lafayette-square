// READ-ONLY what-if: run bake-coast from a temp copy with one textual edit (a JSON [old, new] pair in argv[3]), write=false,
// its verifier recording instead of refusing; print the violations (kind, place) and the embankment line.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
const ROOT = new URL('../../', import.meta.url).pathname, HOME = join(ROOT, 'cartograph/bake-coast.mjs'), [scene, edit] = process.argv.slice(2)
let src = readFileSync(HOME, 'utf8')
for (const [a, b] of JSON.parse(edit)) { if (!src.includes(a)) throw new Error('edit target gone: ' + a); src = src.replace(a, b) }
const v = '  if (bad.length) throw new Error(`⛔ bake-coast: ${scene} — ${bad.length} place(s)'
src = src.replace(v, '  globalThis.__bad = bad\n  if (false) throw new Error(`⛔ bake-coast: ${scene} — ${bad.length} place(s)')
const abs = (spec) => spec.startsWith('.') ? pathToFileURL(join(dirname(HOME), spec)).href : spec.includes(':') ? spec : import.meta.resolve(spec)
const out = join(mkdtempSync(join(tmpdir(), 'coast-variant-')), 'bake-coast.mjs')
writeFileSync(out, src.replace(/from '([^']+)'/g, (_, s) => `from '${abs(s)}'`))
await (await import(pathToFileURL(out).href)).bakeCoast({ scene, write: !!process.env.VARIANT_OUT, outDir: process.env.VARIANT_OUT || null })
const bad = globalThis.__bad || []
console.log(`VARIANT: ${bad.length} violation(s) (${[...new Set(bad.map(x => x.kind))].map(k => k + ' ' + bad.filter(x => x.kind === k).length).join(', ')})${bad.length ? ' · ' + bad.slice(0, 8).map(x => `${x.kind} @(${x.at.map(c => (+c).toFixed(1)).join(', ')})`).join(' · ') : ''}`)
