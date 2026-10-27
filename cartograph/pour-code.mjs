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
// ⭐ THIS FILE IS POUR CODE TOO: pipeline.js imports it to stamp the records, so it is in the closure, and a change to it
// names every town once. That is deliberate. A changed judge is a changed record format, and judging a town's old record
// with a new judge is exactly the case to ask about (2026-10-26: the token-stream judge named pour-code.mjs on HPDM).
// ⭐ AND THE JUDGE THAT RUNS MUST BE THE JUDGE IN THE REPO (`judgeStale`): serve.js loads this module once, at start, and
// a server older than a merge judged HPDM with the byte judge it had loaded, naming a comment-only sources.js
// (2026-10-26, :3343 started 10-25 19:52, the detector merged 10-26 20:09). The Bake refuses (503) while stale.
//   ▶ node checks/claims-the-bake-watches-its-code.mjs
import { readFileSync, existsSync, statSync, readdirSync } from 'fs'
import { join, dirname, relative } from 'path'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { parse } from '@babel/parser'
import { fileURLToPath } from 'url'
import { geographyFor } from './geography.mjs'
import { mapDir, declaredBuildingsOf } from './scene.js'
import { declaredParcelPaths, sourcesPath } from './sources.js'
import { footprintWell } from './footprint-well.mjs'

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
// ⭐ CODE IS JUDGED BY WHAT RUNS (BACKLOG "THE DIRTY DETECTOR HAS NO DISCRETION": Huron's Publish asked for a full re-pour for a
// one-line doc comment in sources.js, b456bc6d). A .js/.mjs/.cjs file hashes its TOKEN STREAM (`executedHash`): every token's
// source text and whether a line break precedes it (automatic semicolon insertion reads line breaks), never its comments or
// its other whitespace. Data files hash their bytes. ⛔ A code file the parser refuses is not hashed at all: it records
// `unparseable: <why>`, and `contentChanged` names it as changed EVERY time, so it can never read as clean.
const CODE_FILE = /\.[mc]?js$/
export const EXEC_PREFIX = 'x1:'
export function executedHash(src) {
  const ast = parse(src, { sourceType: 'module', tokens: true, errorRecovery: false, allowHashBang: true })
  const h = createHash('sha1')
  let prevLine = null
  for (const t of ast.tokens) {
    if (t.type === 'CommentLine' || t.type === 'CommentBlock') continue
    if (t.type?.label === 'eof') break
    h.update(`${prevLine != null && t.loc.start.line > prevLine ? '\n' : ' '}${src.slice(t.start, t.end)}\0`)
    prevLine = t.loc.end.line
  }
  return EXEC_PREFIX + h.digest('hex')
}
const _hashCache = new Map()
function contentHash(f) {
  let st; try { st = statSync(f) } catch { return null }
  const key = `${f}|${st.mtimeMs}|${st.size}|${st.isDirectory()}`
  if (_hashCache.has(key)) return _hashCache.get(key)
  let out
  if (st.isDirectory()) { const h = createHash('sha1'); for (const e of readdirSync(f).sort()) h.update(`${e}:${contentHash(join(f, e))}\n`); out = h.digest('hex') }
  else if (CODE_FILE.test(f)) { try { out = executedHash(readFileSync(f, 'utf-8')) } catch (e) { out = `unparseable: ${String(e.message).split('\n')[0]}` } }
  else out = createHash('sha1').update(readFileSync(f)).digest('hex')
  _hashCache.set(key, out); return out
}
// ⭐ A RECORD WRITTEN BEFORE CODE WAS HASHED BY WHAT RUNS holds the sha1 of the file's BYTES. It is judged exactly, never
// re-recorded by assumption: the bytes as they stand now (equal ⇒ unchanged), else the version in git history whose bytes
// hash to the record, compared by what runs. ⛔ Not found in history ⇒ changed, named. Read-only: `git log` and `git show`.
const rawSha1 = (buf) => createHash('sha1').update(buf).digest('hex')
const _bridged = new Map()
function oldRecordRunsAs(f, oldSha) {
  const key = `${f}|${oldSha}`
  if (_bridged.has(key)) return _bridged.get(key)
  let out = null
  if (rawSha1(readFileSync(f)) === oldSha) out = contentHash(f)
  else try {
    const rel = relative(REPO_ROOT, f)
    const revs = execFileSync('git', ['-C', REPO_ROOT, 'log', '--format=%H', '-n', '400', '--', rel], { encoding: 'utf-8' }).split('\n').filter(Boolean)
    for (const r of revs) {
      let buf; try { buf = execFileSync('git', ['-C', REPO_ROOT, 'show', `${r}:${rel}`], { maxBuffer: 1 << 28 }) } catch { continue }
      if (rawSha1(buf) === oldSha) { try { out = executedHash(buf.toString('utf-8')) } catch { out = null } break }
    }
  } catch { out = null }
  _bridged.set(key, out); return out
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
  const now = contentRecord(files), out = [], abs = new Map(files.filter(f => typeof f === 'string').map(f => [relative(REPO_ROOT, f), f]))
  for (const [p, h] of Object.entries(now)) {
    if (typeof h === 'string' && h.startsWith('unparseable')) { out.push(`${p} (${h} — code that cannot be read as JavaScript is never judged unchanged)`); continue }
    if (record[p] === h) continue
    const was = record[p]
    if (!(p in record)) { out.push(`${p} (new to ${who})`); continue }
    if (typeof was === 'string' && typeof h === 'string' && h.startsWith(EXEC_PREFIX) && /^[0-9a-f]{40}$/.test(was) && abs.has(p) && oldRecordRunsAs(abs.get(p), was) === h) continue
    out.push(p)
  }
  for (const p of Object.keys(record)) if (!(p in now)) out.push(`${p} (no longer read by ${who})`)
  return out
}

// ⭐ THE JUDGE IS CURRENT. `staleJudge(files)` hashes `files` by what runs, NOW, and returns a function that names any of them
// whose code has changed since: a long-running process that loaded them is judging with old code. A comment does not count.
export function staleJudge(files) {
  const at = new Map(files.map(f => [f, executedHash(readFileSync(f, 'utf-8'))]))
  return () => {
    const out = []
    for (const [f, h] of at) { let now; try { now = executedHash(readFileSync(f, 'utf-8')) } catch (e) { now = `unreadable: ${e.message}` }
      if (now !== h) out.push(relative(REPO_ROOT, f)) }
    return out
  }
}
// the bake's judges: this file and the server that calls it, as this process loaded them
export const judgeStale = staleJudge([fileURLToPath(import.meta.url), join(HERE, 'serve.js')])

export const pourCodeRecord = (files = pourCodeClosure()) => contentRecord(files)
export const pourCodeChanged = (record, files = pourCodeClosure()) => contentChanged(record, files, 'the pour')

// ⭐ THE POUR'S OTHER DATA READS — files pipeline.js/derive.js open that were never declared (the bake-read audit,
// 2026-09-26). The pour stamps their content as `map.json.dataRead`; a change to one re-pours only after the SAME
// question as a code change (Boz's ruling: the operator was never told these drive the pour). The authoring inputs
// (overlay, skeleton, measurements…) are NOT here — they re-pour without asking. ▶ the site of each read is named.
export function pourDataReads(scene) {
  const raw = join(mapDir(scene), 'raw'), clean = join(mapDir(scene), 'clean')
  return [
    footprintWell(scene).path,                                // pipeline.js main — the footprint well (footprint-well.mjs)
    ...[declaredBuildingsOf(scene)].filter(Boolean).map(p => join(REPO_ROOT, p)),  // pipeline.js main — a declared curated set (pour.buildings)
    join(mapDir(scene), 'neighborhood_boundary.json'),        // pipeline.js — membership
    join(mapDir(scene), 'building-overrides.json'),           // pipeline.js — authored building edits
    join(raw, 'survey.json'),                                 // derive.js — surveyed widths
    join(clean, 'park-polygon.json'),                         // derive.js — the authored park
    join(raw, 'osm_street_lamps.json'),                       // derive.js
    join(mapDir(scene), 'content', 'county-land-use-codes.csv'),  // derive.js → parcel-landuse#loadCountyCodeTable
    sourcesPath(scene), ...declaredParcelPaths(scene),        // derive.js → sources.js#readSources, and its parcel wells
    join(raw, 'osm_kerbs.json'),                              // derive.js → curb-cut-evidence.mjs — the recorded curb cuts
    join(mapDir(scene), 'norms.json'),                        // derive.js → curb-cut-norm.mjs — the town's curb-cut norm
  ]
}

// The geography the last pour projected with vs `scene`'s now → a one-line reason, or null. ⛔ No record ⇒ dirty.
export function geographyReadChanged(record, scene) {
  if (!record || typeof record !== 'object') return '(no record of the geography the last pour read)'
  let now
  try { now = geographyFor(scene) } catch (e) { return `(geography unreadable: ${e.message.trim().split('\n')[0]})` }
  return JSON.stringify(now) === JSON.stringify(record) ? null : `the town's geography (lat/lon/bbox/scale) changed`
}
