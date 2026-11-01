#!/usr/bin/env node
// CLAIM — A POUR OR BAKE STEP'S KEY RECORDS EVERY INPUT THAT SHAPES ITS OUTPUT, WHATEVER CARRIES IT; A GUARD IS NOT KEYED AND
// RUNS WHENEVER THE TOWN IS ABOUT TO BE ACTED ON (Boz's ruling, 2026-11-01; cartograph/pourSteps.mjs's header).
//
// Two carriers a step's key could miss, read off the code, never restated:
//   (A) THE TOWN RECORD. A step reads `instanceForMap(scene)` somewhere in its import closure; every field path it takes off
//       the record must be declared among its inputs as `townRecordFor(scene, [fields])` (pourSteps.mjs). ⛔ Until 2026-11-01
//       every step carried the whole record, so a branding edit re-poured the town from its skeleton.
//   (B) ITS COMMAND LINE. Every `${…}` in a step's command must be the step's identity (the town or the Look its record is
//       keyed by), a value its key records (a declared input, or pour-code.mjs#pourArgvReads for the pour), or the input of
//       a guard that runs at the question (pourSteps.mjs#pourGuardRefusals calls the same source). ⛔ `--skip-elevation`
//       was recorded nowhere, so a town's pour.elevation toggle never re-poured it.
// And the guards themselves: pourGuardRefusals runs on every Bake RUN and at Publish before anything ships, and a dangling
// authored key refuses. And the one value the town's Looks share: pourSteps.mjs#townPourElevation refuses, naming both, when two
// Looks of a scene disagree on pour.elevation; it never picks one (Boz's ruling 1, 2026-11-01).
//
// HOW IT READS:
//   · STEPS: every `runIfDirty(` call in serve.js (comments stripped). ⛔ A call whose label is not a literal, or whose inputs
//     are not an array literal or the pour table's `POUR.<step>.inputs`, is UNKNOWN (exit 2): a step the parser misses is a step
//     whose reads go unchecked. The pour's own steps come from pourSteps.mjs, called live (#pourSteps, #skeletonStep).
//   · READS: each step's code (its declared scripts and its command's script) and their import closure, as stepReads hashes it
//     (pour-code.mjs#importClosure, stopping at the town registry). In each file: `instanceForMap(…)` (or its import alias)
//     followed by `.a` / `?.a` / `['a']` is a path, cut before a method call; a name assigned from it is followed the same way;
//     a destructure names its keys. A truthiness or null test reads presence. ⛔ Anything else reads the WHOLE record ('*'):
//     a spread, a rest, a computed key `[k]` (the whole object at that prefix), the value passed, returned or stored.
//     ⛔ UNKNOWN: any other import from the town registry, any import of a town module, instanceForMap used as a value.
//   · COVERED: a declared path covers itself and everything under it; '*' covers all; any declaration covers presence.
//   · Steps run UNJUDGED (serve.js `runStep(`, the manifest) are listed by name with what they read: they carry no key.
//
//   node checks/claims-a-step-keys-every-input-that-shapes-it.mjs [--mutants] [-v]
import { readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { ROOT } from './_scenes.mjs'
import { importSource } from './_importSource.mjs'

const VERBOSE = process.argv.includes('-v')
const CARTO = join(ROOT, 'cartograph')
const PC = await import(pathToFileURL(join(CARTO, 'pour-code.mjs')).href)
const PS = await import(pathToFileURL(join(CARTO, 'pourSteps.mjs')).href)
const REG = await import(pathToFileURL(join(ROOT, 'src/instances/registry.js')).href)
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

// ── text helpers: comments out (strings kept), balanced brackets, top-level comma split ──
function stripComments(s) {
  let out = '', q = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { out += c; if (c === '\\') { out += s[++i] ?? ''; continue } if (c === q) q = null; continue }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; continue }
    if (c === '/' && s[i + 1] === '/') { const j = s.indexOf('\n', i); i = j < 0 ? s.length : j - 1; continue }
    if (c === '/' && s[i + 1] === '*') { const j = s.indexOf('*/', i + 2); i = j < 0 ? s.length : j + 1; continue }
    out += c
  }
  return out
}
function balanced(s, i) {
  const open = s[i], close = { '(': ')', '[': ']', '{': '}' }[open]; let d = 0, q = null
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue }
    if (c === "'" || c === '"' || c === '`') { q = c; continue }
    if (c === open) d++
    else if (c === close && --d === 0) return j + 1
  }
  return -1
}
function splitTop(s) {
  const out = []; let d = 0, q = null, cur = ''
  for (let j = 0; j < s.length; j++) {
    const c = s[j]
    if (q) { cur += c; if (c === '\\') { cur += s[++j]; continue } if (c === q) q = null; continue }
    if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = '' } else cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
const interpolations = (tpl) => { const out = []; for (let i = tpl.indexOf('${'); i >= 0; i = tpl.indexOf('${', i + 1)) { const e = balanced(tpl, i + 1); out.push(tpl.slice(i + 2, e - 1)) } return out }
const identsOf = (expr) => [...new Set((stripStrings(expr).match(/(?<![.\w$])[A-Za-z_$][\w$]*/g) || []).filter(w => !KEYWORDS.has(w)))]
const KEYWORDS = new Set(['true', 'false', 'null', 'undefined', 'typeof', 'new', 'await', 'return', 'const', 'let', 'var', 'of', 'in'])
function stripStrings(s) { return s.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "''").replace(/`(?:\\.|[^`\\$]|\$(?!\{))*`/g, '``') }

// ── (A) the record reads in one file ──
// → { paths: Set (''= presence, '*' = whole), unknown: [] }
function recordReads(text, file) {
  const s = stripComments(text), paths = new Set(), unknown = [], rel = relative(ROOT, file)
  const callees = new Set()
  for (const m of s.matchAll(/import\s*(\*\s*as\s+\w+|\{[^}]*\}|\w+)\s*from\s*['"]([^'"]+)['"]/g)) {
    const spec = m[2]
    if (!/src\/instances\//.test(spec)) continue
    if (!/src\/instances\/registry\.js$/.test(spec)) { unknown.push(`${rel} imports a town module (${spec})`); continue }
    if (!m[1].startsWith('{')) { unknown.push(`${rel} imports the town registry whole (${m[1].trim()})`); continue }
    for (const part of m[1].slice(1, -1).split(',').map(x => x.trim()).filter(Boolean)) {
      const [name, alias] = part.split(/\s+as\s+/)
      if (name !== 'instanceForMap') unknown.push(`${rel} imports ${name} from the town registry, which this check cannot read`)
      else callees.add(alias || name)
    }
  }
  if (/import\(\s*['"`][^'"`]*src\/instances\//.test(s)) unknown.push(`${rel} imports from src/instances/ dynamically`)
  // a chain after index i: ['a','b'] — cut before a method call; a computed non-literal key ends the path there
  const chainAt = (i) => {
    const segs = []; let j = i
    for (;;) {
      const m = /^\s*(\?\.|\.)\s*([A-Za-z_$][\w$]*)/.exec(s.slice(j)) || /^\s*(\?\.)?\s*\[\s*(['"])([^'"]+)\2\s*\]/.exec(s.slice(j))
      if (m && m[2] && !['"', "'"].includes(m[2])) { segs.push(m[2]); j += m[0].length; continue }
      if (m && m[3]) { segs.push(m[3]); j += m[0].length; continue }
      if (/^\s*(\?\.)?\s*\[/.test(s.slice(j))) return { segs, end: j, computed: true }
      break
    }
    if (/^\s*(\?\.)?\s*\(/.test(s.slice(j)) && segs.length) segs.pop()   // a method called on the value: the object before it is read
    return { segs, end: j, computed: false }
  }
  const destructure = (pat) => {
    const out = []
    for (const p of splitTop(pat.slice(1, -1))) {
      if (p.startsWith('...')) return ['*']
      const key = p.split(':')[0].split('=')[0].trim()
      if (/^\[/.test(key)) return ['*']
      out.push(key)
    }
    return out
  }
  // how a value at `at` (just past it: index `end`, just before it: `start`) is used → paths it reads, relative to it
  const useOf = (start, end) => {
    const c = chainAt(end)
    if (c.segs.length) return [c.computed ? c.segs.join('.') : c.segs.join('.')]
    if (c.computed) return ['*']
    const after = s.slice(end).replace(/^\s+/, ''), before = s.slice(0, start).replace(/\s+$/, '')
    if (/^(\?(?![.?])|&&|\|\||[!=]==?)/.test(after) || /!$/.test(before)) return ['']
    const asg = /(?:\b(?:const|let|var)\s+)?([A-Za-z_$][\w$]*)\s*=$/.exec(before)
    if (asg) return { name: asg[1] }
    const des = /(\{[^{}]*\})\s*=$/.exec(before)
    if (des) return destructure(des[1])
    return ['*']
  }
  const names = new Set()
  for (const callee of callees) {
    for (const m of s.matchAll(new RegExp(`(?<![\\w$])(?<![^.]\\.)${callee.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'))) {
      const i = m.index
      if (/import\s*\{[^}]*$/.test(s.slice(Math.max(0, i - 200), i))) continue   // the import itself
      if (s[i + callee.length] !== '(') { unknown.push(`${rel}: ${callee} is used as a value, not called`); continue }
      const end = balanced(s, i + callee.length)
      const u = useOf(i, end)
      if (Array.isArray(u)) u.forEach(p => paths.add(p)); else names.add(u.name)
    }
  }
  for (const n of names) {
    for (const m of s.matchAll(new RegExp(`(?<![\\w$])(?<![^.]\\.)${n.replace(/\$/g, '\\$')}(?![\\w$])`, 'g'))) {
      const i = m.index, before = s.slice(0, i).replace(/\s+$/, ''), after = s.slice(i + n.length).replace(/^\s+/, '')
      if (/\b(?:const|let|var)$/.test(before) && !/^=(?!=)/.test(after)) continue   // `let inst` — a declaration
      if (/^=(?![=>])/.test(after)) continue                                          // `inst = …` — the assignment itself
      if (/(?:,|\{)$/.test(before) && /^(?:,|\})/.test(after) && /\{[^{}]*$/.test(s.slice(Math.max(0, i - 80), i)) && /^[^{}]*\}\s*=/.test(s.slice(i, i + 80))) continue   // a destructure target of another value
      const u = useOf(i, i + n.length)
      if (Array.isArray(u)) u.forEach(p => paths.add(p)); else paths.add('*')         // re-assigned to another name: not followed
    }
  }
  return { paths, unknown }
}

const covered = (path, declared) => declared.includes('*') || (path === '' ? declared.length > 0 : declared.some(d => path === d || path.startsWith(d + '.')))

// ── the steps ──
function serveSteps(serveSrc) {
  const s = stripComments(serveSrc), steps = [], unknown = []
  const sites = [...s.matchAll(/\brunIfDirty\(/g)].map(m => m.index)
  for (const i of sites) {
    const open = i + 'runIfDirty'.length, end = balanced(s, open), args = splitTop(s.slice(open + 1, end - 1))
    const label = /^'([^']+)'$/.exec(args[0] || '')?.[1]
    const where = `serve.js runIfDirty(${(args[0] || '').slice(0, 30)}…)`
    if (!label) { unknown.push(`${where}: its label is not a literal, so its reads cannot be checked`); continue }
    const pour = /^POUR(?:\.([\w]+)|\['([\w-]+)'\])\.inputs$/.exec(args[1] || '')
    if (pour) { steps.push({ label, from: 'pourSteps', at: i }); continue }
    if (!/^\[[\s\S]*\]$/.test(args[1] || '')) { unknown.push(`${where}: its inputs are not an array literal, so its reads cannot be checked`); continue }
    steps.push({ label, at: i, inputsText: args[1], outputsText: args[2] || '', cmdText: args[3] || '', from: 'serve' })
  }
  return { steps, unknown, sites: sites.length }
}
// a path expression of literals: join(here, 'a.js') · join(REPO_ROOT, 'arborist', 'b.js') · join(HERE, 'c.mjs')
function literalPath(expr) {
  const m = /^join\(\s*(here|HERE|REPO_ROOT)\s*,\s*((?:'[^']+'\s*,?\s*)+)\)$/.exec(expr.trim())
  if (!m) return null
  const parts = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1])
  return join(m[1] === 'REPO_ROOT' ? ROOT : CARTO, ...parts)
}
function serveStepCode(st) {
  const code = []
  for (const e of splitTop(st.inputsText.slice(1, -1))) { const p = literalPath(e); if (p && /\.m?js$/.test(p)) code.push(p) }
  const script = /node\s+([\w/.-]+\.m?js)/.exec(st.cmdText)?.[1]
  if (script) for (const base of [CARTO, ROOT]) if (existsSync(join(base, script))) { code.push(join(base, script)); break }
  return code
}
function declaredOf(inputsText) {
  const out = [], bad = []
  for (const m of inputsText.matchAll(/townRecordFor\(/g)) {
    const end = balanced(inputsText, m.index + 'townRecordFor'.length), args = splitTop(inputsText.slice(m.index + 'townRecordFor'.length + 1, end - 1))
    const list = /^\[([\s\S]*)\]$/.exec(args[1] || '')
    if (!list) { bad.push(`townRecordFor(${args.join(', ')}): its fields are not a literal list`); continue }
    for (const f of splitTop(list[1])) { const l = /^'([^']+)'$/.exec(f); if (l) out.push(l[1]); else bad.push(`townRecordFor: field ${f} is not a literal`) }
  }
  return { declared: out, bad }
}

// ── (B) the command line ──
// serve.js: a name's definition is its last `const <name> =` before the call site
function defBefore(s, name, at) {
  let best = -1
  for (const m of s.matchAll(new RegExp(`\\bconst\\s+${name}\\s*=`, 'g'))) if (m.index < at) best = m.index
  if (best < 0) return null
  const start = s.indexOf('=', best) + 1
  let j = start, d = 0, q = null
  for (; j < s.length; j++) {
    const c = s[j]
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue }
    if (c === "'" || c === '"' || c === '`') { q = c; continue }
    if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--
    else if (c === '\n' && d === 0) break
  }
  return s.slice(start, j).trim()
}
function serveArgv(serveSrc, st, ctx) {
  const s = stripComments(serveSrc), fails = []
  const IDENTITY = new Set(['id', 'bakeScene'])
  const inInputs = (w) => new RegExp(`(?<![\\w$])${w}(?![\\w$])`).test(st.inputsText)
  const isIdentity = (w, depth = 0) => {
    if (IDENTITY.has(w)) return true
    if (depth > 4) return false
    const def = defBefore(s, w, st.at)
    if (!def || !/^`[^`]*`$/.test(def)) return false
    return interpolations(def).every(e => identsOf(e).every(x => isIdentity(x, depth + 1)))
  }
  for (const expr of interpolations(st.cmdText)) {
    for (const w of identsOf(expr)) {
      if (isIdentity(w)) continue
      if (inInputs(w)) continue
      // a name its declared inputs are built from: `const LANDSCAPE_OBJ = join(REPO_ROOT, landscapeSource)`, LANDSCAPE_OBJ declared
      const viaInput = identsOf(st.inputsText).some(y => { const d = defBefore(s, y, st.at); return d && new RegExp(`(?<![\\w$])${w}(?![\\w$])`).test(d) })
      if (viaInput) continue
      // members of an object whose `.inputs` the step declares: each member value, for every registered town, must be one of those
      // inputs, an output the step names, or the town itself
      const def = defBefore(s, w, st.at) || ''
      const roots = [...new Set([...def.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]))].filter(r => new RegExp(`\\.\\.\\.${r}\\.inputs\\b`).test(st.inputsText))
      if (roots.length && ctx.memberCheck(s, st, w, def, roots, fails)) continue
      fails.push(`step "${st.label}": its command carries \${${w}} (from ${def ? def.slice(0, 80) : 'no definition found'}), which is neither its identity nor a recorded input`)
    }
  }
  return fails
}

// pourSteps.mjs: identity is the `scene` parameter; a destructured option (`{ elevation }`) is recorded only through
// pour-code.mjs#pourArgvReads; a value from a function (homeLookOf) only if the guard at the question calls the same function
function pourArgv(psSrc, pcSrc, pipelineSrc, serveSrc) {
  const s = stripComments(psSrc), fails = []
  const fnBody = (src, name) => { const i = src.indexOf(`export function ${name}(`); if (i < 0) return null; const b = src.indexOf('{', src.indexOf(')', i)); return src.slice(i, balanced(src, b)) }
  const argvParams = (() => { const b = fnBody(stripComments(pcSrc), 'pourArgvReads'); const m = b && /pourArgvReads\(\s*\{([^}]*)\}/.exec(b); return m ? m[1].split(',').map(x => x.trim()).filter(Boolean) : [] })()
  const recorded = /argvRead:\s*contentRecord\(pourArgvReads\(/.test(stripComments(pipelineSrc)) && /contentChanged\(lastPour\.argvRead,\s*pourArgvReads\(/.test(stripComments(serveSrc))
  const guard = fnBody(s, 'pourGuardRefusals') || ''
  for (const fn of ['pourSteps', 'skeletonStep']) {
    const body = fnBody(s, fn)
    if (!body) { fails.push(`pourSteps.mjs has no ${fn}(): the pour's commands cannot be read`); continue }
    const sig = body.slice(0, body.indexOf('{', body.indexOf(')')))
    const opts = /\{([^}]*)\}\s*\)\s*$/.exec(sig.replace(/\)\s*$/, ')'))?.[1]?.split(',').map(x => x.trim()) || []
    const localDef = (w) => { const m = new RegExp(`(?<![\\w$.])${w}\\s*=(?![=>])\\s*([^\\n]+)`).exec(body); return m ? m[1] : null }
    const resolve = (w, depth = 0) => {   // → { identity } | { option } | { fn } | null
      if (w === 'scene') return { identity: true }
      if (opts.includes(w)) return { option: w }
      if (depth > 4) return null
      const d = localDef(w)
      if (!d) return null
      const call = /(?<![\w$.])([A-Za-z_$][\w$]*)\(/.exec(stripStrings(d))
      const ids = identsOf(d.replace(/`[^`]*`/g, (t) => interpolations(t).join(' ')))
      const res = ids.filter(x => x !== w && x !== call?.[1]).map(x => resolve(x, depth + 1))
      if (call && !['join'].includes(call[1])) return { fn: call[1] }
      if (res.length && res.every(r => r?.identity)) return { identity: true }
      return res.find(r => r && !r.identity) || (res.length ? null : null)
    }
    for (const m of body.matchAll(/cmd:\s*`([^`]*)`/g)) {
      for (const expr of interpolations('`' + m[1] + '`')) {
        for (const w of identsOf(expr)) {
          const r = resolve(w)
          if (r?.identity) continue
          if (r?.option) { if (argvParams.includes(r.option) && recorded) continue
            fails.push(`pourSteps#${fn}: its command carries \${${w}}, the option '${r.option}', which pour-code.mjs#pourArgvReads does not record (or pipeline/the Bake do not stamp and compare argvRead)`); continue }
          if (r?.fn) { if (new RegExp(`(?<![\\w$.])${r.fn}\\(`).test(guard)) continue
            fails.push(`pourSteps#${fn}: its command carries \${${w}} from ${r.fn}(), which is not recorded and not read by the guard at the question (pourSteps.mjs#pourGuardRefusals)`); continue }
          fails.push(`pourSteps#${fn}: its command carries \${${w}}, which this check cannot resolve to an identity, a recorded option or a guarded source`)
        }
      }
    }
  }
  return fails
}

// ── the guards: placed where the town is acted on, and a dangling key refuses ──
function guardPlacement(serveSrc, psSrc) {
  const s = stripComments(serveSrc), fails = []
  const bakeGuard = s.search(/if \(!P\.plan\) \{ const (\w+) = pourGuardRefusals\(bakeScene\); if \(\1\.length\) throw /)
  const firstStep = s.indexOf("runIfDirty('skeleton'")
  if (bakeGuard < 0 || firstStep < 0 || bakeGuard > firstStep) fails.push('the Bake does not run pourGuardRefusals on every run (not on the plan) before its first step')
  const pub = s.search(/\/\^\\\/looks\\\/\(\[\^\/\]\+\)\\\/publish\$\//)
  const pubEnd = pub < 0 ? -1 : s.indexOf("if (req.method", pub + 10)
  const body = pub < 0 ? '' : s.slice(pub, pubEnd)
  const g = body.search(/pourGuardRefusals\(\w+, \{ requirePoured: true \}\)/), add = body.indexOf('git add')
  if (g < 0 || add < 0 || g > add || !/if \(\w+\.length\) throw new Error/.test(body.slice(g, g + 200))) fails.push('Publish does not refuse on pourGuardRefusals (requirePoured) before anything is committed or uploaded')
  const ps = stripComments(psSrc), gb = ps.slice(ps.indexOf('export function pourGuardRefusals('))
  if (!/authoringReKeys\(sk, sk, authoringOf\(scene\)/.test(gb) || !/mintInputsOf\(scene,/.test(gb)) fails.push('pourGuardRefusals does not run both guards (the join guard through mintInputsOf, the skeleton guard through authoringReKeys on the skeleton against itself)')
  return fails
}
// The dangling-key guard on a PLANTED skeleton (Zob, 2026-11-01): the check builds its own, so it runs in any checkout, data or
// none (a throwaway worktree has no clean/skeleton.json, and a guard this check cannot exercise is never a pass). Two chains
// crossing; one authored key on a chain that exists (it must come back SAME and refuse nothing: a guard that refuses every key
// is no guard) and one on a chain that does not (it must refuse as DANGLING). authoringReKeys is pure, so the fixture is the
// whole of what it reads; that pourGuardRefusals feeds it the scene's real skeleton and authoring is read by guardPlacement.
const FIXTURE_SKELETON = { streets: [
  { id: 'planted-east-west', osmIds: [1], highway: 'residential', points: [[-50, 0], [0, 0], [50, 0]] },
  { id: 'planted-north-south', osmIds: [2], highway: 'residential', points: [[0, -50], [0, 0], [0, 50]] },
] }
async function danglingRefuses(akTransform) {
  const AK = akTransform ? await importSource('cartograph/authoredKeys.mjs', { transform: akTransform }) : await import(pathToFileURL(join(CARTO, 'authoredKeys.mjs')).href)
  const sk = FIXTURE_SKELETON, HW = AK.highwayClasses()
  const A = { ids: new Map([['planted-east-west', ['the check\'s live key']], ['a-chain-that-does-not-exist', ['the check\'s planted key']]]), caps: new Map(), slots: new Map(), corners: [], notJudged: [] }
  const r = AK.authoringReKeys(sk, sk, A, HW), fails = []
  const live = r.rows.find(x => x.id === 'planted-east-west')
  if (live?.status !== 'SAME' || r.hits.some(h => /planted-east-west/.test(h))) fails.push(`a key on a chain the skeleton has does not come back SAME (${live?.status ?? 'no row'}): the guard refuses what it should keep`)
  if (!r.hits.some(h => /^DANGLING a-chain-that-does-not-exist/.test(h))) fails.push('a dangling authored key does not refuse (authoredKeys.mjs#authoringReKeys, on the planted skeleton against itself)')
  return { fails, line: `a dangling authored key, planted: ${fails.length ? 'NOT refused as it should be' : 'REFUSES'}; a live key: ${live?.status ?? 'no row'}` }
}

// ── the elevation agreement: Looks of one scene that disagree must throw naming both; agreement returns the value; none → false ──
function elevationFails(fn) {
  const D = { a: { pour: { elevation: true } }, b: { pour: {} }, c: {}, d: { pour: { elevation: true } } }, of = (id) => D[id], fails = []
  if (typeof fn !== 'function') return ['it is not exported']
  let threw = null
  try { fn('planted', ['a', 'b'], of) } catch (e) { threw = e.message }
  if (!threw) fails.push('two Looks disagreeing (a: true · b: unset) did not refuse — a value was picked')
  else if (!/\ba\b/.test(threw) || !/\bb\b/.test(threw)) fails.push(`the refusal does not name both Looks: ${threw.slice(0, 120)}`)
  try { if (fn('planted', ['a', 'd'], of) !== true || fn('planted', ['b', 'c'], of) !== false) fails.push('agreeing Looks do not return their one value') } catch (e) { fails.push(`agreeing Looks refused: ${e.message.slice(0, 120)}`) }
  try { if (fn('planted', [], of) !== false) fails.push('a scene with no Look does not read false (the neutral default)') } catch (e) { fails.push(`a scene with no Look refused: ${e.message.slice(0, 120)}`) }
  return fails
}

// ── the projection ──
function projectionFails(pick) {
  const h = (v) => createHash('sha1').update(JSON.stringify(v)).digest('hex'), fails = []
  const rec = { setPiece: { buildingId: 'b1', other: 1 }, branding: { title: 'A' } }
  const f = ['setPiece.buildingId']
  if (h(pick(rec, f)) !== h(pick({ ...rec, branding: { title: 'B' } }, f))) fails.push('an UNDECLARED field changed the projection')
  if (h(pick(rec, f)) === h(pick({ ...rec, setPiece: { buildingId: 'b2', other: 1 } }, f))) fails.push('a DECLARED field changed and the projection did not')
  if (h(pick({ branding: 1 }, f)) !== h(pick({ branding: 1 }, f)) || JSON.stringify(pick({ branding: 1 }, f)) !== JSON.stringify({ 'setPiece.buildingId': null })) fails.push('a declared field the record lacks does not hash the same on every run (absent must read null, stably)')
  if (h(pick(rec, ['*'])) === h(pick({ ...rec, branding: { title: 'B' } }, ['*']))) fails.push("'*' does not carry the whole record")
  return fails
}

// ── one run, on a set of sources (the mutants swap one) ──
async function verdict(m = {}) {
  const psRaw = read('cartograph/pourSteps.mjs'), serveSrc = m.serve ?? read('cartograph/serve.js'), psSrc = m.psSwap ? psRaw.replace(m.psSwap[0], m.psSwap[1]) : psRaw
  const pcSrc = m.pourCode ?? read('cartograph/pour-code.mjs'), pipelineSrc = read('cartograph/pipeline.js')
  const textOf = (abs) => m.files?.[relative(ROOT, abs)] ?? readFileSync(abs, 'utf8')
  const fails = [], unknown = [], rows = []
  const memo = new Map()
  const readsOf = (code) => {
    const paths = new Set(), unk = []
    for (const f of PC.importClosure(code, { stopAt: [PC.TOWN_REGISTRY] })) {
      if (!/\.m?js$/.test(f)) continue
      const key = f + (m.files?.[relative(ROOT, f)] ? ':m' : '')
      if (!memo.has(key)) memo.set(key, recordReads(textOf(f), f))
      const r = memo.get(key); r.paths.forEach(p => paths.add(`${p}@${relative(ROOT, f)}`)); unk.push(...r.unknown)
    }
    return { paths, unknown: unk }
  }
  const judge = (label, code, declared) => {
    const r = readsOf(code); unknown.push(...r.unknown.map(u => `step "${label}": ${u}`))
    const bad = [...r.paths].filter(pf => !covered(pf.split('@')[0], declared))
    for (const pf of bad) { const [p, f] = pf.split('@'); fails.push(`step "${label}" reads the town record's ${p === '' ? 'presence' : p === '*' ? 'WHOLE record' : `'${p}'`} (${f}) and declares ${declared.length ? declared.join(', ') : 'no record field'}`) }
    rows.push(`${label}: reads ${r.paths.size ? [...r.paths].map(pf => pf.split('@')[0] || '(presence)').join(', ') : 'nothing of the record'} · declares ${declared.length ? declared.join(', ') : 'nothing'}`)
  }
  // the serve.js steps
  const { steps, unknown: su, sites } = serveSteps(serveSrc)
  unknown.push(...su)
  if (steps.length + su.length !== sites) unknown.push(`serve.js has ${sites} runIfDirty call sites and ${steps.length + su.length} were read`)
  if (!steps.length) unknown.push('no runIfDirty step was found in serve.js: nothing was measured')
  const memberCheck = (s, st, w, def, roots, out) => {
    for (const r of roots) {
      const rdef = defBefore(s, r, st.at), call = rdef && /^([A-Za-z_$][\w$]*)\(bakeScene\)$/.exec(rdef.trim())
      if (!call) { out.push(`step "${st.label}": \${${w}} is built from ${r}, which this check cannot evaluate`); return true }
      const imp = new RegExp(`import\\s*\\{[^}]*\\b${call[1]}\\b[^}]*\\}\\s*from\\s*'([^']+)'`).exec(serveSrc)
      if (!imp) { out.push(`step "${st.label}": ${call[1]} is not imported by serve.js`); return true }
      ctx.pending.push((async () => {
        const mod = await import(pathToFileURL(join(CARTO, imp[1])).href)
        const members = [...new Set([...def.matchAll(new RegExp(`(?<![\\w$.])${r}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map(x => x[1]))]
        for (const map of REG.registeredMaps()) {
          let v; try { v = mod[call[1]](map) } catch (e) { out.push(`step "${st.label}": ${call[1]}(${map}) threw — ${e.message.split('\n')[0]}`); continue }
          if (!v) continue
          for (const mem of members) {
            if (new RegExp(`\\b${r}\\.${mem}\\b`).test(st.outputsText)) continue
            for (const val of [].concat(v[mem]).filter(Boolean)) if (!(v.inputs || []).includes(val) && val !== map) out.push(`step "${st.label}" (${map}): its command carries ${r}.${mem} = ${val}, which is not among ${r}.inputs, its outputs or its town`)
          }
        }
      })())
    }
    return true
  }
  const ctx = { memberCheck, pending: [] }
  for (const st of steps.filter(x => x.from === 'serve')) {
    const { declared, bad } = declaredOf(st.inputsText)
    unknown.push(...bad.map(b => `step "${st.label}": ${b}`))
    judge(st.label, serveStepCode(st), declared)
    fails.push(...serveArgv(serveSrc, st, ctx))
  }
  // the pour's steps, from pourSteps.mjs
  const P = m.psSwap ? await importSource('cartograph/pourSteps.mjs', { transform: (t) => t.replace(m.psSwap[0], m.psSwap[1]) }) : PS
  const paths = { raw: '/r', clean: '/c', boundary: '/b', geography: '/g', skeleton: '/s', overlay: '/o', map: '/m', measurements: '/me', centerlines: '/ce' }
  const town = REG.registeredMaps()[0]
  let pourList = []
  try { pourList = [...P.pourSteps(town, paths, '/rb', { elevation: false }), P.skeletonStep(town, paths)] } catch (e) { unknown.push(`pourSteps.mjs could not be called: ${e.message}`) }
  for (const st of pourList) {
    if (st.judge === 'mtime') { rows.push(`${st.label}: judged by mtime and its own map.json records (argv below)`); }
    const code = st.inputs.filter(f => typeof f === 'string' && /\.m?js$/.test(f))
    const script = /node\s+([\w/.-]+\.m?js)/.exec(st.cmd)?.[1]; if (script) code.push(join(CARTO, script))
    const declared = st.inputs.filter(f => f && typeof f === 'object' && Array.isArray(f.fields)).flatMap(f => f.fields)
    judge(st.label, code, declared)
  }
  fails.push(...pourArgv(psSrc, pcSrc, pipelineSrc, serveSrc))
  await Promise.all(ctx.pending)
  // the guards
  fails.push(...guardPlacement(serveSrc, psSrc))
  // the town's elevation: one agreed value across its Looks, or a refusal naming them (pourSteps.mjs#townPourElevation)
  fails.push(...elevationFails(P.townPourElevation).map(f => `the town's pour elevation (pourSteps.mjs#townPourElevation): ${f}`))
  // the projection
  const pick = m.pick ?? PS.pickRecord
  fails.push(...projectionFails(pick).map(f => `the record projection (pourSteps.mjs#pickRecord): ${f}`))
  // unjudged steps, by name
  const s = stripComments(serveSrc), unjudged = []
  for (const mm of s.matchAll(/\brunStep\(P,\s*'([^']+)',\s*`node\s+([\w/.-]+\.m?js)/g)) {
    const f = [CARTO, ROOT].map(b => join(b, mm[2])).find(existsSync)
    if (!f) continue
    const r = readsOf([f])
    if (r.paths.size) unjudged.push(`${mm[1]} (${mm[2]}) reads ${[...r.paths].map(pf => pf.split('@')[0] || '(presence)').join(', ')} — run unjudged, so it carries no key`)
  }
  return { fails, unknown, rows, unjudged }
}

// ── run ──
const base = await verdict()
const D = await danglingRefuses()
base.fails.push(...D.fails)
if (VERBOSE) for (const r of base.rows) console.log(`  ${r}`)
for (const u of base.unjudged) console.log(`  · unjudged: ${u}`)
console.log(`  ${D.line}`)
for (const u of base.unknown) console.log(`  ? ${u}`)
for (const f of base.fails) console.log(`  ✗ ${f}`)
console.log(base.unknown.length ? `⛔ NOT CHECKED — ${base.unknown.length} unknown(s): a read this check cannot parse is never a pass`
  : base.fails.length ? `❌ ${base.fails.length} input(s) shape a step and are not in its key` : `✅ every step keys the record fields and command-line values that shape it, and the guards run at Bake and Publish (${base.rows.length} steps)`)
let exit = base.unknown.length ? 2 : base.fails.length ? 1 : 0

if (process.argv.includes('--mutants')) {
  const had = new Set([...base.fails, ...base.unknown])
  const serve = read('cartograph/serve.js'), ps = read('cartograph/pourSteps.mjs'), pc = read('cartograph/pour-code.mjs')
  const swap = (text, a, b) => { if (text.split(a).length !== 2) return null; return text.replace(a, b) }
  const regImport = "import { instanceForMap } from '../src/instances/registry.js'\n"
  const MUTANTS = [
    ["bake-buildings' setPiece declaration deleted", { serve: swap(serve, "townRecordFor(bakeScene, ['setPiece.buildingId'])],   // the town's set-piece", "],   // the town's set-piece") }],
    ['an undeclared read in a skeleton script', { files: { 'cartograph/skeleton.js': regImport + 'const __branding = instanceForMap(process.argv[2])?.branding\n' + read('cartograph/skeleton.js') } }],
    ['the whole record spread in a step script', { files: { 'cartograph/bake-labels.js': regImport + 'const __all = { ...instanceForMap(process.argv[2]) }\n' + read('cartograph/bake-labels.js') } }],
    ['another registry export imported by a step script', { files: { 'cartograph/bake-labels.js': "import { registeredMaps } from '../src/instances/registry.js'\n" + read('cartograph/bake-labels.js') } }],
    ['a computed key under the declared field', { files: { 'cartograph/bake-buildings.js': swap(read('cartograph/bake-buildings.js'), 'instanceForMap(scene)?.setPiece?.buildingId', 'instanceForMap(scene)?.setPiece?.[process.argv[2]]') } }],
    ['the projection returns nothing', { pick: () => ({}) }],
    ['a runIfDirty call the parser cannot read', { serve: swap(serve, "await runIfDirty('buildings',", "await runIfDirty(lbl, someInputs, [], 'node x.js')\n        await runIfDirty('buildings',") }],
    ['--skip-elevation unrecorded (pourArgvReads names no option)', { pourCode: swap(pc, 'export function pourArgvReads({ elevation }) {', 'export function pourArgvReads({}) { const elevation = undefined;') }],
    ['the guard at the question no longer reads the home Look', { psSwap: ps.split('.streets, homeLookOf(scene))').length === 2 ? ['.streets, homeLookOf(scene))', '.streets, undefined)'] : null }],
    ['the elevation refusal deleted (a Look is picked)', { psSwap: ps.split("  if (new Set(vals.map(([, v]) => v)).size > 1) throw").length === 2 ? ["  if (new Set(vals.map(([, v]) => v)).size > 1) throw", '  if (false) throw'] : null }],
    ["Publish's guard removed", { serve: swap(serve, 'const guarded = pourGuardRefusals(pubScene, { requirePoured: true })', 'const guarded = []') }],
    ['the DANGLING refusal deleted (authoredKeys.mjs)', { ak: swap(read('cartograph/authoredKeys.mjs'), "if (!b) { row(id, 'DANGLING',", "if (!b) { continue; row(id, 'DANGLING',") && ((t) => t.replace("if (!b) { row(id, 'DANGLING',", "if (!b) { continue; row(id, 'DANGLING',")) }],
    ['the guard refuses every key (a live key reads as dangling)', { ak: swap(read('cartograph/authoredKeys.mjs'), 'const b = wb.get(id), a = wa.get(id)', 'const b = undefined, a = wa.get(id)') && ((t) => t.replace('const b = wb.get(id), a = wa.get(id)', 'const b = undefined, a = wa.get(id)')) }],
    ["the Bake's guard removed", { serve: swap(serve, 'if (!P.plan) { const g = pourGuardRefusals(bakeScene);', 'if (false) { const g = pourGuardRefusals(bakeScene);') }],
  ]
  let bad = 0
  for (const [name, mm] of MUTANTS) {
    if (Object.values(mm).some(v => v === null) || Object.values(mm.files || {}).some(v => v == null)) { console.log(`⚪ NOT APPLIED mutant: ${name} — its anchor is not in the source once; re-aim it`); bad++; continue }
    const r = mm.ak ? { fails: (await danglingRefuses(mm.ak)).fails, unknown: [] } : await verdict(mm)
    const fresh = [...r.fails, ...r.unknown].filter(f => !had.has(f))
    console.log(`${fresh.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${VERBOSE && fresh.length ? ` (${fresh[0].slice(0, 160)})` : ''}`)
    if (!fresh.length) bad++
  }
  if (bad && !exit) exit = 1
}
process.exit(exit)
