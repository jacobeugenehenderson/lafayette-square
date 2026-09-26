#!/usr/bin/env node
// CLAIM — EVERY FILE A BAKE STEP READS IS IN THAT STEP'S `runIfDirty` INPUT LIST.
//
// `runIfDirty(label, INPUTS, OUTPUTS, cmd)` (cartograph/serve.js) skips a step when its outputs are newer than its
// inputs, so a file a step READS but does not LIST can never make it re-run. Huron acquired elevation, baked terrain,
// and its 3,678 buildings stayed at y = 0 under 24 m of ground: `buildings` read the terrain and did not declare it
// (docs/briefs/BRIEF-dirty-graph-declares-what-it-reads.md). `ground` declared it, which is why this is a class.
//
// READS BOTH SIDES, RESTATES NEITHER:
//   · DECLARED — each runIfDirty call's input array, parsed out of serve.js; identifiers resolved through their
//     `const X = …` definitions and `mapDataPaths`'s keys, `importClosure([...])` evaluated on the live tree.
//   · READ — the step's script (from its `node <script>` command): (a) CODE, its import closure; (b) DATA, every
//     data-file name that appears as a string literal in that closure (comments stripped), matched by basename.
//     A name the step itself WRITES (its outputs) is not a read.
// ⛔ WHERE IT CANNOT TELL, IT SAYS UNKNOWN AND NAMES THE STEP — a declared input it cannot resolve statically
// (`...treeInputs.inputs`), or a script it cannot find. UNKNOWN is not a pass: exit 2.
// ⚠️ The data side is a NAME match: a literal names a file the script can open, on some branch. It cannot see a path
// built at runtime, and it counts a literal on a branch this town never takes. So a gap is a question with a
// line to read, not a verdict; the list is the audit.
//
//   node checks/claims-a-bake-step-declares-what-it-reads.mjs [--serve=path] [--step=label] [-v]
//
// MUTATION (must go red, naming `ground`): remove SCENE_TERRAIN_JSON from ground's input list, via --serve.
import { readFileSync, existsSync } from 'node:fs'
import { join, basename, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const verbose = process.argv.includes('-v')
const src = readFileSync(arg('serve') || join(ROOT, 'cartograph/serve.js'), 'utf8')
const pc = await import(pathToFileURL(join(ROOT, 'cartograph/pour-code.mjs')).href)
const { importClosure } = pc
const CARTO = join(ROOT, 'cartograph')
const DATA_EXT = 'json|bin|tif|tiff|png|jpg|csv|txt|geojson|obj|glb|ktx2'

// ── small parser: balanced slice from an opening bracket, and top-level comma split ──
function balanced(s, i) {                        // s[i] is ( [ or { → index after its match
  const open = s[i], close = { '(': ')', '[': ']', '{': '}' }[open]; let d = 0, q = null
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue }
    if (c === "'" || c === '"' || c === '`') { q = c; continue }
    if (c === '/' && s[j + 1] === '/') { j = s.indexOf('\n', j); continue }
    if (c === open) d++
    else if (c === close && --d === 0) return j + 1
  }
  return -1
}
function splitTop(s) {
  const out = []; let d = 0, q = null, cur = ''
  for (let j = 0; j < s.length; j++) {
    const c = s[j]
    if (q) { cur += c; if (c === '\\') { cur += s[++j] } else if (c === q) q = null; continue }
    if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue }
    if (c === '/' && s[j + 1] === '/') { const e = s.indexOf('\n', j); j = e < 0 ? s.length : e; continue }
    if ('([{'.includes(c)) d++
    if (')]}'.includes(c)) d--
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = '' } else cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')

// ── the DECLARED side: resolve an input expression to { names:Set<basename>, code:Set<abs path>, unknown:[] } ──
const constDef = (id) => {
  const m = src.match(new RegExp(`\\bconst\\s+${id}\\s*=\\s*`)); if (!m) return null
  const i = m.index + m[0].length
  if (src[i] === '[') return src.slice(i, balanced(src, i))                  // a multi-line array (RAW_PATHS)
  return src.slice(i, src.indexOf('\n', i)).replace(/\/\/.*$/, '').trim()
}
const mdp = (() => { const a = src.indexOf('function mapDataPaths'), b = src.indexOf('return {', a), e = balanced(src, src.indexOf('{', b)); return src.slice(src.indexOf('{', b) + 1, e - 1) })()
const mdpKey = (k) => { const m = mdp.match(new RegExp(`\\b${k}\\s*:\\s*([^\\n]+)`)); return m ? m[1].replace(/,\s*(\/\/.*)?$/, '').trim() : null }
function resolve(expr, acc, depth = 0) {
  expr = expr.trim()
  if (depth > 8) { acc.unknown.push(expr); return }
  if (expr.startsWith('...importClosure(') || expr.startsWith('importClosure(')) {
    const lits = [...expr.matchAll(/join\(\s*(here|REPO_ROOT)\s*,\s*((?:'[^']*'\s*,?\s*)+)\)/g)]
    if (!lits.length) { acc.unknown.push(expr); return }
    const entries = lits.map(m => join(m[1] === 'here' ? CARTO : ROOT, ...[...m[2].matchAll(/'([^']*)'/g)].map(x => x[1])))
    for (const f of importClosure(entries)) acc.code.add(f)
    return
  }
  const spc = expr.match(/^\.\.\.(\w+)$/)
  if (spc && constDef(spc[1])?.startsWith('[')) { resolve(constDef(spc[1]), acc, depth + 1); return }
  if (expr.startsWith('...')) { acc.unknown.push(expr); return }
  const tern = expr.match(/^existsSync\((\w+)\)\s*\?\s*(\w+)\s*:\s*(\w+)$/)
  if (tern) { resolve(tern[2], acc, depth + 1); resolve(tern[3], acc, depth + 1); return }
  if (expr.startsWith('[')) { for (const e of splitTop(expr.slice(1, -1))) resolve(e, acc, depth + 1); return }
  const j = expr.match(/^join\(([\s\S]*)\)$/)
  if (j) {
    const parts = splitTop(j[1]), last = parts.at(-1), base = parts[0]
    const lit = last.match(/^'([^']*)'$/)
    if (!lit) { acc.unknown.push(expr); return }
    const name = basename(lit[1])
    if (/\.(m?js)$/.test(name)) {
      const abs = join(base === 'REPO_ROOT' ? ROOT : base === 'here' ? CARTO : null ?? '', ...parts.slice(1).map(p => (p.match(/^'([^']*)'$/) || [])[1]).filter(Boolean))
      if (base === 'here' || base === 'REPO_ROOT') acc.code.add(abs); else acc.names.add(name)
    } else acc.names.add(name)
    return
  }
  const bp = expr.match(/^bakePaths\.(\w+)$/)
  if (bp) { const d = mdpKey(bp[1]); if (d) resolve(d, acc, depth + 1); else acc.unknown.push(expr); return }
  if (/^\w+$/.test(expr)) { const d = constDef(expr); if (d) resolve(d, acc, depth + 1); else acc.unknown.push(expr); return }
  acc.unknown.push(expr)
}

// ── the steps ──
const steps = []
for (const m of src.matchAll(/runIfDirty\(\s*'([^']+)'\s*,/g)) {
  const open = src.indexOf('(', m.index), end = balanced(src, open)
  const args = splitTop(src.slice(open + 1, end - 1))
  const [, inputs, outputs, cmd] = args
  if (!inputs?.startsWith('[') && !/^\w+$/.test(inputs || '')) continue   // the definition `runIfDirty = async (label, inputs…`
  const arr = (a) => a.startsWith('[') ? splitTop(a.slice(1, -1)) : [a]
  const decl = { names: new Set(), code: new Set(), unknown: [] }
  for (const e of arr(inputs)) resolve(e, decl)
  const outs = { names: new Set(), code: new Set(), unknown: [] }
  for (const e of arr(outputs)) resolve(e, outs)
  const sm = cmd?.match(/node\s+((?:arborist\/)?[\w.-]+\.m?js)/)
  const script = sm ? join(sm[1].startsWith('arborist/') ? ROOT : CARTO, sm[1]) : null
  steps.push({ label: m[1], decl, outs, script, line: src.slice(0, m.index).split('\n').length })
}
if (!steps.length) { console.log('⛔ NOT CHECKED — no runIfDirty steps parsed out of serve.js'); process.exit(2) }

// ── the READ side, and the comparison ──
const only = arg('step')
let gaps = 0, unknowns = 0
const rows = []
for (const st of steps) {
  if (only && st.label !== only) continue
  const row = { label: st.label, line: st.line, code: [], data: [], unknown: [...st.decl.unknown] }
  if (!st.script || !existsSync(st.script)) { row.unknown.push(`script not found (${st.script ?? 'no node command'})`); rows.push(row); unknowns++; continue }
  const closure = importClosure([st.script])
  // ⭐ The POUR is judged by content, not by this list: map.json records the code it ran (`codeRead`, over
  // `pourCodeClosure()`), the geography (`geographyRead`) and the registry entries (`registryRead`), and serve.js
  // compares all three before the pipeline step (pour-code.mjs). Credited only when serve.js actually calls them.
  if (st.script === pc.POUR_ENTRY && /pourCodeChanged\(/.test(src) && /geographyReadChanged\(/.test(src) && /registryReadChanged\(/.test(src)) {
    for (const f of importClosure([pc.POUR_ENTRY])) st.decl.code.add(f)       // town modules: read only as geographyRead
    st.decl.names.add('geography.json'); st.decl.names.add('registry.json')
  }
  row.code = closure.filter(f => !st.decl.code.has(f)).map(f => relative(ROOT, f))
  const declNames = new Set([...st.decl.names, ...[...st.decl.code].map(f => basename(f))])
  const outNames = st.outs.names
  const seen = new Map()                   // basename → first file that names it
  const rx = new RegExp(`['"\`]([^'"\`\\n]*?\\.(?:${DATA_EXT}))['"\`]`, 'g')
  for (const f of closure) {
    let s; try { s = stripComments(readFileSync(f, 'utf8')) } catch { continue }
    for (const mm of s.matchAll(rx)) {
      const name = basename(mm[1].replace(/\$\{[^}]*\}/g, '*'))
      if (!name || name.includes('*') || declNames.has(name) || outNames.has(name) || seen.has(name)) continue
      seen.set(name, relative(ROOT, f))
    }
  }
  row.data = [...seen].map(([n, f]) => `${n}  (named in ${f})`)
  if (row.code.length || row.data.length) gaps++
  if (row.unknown.length) unknowns++
  rows.push(row)
}

const nGap = rows.reduce((a, r) => a + r.code.length + r.data.length, 0)
console.log(`── bake steps ── ${rows.length} runIfDirty step(s) · ${gaps} with an undeclared read (${nGap} file(s)) · ${unknowns} UNKNOWN`)
for (const r of rows) {
  const bad = r.code.length + r.data.length
  if (!bad && !r.unknown.length && !verbose) continue
  console.log(`\n${bad ? '⛔' : r.unknown.length ? '❔' : '✅'} ${r.label}  (serve.js:${r.line})`)
  for (const c of r.code) console.log(`   code  ${c}`)
  for (const d of r.data) console.log(`   data  ${d}`)
  for (const u of r.unknown) console.log(`   UNKNOWN  ${u}`)
}
if (gaps) console.log(`\n⛔ ${gaps} step(s) read a file they do not declare — an input that arrives late will never re-run them.`)
else if (unknowns) console.log(`\n❔ No undeclared read found, but ${unknowns} step(s) could not be fully resolved — NOT a pass.`)
else console.log('\n✅ Every bake step declares every file it reads.')
process.exit(gaps ? 1 : unknowns ? 2 : 0)
