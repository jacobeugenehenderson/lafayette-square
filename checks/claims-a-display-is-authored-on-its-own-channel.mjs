#!/usr/bin/env node
/**
 * "IS A DISPLAY AUTHORED ON ITS OWN LOOK CHANNEL, AND DOES THE DEFAULT DO WHAT THE SHOW DID?" (Jacob, 2026-11-01,
 * r-a-display-is-authored-on-its-own-look-channel; Boz's rulings and Zob's conditions on the plan, same day)
 *
 * Through src/displays/showChannel.js and animatedParam.js#keyedStepAt, on synthetic channels:
 *   1. showEvery is STEP-HELD: between a key of 60 and a key of 120 it is 60, never a tweened value; from the later key
 *      on it is 120; before the day's first key the last key holds across midnight;
 *   2. glow and show fade with the marks, and a fade of 0 is a hard switch; kelvin is never faded (a colour has no off);
 *   3. a channel is refused by name for: a showEvery that does not divide 1440 (50), 0, below 0, not whole; a field
 *      missing; an unknown field; an unknown slot; a kelvin outside the colour model; not keyed on the day; a mark on a
 *      slot with no key;
 *   4. a Look keying a display the town lacks is refused by name; a display with no channel gets the default, a fresh
 *      copy each time;
 *   5. the default is the old Light Show's: show = the old SHOW_GAIN, glow = the old GLOW_GAIN × the old shimmer's
 *      time-averaged mean, read from LightShow.jsx and engine.js#glowColour (never typed here); kelvin is the
 *      temperature whose kelvinToRgb is nearest the old glow's colour; and over every day of a year at a test point,
 *      the default glows exactly inside the old dusk-to-dawn span (engine.js#glowSpan) at every fifth minute.
 * Usage: node checks/claims-a-display-is-authored-on-its-own-channel.mjs [--mutants] [--kelvin]
 *   --kelvin: prints the nearest temperature and its residual against the old glow colour.
 * ⚠️ Item 3 of the plan deletes SHOW_GAIN / GLOW_GAIN and the old shimmer; 5 then moves to a pinned reading.
 */
import { importSource, sourceOf } from './_importSource.mjs'

const DAY = 1440
const TEST_POINT = { lat: 42.05, lon: -70.19, tz: 'America/New_York' }   // a mid-latitude test point, not a town
const key = (o = {}) => ({ glow: 1, show: 2, kelvin: 3000, showEvery: 60, ...o })
const refuses = (f, re) => { try { f(); return false } catch (e) { return re.test(e.message) } }
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e

async function verdict({ chan, param, view } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const redirect = param ? { 'src/cartograph/animatedParam.js': { transform: param } } : undefined
  const S = await importSource('src/displays/showChannel.js', { ...(chan ? { transform: chan } : {}), ...(redirect ? { redirect } : {}) })
  const SM = { dawn: 360, sunrise: 390, noon: 720, golden: 1000, sunset: 1050, dusk: 1080, night: 1150, deep: 1440 - 20 }
  // 1. step-held
  const step = { animated: 'tod', values: { dusk: key({ showEvery: 60 }), night: key({ showEvery: 120 }) } }
  const mid = (SM.dusk + SM.night) / 2
  F(S.displayAt(step, mid, SM).showEvery === 60, `between keys of 60 and 120 showEvery is ${S.displayAt(step, mid, SM).showEvery}, not 60 (tweened?)`)
  F(S.displayAt(step, SM.night, SM).showEvery === 120, 'at the later key showEvery is not 120')
  F(S.displayAt(step, 600, SM).showEvery === 120, "before the day's first key the last key does not hold across midnight")
  // 2. fades; 0 is a hard switch; kelvin unfaded
  const d = S.defaultDisplayChannel()
  F(S.displayAt(d, SM.dusk - 1, SM).glow === 0 && S.displayAt(d, SM.dusk - 1, SM).show === 0, 'the default is not off before dusk')
  F(near(S.displayAt(d, SM.dusk, SM).glow, d.values.dusk.glow) && near(S.displayAt(d, SM.dusk + 1, SM).glow, d.values.dusk.glow), 'the default does not switch on hard at dusk (fade not 0?)')
  F(near(S.displayAt(d, SM.dawn - 1, SM).glow, d.values.dawn.glow) && S.displayAt(d, SM.dawn, SM).glow === 0, 'the default does not switch off hard at dawn')
  const slow = { animated: 'tod', values: { dusk: key({ kelvin: 2000 }), dawn: key({ kelvin: 2000 }) }, edges: { dusk: { fade: 'up', minutes: 0 }, dawn: { fade: 'down', minutes: 30 } } }
  const at = S.displayAt(slow, SM.dawn + 10, SM)
  F(at.glow > 0 && at.glow < 1, `a 30-minute fade-down is not part way 10 minutes in (glow ${at.glow})`)
  F(at.kelvin === 2000, `kelvin is faded with the level (${at.kelvin} K, 10 minutes into a fade-down)`)
  // 3. refusals
  const one = (k, extra = {}) => ({ animated: 'tod', values: { dusk: k }, ...extra })
  const R = (ch, re, what) => F(refuses(() => S.validateDisplayChannel(ch, 'check'), re), `${what} is not refused by name`)
  R(one(key({ showEvery: 50 })), /showEvery \(50\) must be a whole number of minutes that divides the day/, 'a showEvery of 50 (does not divide 1440)')
  R(one(key({ showEvery: 0 })), /showEvery \(0\)/, 'a showEvery of 0')
  R(one(key({ showEvery: -60 })), /showEvery \(-60\)/, 'a negative showEvery')
  R(one(key({ showEvery: 60.5 })), /showEvery \(60\.5\)/, 'a showEvery not whole')
  const { kelvin, ...noK } = key(); void kelvin
  R(one(noK), /kelvin is not authored/, 'a key with no kelvin')
  R(one(key({ hue: 3 })), /"hue" is not a display field/, 'an unknown field')
  R({ animated: 'tod', values: { midnight: key() } }, /"midnight" is not a time-of-day slot/, 'an unknown slot')
  R(one(key({ kelvin: 500 })), /500 K is outside the colour model/, 'a kelvin outside the model')
  R({ values: { glow: 1 } }, /keyed on the day/, 'a channel not keyed on the day')
  R(one(key(), { edges: { dawn: { fade: 'down', minutes: 0 } } }), /a fade mark at dawn, which has no key/, 'a mark on a slot with no key')
  // 4. identity vs Look
  const ids = { monument: {}, arch: {} }
  F(refuses(() => S.displayChannelsFor(ids, { tower: one(key()) }, 'check'), /keys a display "tower" the town does not have/), 'a Look keying a display the town lacks is not refused by name')
  const got = S.displayChannelsFor(ids, { monument: one(key()) }, 'check')
  F(got.arch && JSON.stringify(got.arch) === JSON.stringify(S.defaultDisplayChannel()), 'a display with no channel does not get the default')
  const a = S.defaultDisplayChannel(); a.values.dusk.glow = 99
  F(S.defaultDisplayChannel().values.dusk.glow !== 99, 'the default is shared, not a fresh copy')
  // 5. the default is the old show
  const ls = view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx')
  const g = ls.match(/const SHOW_GAIN = ([\d.]+), GLOW_GAIN = ([\d.]+)/)
  F(g, 'LightShow.jsx no longer states SHOW_GAIN / GLOW_GAIN: re-aim 5 at a pinned reading')
  const E = await importSource('src/displays/lightShow/engine.js')
  let wSum = 0, n = 0
  for (let s = 0; s < 600; s += 0.05) { const c = E.glowColour(3, 7, s); wSum += c[0] / 255; n++ }
  const wMean = wSum / n, old = E.glowColour(3, 7, 0).map((v, _i, a) => v / a[0] * 255)
  if (g) {
    F(near(d.values.dusk.show, Number(g[1])) && near(d.values.dawn.show, Number(g[1])), `the default show (${d.values.dusk.show}) is not the old SHOW_GAIN (${g[1]})`)
    F(near(d.values.dusk.glow, Number(g[2]) * wMean, 0.01), `the default glow (${d.values.dusk.glow}) is not the old GLOW_GAIN × the shimmer's mean (${(Number(g[2]) * wMean).toFixed(3)})`)
  }
  let best = null
  for (let K = 1000; K <= 40000; K += 10) { const c = S.kelvinToRgb(K), m = Math.max(...c), r = Math.hypot(...c.map((v, i) => v / m * 255 - old[i])); if (!best || r < best.r) best = { K, r } }
  F(d.values.dusk.kelvin === best.K && d.values.dawn.kelvin === best.K, `the default kelvin (${d.values.dusk.kelvin}) is not the nearest to the old glow (${best.K} K, residual ${best.r.toFixed(1)})`)
  if (process.argv.includes('--kelvin') && !chan && !param && !view) console.log(`   nearest ${best.K} K to the old glow [${old.map(v => v.toFixed(0))}], residual ${best.r.toFixed(1)} of 255`)
  const { todSlotMinutesAt } = await importSource('src/lib/todSlots.js')
  let miss = null
  for (let day = 0; day < 365 && !miss; day++) {
    const date = new Date(Date.UTC(2026, 0, 1 + day, 17)), sm = todSlotMinutesAt(date, TEST_POINT)
    const span = E.glowSpan({ dusk: sm.dusk, dawn: sm.dawn })
    for (let m = 0; m < DAY && !miss; m += 5) {
      const inside = !!span && (span.len === DAY || ((m - span.from) % DAY + DAY) % DAY < span.len)
      if ((S.displayAt(d, m, sm).glow > 0) !== inside) miss = `${date.toISOString().slice(0, 10)} minute ${m}: the default ${inside ? 'is dark inside' : 'glows outside'} the old dusk-to-dawn span`
    }
  }
  F(!miss, miss)
  return fails
}

const fails = await verdict()
if (fails.length) { console.log('⛔ a display is not authored on its own channel:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log("✅ a display is authored on its own channel: showEvery step-held, fades with 0 a hard switch, kelvin unfaded, refused by name, the default is the old show")

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['showEvery tweened', { chan: (s) => s.replace("showEvery: keyedStepAt(ch, 'showEvery', minute, slotMinutes)", "showEvery: resolveGroupAtMinute(unfaded, minute, slotMinutes, ['showEvery']).showEvery") }],
    ['a step held from the key after', { param: (s) => s.replace('for (const p of pts) if (p.minute <= minute) held = p', 'for (const p of pts) if (p.minute < minute) held = p') }],
    ['the default fades in over 30 minutes', { chan: (s) => s.replace("edges: { dusk: { fade: 'up', minutes: 0 }", "edges: { dusk: { fade: 'up', minutes: 30 }") }],
    ['the default fades out over 30 minutes', { chan: (s) => s.replace("dawn: { fade: 'down', minutes: 0 } } }", "dawn: { fade: 'down', minutes: 30 } } }") }],
    ['kelvin faded with the level', { chan: (s) => s.replace("resolveGroupAtMinute(unfaded, minute, slotMinutes, ['kelvin'])", "resolveGroupAtMinute(ch, minute, slotMinutes, ['kelvin'])") }],
    ['a cadence that does not divide the day accepted', { chan: (s) => s.replace(' || DAY_MIN % k.showEvery)', ')') }],
    ['a missing field accepted', { chan: (s) => s.replace("for (const f of DISPLAY_CHANNEL_FIELDS) if (typeof k?.[f] !== 'number'", "for (const f of []) if (typeof k?.[f] !== 'number'") }],
    ['an unknown display accepted', { chan: (s) => s.replace('if (!ids.includes(id)) throw', 'if (false) throw') }],
    ['a display with no channel left without one', { chan: (s) => s.replace(': defaultDisplayChannel()]))', ': null]))') }],
    ['the default shared, not copied', { chan: (s) => s.replace('return JSON.parse(JSON.stringify(DEFAULT))', 'return DEFAULT') }],
    ['the default show dimmer than the old', { chan: (s) => s.replace('show: 2.4,', 'show: 2,') }],
    ['the default glow without the shimmer (1.7 × 0.9)', { chan: (s) => s.replace('glow: 1.36,', 'glow: 1.53,') }],
    ['the default kelvin at 2200', { chan: (s) => s.replace('export const DEFAULT_KELVIN = 3810', 'export const DEFAULT_KELVIN = 2200') }],
    ['the old gains changed under the default', { view: (s) => s.replace('const SHOW_GAIN = 2.4,', 'const SHOW_GAIN = 3,') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
