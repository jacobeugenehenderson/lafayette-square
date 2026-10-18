// swapset.mjs <worktree> <main tree> — the swap set for run.sh, DERIVED FROM GIT, never kept by hand (Boz, 2026-10-18: the
// hand-kept list missed groundConformity.js, so two gate bakes ran main's detector). Every code file under cartograph/ and src/
// that differs between the worktree's HEAD and the main tree's HEAD is swapped, the worktree's copy over main's; run.sh's own
// overrides (BG = the gate's bake-ground copy, TG, DEFORMER) replace those entries. ⛔ REFUSES (exit 2) if a differing file
// cannot be swapped by swap-hooks.mjs (only ES modules reached by a relative import are: not data, not shaders) or was
// deleted in the worktree, and if the worktree has uncommitted changes in a code file no override replaces (the bake would
// not be the sha it names). It compares against the main tree's HEAD while the bake imports its WORKING copy, so run.sh's own
// guard that the main tree is clean must stay.
// Prints the map (JSON) on stdout and the list it swapped on stderr.
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
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
const map = {}, refuse = []
for (const [st, p] of changed) {
  if (st.startsWith('D')) { refuse.push(`${p}: deleted in the worktree — a swap cannot remove a module`); continue }
  if (!/\.m?js$/.test(p)) { refuse.push(`${p}: not an ES module — swap-hooks cannot serve it`); continue }
  const src = over[p] || `${WT}/${p}`
  if (!existsSync(src)) { refuse.push(`${p}: ${src} does not exist`); continue }
  map[p] = src
}
// an uncommitted file an override replaces is fine (the pin is what is baked, and it is printed as overridden)
for (const p of dirty) if (!over[p]) refuse.push(`${p}: uncommitted in the worktree — the bake would not be ${wtHead.slice(0, 8)}`)
for (const [p, v] of Object.entries(over)) if (v && !changed.some(([, q]) => q === p)) refuse.push(`${p}: overridden (${v}) but it does not differ from main — the override would not be what the gate tests`)
console.error(`[swapset] main ${mainHead.slice(0, 8)} · worktree ${wtHead.slice(0, 8)} · ${Object.keys(map).length} module(s) swapped: ${Object.entries(map).map(([k, v]) => k + (v.startsWith(WT) ? '' : ` (overridden ← ${v})`)).join(' · ')}`)
if (refuse.length) { console.error(`[swapset] ⛔ refusing to start — ${refuse.length} file(s) the gate cannot carry:\n  ${refuse.join('\n  ')}`); process.exit(2) }
console.log(JSON.stringify(map))
