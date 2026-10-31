#!/usr/bin/env node
/**
 * "ARE THE STRANDS THERE ONLY WHEN THEY WOULD BE?" (Jacob, 2026-10-31: "hide the strands out of season"; and his Glow
 * screenshot, a dark lattice and no light: the unlit SHOW strands, which share the glow strands' places, covered them.)
 *
 *   1. the rule (engine.js#liveState): out of season, or with no calendar read, the strands are not up; in season they
 *      are, lit after dark and hanging dark by day;
 *   2. the renderer: the glow strands (the real ones) are visible exactly when up; the show strands and the pinnacle's
 *      strips only while a show plays; no unlit bulb is left in the scene to cover a lit one.
 *
 * Usage: node checks/claims-a-display-hangs-only-in-season.mjs [--mutants]
 *   --mutants: strands up out of season → (1) red; show strands left visible outside a show → (2) red.
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const D = { season: 'lights', shows: { every: 'hour', from: '17:00', to: '23:00' } }, C = { segs: [], seconds: 60 }
const CAL = [{ id: 'lights', start_date: '2026-11-11', end_date: '2027-01-01' }]
const at = (date, hours) => ({ date, hours, minutes: 30, seconds: 0 })

async function verdict({ engine, view } = {}) {
  const fails = []
  const E = await importSource('src/displays/lightShow/engine.js', engine ? { transform: engine } : {})
  const ask = (cal, clock, sunDown) => E.liveState(D, C, clock, cal, sunDown, 'check')
  if (ask(null, at('2026-11-20', 18), true).up !== false) fails.push('with no calendar read, the strands are up: they must not be')
  if (ask(CAL, at('2026-10-31', 18), true).up !== false) fails.push('out of season (Oct 31), the strands are up')
  const day = ask(CAL, at('2026-11-20', 12), false)
  if (day.up !== true || day.mode !== 'off') fails.push(`in season by day the strands should hang dark (up, off); got up=${day.up}, mode=${day.mode}`)
  if (ask(CAL, at('2026-11-20', 18), true).up !== true) fails.push('in season after dark, the strands are not up')
  const ls = code(view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx'))
  if (!/glowRef\.current\.visible = up;/.test(ls)) fails.push('LightShow: the glow strands are not shown exactly when up')
  if (!/showRef\.current\.visible = !!show;/.test(ls) || !/pinRef\.current\.visible = !!show/.test(ls)) fails.push('LightShow: the show strands or the pinnacle strips are visible outside a show (unlit, they cover the glow)')
  if (!/\{ mode, t, up \} = liveState\(/.test(ls)) fails.push('LightShow: the live path does not take `up` from liveState')
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ the strands hang when they should not:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ the strands hang only in season (dark by day, lit after dark, gone out of it and with no calendar); the show strands and the pinnacle strips only during a show')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['strands up out of season', { engine: (s) => s.replace('  const up = inSeason(calendar, display.season, clock.date, where)\n', '  const up = calendar == null || inSeason(calendar, display.season, clock.date, where) || true\n') }],
    ['show strands visible outside a show', { view: (s) => s.replace('showRef.current.visible = !!show;', 'showRef.current.visible = true;') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
