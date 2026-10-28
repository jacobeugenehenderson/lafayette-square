#!/usr/bin/env node
// CLAIM — NO COAST EDGE IS FINER THAN ITS TRACE (ORIENTATION §5, "a source is drawn to its own resolution, and no finer"; Boz's
// ruling, 2026-10-27). bake-coast settles each traced vertex on the lidar, by up to one step (bake-coast.mjs#settleOnSource), and
// nothing after it asked what the moves left: PTown v3's sweep clamp left a 7.6 cm edge at (-3418.7, -1928.6), one the coast
// verifier passes (both corners are outlinable), on which ①'s shore refused far downstream (shareWaterRunIntoShore: "the
// block's vertex on a water run has no place on a shore cell"). Now, at settle's exit, every edge shorter than the step loses a
// vertex where that is admissible, and an edge neither end of which may go is HELD by place (coastFile.mjs#toResolution).
//   (1) SOURCE: bakeCoast calls toResolution once, after settleOnSource and before the verifier, at the trace's own step
//       (`fine`) with the mint's ink width and outline test, the square's points fixed, and records it (edgesBelowResolution).
//   (2) PTown's hairpin (its ON-arm ring 0, v1924–1936, closed by a chord): the 7.6 cm edge goes, no edge under the step is
//       left, and the ring passes the coast verifier.
//   (3) Huron's held edge (its ON-arm ring 16, a 4 m × 0.5 m island): its 0.49 m edge goes (the island is then three
//       vertices), and its 0.767 m edge is HELD, by place, since a ring keeps three. ⛔ The island is a WIDTH under one cell,
//       which this rule does not remove (BACKLOG: the width form).
//   MUTANT (always run): the rule removed (its loop never runs) → (2) the 7.6 cm edge stays, RED · (3) nothing held, RED.
//   node checks/claims-a-coast-edge-is-no-finer-than-its-trace.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { ROOT } from './_scenes.mjs'

let red = 0
const row = (ok, s) => { if (!ok) red++; console.log(`${ok ? '✅' : '⛔'} ${s}`) }
const { outlineCorner, INK_EPS } = await import('../src/lib/tileGround.js'), CF = await import('../cartograph/coastFile.mjs')
const acuteAt = (o, p, q) => outlineCorner(o, [{ to: p }, { to: q }], INK_EPS).bad, W = 2 * INK_EPS
const STEP = 0.999   // PTown's and Huron's trace step (coast.json fineM, 0.99879 and 0.99874), to the millimetre

{ const bc = readFileSync(join(ROOT, 'cartograph/bake-coast.mjs'), 'utf8'), body = bc.slice(bc.indexOf('export async function bakeCoast('))
  const call = 'toResolution(all, fine, { fixed: (p) => onSquare(p, R), acuteAt, clear: inkW })'
  const iS = body.indexOf('await settleOnSource('), iT = body.indexOf(call), iV = body.indexOf('ringViolations(r, acuteAt, inkW)')
  const ok = body.split(call).length === 2 && iS >= 0 && iS < iT && iT < iV && /\n    edgesBelowResolution,\n/.test(body)
  row(ok, `(1) bakeCoast calls toResolution once, after settleOnSource and before the verifier, at the trace's step with the ink and its outline test, and records it: ${ok}`) }

const HAIRPIN = [[-3445.188, -1912.892], [-3438.066, -1917.567], [-3431.144, -1917.155], [-3428.214, -1918.248], [-3426.036, -1920.568], [-3425.765, -1924.673], [-3418.66, -1928.633], [-3418.72, -1928.587], [-3418.068, -1923.66], [-3413.068, -1923.66], [-3413.068, -1918.66], [-3408.068, -1918.66], [-3408.074, -1916.315]]
const ISLAND = [[691.552, 348.301], [695.298, 348.809], [695.684, 348.146], [691.656, 347.818]]
const shortest = (r) => Math.min(...r.map((a, i) => { const b = r[(i + 1) % r.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]) }))
const judge = (toResolution) => {
  const h = toResolution([HAIRPIN], STEP, { acuteAt, clear: W }), hr = h.rings[0], bad = CF.ringViolations(hr, acuteAt, W)
  const i = toResolution([ISLAND], STEP, { acuteAt, clear: W })
  return { h, hr, bad, i, ok2: shortest(hr) >= STEP && !bad.length && h.removed.length === 1, ok3: i.held.length === 1 && Math.abs(i.held[0].edgeM - 0.7672) < 1e-3 && i.removed.length === 1 && i.rings[0].length === 3 } }
const say2 = (J) => `${J.h.removed.length} vertex(es) removed${J.h.removed.length ? ` (${J.h.removed.map(q => `(${q.at.join(', ')})`).join(' ')})` : ''}, the shortest edge left ${(shortest(J.hr) * 100).toFixed(1)} cm, ${J.bad.length} verifier violation(s)`
const say3 = (J) => `${J.i.held.length} held${J.i.held.length ? ` (${J.i.held.map(q => `${q.edgeM.toFixed(4)} m @(${q.at.join(', ')})`).join(' ')})` : ''}, ${J.i.removed.length} removed`
{ const J = judge(CF.toResolution)
  row(J.ok2, `(2) PTown's hairpin (the 7.6 cm edge at (-3418.66, -1928.633)): ${say2(J)}`)
  row(J.ok3, `(3) Huron's 4 m × 0.5 m island: ${say3(J)} — a width under one cell, held at three vertices`) }

// MUTANT: the rule removed (its loop exits before its first edge)
{ const src = readFileSync(join(ROOT, 'cartograph/coastFile.mjs'), 'utf8'), ANCHOR = '    if (!best) break\n'
  if (src.split(ANCHOR).length !== 2) row(false, 'mutant: the rule\'s loop exit is not in coastFile.mjs once — re-aim the anchor')
  else { const dir = mkdtempSync(join(tmpdir(), 'edgeres-')), base = join(ROOT, 'cartograph')
    try { writeFileSync(join(dir, 'coastFile.mjs'), src.replace(ANCHOR, '    break\n')
        .replace(/from '(\.{1,2}\/[^']+)'/g, (_, r) => `from "${pathToFileURL(join(base, r)).href}"`))
      const M = judge((await import(pathToFileURL(join(dir, 'coastFile.mjs')).href)).toResolution)
      row(!M.ok2 && !M.ok3, `mutant: the rule removed → (2) ${say2(M)} · (3) ${say3(M)} — ${!M.ok2 && !M.ok3 ? 'RED as it must be' : 'the rows prove nothing'}`)
    } finally { rmSync(dir, { recursive: true, force: true }) } } }
console.log(red ? `\n⛔ ${red} row(s) RED` : '\n✅ no coast edge is finer than its trace')
process.exit(red ? 1 : 0)
