// _importSource.mjs — THE ONE WAY A CHECK RUNS A PIECE OF A REPO FILE (Boz's ruling, Zob's mechanism, 2026-10-26).
//
// A check that needs one function out of a large module (sweepHighway out of tileGround.js, bakePlan out of serve.js), or a
// mutated copy of a module, used to build its own `data:` import: read the file, slice it, rewrite it, import the text. The
// tierer cannot read a body built at run time, so every one of those was a SAFE verdict on code nobody had read.
// ⭐ Here it is built from parts the tierer READS: `rel` is a literal repo path, and `span` is a literal that says which part
// runs — checks/tier.mjs takes the SAME span with the SAME function (`spanOf`, below) and classifies exactly that text, so a
// check that runs four functions of serve.js is judged on those four, not on serve.js's network routes. `transform` /
// `prefix` / `suffix` are code that runs inside the import, scanned for live signals as written. This file's own `data:`
// import is the one the tierer exempts; any other run-time `data:` import is live.
//
//   importSource(rel, { span, transform, prefix, suffix }) → the module's namespace
//     rel        repo-relative path, a LITERAL ('src/lib/tileGround.js')
//     span       a LITERAL: { functions: ['a', 'b'] } — those top-level functions, in that order — or
//                { from: 'text', to: 'text' } — from the line holding `from` to the line holding `to` (either may be omitted:
//                the file's start / end). Omitted: the whole file.
//     transform  (text) → the text to import, after the span and the import rewrite (a mutation goes here)
//     prefix / suffix  text added before / after (imports a span needs, `export { … }`)
// Relative import specifiers are rewritten to the repo file's own `file:` URLs (`resolveImports`), so the text resolves
// exactly as the file would. Nothing is written to disk.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function sourceOf(rel) {
  if (typeof rel !== 'string' || !rel || rel.startsWith('/') || rel.includes('..')) throw new Error(`[importSource] "${rel}" is not a repo-relative path`)
  return readFileSync(join(ROOT, rel), 'utf8')
}

const lineStart = (src, i) => src.lastIndexOf('\n', i) + 1
/** The part of `src` a span names, or throws naming what it could not find. Read by the helper AND by checks/tier.mjs. */
export function spanOf(src, span, rel = 'the file') {
  if (!span) return src
  if (Array.isArray(span.functions)) return span.functions.map((name) => {
    const at = src.search(new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`, 'm'))
    if (at < 0) throw new Error(`[importSource] ${rel} has no top-level function ${name} — re-aim the span`)
    const end = src.indexOf('\n}\n', at)
    if (end < 0) throw new Error(`[importSource] ${rel}: function ${name} does not end at a top-level brace`)
    return src.slice(at, end + 3).replace(/^export\s+/, '')
  }).join('\n')
  const a = span.from == null ? 0 : src.indexOf(span.from), b = span.to == null ? src.length : src.indexOf(span.to, Math.max(0, a))
  if (a < 0) throw new Error(`[importSource] ${rel} has no "${span.from}" — re-aim the span`)
  if (b < 0) throw new Error(`[importSource] ${rel} has no "${span.to}" after "${span.from}" — re-aim the span`)
  return src.slice(lineStart(src, a), span.to == null ? b : lineStart(src, b))
}

/** Relative import specifiers → the repo file's own file: URLs (static, side-effect and literal dynamic imports). */
export function resolveImports(text, rel) {
  const dir = dirname(join(ROOT, rel))
  return text.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?\/[^'"]+)\2/g, (_, kw, q, p) => `${kw}${q}${pathToFileURL(join(dir, p)).href}${q}`)
}

export async function importSource(rel, { span = null, transform = null, prefix = '', suffix = '' } = {}) {
  const part = spanOf(sourceOf(rel), span, rel)
  const text0 = resolveImports(prefix + '\n' + part + '\n' + suffix, rel)
  const text = transform ? transform(text0) : text0
  if (typeof text !== 'string') throw new Error(`[importSource] ${rel}: the transform returned no text`)
  return import('data:text/javascript;base64,' + Buffer.from(text).toString('base64'))
}
