#!/usr/bin/env node
/**
 * THE KIT'S RENDERER-FREE DOOR LOADS NO RENDERER (Boz's assignment, Zob's ruling, 2026-11-02).
 *
 * An app's 2D module (a place card, a list, the almanac) that needs one of the kit's pure utilities (frameSlices, glyphInk,
 * kitUrl, …) imports it from the kit's renderer-free public entry, ENTRY below, not from Town.jsx, whose graph is the whole 3D
 * kit. Membership is WRITTEN in the entry and JUDGED here; this check never
 * computes or writes it. Claims, each driven:
 *   ① the entry's import graph reaches no renderer. Followed: static `import … from`, `export … from`, `export * from`, bare
 *      `import 'x'`, and literal dynamic `import('x')`; a non-literal `import(…)` cannot be judged and is RED. A RENDERER is
 *      three, @react-three/*, react-dom, or any bare package whose own package.json dependencies + peerDependencies closure
 *      reaches one of them (so drei, postprocessing and three-stdlib are caught with no list). A kit file is never listed: it
 *      is judged by what it imports. A package (or a required dependency of one) installed nowhere Node would look CANNOT BE
 *      JUDGED and is RED, never renderer-free; an optional dependency or peer is judged when installed and skipped when not
 *      (it cannot load). Comments are stripped by a scanner that keeps strings, templates and regex literals.
 *   ② (LIVE, its own check, since loading through vite is live tier: checks/claims-the-pure-entry-loads-without-a-browser.mjs)
 *      the entry loads as an app's 2D module is loaded, vite SSR with no window: a utility that touches a browser global at
 *      load fails there even with no renderer in its graph, and no static read decides it.
 *   ③ ONE DOOR PER NAME: Town.jsx re-exports from the entry, and never re-exports again from a file the entry re-exports from
 *      (by `export … from` or by import-then-export)
 *      (two doors to one lib invite two import paths, and the one-instance guarantee rests on one module URL).
 *   ④ the entry re-exports something.
 * REPORTED, not failed: a Town.jsx re-export whose own graph is renderer-free but which the entry does not carry. Renderer-free
 * is not import-safe (slabUrl.js: bakedUrl reads the page at load under a runtime build), so the report proposes nothing;
 * the live check decides, with the lib in the door. Which names go in is the entry author's call.
 * ANCHORED every run on this repo's real files: Town.jsx's own graph must be judged to reach three, the installed postprocessing
 * to reach it by its peer, and the installed zustand (optional peers only) to be renderer-free.
 * Usage: node checks/claims-the-pure-entry-loads-no-renderer.mjs [--mutants]
 *   --mutants: planted graphs, each must be RED.
 */
import { readFileSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY_REL = 'src/components/TownPure.js'
const TOWN_REL = 'src/components/Town.jsx'
const RENDERER = (pkg) => pkg === 'three' || pkg === 'react-dom' || pkg.startsWith('@react-three/')
const EXTS = ['', '.js', '.jsx', '.mjs', '/index.js', '/index.jsx']

/** Comments out, strings, templates and regex literals KEPT (so a `//` in 'https://…' or a `/*` in a string never eats code,
 *  Fuse's item 3). A scanner, not a regex: '…' "…" `…${ code }…` and /re/ are walked; a comment becomes spaces (newlines kept).
 *  A `/` opens a regex after an operator, a keyword-free punctuation or the start; elsewhere it is division. */
export function stripComments(src) {
  let out = '', i = 0
  const n = src.length, tpl = []          // tpl: brace depth inside each open template's ${ … }
  const prevSig = () => { for (let j = out.length - 1; j >= 0; j--) if (!/\s/.test(out[j])) return out[j]; return '' }
  while (i < n) {
    const c = src[i], d = src[i + 1]
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++ } continue }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2), stop = e < 0 ? n : e + 2; for (; i < stop; i++) out += src[i] === '\n' ? '\n' : ' '; continue }
    if (c === "'" || c === '"') { let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1; out += src.slice(i, j + 1); i = j + 1; continue }
    if (c === '`' || (c === '}' && tpl.length && tpl[tpl.length - 1] === 0)) {
      if (c === '}') tpl.pop()
      let j = i + 1
      while (j < n && src[j] !== '`' && !(src[j] === '$' && src[j + 1] === '{')) j += src[j] === '\\' ? 2 : 1
      if (src[j] === '$') { tpl.push(0); out += src.slice(i, j + 2); i = j + 2 } else { out += src.slice(i, j + 1); i = j + 1 }
      continue
    }
    if (tpl.length && c === '{') tpl[tpl.length - 1]++
    if (tpl.length && c === '}') tpl[tpl.length - 1]--
    if (c === '/' && (prevSig() === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prevSig()) || /\b(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/.test(out.trimEnd()))) {
      let j = i + 1, cls = false
      while (j < n && src[j] !== '\n' && (cls || src[j] !== '/')) { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; j++ }
      out += src.slice(i, j + 1); i = j + 1; continue
    }
    out += c; i++
  }
  return out
}
/** Every import edge of a module's text: { spec, kind: 'static' | 'reexport' | 'dynamic' } or { kind: 'opaque', text }. */
export function edgesOf(text) {
  const t = stripComments(text), out = []
  for (const m of t.matchAll(/(?:^|[;\n}])\s*(import|export)\b([^;'"`]*?)\bfrom\s*['"]([^'"]+)['"]/g)) out.push({ spec: m[3], kind: m[1] === 'export' ? 'reexport' : 'static' })
  for (const m of t.matchAll(/(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)) out.push({ spec: m[1], kind: 'static' })
  for (const m of t.matchAll(/\bimport\s*\(\s*([^)]*?)\s*\)/g)) {
    const lit = m[1].match(/^(['"])([^'"`]+)\1$/)
    out.push(lit ? { spec: lit[2], kind: 'dynamic' } : { kind: 'opaque', text: m[0] })
  }
  return out
}
/** ⭐ IMPORT-THEN-EXPORT (Fuse's item 4): `import { a as b } from './x.js'` + `export { b }` (or `export default b`, or a
 *  namespace `import * as ns` + `export { ns }`) is a re-export of './x.js' as surely as `export { a } from`. */
export function localReexports(text) {
  const t = stripComments(text), local = new Map(), out = new Set()
  for (const m of t.matchAll(/(?:^|[;\n}])\s*import\s+([^;'"`]*?)\s+from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[1], spec = m[2]
    const def = clause.match(/^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/); if (def) local.set(def[1], spec)
    const ns = clause.match(/\*\s*as\s+([A-Za-z_$][\w$]*)/); if (ns) local.set(ns[1], spec)
    const br = clause.match(/\{([^}]*)\}/)
    if (br) for (const part of br[1].split(',')) { const nm = part.trim().match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/); if (nm) local.set(nm[2] || nm[1], spec) }
  }
  for (const m of t.matchAll(/(?:^|[;\n}])\s*export\s*\{([^}]*)\}(?!\s*from)/g))
    for (const part of m[1].split(',')) { const nm = part.trim().match(/^([\w$]+)/); if (nm && local.has(nm[1])) out.add(local.get(nm[1])) }
  for (const m of t.matchAll(/(?:^|[;\n}])\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*(?:;|\n|$)/g)) if (local.has(m[1])) out.add(local.get(m[1]))
  return [...out]
}
const pkgOf = (spec) => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]

/** A package's manifest as Node finds it from `fromDir`: `<d>/node_modules/<pkg>` for d = fromDir and EVERY parent, to the
 *  filesystem root. ⛔ Never stopped at the repo root: a worktree's own node_modules may lack a package that the main
 *  checkout's, directories above, holds (integration's layout, measured by Boz 2026-11-02, when this stopped at ROOT and called
 *  zustand "installed nowhere"). `fs` is { exists, read } so the layout itself is planted in the self-test.
 *  → { dir, required: [...], optional: [...] }, or null when no directory up the chain holds it. */
export function manifestIn(fs, pkg, fromDir) {
  for (let d = fromDir; ; d = dirname(d)) {
    const f = resolve(d, 'node_modules', pkg, 'package.json')
    if (fs.exists(f)) {
      const j = JSON.parse(fs.read(f)), meta = j.peerDependenciesMeta || {}
      const peers = Object.keys(j.peerDependencies || {})
      return { dir: dirname(f), required: [...Object.keys(j.dependencies || {}), ...peers.filter(p => !meta[p]?.optional)],
        optional: [...Object.keys(j.optionalDependencies || {}), ...peers.filter(p => meta[p]?.optional)] }
    }
    if (d === dirname(d)) return null
  }
}

/** The real world: repo files and node_modules package manifests. A planted world replaces both. */
const REAL = {
  rootDir: ROOT,
  read: (abs) => readFileSync(abs, 'utf8'),
  resolve(fromAbs, spec) {
    const base = resolve(dirname(fromAbs), spec.split('?')[0])
    for (const e of EXTS) { const p = base + e; if (existsSync(p) && statSync(p).isFile()) return p }
    return null
  },
  manifest: (pkg, fromDir = ROOT) => manifestIn({ exists: existsSync, read: (f) => readFileSync(f, 'utf8') }, pkg, fromDir),
}

/** Does a bare package reach a renderer through its manifest closure? → { renderer: chain } · { unjudged: chain } (a required
 *  package installed nowhere Node would look: ⛔ never read as renderer-free, Fuse's item 1) · null (renderer-free). An
 *  OPTIONAL dependency or peer that is not installed cannot be loaded, so it cannot reach anything; one that is, is judged. */
export function rendererChain(world, pkg, fromDir, seen = new Set()) {
  if (RENDERER(pkg)) return { renderer: [pkg] }
  const key = `${fromDir}|${pkg}`
  if (seen.has(key)) return null
  seen.add(key)
  const m = world.manifest(pkg, fromDir)
  if (!m) return { unjudged: [pkg] }
  for (const [d, optional] of [...m.required.map(d => [d, false]), ...m.optional.map(d => [d, true])]) {
    if (optional && !RENDERER(d) && !world.manifest(d, m.dir)) continue
    const c = rendererChain(world, d, m.dir, seen)
    if (c?.renderer) return { renderer: [pkg, ...c.renderer] }
    if (c?.unjudged) return { unjudged: [pkg, ...c.unjudged] }
  }
  return null
}

/** ① Walk a module's graph; every way it reaches a renderer, or cannot be judged, is a finding naming the path. */
export function graphFindings(world, entryAbs, name = (p) => relative(ROOT, p)) {
  const out = [], seen = new Set(), stack = [[entryAbs, [name(entryAbs)]]]
  while (stack.length) {
    const [f, path] = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    let text
    try { text = world.read(f) } catch (e) { out.push(`${path.join(' → ')}: cannot be read (${e.message})`); continue }
    for (const e of edgesOf(text)) {
      if (e.kind === 'opaque') { out.push(`${path.join(' → ')}: ${e.text} names no literal module, so its graph cannot be judged`); continue }
      if (e.spec.startsWith('node:')) continue
      if (e.spec.startsWith('.') || e.spec.startsWith('/')) {
        const to = world.resolve(f, e.spec)
        if (!to) { out.push(`${path.join(' → ')}: '${e.spec}' resolves to no file`); continue }
        if (/\.json$/.test(to)) continue
        stack.push([to, [...path, name(to)]])
        continue
      }
      const r = rendererChain(world, pkgOf(e.spec), world.rootDir)
      const dyn = e.kind === 'dynamic' ? ' [dynamic import]' : ''
      if (r?.renderer) out.push(`${path.join(' → ')} → '${e.spec}'${r.renderer.length > 1 ? ` (${r.renderer.join(' → ')})` : ''}${dyn}: a renderer`)
      if (r?.unjudged) out.push(`${path.join(' → ')} → '${e.spec}' (${r.unjudged.join(' → ')})${dyn}: ${r.unjudged.at(-1)} is installed nowhere Node would look, so its graph cannot be judged`)
    }
  }
  return out
}

/** The files a module re-exports from (resolved), for the one-door rule. */
const reexportsOf = (world, abs) => {
  const text = world.read(abs)
  const specs = [...edgesOf(text).filter(e => e.kind === 'reexport').map(e => e.spec), ...localReexports(text)]
  return [...new Set(specs.filter(s => s.startsWith('.')).map(s => world.resolve(abs, s)).filter(Boolean))]
}

/** ③ ④ the door rules, plus the report of pure candidates the entry does not carry. */
export function doorFindings(world, entryAbs, townAbs, name = (p) => relative(ROOT, p)) {
  const out = [], report = []
  const behind = new Set(reexportsOf(world, entryAbs))
  if (!behind.size) out.push(`${name(entryAbs)} re-exports nothing: an empty door`)
  const townFrom = reexportsOf(world, townAbs)
  if (!townFrom.includes(entryAbs)) out.push(`${name(townAbs)} does not re-export from ${name(entryAbs)}: an app reading Town.jsx and one reading the entry would reach the libs by two paths`)
  for (const f of townFrom) {
    if (f === entryAbs) continue
    if (behind.has(f)) { out.push(`${name(townAbs)} re-exports ${name(f)} directly, and ${name(entryAbs)} re-exports it too: two doors to one lib`); continue }
    if (!graphFindings(world, f, name).length) report.push(name(f))
  }
  return { out, report }
}

// ── the live entry ────────────────────────────────────────────────────────────────────────────────────────────────────
const ENTRY = resolve(ROOT, ENTRY_REL), TOWN = resolve(ROOT, TOWN_REL)
function live() {
  if (!existsSync(ENTRY)) return { fails: [`no ${ENTRY_REL}: the kit has no renderer-free door yet`], report: [] }
  const doors = doorFindings(REAL, ENTRY, TOWN)
  return { fails: [...graphFindings(REAL, ENTRY), ...doors.out], report: doors.report }
}

// ── planted worlds: each must be RED ────────────────────────────────────────────────────────────────────────────────
function planted(files, pkgs = {}) {
  return {
    read: (p) => { if (!(p in files)) throw new Error('absent'); return files[p] },
    resolve: (from, spec) => { const b = resolve(dirname(from), spec); for (const e of EXTS) if ((b + e) in files) return b + e; return null },
    rootDir: '/w',
    manifest: (pkg) => pkg in pkgs ? { dir: '/w', required: pkgs[pkg].required ?? pkgs[pkg], optional: pkgs[pkg].optional ?? [] } : null,
  }
}
const P = (r) => resolve('/w', r)
const E = P('src/components/TownPure.js'), T = P('src/components/Town.jsx')
const pure = { [P('src/lib/a.js')]: 'export const a = 1\n', [P('src/lib/b.js')]: "import { create } from 'zustand'\nexport const b = create\n" }
const okWorld = { ...pure, [E]: "export { a } from '../lib/a.js'\nexport * from '../lib/b.js'\n", [T]: "import * as THREE from 'three'\nexport * from './TownPure.js'\nexport { c } from '../lib/c.js'\n", [P('src/lib/c.js')]: 'export const c = 3\n' }
const okPkgs = { zustand: { required: ['use-sync-external-store'], optional: ['immer'] }, 'use-sync-external-store': [] }
const nm = (p) => relative('/w', p)
const judge = (files, pkgs = okPkgs) => { const w = planted(files, pkgs); return [...graphFindings(w, E, nm), ...doorFindings(w, E, T, nm).out] }
const PLANTS = [
  ['a pure lib that imports three', { ...okWorld, [P('src/lib/a.js')]: "import * as THREE from 'three'\nexport const a = 1\n" }],
  ['a lib two hops down importing @react-three/fiber', { ...okWorld, [P('src/lib/a.js')]: "import { d } from './d.js'\nexport const a = d\n", [P('src/lib/d.js')]: "export { useThree as d } from '@react-three/fiber'\n" }],
  ['a package whose manifest closure reaches three', okWorld, { ...okPkgs, 'use-sync-external-store': ['three-stdlib'], 'three-stdlib': ['three'] }],
  ['react-dom', { ...okWorld, [P('src/lib/a.js')]: "import { createRoot } from 'react-dom/client'\nexport const a = createRoot\n" }],
  ['a literal dynamic import of three', { ...okWorld, [P('src/lib/a.js')]: "export const a = () => import('three')\n" }],
  ['a non-literal dynamic import', { ...okWorld, [P('src/lib/a.js')]: "export const a = (m) => import(m)\n" }],
  ['a multi-line import of a renderer', { ...okWorld, [P('src/lib/a.js')]: "import {\n  Vector3,\n  Color,\n} from 'three'\nexport const a = Vector3\n" }],
  ['the entry re-exporting from Town.jsx', { ...okWorld, [E]: "export { a } from '../lib/a.js'\nexport { c } from './Town.jsx'\n" }],
  ['Town.jsx re-exporting a lib the entry carries', { ...okWorld, [T]: okWorld[T] + "export { a } from '../lib/a.js'\n" }],
  ['Town.jsx not re-exporting the entry', { ...okWorld, [T]: "export { a } from '../lib/a.js'\n" }],
  ['an empty entry', { ...okWorld, [E]: 'export const nothing = null\n' }],
  ['a bare package installed nowhere (Fuse 1)', { ...okWorld, [P('src/lib/a.js')]: "import x from 'ghost-pkg'\nexport const a = x\n" }],
  ['a required dependency of a package installed nowhere (Fuse 1)', okWorld, { ...okPkgs, 'use-sync-external-store': ['ghost-dep'] }],
  ['an optional peer that IS installed and reaches three', okWorld, { ...okPkgs, immer: ['three'] }],
  ['Town.jsx re-exporting a carried lib by import-then-export (Fuse 4)', { ...okWorld, [T]: okWorld[T] + "import { a as aa } from '../lib/a.js'\nexport { aa }\n" }],
  ['an import after a string holding // (Fuse 3)', { ...okWorld, [P('src/lib/a.js')]: "const u = 'a//b'; import * as T from 'three'\nexport const a = u\n" }],
  ['an import between two templates holding /* and */ (Fuse 3)', { ...okWorld, [P('src/lib/a.js')]: "const g = `a/*${1}`\nimport * as T from 'three'\nconst h = `*/`\nexport const a = g + h\n" }],
  ['an import after a regex holding // (Fuse 3)', { ...okWorld, [P('src/lib/a.js')]: "const r = /[//]/g; import * as T from 'three'\nexport const a = r\n" }],
  ['an import that resolves to no file', { ...okWorld, [P('src/lib/a.js')]: "import { z } from './gone.js'\nexport const a = z\n" }],
]
function selfTest() {
  const fails = []
  const base = judge(okWorld)
  if (base.length) fails.push(`the planted clean world is judged RED: ${base.join(' · ')}`)
  const rep = doorFindings(planted(okWorld, okPkgs), E, T, nm).report
  if (rep.join() !== 'src/lib/c.js') fails.push(`the pure candidate Town.jsx carries alone is not reported (got [${rep}])`)
  if (judge({ ...okWorld, [P('src/lib/a.js')]: "// import * as THREE from 'three'\nexport const a = 1\n" }).length) fails.push('a commented-out import is judged as an edge')
  for (const [why, files, pkgs] of PLANTS) if (!judge(files, pkgs).length) fails.push(`planted: ${why} → judged GREEN`)
  // ⭐ THE LAYOUT (Boz, 2026-11-02): a near node_modules that lacks the package, the package two directories further up (a
  // worktree under the main checkout). Node finds it; so must this. And a package nowhere up the chain is still null.
  // Planted around THIS repo's ROOT, so a walk that stops at ROOT (the bug) is caught, not just one that stops early.
  const up2 = dirname(dirname(ROOT))
  const files = { [resolve(up2, 'node_modules/zz/package.json')]: '{"peerDependencies":{"three":"*"}}', [resolve(ROOT, 'node_modules/other/package.json')]: '{}' }
  const pfs = { exists: (f) => f in files, read: (f) => files[f] }
  const far = manifestIn(pfs, 'zz', ROOT)
  if (far?.dir !== resolve(up2, 'node_modules/zz') || far.required.join() !== 'three') fails.push(`layout: a package two directories above the repo, past a near node_modules that lacks it, is not found (got ${JSON.stringify(far)})`)
  if (manifestIn(pfs, 'ghost', ROOT) !== null) fails.push('layout: a package nowhere up the chain is found')
  // ⭐ REAL-WORLD ANCHORS (Fuse's item 2): the planted worlds prove the logic; these prove it reads THIS repo's files and
  // manifests. Town.jsx IS the renderer, so its graph must be RED and name three; postprocessing names three only as a peer.
  const town = graphFindings(REAL, TOWN)
  if (!town.some(f => /'three'.*: a renderer/.test(f))) fails.push(`anchor: Town.jsx's real graph is not judged to reach three (${town.length} findings)`)
  const pp = rendererChain(REAL, 'postprocessing', ROOT)
  if (pp?.renderer?.join() !== 'postprocessing,three') fails.push(`anchor: the installed postprocessing is not judged to reach three by its peer (got ${JSON.stringify(pp)})`)
  if (rendererChain(REAL, 'zustand', ROOT) !== null) fails.push(`anchor: the installed zustand (its peers all optional) is not judged renderer-free (got ${JSON.stringify(rendererChain(REAL, 'zustand', ROOT))})`)
  return fails
}

const self = selfTest()
const { fails, report } = live()
const all = [...self.map(s => `[self-test] ${s}`), ...fails]
if (all.length) { console.log(`⛔ the kit's renderer-free door (${ENTRY_REL}):\n  · ${all.join('\n  · ')}`); process.exitCode = 1 }
else console.log(`✅ ${ENTRY_REL} reaches no renderer and is the one door for what it carries (${PLANTS.length} planted graphs judged RED)`)
if (report.length) console.log(`  ℹ️ Town.jsx re-exports these libs outside the door whose graph reaches no renderer: ${report.join(', ')}. Not a finding, and not yet a candidate: whether one is safe to IMPORT (no read of the page at load, in any build mode) is claims-the-pure-entry-loads-without-a-browser's verdict, run with it in the door.`)

if (process.argv.includes('--mutants')) {
  let bad = 0
  const mut = async (name, f) => { const n = (await f()).length; console.log(`${n ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${n ? ` (${n})` : ''}`); if (!n) bad++ }
  for (const [why, files, pkgs] of PLANTS) await mut(`planted: ${why}`, async () => judge(files, pkgs))
  if (bad) process.exitCode = 1
}
