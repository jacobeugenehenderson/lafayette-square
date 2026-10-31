// _sourceFile.mjs — importSource's text as a FILE, for a check that must spawn a mutated script (Boz's one-loader ruling,
// 2026-10-30). It is checks/_importSource.mjs#sourceText — the same span, transform and redirect — written into a fresh
// directory under the OS temp dir, never beside the source: a copy in the checkout survives a SIGKILL (a finally never runs)
// and is seen by node --watch and vite. Its relative imports are already file: URLs (its redirects data: URLs) and its
// import.meta the repo file's, so it runs from anywhere as the repo file would. checks/tier.mjs reads each sourceFile call as it reads importSource.
//   sourceFile(rel, opts) → the written file's path
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename, dirname } from 'node:path'
import { sourceText } from './_importSource.mjs'

// each temp dir goes when this process exits (a SIGKILL leaves it, in the OS temp dir only: never the checkout)
const made = []
process.on('exit', () => { for (const d of made) rmSync(d, { recursive: true, force: true }) })

export function sourceFile(rel, opts = {}) {
  const text = sourceText(rel, opts)
  // import.meta.url reads as the repo file's (sourceText), so a main-guard against process.argv[1] would never fire in the
  // spawned copy and its main would silently not run: refused by name, never a quiet no-op
  if (/process\.argv\[1\]/.test(text) && /import\.meta|file:\/\//.test(text) && /pathToFileURL\(\s*process\.argv\[1\]/.test(text)) {
    throw new Error(`[sourceFile] ${rel} guards its main on process.argv[1]: a spawned copy would not run it — import it with importSource instead`)
  }
  // an ES module named .js is ESM by the repo's package.json; a temp dir has none, so it is named .mjs
  const file = join(mkdtempSync(join(tmpdir(), 'source-file-')), basename(rel).replace(/\.js$/, '.mjs'))
  made.push(dirname(file))
  writeFileSync(file, text)
  return file
}
