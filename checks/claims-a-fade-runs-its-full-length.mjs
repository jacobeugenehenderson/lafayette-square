#!/usr/bin/env node
/**
 * "DOES A FADE RUN ITS FULL AUTHORED MINUTES, ACROSS LATER KEYS, FROM WHERE THE LIGHT IS?" (Jacob, 2026-11-01: "It takes
 * 30 minutes to fade in and the slot is only 22 minutes; whatever. The next slot gets the 8 minutes"; Boz's ruling (B);
 * Zob's co-sign.)
 *
 * Through src/cartograph/animatedParam.js#resolveGroupAtMinute (edgeEnvelope), on planted channels and fixed slot minutes:
 *   1. a ▲ at Sunset of 30 minutes with Dusk 25 minutes later (unmarked) is 25/30 up at Dusk, 28/30 three minutes after
 *      it, full at Sunset + 30 and after; the keys' own tween is multiplied by it (Dusk keyed at 2 → the tween × the
 *      fade); continuous across Dusk;
 *   2. a ▼ starts from the level the ▲ before it reached (a ▲ of 120 minutes, a ▼ 62 minutes on, starts at 62/120);
 *   3. a ▲ starts from where a ▼ still running has reached (a ▼ of 60 at Dawn, a ▲ of 30 at Noon 30 minutes on: from
 *      0.5, so 0.75 fifteen minutes in);
 *   4. after a ▼, an unmarked key turns the light on at once, as before (the "–" across the blank);
 *   5. a 0-minute fade is still a switch.
 * ⛔ NOT CHECKED, BY NAME: a fade across MIDNIGHT. The resolvers read one day's slot minutes, so a key of yesterday is read
 * at today's minute (the open item: cartograph/BACKLOG.md, "the resolvers' single-day read"; its numbers by
 * `node checks/claims-every-slot-has-a-time-every-day.mjs --drift`). Asserting today's value would be asserting a known
 * error (Zob); the case joins this check when the cache carries yesterday through.
 * Usage: node checks/claims-a-fade-runs-its-full-length.mjs [--mutants]
 */
import { execFileSync } from 'node:child_process'
import { importSource, sourceOf, spanOf } from './_importSource.mjs'

// The resolver as it was before the clamp was removed (integration, 2026-11-01), for the "clamp restored" mutant.
const BEFORE = '151a63f4'
const oldEnvelope = () => spanOf(execFileSync('git', ['show', `${BEFORE}:src/cartograph/animatedParam.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), { from: '/**\n * How the edge marks shape the value at `minute`', to: 'function tweenAnimatedAtMinute(' })
const newEnvelope = (s) => spanOf(s, { from: '/**\n * How the edge marks shape the value at `minute`', to: 'function tweenAnimatedAtMinute(' })

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e
const MIN = { dawn: 390, sunrise: 415, noon: 780, golden: 1100, sunset: 1135, dusk: 1160, night: 1222, deep: 30 }

async function verdict({ param } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const A = await importSource('src/cartograph/animatedParam.js', param ? { transform: param } : {})
  const at = (ch, m, sm = MIN) => A.resolveGroupAtMinute(ch, m, sm, ['v'], { v: 0 }).v
  // 1. a ▲ across a later key
  const up = (duskV = 1) => ({ animated: 'tod', values: { sunset: { v: 1 }, dusk: { v: duskV }, dawn: { v: 1 } }, edges: { sunset: { fade: 'up', minutes: 30 }, dawn: { fade: 'down', minutes: 0 } } })
  const c = up()
  F(near(at(c, MIN.sunset), 0), `a ▲ is not 0 at its key (${at(c, MIN.sunset)})`)
  F(near(at(c, MIN.dusk), 25 / 30), `a 30-minute ▲ is ${at(c, MIN.dusk).toFixed(4)} at a key 25 minutes on, not 25/30 (it stopped at the key: the clamp)`)
  F(near(at(c, MIN.dusk + 3), 28 / 30), `three minutes past that key it is ${at(c, MIN.dusk + 3).toFixed(4)}, not 28/30: the next slot did not get the minutes left`)
  F(near(at(c, MIN.sunset + 30), 1) && near(at(c, MIN.sunset + 40), 1), 'the ▲ is not full at its key + its minutes, and after')
  F(near(at(c, MIN.dusk - 1e-6), at(c, MIN.dusk), 1e-5), `the ▲ is not continuous across the later key (${at(c, MIN.dusk - 1e-6)} → ${at(c, MIN.dusk)})`)
  const c2 = up(2), tween = A.resolveGroupAtMinute({ ...c2, edges: undefined }, MIN.dusk + 3, MIN, ['v'], { v: 0 }).v
  F(near(at(c2, MIN.dusk + 3), tween * 28 / 30), `past the later key the light is ${at(c2, MIN.dusk + 3)}, not the keys' own tween (${tween}) × the fade (28/30)`)
  // 2. a ▼ from what the ▲ reached
  const short = { animated: 'tod', values: { dusk: { v: 1 }, night: { v: 1 } }, edges: { dusk: { fade: 'up', minutes: 120 }, night: { fade: 'down', minutes: 30 } } }
  const reached = (MIN.night - MIN.dusk) / 120
  F(near(at(short, MIN.night), reached), `a ▼ starts from ${at(short, MIN.night)}, not the level the ▲ reached (${reached.toFixed(4)})`)
  F(near(at(short, MIN.night + 15), reached * 0.5), 'a ▼ half way is not half the level it started from')
  // 3. a ▲ from where a ▼ still running has reached
  const SM3 = { ...MIN, noon: MIN.dawn + 30 }
  const over = { animated: 'tod', values: { dawn: { v: 1 }, noon: { v: 1 } }, edges: { dawn: { fade: 'down', minutes: 60 }, noon: { fade: 'up', minutes: 30 } } }
  F(near(at(over, SM3.noon, SM3), 0.5), `a ▲ starts from ${at(over, SM3.noon, SM3)}, not where the ▼ still running had reached (0.5)`)
  F(near(at(over, SM3.noon + 15, SM3), 0.75), `fifteen minutes into that ▲ the light is ${at(over, SM3.noon + 15, SM3)}, not 0.75`)
  // 4. after a ▼, an unmarked key relights at once
  const relight = { animated: 'tod', values: { dawn: { v: 1 }, noon: { v: 1 } }, edges: { dawn: { fade: 'down', minutes: 60 } } }
  F(near(at(relight, SM3.noon + 1, SM3), 1), `after a ▼, an unmarked key does not turn the light on at once (${at(relight, SM3.noon + 1, SM3)})`)
  // 5. 0 is a switch
  const sw = { animated: 'tod', values: { dusk: { v: 1 }, dawn: { v: 1 } }, edges: { dusk: { fade: 'up', minutes: 0 }, dawn: { fade: 'down', minutes: 0 } } }
  F(near(at(sw, MIN.dusk), 1) && near(at(sw, MIN.dawn), 0) && near(at(sw, MIN.dusk - 1), 0), 'a 0-minute fade is not a switch')
  return fails
}

const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ a fade does not run its full length:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a fade runs its full authored minutes across later keys (the keys\' own tween multiplied by it), a ▼ from where the ▲ reached, a ▲ from where a running ▼ reached; after a ▼ an unmarked key relights at once; 0 is a switch')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the clamp restored (the resolver before 2026-11-01)', { param: (s) => s.replace(newEnvelope(s), oldEnvelope()) }],
    ['the ▲ ended at the next key (no carry across)', { param: (s) => s.replace("  if (m?.e.fade === 'up') { const s = upLevel(channel, points, m.j, minute); if (s < 1) return { tween: s } }\n", '') }],
    ['a ▲ always from 0', { param: (s) => s.replace("const from = m?.e.fade === 'down' ? reachedAt(channel, points, m.j) * (1 - fadeProgress(m.e, arcMin(points[m.j].minute, K.minute))) : 0", 'const from = 0') }],
    ['a ▼ always from full', { param: (s) => s.replace("return m?.e.fade === 'up' ? fadeProgress(m.e, arcMin(points[m.j].minute, points[i].minute)) : 1", 'return 1') }],
    ['a ▼ carried across the key after it', { param: (s) => s.replace("  if (m?.e.fade === 'up') { const s = upLevel(", "  if (m?.e.fade === 'down') return { tween: 0 }\n  if (m?.e.fade === 'up') { const s = upLevel(") }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
