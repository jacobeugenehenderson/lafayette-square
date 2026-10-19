// swapset.mjs <worktree> <main tree> — the swap set for run.sh, DERIVED FROM GIT, never kept by hand (Boz, 2026-10-18: the
// hand-kept list missed groundConformity.js, so two gate bakes ran main's detector). Every code file under cartograph/ and src/
// that differs between the worktree's HEAD and the main tree's HEAD is swapped, the worktree's copy over main's; run.sh's own
// overrides (BG = the gate's bake-ground copy, TG, DEFORMER) replace those entries. ⛔ REFUSES (exit 2) if a differing file
// cannot be swapped by swap-hooks.mjs (only ES modules reached by a relative import are: not data, not shaders) or was
// deleted in the worktree, and if the worktree has uncommitted changes in a code file no override replaces (the bake would
// not be the sha it names). It compares against the main tree's HEAD while the bake imports its WORKING copy, so run.sh's own
// guard that the main tree is clean must stay.
// ⭐ A browser-only file (.jsx / .tsx) that differs is NOT CARRIED rather than refused — but only when PROVEN unreachable (Boz,
// 2026-10-19): ENTRY='<repo path>[=<source>] …' names the run's entry points, and the import graph is walked from them,
// each module read from what the run actually serves (its swap source, else the main tree's working copy). A static import, an
// export-from, and a literal import('…') are edges. If any edge reaches the file, or the graph holds a dynamic import that is not
// a literal (it cannot be followed), or no ENTRY is given, the file is refused exactly as before.
// Prints the map (JSON) on stdout and the list it swapped on stderr.
import { execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { posix } from 'path'
const [WT, R] = process.argv.slice(2)
if (!WT || !R) { console.error('usage: swapset.mjs <worktree> <main tree>'); process.exit(2) }
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim()
const mainHead = git(R, 'rev-parse', 'HEAD'), wtHead = git(WT, 'rev-parse', 'HEAD')
const CODE = /\.(m?js|cjs|ts|jsx|tsx|wgsl|glsl|json)$/
const changed = git(WT, 'diff', '--name-status', mainHead, wtHead, '--', 'cartograph', 'src').split('\n').filter(Boolean)
  .map(l => l.split('\t')).filter(([, p]) => !p.startsWith('cartograph/data/') && !p.includes('/_archive/') && CODE.test(p))
// porcelain lines are "XY path"; read untrimmed, since a leading space IS the X column (trimming ate the path's first letter)
const dirty = execFileSync('git', ['-C', WT, 'status', '--porcelain', '--', 'cartograph', 'src'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  .map(l => l.slice(3)).filter(p => !p.startsWith('cartograph/data/') && CODE.test(p))
const over = { 'cartograph/bake-ground.js': process.env.BG, 'src/lib/tileGround.js': process.env.TG, 'cartograph/groundDeformer.mjs': process.env.DEFORMER }
const map = {}, refuse = [], notCarried = [], browserOnly = []
for (const [st, p] of changed) {
  if (st.startsWith('D')) { refuse.push(`${p}: deleted in the worktree — a swap cannot remove a module`); continue }
  if (/\.[jt]sx$/.test(p)) { browserOnly.push(p); continue }
  if (!/\.m?js$/.test(p)) { refuse.push(`${p}: not an ES module — swap-hooks cannot serve it`); continue }
  const src = over[p] || `${WT}/${p}`
  if (!existsSync(src)) { refuse.push(`${p}: ${src} does not exist`); continue }
  map[p] = src
}
// the browser-only files: carried by no swap, so each must be proven unreachable from the run's entry points
if (browserOnly.length) {
  const entries = (process.env.ENTRY || '').split(/\s+/).filter(Boolean).map(e => e.split('='))
  const reach = reachable(entries)
  for (const p of browserOnly) {
    if (!entries.length) refuse.push(`${p}: not an ES module — swap-hooks cannot serve it (no ENTRY given, so it cannot be proven unreachable)`)
    else if (reach.opaque.length) refuse.push(`${p}: not an ES module — and the run's graph holds a dynamic import that cannot be followed (${reach.opaque[0]}), so it cannot be proven unreachable`)
    else if (reach.files.has(p)) refuse.push(`${p}: not an ES module — and the run imports it (${reach.via.get(p)} → ${p})`)
    else notCarried.push(p)
  }
}
// an uncommitted file an override replaces is fine (the pin is what is baked, and it is printed as overridden)
for (const p of dirty) if (!over[p] && !(notCarried.includes(p))) refuse.push(`${p}: uncommitted in the worktree — the bake would not be ${wtHead.slice(0, 8)}`)
for (const [p, v] of Object.entries(over)) if (v && !changed.some(([, q]) => q === p)) refuse.push(`${p}: overridden (${v}) but it does not differ from main — the override would not be what the gate tests`)
console.error(`[swapset] main ${mainHead.slice(0, 8)} · worktree ${wtHead.slice(0, 8)} · ${Object.keys(map).length} module(s) swapped: ${Object.entries(map).map(([k, v]) => k + (v.startsWith(WT) ? '' : ` (overridden ← ${v})`)).join(' · ')}`)
if (notCarried.length) console.error(`[swapset] not carried: no Node import path reaches it, from ${process.env.ENTRY}: ${notCarried.join(' · ')}`)
if (refuse.length) { console.error(`[swapset] ⛔ refusing to start — ${refuse.length} file(s) the gate cannot carry:\n  ${refuse.join('\n  ')}`); process.exit(2) }
console.log(JSON.stringify(map))

// the run's import graph: every repo path reachable from the entries, each module read from what the run serves
function reachable(entries) {
  const src = (p, explicit) => explicit || map[p] || over[p] || `${R}/${p}`
  const files = new Set(), via = new Map(), opaque = [], q = entries.map(([p, s]) => [p, s])
  const EDGE = /(?:^|[^\w.])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|(?:^|[^\w.])import\s*['"]([^'"]+)['"]|(?:^|[^\w.])import\s*\(\s*(['"`])([^'"`]*)\3\s*\)|(?:^|[^\w.])import\s*\(\s*([^'"`\s)][^)]*)\)/g
  while (q.length) {
    const [p, explicit] = q.shift(); if (files.has(p)) continue; files.add(p)
    const f = src(p, explicit); if (!existsSync(f) || !/\.(m?js|[jt]sx)$/.test(p)) continue
    const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    for (const m of text.matchAll(EDGE)) {
      const spec = m[1] ?? m[2] ?? (m[3] === '`' && m[4].includes('${') ? null : m[4])
      if (spec == null) { opaque.push(`${p}: import(${(m[4] ?? m[5]).trim().slice(0, 60)})`); continue }
      if (!spec.startsWith('.')) continue                                   // a package, or node: — not a repo file
      const to = posix.normalize(posix.join(posix.dirname(p), spec)); if (!via.has(to)) via.set(to, p); q.push([to])
    }
  }
  return { files, via, opaque }
}
