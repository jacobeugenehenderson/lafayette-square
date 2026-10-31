#!/usr/bin/env node
/**
 * "DOES THE LIGHT SHOW GLOW DUSK TO DAWN AND PLAY ON THE HOUR?" (r-the-lights-run-dusk-to-dawn-and-the-show-plays-on-
 * the-hour; Jacob, 2026-10-31: "Hourly on the hour, dusk until dawn is fine"; Boz's calls (a) and (b), same day)
 *
 * The schedule is the plugin's (src/displays/lightShow/engine.js#glowSpan, #showtimes, #liveState). On synthetic nights:
 *   1. it glows from dusk to dawn, across midnight, and is off outside;
 *   2. a show starts at every whole hour inside the glow and nowhere else, t counting from the hour; and a whole hour
 *      the show cannot finish before dawn is no showtime (never clipped);
 *   3. a night with no dusk (white nights) has no glow and no show; a night with no dawn (polar night) glows the whole
 *      town day with a show every hour;
 *   4. a whole hour is the TOWN's :00 through a change of clocks (townClockOf, America/New_York, 2026-11-01);
 *   5. the record refuses, by name, a show longer than the hour, and a `shows` field (the schedule has no knobs);
 *   6. the live path asks the schedule with the town's clock and the town's night (nightAt), never the sun's altitude.
 *
 * Usage: node checks/claims-a-light-show-runs-dusk-to-dawn-on-the-hour.mjs [--mutants]
 *   --mutants: midnight not wrapped · a late hour kept past dawn · a show on the half hour · white nights glowing ·
 *   polar night dark · the refusal of a long show dropped · the live path on the sun's altitude, each red.
 */
import { importSource, sourceOf } from './_importSource.mjs'

const S = 300, C = { segs: [], seconds: S - 2 * 3.8 }                       // a five-minute show (OPEN_SECONDS each end)
const D = { season: 'lights' }, CAL = [{ id: 'lights', start_date: '2026-11-01', end_date: '2027-01-01' }]
const hm = (h, m = 0, s = 0) => ({ date: '2026-11-20', hours: h, minutes: m, seconds: s })
const NIGHT = { dusk: 16 * 60 + 32, dawn: 6 * 60 + 3 }                       // 06:00's show would end at 06:05, past dawn

async function verdict({ engine, view } = {}) {
  const E = await importSource('src/displays/lightShow/engine.js', engine ? { transform: engine } : {})
  const { townClockOf } = await importSource('src/lib/townClock.js')
  const fails = [], F = (cond, msg) => { if (!cond) fails.push(msg) }
  const st = (night, clock) => E.liveState(D, { ...C }, clock, CAL, night, 'check')
  // 1. glow dusk to dawn, across midnight.
  F(st(NIGHT, hm(16, 31)).mode === 'off', 'before dusk the display is not off')
  F(st(NIGHT, hm(16, 33)).mode === 'glow', 'just after dusk it does not glow')
  F(st(NIGHT, hm(2, 30)).mode === 'glow', 'after midnight, before dawn, it does not glow (midnight not wrapped)')
  F(st(NIGHT, hm(6, 4)).mode === 'off', 'after dawn the display is not off')
  // 2. a show at each whole hour inside the glow, t from the hour; none on the half hour; none it cannot finish.
  const times = E.showtimes(NIGHT, S), want = [0, 1, 2, 3, 4, 5, 17, 18, 19, 20, 21, 22, 23].map(h => h * 60)
  F(JSON.stringify(times) === JSON.stringify(want), `tonight's showtimes are ${times.map(m => m / 60)}, not ${want.map(m => m / 60)}`)
  const s21 = st(NIGHT, hm(21, 0, 0)), s21e = st(NIGHT, hm(21, 4, 59)), s21x = st(NIGHT, hm(21, 5, 0))
  F(s21.mode === 'show' && s21.t === 0, `at 21:00:00 the show does not begin (${s21.mode}, t ${s21.t})`)
  F(s21e.mode === 'show' && s21e.t === 299, 'at 21:04:59 the show is not 299 s in')
  F(s21x.mode === 'glow', 'after the show it does not settle back to the glow')
  F(st(NIGHT, hm(21, 30)).mode === 'glow', 'on the half hour it is not simply glowing')
  F(st(NIGHT, hm(6, 1)).mode === 'glow', 'the 06:00 show plays though it cannot finish before dawn (06:03)')
  // 3. white nights and polar night.
  const white = { dusk: null, dawn: null }, polar = { dusk: 0, dawn: null }
  F(E.showtimes(white, S).length === 0 && st(white, hm(23)).mode === 'off', 'a night with no dusk glows or shows')
  F(E.showtimes(polar, S).length === 24 && st(polar, hm(12, 30)).mode === 'glow' && st(polar, hm(12, 0, 10)).mode === 'show', 'a night with no dawn does not glow all day with a show every hour')
  // 4. the town's :00 through the change of clocks (US clocks fall back at 02:00 on 2026-11-01).
  const tz = 'America/New_York', dst = { dusk: 16 * 60 + 40, dawn: 6 * 60 + 30 }, starts = []
  for (let ms = Date.UTC(2026, 10, 1, 4, 0); ms < Date.UTC(2026, 10, 1, 12, 0); ms += 60_000) {
    const c = townClockOf(new Date(ms), tz), r = E.liveState(D, { ...C }, c, CAL, dst, 'check')
    if (r.mode === 'show' && r.t === 0) starts.push(c.hhmm)
  }
  F(starts.every(h => h.endsWith(':00')), `a show began off the town's whole hour: ${starts}`)
  F(starts.filter(h => h === '01:00').length === 2, `the repeated 01:00 of the change of clocks did not get both its shows: ${starts}`)
  // 5. the record's refusals.
  const drawer = { frame: { w: 8, h: 6, pinH: 2, faces: 4 }, looks: [{ id: 'a', layers: [{ motion: { kind: 'still' }, frames: ['x'] }] }] }
  const rec = (extra) => ({ id: 'd', season: 's', strands: { glow: 1, show: 1, ringRadiusM: 1, footHeightM: 1 }, run: [{ look: 'a', seconds: 60 }], ...extra })
  const refuses = (r, named) => { try { E.validateDisplay(r, drawer, 'check'); return false } catch (e) { return named.test(e.message) } }
  F(refuses(rec({ run: [{ look: 'a', seconds: 3700 }] }), /longer than the hour/), 'a show longer than the hour is not refused by name')
  F(refuses(rec({ shows: { every: 'hour' } }), /shows/), 'a `shows` field is not refused by name')
  let ok = true; try { E.validateDisplay(rec(), drawer, 'check') } catch { ok = false }
  F(ok, 'a good record is refused')
  // 6. the live path: the town's clock and the town's night.
  const ls = (view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx')).replace(/\/\/.*$/gm, '')
  F(/liveState\(display, compiled, townClockOf\(instant\), calendar, nightAt\(instant\), where\)/.test(ls) && !/sunAltitude/.test(ls), "LightShow's live path does not ask the schedule with the town's clock and nightAt")
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ the Light Show does not keep its schedule:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ the Light Show glows dusk to dawn across midnight and plays at every whole town hour it can finish; white nights dark, polar night all day; a long show and a `shows` field refused by name')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['midnight not wrapped', { engine: (s) => s.replace('return { from: night.dusk, len: ((night.dawn - night.dusk) % DAY_MIN + DAY_MIN) % DAY_MIN }', 'return { from: night.dusk, len: Math.max(0, night.dawn - night.dusk) }') }],
    ['a late hour kept past dawn', { engine: (s) => s.replace('offsetIn(span, h * 60) + seconds / 60 <= span.len', 'offsetIn(span, h * 60) < span.len') }],
    ['a show on the half hour', { engine: (s) => s.replace('const t = clock.minutes * 60 + clock.seconds, seconds', 'const t = (clock.minutes % 30) * 60 + clock.seconds, seconds') }],
    ['white nights glowing', { engine: (s) => s.replace('if (night.dusk == null) return null', 'if (night.dusk == null) return { from: 0, len: DAY_MIN }') }],
    ['polar night dark', { engine: (s) => s.replace('if (night.dawn == null) return { from: 0, len: DAY_MIN }', 'if (night.dawn == null) return null') }],
    ['the refusal of a long show dropped', { engine: (s) => s.replace('if (showSeconds(compiled) > 3600)', 'if (false)') }],
    ['the live path on the sun\'s altitude', { view: (s) => s.replace('calendar, nightAt(instant), where)', 'calendar, useTimeOfDay.getState().getLightingPhase().sunAltitude < 0, where)') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
