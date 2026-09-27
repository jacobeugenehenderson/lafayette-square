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
import { readFileSync, existsSync, statSync, readdirSync } from 'fs'
import { join, dirname, relative } from 'path'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'
import { geographyFor } from './geography.mjs'
import { mapDir, DEFAULT_MAP } from './scene.js'
import { declaredParcelPaths, sourcesPath } from './sources.js'

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

// ⭐ A FILE'S CONTENT, hashed once per (path, mtime, size) — a bake hashes map.json for several steps and pays once.
// A missing file hashes to null (so its APPEARING later is a change); a directory to the hash of its sorted listing.
const _hashCache = new Map()
function contentHash(f) {
  let st; try { st = statSync(f) } catch { return null }
  const key = `${f}|${st.mtimeMs}|${st.size}|${st.isDirectory()}`
  if (_hashCache.has(key)) return _hashCache.get(key)
  const h = createHash('sha1')
  if (st.isDirectory()) for (const e of readdirSync(f).sort()) h.update(`${e}:${contentHash(join(f, e))}\n`)
  else h.update(readFileSync(f))
  const out = h.digest('hex'); _hashCache.set(key, out); return out
}

// → { path: sha1 | null } for a set of files as they stand now — CODE (the pour's `codeRead`, a step's closure) or
// DATA (a step's declared inputs). Every bake step keeps one in clean/bake-reads.json (serve.js `runIfDirty`), so it
// re-runs on a CONTENT change and never on an mtime — a checkout, or writeIfChanged's touch, changes nothing.
// ⭐ An input may also be a VALUE — `{ value: name, read: () => … }` — when a step reads a few keys out of a file that
// changes for other reasons (a Look's design.json on every slider, the registry on every research edit). Its record is
// the hash of what `read()` returns, keyed `value:<name>`, so only a change to what the step READ re-runs it.
export function contentRecord(files) {
  return Object.fromEntries(files.map(f => typeof f === 'string'
    ? [relative(REPO_ROOT, f), contentHash(f)]
    : [`value:${f.value}`, createHash('sha1').update(JSON.stringify(f.read())).digest('hex')]).sort(([a], [b]) => a < b ? -1 : 1))
}

// The files whose content differs from `record` → their paths. ⛔ No record ⇒ dirty, named.
export function contentChanged(record, files, who = 'this step') {
  if (!record || typeof record !== 'object') return [`(no record of what ${who} last read)`]
  const now = contentRecord(files), out = []
  for (const [p, h] of Object.entries(now)) if (record[p] !== h) out.push(p in record ? p : `${p} (new to ${who})`)
  for (const p of Object.keys(record)) if (!(p in now)) out.push(`${p} (no longer read by ${who})`)
  return out
}

export const pourCodeRecord = (files = pourCodeClosure()) => contentRecord(files)
export const pourCodeChanged = (record, files = pourCodeClosure()) => contentChanged(record, files, 'the pour')

// ⭐ THE POUR'S OTHER DATA READS — files pipeline.js/derive.js open that were never declared (the bake-read audit,
// 2026-09-26). The pour stamps their content as `map.json.dataRead`; a change to one re-pours only after the SAME
// question as a code change (Boz's ruling: the operator was never told these drive the pour). The authoring inputs
// (overlay, skeleton, measurements…) are NOT here — they re-pour without asking. ▶ the site of each read is named.
export function pourDataReads(scene) {
  const raw = join(mapDir(scene), 'raw'), clean = join(mapDir(scene), 'clean')
  return [
    join(raw, 'msbf.json'),                                   // pipeline.js main — the footprint well
    join(mapDir(scene), 'neighborhood_boundary.json'),        // pipeline.js — membership
    join(mapDir(scene), 'building-overrides.json'),           // pipeline.js — authored building edits
    join(raw, 'survey.json'),                                 // derive.js — surveyed widths
    join(clean, 'park-polygon.json'),                         // derive.js — the authored park
    scene === DEFAULT_MAP ? join(REPO_ROOT, 'scripts', 'raw', 'osm_street_lamps.json') : join(raw, 'osm_street_lamps.json'),  // derive.js
    join(mapDir(scene), 'content', 'county-land-use-codes.csv'),  // derive.js → parcel-landuse#loadCountyCodeTable
    sourcesPath(scene), ...declaredParcelPaths(scene),        // derive.js → sources.js#readSources, and its parcel wells
  ]
}

// The geography the last pour projected with vs `scene`'s now → a one-line reason, or null. ⛔ No record ⇒ dirty.
export function geographyReadChanged(record, scene) {
  if (!record || typeof record !== 'object') return '(no record of the geography the last pour read)'
  let now
  try { now = geographyFor(scene) } catch (e) { return `(geography unreadable: ${e.message.trim().split('\n')[0]})` }
  return JSON.stringify(now) === JSON.stringify(record) ? null : `the town's geography (lat/lon/bbox/scale) changed`
}
