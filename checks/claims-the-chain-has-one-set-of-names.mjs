#!/usr/bin/env node
// claims-the-chain-has-one-set-of-names.mjs — DOES THE OPERATOR READ ONE SET OF NAMES FOR THE CHAIN, AND NO RETIRED ONE?
//
// ⭐ THE CLAIM (Sigil, 2026-11-01; Boz's rulings, Zob's co-sign; Jacob's chain names). Three functions, Stage · Preview ·
// Publish, holding twelve steps: Extent · Intake · Skeleton · Survey · Seal · Section · Foundry · Slab · Look · Preview ·
// Publish · Promote. Code identifiers, routes, CLI flags and file names keep their old words (names change for people,
// not in code). Five judges, each reading the source:
//   1 · THE SCREENS — every operator-visible string (JSX text and prose literals in the operator apps, ids, paths, flags,
//       `code` and ${…} stripped) carries no retired word: bake · re-bake · rebuild · pour · re-pour · the Data Wall ·
//       the Wall · shape freeze · soft/hard fetch · light/heavy pass · "Measure" as a label. (Arborist is out: the grove
//       keeps its own term, Boz's ruling.)
//   2 · THE CONVERTED STRINGS — "town"/"map" as the working object is a judgment, so only the strings this pass
//       converted to "scene" are held: none of them may return.
//   3 · EVERY STEP IN WORDS — every step id serve.js can emit (runIfDirty labels, plan `step:` literals) has an entry in
//       src/lib/stepWords.js, and no screen renders a raw plan step: a `.step` inside a rendered ${…} or {…} must go
//       through stepWords/stepList, and a list mapped from `.step` may not be joined into text.
//   4 · THE REQUESTS ARE UNCHANGED — the relabel kept every button's request: the Foundry button's
//       `runBake({ force: e.altKey })`, the banner's `runBake()`, BakeModal's `runBake({ ...resume, repour: true })`,
//       Extent's `repourAsk.resolve(true)`, Preview's `${API}/bake${confirmRepour ? '?repour=1' : ''}` and
//       `publishStaging(true)`, and api.js's `force=1`/`repour=1` query. A later relabel cannot quietly drop the consent.
//   5 · THE REGISTERS — the operator and marketer registers (prose: code spans, fences and link targets stripped) carry no
//       retired word, and no tracked file (live or Diary) points at the retired BAKE doc, now cartograph/FOUNDRY.md.
// ⭐ MUTANTS (--mutants), each must go RED: (a) a "Bake" button label → 1 · (b) a "re-pour" banner → 1 · (c) "the Wall" in
// OPERATIONS → 5 · (d) a raw step id rendered in a banner → 3 · (e) a new server step with no words → 3 · (f) "Measure"
// back as a tab label → 1 · (g) a converted "Choose a town" back → 2 · (h) the re-pour consent dropped from Preview → 4.
//   node checks/claims-the-chain-has-one-set-of-names.mjs [--mutants]
// Read-only. Exits 1 on any failing judge or any mutant left GREEN.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STEP_WORDS } from '../src/lib/stepWords.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const UI_DIRS = ['src/cartograph', 'src/preview', 'src/stage', 'src/meteorologist', 'src/street-furniture']
const REGISTERS = ['cartograph/OPERATIONS.md', 'cartograph/FEATURES.md', 'cartograph/README.md', 'README.md', 'cartograph/FOUNDRY.md',
  'cartograph/PREVIEW.md', 'cartograph/STAGE.md', 'ORIENTATION.md', 'INTAKE-CATALOGUE.md']

// ── reading the screens ──────────────────────────────────────────────────────
const walk = (d, o = []) => { for (const e of readdirSync(join(ROOT, d))) { const p = `${d}/${e}`; statSync(join(ROOT, p)).isDirectory() ? walk(p, o) : /\.(jsx?|mjs)$/.test(e) && o.push(p) } return o }
const uncomment = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length))
export function screenStrings(file, text) {
  const t = uncomment(text), out = [], at = (i) => t.slice(0, i).split('\n').length
  for (const m of t.matchAll(/(?<=[>}])([^<>{}]*[A-Za-z]{2,}[^<>{}]*)(?=[<{])/g)) if (!/[;=()&|?]|=>/.test(m[1]) && /[A-Za-z]{2,}/.test(m[1])) out.push([file, at(m.index), m[1].trim()])
  for (const m of t.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) if (/[A-Za-z]{2,}/.test(m[2]) && /\s/.test(m[2])) out.push([file, at(m.index), m[2]])
  // a template's ${…} can hold its own quoted text (`${x ? ' (re-run)' : ''}`): read those too
  for (const m of t.matchAll(/`((?:[^`\\]|\\.)*)`/g)) for (const q of m[1].matchAll(/'([^'\n]*[A-Za-z]{2,}[^'\n]*)'/g)) out.push([file, at(m.index), q[1]])
  return out
}
export function prose(t) {
  let s = t
  for (let i = 0; i < 4; i++) s = s.replace(/\$\{[^{}]*\}/g, ' ').replace(/\{[^{}]*\}/g, ' ')
  return s.replace(/`[^`]*`/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\S*\w=\S*/g, ' ').replace(/\S*\/\S*/g, ' ').replace(/\b[\w-]+\.(m?js|jsx|json|md|css|html|glb|png)\b/g, ' ')
    .replace(/(^|\s)--?[\w-]+(=\S*)?/g, ' ').replace(/\[[\w-]+\]/g, ' ').replace(/\b\w+\.\w+(\.\w+)*\b/g, ' ').replace(/\b[a-z]+[A-Z]\w*\b/g, ' ')
    .replace(/\b[a-z]+(-[a-z]+)+\b/gi, (m) => (/^re-(bak|pour)/i.test(m) ? m : ' '))
}
const RETIRED = [
  ['bake', /\b(re-?)?bak(e|es|ed|ing)\b/i], ['pour', /\b(re-?)?pour(s|ed|ing)?\b/i], ['rebuild', /\brebuil(d|ds|t|ding)\b/i],
  ['the Wall', /\b(the )?data ?wall\b|\bthe wall\b/i], ['shape freeze', /\bshape freeze\b/i],
  ['soft/hard fetch', /\b(soft|hard) fetch\b|\b(light|heavy) (pass|fetch)\b/i],
]
const MEASURE_LABEL = /label:\s*'Measure'/

function judgeScreens(files) {
  const why = []
  for (const [f, text] of files) {
    if (MEASURE_LABEL.test(uncomment(text))) why.push(`${f}: a tab is labelled "Measure" — it is Section`)
    for (const [file, line, s] of screenStrings(f, text)) {
      const p = prose(s)
      for (const [name, re] of RETIRED) if (re.test(p)) { why.push(`${file}:${line} says "${name}": ${s.slice(0, 90).replace(/\s+/g, ' ')}`); break }
    }
  }
  return why
}

// ── the converted strings ────────────────────────────────────────────────────
const CONVERTED = ["No map: the town's disc was refused.", "No map: the town's ribbons could not be read.", 'Choose a town', 'choose a town',
  'has no town — close the town to edit the kit default', "The town's authoring data failed to load", "save one image per slot into the town's slab",
  "Saved to this town's Look"]
function judgeConverted(files) {
  const why = []
  for (const [f, text] of files) for (const c of CONVERTED) if (uncomment(text).includes(c)) why.push(`${f} says "${c}" again — the working object is the scene`)
  return why
}

// ── every step in words ──────────────────────────────────────────────────────
export function serverStepIds(serve) {
  const ids = new Set()
  for (const m of serve.matchAll(/runIfDirty\(\s*'([a-z0-9-]+)'/g)) ids.add(m[1])
  for (const m of serve.matchAll(/\bstep:\s*'([a-z0-9-]+)'/g)) ids.add(m[1])
  return ids
}
function judgeSteps(serve, words, files) {
  const why = [], ids = serverStepIds(serve)
  if (ids.size < 10) why.push(`only ${ids.size} step ids read from serve.js — the reader is broken`)
  for (const id of ids) if (!(id in words)) why.push(`serve.js emits step "${id}" and src/lib/stepWords.js has no words for it`)
  for (const [f, text] of files) {
    const t = uncomment(text)
    for (const m of t.matchAll(/(\$\{|\{)([^{}]*?)\b(\w+)\.step\b(?!\s*[(=])([^{}]*)\}/g)) {
      const before = m[2]
      if (/\b(stepWords|stepList)\(\s*$/.test(before) || /[(,]\s*$/.test(before) || /\b\w+:\s*$/.test(before) || /\bstep=\{$/.test(t.slice(Math.max(0, m.index - 6), m.index + 1))) continue
      if (/\.map\(\s*\w+\s*=>\s*$/.test(before) && /\)\s*\)/.test(m[4]) ) continue
      if (/\.map\(\s*\w+\s*=>\s*$/.test(before) && !/^\)\s*\.join/.test(m[4].trim())) continue
      why.push(`${f}: renders a raw step id (${m[3]}.step) — say it through stepWords/stepList`)
    }
    for (const m of t.matchAll(/const (\w+) = [^\n]*\.map\(\s*\w+\s*=>\s*\w+\.step\s*\)/g)) {
      if (new RegExp(`\\$\\{\\s*${m[1]}\\.(slice|join)|\\{\\s*${m[1]}\\.(slice|join)`).test(t)) why.push(`${f}: joins the raw step ids in "${m[1]}" into text — use stepList`)
    }
  }
  return why
}

// ── the requests are unchanged ───────────────────────────────────────────────
const REQUESTS = [
  ['src/cartograph/Toolbar.jsx', 'onClick={(e) => runBake({ force: e.altKey })}', "the Foundry button's request (Option-click = force)"],
  ['src/cartograph/StatusBar.jsx', 'onClick={() => runBake()}', "the banner's Foundry request"],
  ['src/cartograph/BakeModal.jsx', 'runBake({ ...resume, repour: true })', "BakeModal's run-every-step consent"],
  ['src/cartograph/ExtentApp.jsx', 'onClick={() => repourAsk.resolve(true)}', "Extent's run-every-step consent"],
  ['src/preview/PreviewApp.jsx', "`${API}/bake${confirmRepour ? '?repour=1' : ''}`", "Preview's Foundry request and its consent"],
  ['src/preview/PreviewApp.jsx', 'onClick={() => publishStaging(true)}', "Preview's run-every-step-and-publish consent"],
  ['src/cartograph/api.js', "[force && 'force=1', repour && 'repour=1']", "api.js's force/repour query"],
]
function judgeRequests(texts) {
  const why = []
  for (const [f, needle, what] of REQUESTS) if (!uncomment(texts[f] ?? '').includes(needle)) why.push(`${f}: ${what} is no longer \`${needle}\` — a relabel must not change what a button sends`)
  return why
}

// ── the registers ────────────────────────────────────────────────────────────
export function docProse(md) {
  return md.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ').replace(/\]\([^)]*\)/g, '] ').replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[\w-]+\.(m?js|jsx|json|md|css|html)\b/g, ' ').replace(/§\s*[\d.]+\s*\([^)]*\)/g, ' ')
}
// ⭐ Words the registers may still say: the Arborist's grove bake (its own term, Boz's ruling) and Layer 0's product metaphor
// ("the kit pours neighbourhoods", "a fresh pour", "a poured scene"). Only these, by shape, never by line.
const DOC_RETIRED = [
  ['bake', /\b(re-?)?bak(e|es|ed|ing)\b/gi, (ctx) => /grove|arborist|impostor|atlas|specimen|species|older canon/i.test(ctx)],
  ['re-pour', /\bre-?pour(s|ed|ing)?\b/gi, () => false],
  ['the Wall', /\bData ?Wall\b|\b[Tt]he Wall\b|⟦(THE )?WALL⟧/g, (ctx) => /older canon/i.test(ctx)],
  ['soft/hard fetch', /\b(soft|hard) fetch\b|\b(light|heavy) (pass|fetch)\b/gi, (ctx) => /older canon/i.test(ctx)],
  ['(was Measure)', /\(was Measure\)/g, () => false],
]
function judgeRegisters(docs, bakePointers) {
  const why = []
  for (const [f, md] of docs) {
    const p = docProse(md)
    for (const [name, re, allowed] of DOC_RETIRED) for (const m of p.matchAll(re)) {
      const ctx = p.slice(Math.max(0, m.index - 80), m.index + 80), line = p.slice(p.lastIndexOf('\n', m.index) + 1, (p.indexOf('\n', m.index) + 1 || p.length + 1) - 1)
      if (!allowed(ctx) && !/older canon/i.test(line)) { why.push(`${f}:${p.slice(0, m.index).split('\n').length} says "${m[0]}" (${name}): …${ctx.replace(/\s+/g, ' ').slice(40, 130)}…`) }
    }
  }
  for (const l of bakePointers) why.push(`${l} — points at cartograph/BAKE.md, which is FOUNDRY.md`)
  return why
}

// ── run ──────────────────────────────────────────────────────────────────────
const uiFiles = UI_DIRS.flatMap((d) => walk(d)).map((f) => [f, read(f)])
const texts = Object.fromEntries(uiFiles)
texts['src/cartograph/api.js'] ??= read('src/cartograph/api.js')
const serve = read('cartograph/serve.js')
const docs = REGISTERS.map((f) => [f, read(f)])
// git grep exits 1 when it finds nothing, which is the answer wanted here.
let bakePointers = []
// Every tracked file, but this check and the tier records, which quote the command (Zob, 2026-11-01).
const QUOTES_IT = new Set(['checks/claims-the-chain-has-one-set-of-names.mjs', 'checks/TIERS.json', 'checks/README.md'])
try { bakePointers = execSync('git grep -n -F BAKE.md', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter((l) => !QUOTES_IT.has(l.split(':')[0]) && /(^|[^A-Za-z])BAKE\.md/.test(l.replace(/^[^:]+:\d+:/, ''))) } catch (e) { if (e.status !== 1) throw e }

const JUDGES = [
  [1, 'the screens say no retired word', () => judgeScreens(uiFiles)],
  [2, 'no converted town/map string returns', () => judgeConverted(uiFiles)],
  [3, 'every step is said in words', () => judgeSteps(serve, STEP_WORDS, uiFiles)],
  [4, 'every button sends what it sent', () => judgeRequests(texts)],
  [5, 'the registers say no retired word', () => judgeRegisters(docs, bakePointers)],
]
let bad = 0
console.log(`\nThe chain has one set of names (${uiFiles.length} UI files, ${docs.length} registers)`)
for (const [k, name, run] of JUDGES) {
  const why = run()
  if (why.length) { bad++; console.log(`  ⛔ ${k} · ${name} (${why.length})`); for (const w of why.slice(0, 40)) console.log(`       ${w}`); if (why.length > 40) console.log(`       … +${why.length - 40}`) }
  else console.log(`  ✅ ${k} · ${name}`)
}

if (process.argv.includes('--mutants')) {
  const swap = (f, a, b) => uiFiles.map(([p, t]) => [p, p === f ? t.replace(a, b) : t])
  const MUTANTS = [
    ['a · a "Bake" button label', 1, () => judgeScreens(swap('src/cartograph/StatusBar.jsx', '>Run the Foundry</button>', '>Bake</button>'))],
    ['b · a "re-pour" banner', 1, () => judgeScreens(swap('src/cartograph/StatusBar.jsx', "' (every step re-runs)'", "' (re-pour)'"))],
    ['c · "the Wall" in OPERATIONS', 5, () => judgeRegisters(docs.map(([f, m]) => [f, f === 'cartograph/OPERATIONS.md' ? m + '\nThe Wall holds the shape.\n' : m]), [])],
    ['d · a raw step id in a banner', 3, () => judgeSteps(serve, STEP_WORDS, swap('src/cartograph/StatusBar.jsx', '${stepList(steps)}', "${steps.join(', ')}").map(([p, t]) => [p, p === 'src/cartograph/StatusBar.jsx' ? t.replace('${stepWords(s.step)}', '${s.step}') : t]))],
    ['e · a new server step with no words', 3, () => judgeSteps(serve + "\nawait runIfDirty('sky-dome', [], [], 'x')\n", STEP_WORDS, uiFiles)],
    ['f · "Measure" back as a tab label', 1, () => judgeScreens(swap('src/cartograph/Panel.jsx', "label: 'Section' }", "label: 'Measure' }"))],
    ['g · a converted "Choose a town" back', 2, () => judgeConverted(swap('src/cartograph/Toolbar.jsx', 'Choose a scene', 'Choose a town'))],
    ['h · the re-pour consent dropped from Preview', 4, () => judgeRequests({ ...texts, 'src/preview/PreviewApp.jsx': texts['src/preview/PreviewApp.jsx'].replace("${confirmRepour ? '?repour=1' : ''}", '') })],
  ]
  console.log('\n  mutants:')
  for (const [name, judge, run] of MUTANTS) {
    const r = run()
    if (r.length) console.log(`    ✅ RED   ${name} → ${judge}: ${r[0].slice(0, 110)}`)
    else { bad++; console.log(`    ⛔ GREEN ${name} → ${judge} did not catch it`) }
  }
}
process.exit(bad ? 1 : 0)
