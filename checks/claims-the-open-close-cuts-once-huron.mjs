#!/usr/bin/env node
// ⭐ THE OPEN/CLOSE CUTS ONCE, HURON'S RATCHET (the heavy half of checks/claims-the-open-close-cuts-once.mjs; Zob, 2026-10-29).
// Huron's whole traced water (checks/fixtures/cut-once-huron-traced.json: `traced` in bake-coast.mjs, before simplify and settle)
// through structures.mjs#openCloseAtStep, judged end to end against the definition (checks/_cutOnceJudge.mjs). What is left past
// 2·NODE_BOUND is a measured RESIDUAL, held on a RATCHET: RED when the count or the m² RISES above the ceiling, and RED when it
// FALLS ("lower the ceiling to N, A in this commit"), so a fix lowers it in the same commit and it can never drift into a tolerance.
// BACKLOG "the open/close's residual against the definition" evicts when every ceiling below is 0.
//   ⚠ copy is on the ratchet too, named by site: ONE real copy, (720.196, 209.874) → (720.266, 209.626) on source edge (720.045, 210.429)
//   → (720.266, 209.626), whose cut point lies 1.683 u off that line, past NODE_BOUND (Zob, 2026-10-29). Why the emission invariant
//   passes it is not established. (The yardstick counts a source edge split within NODE_BOUND as the edge: 103 of an earlier 104.)
// Mutants, each seen RED: a planted extra piece in the output · the residual one below the ceiling, the ceiling unchanged.
// ⏱ about 2 minutes (the kit's open/close ~60 s, the judge ~70 s). ▶ node checks/claims-the-open-close-cuts-once-huron.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openCloseAtStep } from '../cartograph/structures.mjs'
import { partsOf } from '../cartograph/openClose.mjs'
import { ip, e2e, definitionOf, ownEdge, crossings, short } from './_cutOnceJudge.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let fails = 0
const row = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? '✅' : '⛔'} ${msg}`) }
// the ceilings, measured 2026-10-29 at the port: pieces past 2·NB, count and m², each side; copy, crossings, ≤ 2 mm
const CEILING = { 'candidate only': { n: 6, m2: 0.0022 }, 'definition only': { n: 11, m2: 0.0206 }, copy: 1, crossings: 0, short: 119 }, COPY_AT = '720.196, 209.874'
const ratchet = (v, c, what) => (v > c ? `${what} ROSE to ${v} above the ceiling ${c}` : v < c ? `${what} FELL to ${v}: lower the ceiling to ${v} in this commit` : null)
const sideWhy = (s, c) => [ratchet(s.twoNb, c.n, 'the count'), ratchet(+s.twoNbM2.toFixed(4), c.m2, 'the m²')].filter(Boolean).join('; ') || null

const d = JSON.parse(readFileSync(join(ROOT, 'checks/fixtures/cut-once-huron-traced.json'), 'utf8')), src = ip(d.traced)
let k; try { k = openCloseAtStep(src, d.fineM, "Huron's traced water").paths } catch (e) { row(false, `Huron's traced water REFUSES: ${String(e.message).slice(0, 240)}`) }
if (k) {
  const def = definitionOf(src, d.fineM), j = e2e(k, src, d.fineM, def)
  for (const side of ['candidate only', 'definition only']) { const s = j[side], why = sideWhy(s, CEILING[side])
    row(!why, `Huron, ${side} past 2·NB: ${s.twoNb} piece(s), ${s.twoNbM2.toFixed(4)} m² (ceiling ${CEILING[side].n}, ${CEILING[side].m2})${why ? ` — ${why}` : ''}${side === 'definition only' && j.list[0] ? ` · largest ${j.list[0].m2} m² at (${j.list[0].at.join(', ')})` : ''}`) }
  const o = ownEdge(ip(partsOf(src, 'P').flat()), k), x = crossings(k).length, sh = short(k)
  for (const [what, v] of [['copy', o.copy], ['crossings', x], ['short', sh]]) { const why = ratchet(v, CEILING[what], what)
    const site = what !== 'copy' || !o.copy || o.copies.some(c => c.flat().join(', ').includes(COPY_AT))
    row(!why && site, `Huron, ${what === 'short' ? '≤ 2 mm edges' : what}: ${v} (ceiling ${CEILING[what]})${what === 'copy' && o.copy ? `, at (${COPY_AT}): ${site ? 'the named one' : `NOT the named one (${JSON.stringify(o.copies[0])})`}` : ''}${why ? ` — ${why}` : ''}`) }
  // mutant: a planted extra piece (a 2 m square of output far from every shore)
  const far = ip([[[1e9, 1e9], [1e9 + 2000, 1e9], [1e9 + 2000, 1e9 + 2000], [1e9, 1e9 + 2000]]]), m = e2e([...k, ...far], src, d.fineM, def)
  const mw = sideWhy(m['candidate only'], CEILING['candidate only'])
  row(!!mw, `mutant: a planted extra 4 m² piece → candidate only ${m['candidate only'].twoNb} piece(s): ${mw || 'NOT seen'}${mw ? ', RED' : ''}`)
  // mutant: the residual shrunk with the ceiling unchanged
  const s = j['definition only'], shrunk = { ...s, twoNb: s.twoNb - 1 }, sw = sideWhy(shrunk, CEILING['definition only'])
  row(!!sw, `mutant: the definition-only residual one piece smaller, the ceiling unchanged → ${sw || 'NOT seen'}${sw ? ', RED' : ''}`)
}
console.log(fails ? `\n⛔ ${fails} claim(s) fail.` : "\n✅ Huron's open/close holds its ratchet")
process.exitCode = fails ? 1 : 0
