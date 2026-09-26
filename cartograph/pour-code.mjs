// ⭐ THE POUR'S CODE, JUDGED BY CONTENT — what the last pour ran, recorded in its map.json, compared with now.
//
// The Bake asks before a code change re-pours a town (Boz's ruling (d)). It used to ask when any file in
// pipeline.js's import closure had an mtime newer than map.json — so a checkout, a rebase or a worktree op asked
// with no change, and every town module's favicon, domain or set-piece edit asked every town (they reach the
// closure through config.js → the registry). Measured 2026-09-26: HPDM's 9 triggers were 4 town modules + 5 real
// pour-code edits. Now:
//   · `codeRead` — { repo-relative path: sha1 } of every file the pour ran. Changed, added or removed ⇒ named.
//   · `geographyRead` — the five numbers config.js projected with (`geography.mjs`). The walk STOPS at the town
//     registry: those modules are read by the pour only as this value.
// ⛔ A map.json with no record is DIRTY, named — never clean by default (the `registryRead` rule).
//   ▶ node checks/claims-the-bake-watches-its-code.mjs
import { readFileSync, existsSync } from 'fs'
import { join, dirname, relative } from 'path'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'
import { geographyFor } from './geography.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = join(HERE, '..')
export const POUR_ENTRY = join(HERE, 'pipeline.js')
// the town registry — read by the pour as a VALUE (geographyRead), so its imports are not the pour's code
export const TOWN_REGISTRY = join(REPO_ROOT, 'src', 'instances', 'registry.js')

// ⭐ THE BAKE'S CODE INPUTS ARE THE IMPORT CLOSURE, NOT A LIST. A hand list (`pipeline.js, derive.js, …`)
// missed `coastline.mjs` and `src/lib/tileGround.js` — the ① mint itself — so a fix to how ① is built sat
// unpoured behind a Bake that called the town clean (Gantry, 2026-09-24: the ① containment rule). Walk the
// static and literal dynamic imports from the entry script, following only relative paths (node: and bare
// packages are not the pipeline's code). A file that cannot be read is still returned, so it counts as dirty
// rather than silently dropping out of the closure. `stopAt` files are neither returned nor walked.
export function importClosure(entries, { stopAt = [] } = {}) {
  const seen = new Set(), stack = [...entries], stop = new Set(stopAt)
  const rx = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f) || stop.has(f)) continue
    seen.add(f)
    let src
    try { src = readFileSync(f, 'utf-8') } catch { continue }
    for (const m of src.matchAll(rx)) {
      let t = join(dirname(f), m[1])
      if (!existsSync(t) && existsSync(t + '.js')) t += '.js'
      if (!seen.has(t)) stack.push(t)
    }
  }
  return [...seen]
}

export const pourCodeClosure = () => importClosure([POUR_ENTRY], { stopAt: [TOWN_REGISTRY] })

const sha1 = (f) => { try { return createHash('sha1').update(readFileSync(f)).digest('hex') } catch { return null } }

// → { path: sha1 } for the pour's code as it stands now (pipeline.js stamps this into map.json as `codeRead`).
export function pourCodeRecord(files = pourCodeClosure()) {
  return Object.fromEntries(files.map(f => [relative(REPO_ROOT, f), sha1(f)]).sort(([a], [b]) => a < b ? -1 : 1))
}

// The files whose content differs from what the last pour ran → their paths. ⛔ No record ⇒ dirty.
export function pourCodeChanged(record, files = pourCodeClosure()) {
  if (!record || typeof record !== 'object') return ['(no record of the code the last pour ran)']
  const now = pourCodeRecord(files), out = []
  for (const [p, h] of Object.entries(now)) if (record[p] !== h) out.push(p in record ? p : `${p} (new to the pour)`)
  for (const p of Object.keys(record)) if (!(p in now)) out.push(`${p} (no longer in the pour)`)
  return out
}

// The geography the last pour projected with vs `scene`'s now → a one-line reason, or null. ⛔ No record ⇒ dirty.
export function geographyReadChanged(record, scene) {
  if (!record || typeof record !== 'object') return '(no record of the geography the last pour read)'
  let now
  try { now = geographyFor(scene) } catch (e) { return `(geography unreadable: ${e.message.trim().split('\n')[0]})` }
  return JSON.stringify(now) === JSON.stringify(record) ? null : `the town's geography (lat/lon/bbox/scale) changed`
}
