#!/usr/bin/env node
/**
 * "ARE THE STRANDS THERE ONLY WHEN THEY WOULD BE?" (Jacob, 2026-10-31: "hide the strands out of season"; "All cords
 * should be dark gray and bulbs should be clear".) One set of strands: the glow hangs every (show ÷ glow)-th, a show all.
 *
 *   1. the rule (engine.js#liveState): out of season, or with no calendar read, the strands are not up; in season they
 *      are, lit after dark and hanging dark by day;
 *   2. the renderer: what hangs is 'none' when not up, 'all' in a show, the glow's strands otherwise; the pinnacle's strips
 *      only in a show; an unlit bulb adds NOTHING (its light is additive, inside clear glass), so it shows as clear; and
 *      the show OVERTAKES the glow (Jacob, 2026-10-31): each bulb is the glow's until the show's front reaches it.
 *
 * Usage: node checks/claims-a-display-hangs-only-in-season.mjs [--mutants]
 *   --mutants: strands up out of season → (1) red; strands hung regardless of the season, the glow faded out under a show
 *   instead of overtaken, the bulbs' light no longer additive (an unlit bulb drawn black), Stage without the Off preview,
 *   the preview not hanging the strands → (2) red.
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const D = { season: 'lights' }, C = { segs: [], seconds: 60 }, NIGHT = { dusk: 17 * 60, dawn: 6 * 60 }
const CAL = [{ id: 'lights', start_date: '2026-11-11', end_date: '2027-01-01' }]
const at = (date, hours) => ({ date, hours, minutes: 30, seconds: 0 })

async function verdict({ engine, view, stageMut } = {}) {
  const fails = []
  const E = await importSource('src/displays/lightShow/engine.js', engine ? { transform: engine } : {})
  const ask = (cal, clock) => E.liveState(D, C, clock, cal, NIGHT, 'check')
  if (ask(null, at('2026-11-20', 18)).up !== false) fails.push('with no calendar read, the strands are up: they must not be')
  if (ask(CAL, at('2026-10-31', 18)).up !== false) fails.push('out of season (Oct 31), the strands are up')
  const day = ask(CAL, at('2026-11-20', 12))
  if (day.up !== true || day.mode !== 'off') fails.push(`in season by day the strands should hang dark (up, off); got up=${day.up}, mode=${day.mode}`)
  if (ask(CAL, at('2026-11-20', 18)).up !== true) fails.push('in season after dark, the strands are not up')
  const ls = code(view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx'))
  if (!/const hang = !up \? 'none' : show \? 'all' : 'glow'/.test(ls)) fails.push("LightShow: what hangs is not 'none' when not up, 'all' in a show, the glow's strands otherwise")
  if (!/pinRef\.current\.visible = !!show/.test(ls)) fails.push('LightShow: the pinnacle strips are visible outside a show')
  if (!/const core = useMemo\(\(\) => new THREE\.MeshBasicMaterial\(\{[^}]*blending: THREE\.AdditiveBlending/.test(ls) || !/: \[0, 0, 0\]\n/.test(ls)) fails.push('LightShow: an unlit bulb is not exactly nothing (its light must be additive, black adding 0, inside clear glass)')
  // The show OVERTAKES the glow: a bulb is the show's where the show has reached it, else (a real strand, lit) the glow's.
  if (!/const rgb = r === 'spark' \? \[255, 246, 228\] : r === 'on' \? show\.colour\(c, row\)[^:]*: real && mode !== 'off' \? glowColour\(/.test(ls)) fails.push('LightShow: the show does not overtake the glow bulb by bulb (the show\'s colour where its front has passed, the glow\'s ahead of it)')
  if (!/\{ mode, t, up \} = liveState\(/.test(ls)) fails.push('LightShow: the live path does not take `up` from liveState')
  // Stage can preview each state, the strands hung unlit included (Jacob: "Live, Off, Glow, Show").
  const stage = code(stageMut ? stageMut(sourceOf('src/stage/StageApp.jsx')) : sourceOf('src/stage/StageApp.jsx'))
  if (!/\['live', 'off', 'glow', 'show'\]\.map/.test(stage)) fails.push("Stage's Displays section does not offer Live, Off, Glow and Show")
  if (!/let mode, t, now, up = true/.test(ls)) fails.push("LightShow: Stage's preview does not hang the strands (Off must show them, unlit)")
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ the strands hang when they should not:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ the strands hang only in season (dark by day, lit after dark, gone out of it and with no calendar), the glow\'s strands at glow and all of them in a show; an unlit bulb adds nothing, so it is clear glass')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['strands up out of season', { engine: (s) => s.replace('const up = inSeason(calendar, display.season, clock.date, where), span', 'const up = true, span') }],
    ['strands hung regardless of the season', { view: (s) => s.replace("const hang = !up ? 'none' : show ? 'all' : 'glow'", "const hang = show ? 'all' : 'glow'") }],
    ['the glow faded out under the show, not overtaken', { view: (s) => s.replace(": real && mode !== 'off' ? glowColour(", ": real && mode === 'glow' ? glowColour(") }],
    ['Stage without the Off preview', { stageMut: (s) => s.replace("['live', 'off', 'glow', 'show'].map", "['live', 'glow', 'show'].map") }],
    ['the preview not hanging the strands', { view: (s) => s.replace('let mode, t, now, up = true', 'let mode, t, now, up = false') }],
    ['an unlit bulb drawn black, not clear', { view: (s) => s.replace('blending: THREE.AdditiveBlending, depthWrite: false }), [])\n  const dark', 'depthWrite: false }), [])\n  const dark') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
