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
import { COAST_FILE } from './coastFile.mjs'

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
// ⭐ x2: A REFUSAL'S WORDING IS NOT WHAT RUNS (2026-11-01: the chain-names pass reworded one `new Refusal(…)` and every town's
// Foundry owed all 18 steps). The literal text inside the arguments of `new Refusal(…)` / `new <X>Error(…)` hashes as one
// placeholder; every `${…}` in it, the callee and the argument structure still hash. ⛔ ONLY those two: a console line is
// OUTPUT another step parses (promote-ribbons' PROMOTE-DIFF, read by serve.js through runStep's onLine), and a returned
// string is a value. Sound only while no judge or runner matches a message's text and no code stores `.message`:
// ▶ node checks/claims-a-wording-edit-owes-nothing.mjs (the census and its mutants).
const CODE_FILE = /\.[mc]?js$/
export const EXEC_PREFIX = 'x2:'
const X1_PREFIX = 'x1:'
const MESSAGE_CALLEE = /^(Refusal|\w*Error)$/
const tokensOf = (src) => parse(src, { sourceType: 'module', tokens: true, errorRecovery: false, allowHashBang: true })
/** The [start, end) of every literal text inside a message argument: StringLiteral and TemplateElement under the arguments
 *  of `new Refusal(…)` / `new <X>Error(…)`. A template's `${…}` is code and stays outside. */
export function messageTextRanges(ast) {
  const out = []
  const walk = (n, inMsg) => {
    if (!n || typeof n.type !== 'string') return
    if (inMsg && (n.type === 'StringLiteral' || n.type === 'TemplateElement')) out.push([n.start, n.end])
    const isMsg = n.type === 'NewExpression' && n.callee?.type === 'Identifier' && MESSAGE_CALLEE.test(n.callee.name)
    for (const k in n) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue
      const v = n[k], deeper = inMsg || (isMsg && k === 'arguments')
      if (Array.isArray(v)) for (const c of v) walk(c, deeper)
      else if (v && typeof v === 'object') walk(v, deeper)
    }
  }
  walk(ast.program, false)
  return out
}
function tokenHash(src, prefix, exempt) {
  const ast = tokensOf(src)
  const R = exempt ? messageTextRanges(ast) : []
  let ri = 0
  const h = createHash('sha1')
  let prevLine = null
  for (const t of ast.tokens) {
    if (t.type === 'CommentLine' || t.type === 'CommentBlock') continue
    if (t.type?.label === 'eof') break
    while (ri < R.length && R[ri][1] <= t.start) ri++
    const words = ri < R.length && t.start >= R[ri][0] && t.end <= R[ri][1]
    h.update(`${prevLine != null && t.loc.start.line > prevLine ? '\n' : ' '}${words ? '\u0001message-text' : src.slice(t.start, t.end)}\0`)
    prevLine = t.loc.end.line
  }
  return prefix + h.digest('hex')
}
export const executedHash = (src) => tokenHash(src, EXEC_PREFIX, true)
/** The x1 judge (every token's text, messages included), kept ONLY to read records written before x2. */
export const executedHashX1 = (src) => tokenHash(src, X1_PREFIX, false)
const _hashCache = new Map()
function contentHash(f) {
  let st; try { st = statSync(f) } catch { return null }
  const key = `${f}|${st.mtimeMs}|${st.size}|${st.isDirectory()}`
  if (_hashCache.has(key)) return _hashCache.get(key)
  let out
  if (st.isDirectory()) { const h = createHash('sha1'); for (const e of readdirSync(f).sort()) h.update(`${e}:${contentHash(join(f, e))}\n`); out = h.digest('hex') }
  // message-flow(8fea236b): the parser's refusal into an `unparseable:` record, which contentChanged names as changed every time
  else if (CODE_FILE.test(f)) { try { out = executedHash(readFileSync(f, 'utf-8')) } catch (e) { out = `unparseable: ${String(e.message).split('\n')[0]}` } }
  else out = createHash('sha1').update(readFileSync(f)).digest('hex')
  _hashCache.set(key, out); return out
}
// ⭐ A RECORD WRITTEN BY AN OLDER JUDGE is judged exactly, never re-recorded by assumption. Two older forms: the sha1 of the
// file's BYTES (before code was hashed by what runs) and x1 (before message text was set aside). Find the version in git
// history that the record describes, take ITS x2, and compare with now's. ⛔ Not found ⇒ changed, named (a record taken on a
// tree git does not hold: a dirty one). Read-only: one `git log --raw` per file for its blob ids, one `git cat-file --batch`
// for their bytes, read newest first in batches of 16 and hashed only in the form the record needs, stopping at the first
// match. Forms are memoised by blob id (blobs repeat across steps and towns); bytes are not kept.
const rawSha1 = (buf) => createHash('sha1').update(buf).digest('hex')
const _blobForm = new Map(), _fileBlobs = new Map(), _bridged = new Map()
const FORMS = { raw: (bytes) => rawSha1(bytes), x1: (bytes) => executedHashX1(bytes.toString('utf-8')), x2: (bytes) => executedHash(bytes.toString('utf-8')) }
const tryForm = (form, bytes) => { try { return FORMS[form](bytes) } catch { return null } }   // unparseable: it judges as changed
function blobsOf(rel) {
  if (!_fileBlobs.has(rel)) _fileBlobs.set(rel, [...new Set(gitRead(['log', '-n', '400', '--format=', '--raw', '--no-abbrev', '--', rel]).toString('utf-8')
    .split('\n').map((l) => l.split(/\s+/)[3]).filter((b) => b && /^[0-9a-f]{40}$/.test(b) && !/^0+$/.test(b)))])
  return _fileBlobs.get(rel)
}
/** git's bytes for blob ids, read in one `git cat-file --batch` → Map(id → Buffer). Nothing keeps them. */
function blobBytes(rel, ids) {
  const buf = gitRead(['cat-file', '--batch'], ids.join('\n') + '\n')
  const out = new Map(); let at = 0
  for (const b of ids) {
    const nl = buf.indexOf(10, at), head = buf.subarray(at, nl).toString().split(' '), size = +head[2]
    if (head[0] !== b || head[1] !== 'blob' || !Number.isFinite(size)) throw new Error(`[pour-code] git cat-file answered "${head.join(' ')}" for ${rel}'s blob ${b}`)
    out.set(b, Buffer.from(buf.subarray(nl + 1, nl + 1 + size))); at = nl + 1 + size + 1
  }
  return out
}
const memoForm = (rel, ids, form) => {
  const todo = ids.filter((b) => !_blobForm.has(`${b}|${form}`))
  if (todo.length) for (const [b, bytes] of blobBytes(rel, todo)) _blobForm.set(`${b}|${form}`, tryForm(form, bytes))
  return ids.map((b) => _blobForm.get(`${b}|${form}`))
}
function oldRecordRunsAs(f, was) {
  const key = `${f}|${was}`
  if (_bridged.has(key)) return _bridged.get(key)
  const form = was.startsWith(X1_PREFIX) ? 'x1' : 'raw'
  let out = null
  try {
    if (tryForm(form, readFileSync(f)) === was) out = contentHash(f)
    else {
      const rel = relative(REPO_ROOT, f), ids = blobsOf(rel)
      for (let i = 0; i < ids.length; i += 16) {
        const batch = ids.slice(i, i + 16), got = memoForm(rel, batch, form), at = got.indexOf(was)
        if (at >= 0) { out = memoForm(rel, [batch[at]], 'x2')[0]; break }
      }
    }
  // message-flow(08af776c): git's failure, named as an owed reason (contentChanged), never read as "not found"
  } catch (e) { out = { error: String(e.message).split('\n')[0] } }   // ⛔ never read as "not found": named below
  _bridged.set(key, out); return out
}
const OLDER_FORM = (was) => typeof was === 'string' && (was.startsWith(X1_PREFIX) || /^[0-9a-f]{40}$/.test(was))

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
    if (typeof h === 'string' && h.startsWith(EXEC_PREFIX) && OLDER_FORM(was) && abs.has(p)) {
      const then = oldRecordRunsAs(abs.get(p), was)
      if (then === h) continue
      if (then == null) { out.push(`${p} (recorded by an older judge from a version git does not hold, e.g. a dirty tree: one run is owed, as expected)`); continue }
      if (then.error) { out.push(`${p} (its older record could not be read from git: ${then.error})`); continue }
    }
    out.push(p)
  }
  for (const p of Object.keys(record)) if (!(p in now)) out.push(`${p} (no longer read by ${who})`)
  return out
}

/** The bridge's one way into git history: `git -C <repo> <args>` (read-only: `log --raw` and `cat-file --batch`) → a Buffer. */
function gitRead(args, input) {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { maxBuffer: 1 << 30, ...(input != null && { input }) })
}

// ⭐ THE JUDGE IS CURRENT. `staleJudge(files)` hashes `files` by what runs, NOW, and returns a function that names any of them
// whose code has changed since: a long-running process that loaded them is judging with old code. A comment does not count.
export function staleJudge(files) {
  const at = new Map(files.map(f => [f, executedHash(readFileSync(f, 'utf-8'))]))
  return () => {
    const out = []
    // message-flow(96da58c0): an unreadable judge file, compared only for inequality: it is named as stale
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
    join(clean, COAST_FILE),                                  // derive.js → coastFile.mjs#readCoast — the lidar's coast (bake-coast.mjs)
  ]
}

// ⭐ WHAT THE POUR WAS GIVEN ON ITS COMMAND LINE THAT SHAPES ITS OUTPUT (2026-11-01). pipeline.js stamps it as `map.json.argvRead`
// with what it ran with; the Bake compares it with what it would pass now, behind the same question as a code change. ONE
// function, both sides, so the two can never name it differently. Today one flag: `--skip-elevation` decides whether map.json
// carries an elevation grid, and was recorded nowhere, so toggling a town's `pour.elevation` never re-poured it (Fuse, read
// from the code; not reproduced). ⛔ `--home-look` is NOT here: it feeds only the join guard, which shapes nothing and runs at
// every Bake and Publish instead (pourSteps.mjs#pourGuardRefusals).
export function pourArgvReads({ elevation }) {
  return [{ value: "pipeline's elevation (--skip-elevation unless the town's pour.elevation is true)", read: () => elevation === true }]
}

// The geography the last pour projected with vs `scene`'s now → a one-line reason, or null. ⛔ No record ⇒ dirty.
export function geographyReadChanged(record, scene) {
  if (!record || typeof record !== 'object') return '(no record of the geography the last pour read)'
  let now
  // message-flow(517f7d0c): the geography refusal, as the owed reason contentChanged returns
  try { now = geographyFor(scene) } catch (e) { return `(geography unreadable: ${e.message.trim().split('\n')[0]})` }
  return JSON.stringify(now) === JSON.stringify(record) ? null : `the town's geography (lat/lon/bbox/scale) changed`
}
