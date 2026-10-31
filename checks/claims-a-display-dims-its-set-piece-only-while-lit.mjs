#!/usr/bin/env node
/**
 * "DO A SET-PIECE'S UPLIGHTS DIM ONLY WHILE ITS DISPLAY IS LIT?" (Jacob, 2026-10-31: "it's only during the show/glow that
 * the lights need to dim"; the Look's uplight setting stays the lights' setting in general.)
 *
 *   1. the rule (src/displays/dim.js): off → the uplights exactly as authored (1); glow and show → the display's
 *      dimUplights; a display with none leaves them alone; two displays → the deeper dim;
 *   2. the wiring: <SetPieceUplights> multiplies its intensity by uplightScale(dim); <SetPiece> gives the SAME dim to its
 *      uplights and its <Displays>; the Light Show writes it from uplightTarget(mode, display) and lets go on unmount;
 *   3. the uplights import only dim.js, never a plugin's engine (so every town's main bundle stays without it).
 *
 * Usage: node checks/claims-a-display-dims-its-set-piece-only-while-lit.mjs [--mutants]
 *   --mutants: dimming while off → red; never dimming → red; uplights ignoring the dim → red.
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

async function verdict({ rule, uplights } = {}) {
  const fails = []
  const D = await importSource('src/displays/dim.js', rule ? { transform: rule } : {})
  const d = { dimUplights: 0.2 }
  if (D.uplightTarget('off', d) !== 1) fails.push(`off, the uplights are scaled ${D.uplightTarget('off', d)}: they must be exactly as the Look authors them`)
  for (const m of ['glow', 'show']) if (D.uplightTarget(m, d) !== 0.2) fails.push(`in ${m}, the uplights are scaled ${D.uplightTarget(m, d)}, not the display's dimUplights (0.2)`)
  if (D.uplightTarget('show', {}) !== 1) fails.push('a display with no dimUplights dims the uplights anyway')
  if (D.uplightScale({ byDisplay: { a: 0.5, b: 0.2 } }) !== 0.2 || D.uplightScale({ byDisplay: {} }) !== 1 || D.uplightScale(undefined) !== 1) fails.push('uplightScale is not the deepest dim asked (1 with none)')
  const up = code(uplights ? uplights(sourceOf('src/components/SetPieceUplights.jsx')) : sourceOf('src/components/SetPieceUplights.jsx'))
  if (!/const k = uplightScale\(dim\)/.test(up) || !/reach \* reach \* k/.test(up)) fails.push('SetPieceUplights does not scale its intensity by the set-piece\'s dim')
  if (/from '\.\.\/displays\/lightShow\//.test(up)) fails.push('SetPieceUplights imports a plugin\'s engine: it would ride into every town\'s main bundle')
  const sp = code(sourceOf('src/components/SetPiece.jsx'))
  if (!/<SetPieceUplights[^>]*dim=\{dim\}/.test(sp) || !/<Displays[^>]*dim=\{dim\}/.test(sp)) fails.push('SetPiece does not hand the same dim to its uplights and its displays')
  const ls = code(sourceOf('src/displays/lightShow/LightShow.jsx'))
  if (!/uplightTarget\(mode, display\)/.test(ls) || !/delete dim\.byDisplay\[display\.id\]/.test(ls)) fails.push('the Light Show does not write its dim from uplightTarget, or does not let go on unmount')
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ a display\'s dim is not only while lit:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a set-piece\'s uplights dim only while its display is lit: as authored when off, to the display\'s dimUplights in glow and show, the deepest of several; the uplights read it without the plugin\'s engine')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['dimming while off', { rule: (s) => s.replace("(mode === 'off' ? 1 : display.dimUplights ?? 1)", '(display.dimUplights ?? 1)') }],
    ['never dimming', { rule: (s) => s.replace("(mode === 'off' ? 1 : display.dimUplights ?? 1)", '1') }],
    ['uplights ignoring the dim', { uplights: (s) => s.replace('reach * reach * k', 'reach * reach') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
