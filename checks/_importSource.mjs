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
//   importSource(rel, { span, transform, prefix, suffix, redirect }) → the module's namespace
//   sourceText(rel, opts) → the text importSource would import
//   sourceFile(rel, opts) — checks/_sourceFile.mjs: that text in a fresh directory under the OS temp dir, for a check that must
//                SPAWN a mutated script. ⛔ Never beside the source: a copy in the checkout survives a SIGKILL and is seen by
//                node --watch and vite (Boz's one-loader ruling, 2026-10-30). Kept apart so this helper writes nothing.
//     rel        repo-relative path, a LITERAL ('src/lib/tileGround.js')
//     span       a LITERAL: { functions: ['a', 'b'] } — those top-level functions, in that order — or
//                { from: 'text', to: 'text' } — from the line holding `from` to the line holding `to` (either may be omitted:
//                the file's start / end). Omitted: the whole file.
//     transform  (text) → the text to import, after the span and the import rewrite (a mutation goes here)
//     prefix / suffix  text added before / after (imports a span needs, `export { … }`)
//     redirect   a LITERAL object { '<repo-relative path>': { span, transform, prefix, suffix } }: an import of that repo file,
//                in this text or in a redirected one, lands on ITS sourceText instead (so index.js's import of route.js can
//                reach a mutated route.js in memory). checks/tier.mjs reads each key as a literal path and classifies it.
// Relative import specifiers are rewritten to the repo file's own `file:` URLs (`resolveImports`), and `import.meta.url` /
// `.dirname` / `.filename` to the repo file's own, so the text resolves and runs exactly as the file would. Nothing is written to disk.
import { readFileSync, existsSync } from 'node:fs'
import { isBuiltin } from 'node:module'
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

/** A package specifier's installed file: URL, resolved as the repo resolves it. ⛔ Only for a file whose nearest
 *  node_modules is the repo's (resolved from here): a nearer one could hold another version, so that is refused by name. */
function packageHref(spec, rel) {
  for (let d = dirname(join(ROOT, rel)); d.length > ROOT.length; d = dirname(d)) {
    if (existsSync(join(d, 'node_modules'))) throw new Error(`[importSource] ${rel} has its own node_modules (${d.slice(ROOT.length)}): "${spec}" would resolve there, not as resolved here — run it in place`)
  }
  return import.meta.resolve(spec)
}
function bare(m, kw, q, spec, rel) {
  if (isBuiltin(spec) || /^(?:node|file|data|https?):/.test(spec)) return m
  let href; try { href = packageHref(spec, rel) } catch (e) { if (/own node_modules/.test(e.message)) throw e; return m }
  return `${kw}${q}${href}${q}`
}
/** Relative import specifiers → the repo file's own file: URLs (static, side-effect and literal dynamic imports); a package
 *  specifier → its installed file: URL (a data: or temp module cannot resolve one); and import.meta.url / .dirname /
 *  .filename → the repo file's own (a data: module's would be the data: URL). A builtin is left as written. */
export function resolveImports(text, rel) {
  const file = join(ROOT, rel), dir = dirname(file)
  return text.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.\.?\/[^'"]+)\2/g, (_, kw, q, p) => `${kw}${q}${pathToFileURL(join(dir, p)).href}${q}`)
    // a package: only in an import / export statement at a line's start, or a literal import(): prose and strings that
    // say "from 'x'" are not imports. A name that resolves to nothing is left as written (it fails where it is used).
    .replace(/^(\s*(?:import|export)\b[^'"\n]*?\bfrom\s*|\s*import\s+)(['"])((?:@[\w.-]+\/)?[\w.-][\w./-]*)\2/gm, (m, kw, q, spec) => bare(m, kw, q, spec, rel))
    .replace(/(\bimport\s*\(\s*)(['"])((?:@[\w.-]+\/)?[\w.-][\w./-]*)\2(\s*\))/g, (m, kw, q, spec, close) => bare(m.slice(0, -close.length), kw, q, spec, rel) + close)
    .replace(/\bimport\.meta\.url\b/g, JSON.stringify(pathToFileURL(file).href))
    .replace(/\bimport\.meta\.dirname\b/g, JSON.stringify(dir))
    .replace(/\bimport\.meta\.filename\b/g, JSON.stringify(file))
}

const dataUrl = (text) => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64')
const hrefOf = (rel) => pathToFileURL(join(ROOT, rel)).href

export function sourceText(rel, { span = null, transform = null, prefix = '', suffix = '', redirect = null } = {}, _chain = []) {
  if (_chain.includes(rel)) throw new Error(`[importSource] a redirect cycle: ${[..._chain, rel].join(' → ')}`)
  const part = spanOf(sourceOf(rel), span, rel).replace(/^#!.*\n/, '\n')   // a shebang is legal only as a file's first line
  const text0 = resolveImports(prefix + '\n' + part + '\n' + suffix, rel)
  let text = transform ? transform(text0) : text0
  if (typeof text !== 'string') throw new Error(`[importSource] ${rel}: the transform returned no text`)
  // each redirected repo file: its own text (the same redirects reach its imports), at the import's place
  for (const [to, opts] of Object.entries(redirect || {})) {
    if (to === rel) continue
    const href = hrefOf(to)
    if (!text.includes(href)) throw new Error(`[importSource] ${rel} does not import ${to}: the redirect would change nothing — re-aim it`)
    const target = dataUrl(sourceText(to, { ...opts, redirect: { ...redirect, ...(opts?.redirect || {}) } }, [..._chain, rel]))
    text = text.split(href).join(target)
  }
  return text
}

export async function importSource(rel, opts = {}) {
  return import('data:text/javascript;base64,' + Buffer.from(sourceText(rel, opts)).toString('base64'))   // the import the tierer exempts: its parts are read at each call site
}

