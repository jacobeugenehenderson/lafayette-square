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
 *      is judged by what it imports.
 *   ② (LIVE, its own check, since loading through vite is live tier: checks/claims-the-pure-entry-loads-without-a-browser.mjs)
 *      the entry loads as an app's 2D module is loaded, vite SSR with no window: a utility that touches a browser global at
 *      load fails there even with no renderer in its graph, and no static read decides it.
 *   ③ ONE DOOR PER NAME: Town.jsx re-exports from the entry, and never re-exports again from a file the entry re-exports from
 *      (two doors to one lib invite two import paths, and the one-instance guarantee rests on one module URL).
 *   ④ the entry re-exports something.
 * REPORTED, not failed: a Town.jsx re-export whose own graph is renderer-free but which the entry does not carry (a candidate;
 * which names go in is the entry author's call).
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

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
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
const pkgOf = (spec) => spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]

/** The real world: repo files and node_modules package manifests. A planted world replaces both. */
const REAL = {
  read: (abs) => readFileSync(abs, 'utf8'),
  resolve(fromAbs, spec) {
    const base = resolve(dirname(fromAbs), spec.split('?')[0])
    for (const e of EXTS) { const p = base + e; if (existsSync(p) && statSync(p).isFile()) return p }
    return null
  },
  deps(pkg) {
    const f = resolve(ROOT, 'node_modules', pkg, 'package.json')
    if (!existsSync(f)) return null
    const j = JSON.parse(readFileSync(f, 'utf8'))
    return Object.keys({ ...j.dependencies, ...j.peerDependencies })
  },
}

/** Does a bare package reach a renderer through its manifest closure? Returns the chain, or null. */
function rendererChain(world, pkg, seen = new Set()) {
  if (RENDERER(pkg)) return [pkg]
  if (seen.has(pkg)) return null
  seen.add(pkg)
  const deps = world.deps(pkg)
  if (deps == null) return null
  for (const d of deps) { const c = rendererChain(world, d, seen); if (c) return [pkg, ...c] }
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
      const chain = rendererChain(world, pkgOf(e.spec))
      if (chain) out.push(`${path.join(' → ')} → '${e.spec}'${chain.length > 1 ? ` (${chain.join(' → ')})` : ''}${e.kind === 'dynamic' ? ' [dynamic import]' : ''}: a renderer`)
    }
  }
  return out
}

/** The files a module re-exports from (resolved), for the one-door rule. */
const reexportsOf = (world, abs) => edgesOf(world.read(abs)).filter(e => e.kind === 'reexport' && e.spec.startsWith('.')).map(e => world.resolve(abs, e.spec)).filter(Boolean)

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
    deps: (pkg) => pkgs[pkg] ?? (RENDERER(pkg) ? [] : null),
  }
}
const P = (r) => resolve('/w', r)
const E = P('src/components/TownPure.js'), T = P('src/components/Town.jsx')
const pure = { [P('src/lib/a.js')]: 'export const a = 1\n', [P('src/lib/b.js')]: "import { create } from 'zustand'\nexport const b = create\n" }
const okWorld = { ...pure, [E]: "export { a } from '../lib/a.js'\nexport * from '../lib/b.js'\n", [T]: "import * as THREE from 'three'\nexport * from './TownPure.js'\nexport { c } from '../lib/c.js'\n", [P('src/lib/c.js')]: 'export const c = 3\n' }
const okPkgs = { zustand: ['use-sync-external-store'], 'use-sync-external-store': [] }
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
  return fails
}

const self = selfTest()
const { fails, report } = live()
const all = [...self.map(s => `[self-test] ${s}`), ...fails]
if (all.length) { console.log(`⛔ the kit's renderer-free door (${ENTRY_REL}):\n  · ${all.join('\n  · ')}`); process.exitCode = 1 }
else console.log(`✅ ${ENTRY_REL} reaches no renderer and is the one door for what it carries (${PLANTS.length} planted graphs judged RED)`)
if (report.length) console.log(`  ℹ️ Town.jsx re-exports these renderer-free libs outside the door (a candidate, not a finding): ${report.join(', ')}`)

if (process.argv.includes('--mutants')) {
  let bad = 0
  const mut = async (name, f) => { const n = (await f()).length; console.log(`${n ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${n ? ` (${n})` : ''}`); if (!n) bad++ }
  for (const [why, files, pkgs] of PLANTS) await mut(`planted: ${why}`, async () => judge(files, pkgs))
  if (bad) process.exitCode = 1
}
