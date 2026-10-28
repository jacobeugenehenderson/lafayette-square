#!/usr/bin/env node
// CLAIM — BACK RETURNS TO THE SHOT (2026-10-28, Jacob: going back to Extent from Survey landed in PROVINCETOWN's preview).
// CartographApp's address writer REPLACED the history entry on every scene, Look and shot change, so a town never made an entry
// and the browser's Back left the page for whatever preceded it; and nothing listened for `popstate`, so an entry alone would
// have changed the address without moving the view. Now (src/cartograph/CartographApp.jsx, the address effect):
//   (1) a change of SHOT or TOWN pushes an entry, and a refinement of the same place (the first write, hydration, a Look of the
//       same town) replaces;
//   (2) Back/Forward read the address back: `popstate` → readAddress → another town reloads onto it, the same town takes its
//       Look and shot (validated against the store's ALL_SHOTS); the listener is removed with the effect;
//   (3) while a pop is applied the writer only replaces, so Back never pushes a new entry over Forward;
//   (4) it is the page's ONE history writer (no other pushState / replaceState in src/cartograph).
// Read from the source: the page is a browser app that no node process can mount.
//   MUTANTS (always run): pushState made replaceState → (1) RED · the popstate listener removed → (2) RED · the pop guard
//   removed from the move → (3) RED.
//   node checks/claims-back-returns-to-the-shot.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const APP = 'src/cartograph/CartographApp.jsx'
const src = readFileSync(join(ROOT, APP), 'utf8')

const judge = (s) => {
  const a = s.indexOf('let popping = false'), b = a < 0 ? -1 : s.indexOf('}, [])', a), E = a < 0 || b < 0 ? '' : s.slice(a, b)
  const push = /const moved = !popping && prev\?\._looksHydrated && \(s\.shot !== prev\.shot \|\| s\.scene !== prev\.scene\)/.test(E)
    && /if \(moved\) window\.history\.pushState\(window\.history\.state, '', url\)\s*\n\s*else window\.history\.replaceState\(window\.history\.state, '', url\)/.test(E)
    && /write\(s, prev\)/.test(E)
  const onPop = E.slice(E.indexOf('const onPop = () => {'), E.indexOf("window.addEventListener('popstate', onPop)"))
  const pop = /window\.addEventListener\('popstate', onPop\)/.test(E) && /window\.removeEventListener\('popstate', onPop\)/.test(E)
    && /readAddress\(\)/.test(onPop) && /url\.scene && url\.scene !== s\.scene\) \{ window\.location\.reload\(\); return \}/.test(onPop)
    && /s\.setShot\(url\.shot\)/.test(onPop) && /ALL_SHOTS\.includes\(url\.shot\)/.test(onPop) && /s\.setActiveLook\(url\.look\)/.test(onPop)
  const guard = /popping = true/.test(onPop) && /finally \{ popping = false \}/.test(onPop) && /const moved = !popping &&/.test(E)
  return { push, pop, guard }
}
const J = judge(src)
row(J.push, `(1) a shot or town change pushes a history entry, a refinement replaces: ${J.push}`)
row(J.pop, `(2) Back/Forward read the address back (popstate → readAddress: another town reloads, the same town takes its Look and shot): ${J.pop}`)
row(J.guard, `(3) a pop being applied only replaces (Back never pushes over Forward): ${J.guard}`)
{ const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : /\.(m?js|jsx)$/.test(e.name) ? [join(d, e.name)] : [])
  const writers = walk(join(ROOT, 'src/cartograph')).flatMap(f => { const n = (readFileSync(f, 'utf8').match(/history\.(pushState|replaceState)\(/g) || []).length; return n ? [`${f.slice(ROOT.length + 1)} ×${n}`] : [] })
  row(writers.length === 1 && writers[0] === `${APP} ×2`, `(4) the page's one history writer: ${writers.join(' · ') || 'none'}`) }

// MUTANTS: the source text, edited
for (const [name, edit, key] of [
  ['pushState made replaceState', (s) => s.replace("if (moved) window.history.pushState(", "if (moved) window.history.replaceState("), 'push'],
  ['the popstate listener removed', (s) => s.replace("    window.addEventListener('popstate', onPop)\n", ''), 'pop'],
  ['the pop guard removed from the move', (s) => s.replace('const moved = !popping && prev?._looksHydrated', 'const moved = prev?._looksHydrated'), 'guard'],
]) { const m = edit(src)
  if (m === src) { row(false, `mutant (${name}): its anchor is not in ${APP} — re-aim it`); continue }
  const M = judge(m); row(!M[key], `mutant: ${name} → ${M[key] ? 'still GREEN — the row proves nothing' : 'RED as it must be'}`) }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ back returns to the shot')
process.exit(red ? 1 : 0)
