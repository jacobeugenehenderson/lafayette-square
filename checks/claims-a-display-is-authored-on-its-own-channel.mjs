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
 *      the default glows exactly inside the old dusk-to-dawn span (engine.js#glowSpan) at every fifth minute;
 *   6. the scene bake carries every registered town's displays, each its Look's channel or the default, through
 *      displayChannelsFor (so a display the town lacks fails the bake), read from the town's own instance records.
 * Usage: node checks/claims-a-display-is-authored-on-its-own-channel.mjs [--mutants] [--kelvin]
 *   --kelvin: prints the nearest temperature and its residual against the old glow colour.
 *   7. the renderer lights the bulbs from the channel: the show's colour × the channel's show, the glow from the
 *      channel's kelvin and glow through engine.js#glowColour, whose shimmer is centred on 1 (its time-average is the
 *      channel's level) with the old relative swing; no gain constant left in LightShow.jsx. <Displays> passes each
 *      display its channel from scene.json#displays, and refuses by name a scene that carries none, and a scene that
 *      could not be read (useSceneJson.js#sceneReadFailure: a 404 or bad JSON a Refusal, a 5xx or no answer a Transient).
 * "The old" is the code as it was at PIN (1b833418, the integration tip the channel was built on), read with `git show`:
 * the pinned blob is the source, so it cannot drift (Zob, 2026-11-01). Without that history git fails, loudly.
 */
import { importSource, sourceOf } from './_importSource.mjs'
import { execFileSync } from 'node:child_process'

const PIN = '1b833418'
const atPin = (rel) => execFileSync('git', ['show', `${PIN}:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const DAY = 1440
const TEST_POINT = { lat: 42.05, lon: -70.19, tz: 'America/New_York' }   // a mid-latitude test point, not a town
const key = (o = {}) => ({ glow: 1, show: 2, kelvin: 3000, showEvery: 60, ...o })
const refuses = (f, re) => { try { f(); return false } catch (e) { return re.test(e.message) } }
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e

async function verdict({ chan, param, view, bake, eng, mount, pin, hook } = {}) {
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
  // 5. the default is the old show (read at PIN)
  const oldLs = pin ? pin(atPin('src/displays/lightShow/LightShow.jsx')) : atPin('src/displays/lightShow/LightShow.jsx')
  const g = oldLs.match(/const SHOW_GAIN = ([\d.]+), GLOW_GAIN = ([\d.]+)/)
  const og = atPin('src/displays/lightShow/engine.js').match(/w = ([\d.]+) \+ ([\d.]+) \* Math\.sin\(now \* 1\.5 \+ h \* 30\); return \[(\d+) \* w, (\d+) \* w, (\d+) \* w\]/)
  F(g && og, `the old gains or the old glowColour are not found at ${PIN}`)
  const [oa, ob] = og ? [Number(og[1]), Number(og[2])] : [NaN, NaN], old = og ? [3, 4, 5].map(i => Number(og[i]) / Number(og[3]) * 255) : [NaN, NaN, NaN]
  let oSum = 0, on = 0
  for (let t = 0; t < 600; t += 0.05) { oSum += oa + ob * Math.sin(t * 1.5); on++ }
  const wMean = oSum / on
  if (g) {
    F(near(d.values.dusk.show, Number(g[1])) && near(d.values.dawn.show, Number(g[1])), `the default show (${d.values.dusk.show}) is not the old SHOW_GAIN (${g[1]})`)
    F(near(d.values.dusk.glow, Number(g[2]) * wMean, 0.01), `the default glow (${d.values.dusk.glow}) is not the old GLOW_GAIN × the old shimmer's mean (${(Number(g[2]) * wMean).toFixed(3)})`)
  }
  const E = await importSource('src/displays/lightShow/engine.js', eng ? { transform: eng } : {})
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
  // 7. the renderer lights from the channel
  F(near(E.GLOW_SHIMMER, ob / oa), `the glow's shimmer swing (${E.GLOW_SHIMMER}) is not the old relative swing (${(ob / oa).toFixed(3)})`)
  let nSum = 0, nn = 0
  for (let t = 0; t < 600; t += 0.05) { nSum += E.glowColour([200, 100, 50], 1.36, 3, 7, t)[0]; nn++ }
  F(near(nSum / nn / 200, 1.36, 0.01), `the glow's time-average (${(nSum / nn / 200).toFixed(3)}) is not the channel's level (1.36): the shimmer is not centred on 1`)
  const ls = view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx')
  F(/show\.colour\(c, row\)\.map\(v => v \* lit\.show\) : real && mode !== 'off' \? glowColour\(warm, lit\.glow, c, j, now\)/.test(ls), 'LightShow does not light the show by the channel\'s show and the glow by its kelvin and glow')
  F(/lit = displayAt\(channel, tod\.getMinuteOfDay\(\), getTodSlotMinutes\(instant\)\), warm = kelvinToRgb\(lit\.kelvin\)/.test(ls), 'LightShow does not read the channel at the town\'s minute')
  F(!/_GAIN\b/.test(ls.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'a gain constant is left in LightShow.jsx')
  const dj = mount ? mount(sourceOf('src/displays/Displays.jsx')) : sourceOf('src/displays/Displays.jsx')
  F(/<P\.Renderer display=\{d\} channel=\{scene\.displays\[d\.id\]\}/.test(dj) && /: !scene\.displays\?\.\[d\.id\] \? `\$\{where\}: the Look's scene\.json carries no channel for it/.test(dj), '<Displays> does not pass each display its baked channel, or does not refuse a scene with none')
  F(/if \(!list\.length \|\| \(!scene && !failed\)\) return null/.test(dj) && /: failed \? failed\n/.test(dj), '<Displays> goes silent on a scene.json that could not be read (it must refuse it by name)')
  const H = await importSource('src/lib/useSceneJson.js', { span: { functions: ['fetchSceneOnce', 'sceneReadFailure'] },
    prefix: "import { Refusal, Transient, httpFailure } from './refusal.js'\nconst _cache = new Map(), _failed = new Map(), _fetchOpts = undefined\nlet slabFetch = null\nexport const setFetch = (f) => { slabFetch = f }\nexport { Refusal, Transient }\n",
    suffix: '\nexport { fetchSceneOnce, sceneReadFailure }', ...(hook ? { transform: hook } : {}) })
  const realWarn = console.warn; console.warn = () => {}
  const reads = [['a 404', { ok: false, status: 404 }, 'Refusal'], ['a 503', { ok: false, status: 503 }, 'Transient'],
    ['bad JSON', { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token') } }, 'Refusal'], ['no answer', null, 'Transient']]
  for (const [what, res, kind] of reads) {
    H.setFetch(async () => { if (!res) throw new TypeError('Failed to fetch'); return res })
    await H.fetchSceneOnce(`l-${what}`, 0)
    const e = H.sceneReadFailure(`l-${what}`, 0)
    F(e instanceof H[kind] && !(kind === 'Refusal' && e instanceof H.Transient), `a scene.json read that ends in ${what} is not recorded as a ${kind} (${e?.constructor?.name ?? 'nothing'})`)
  }
  H.setFetch(async () => ({ ok: true, status: 200, json: async () => ({ displays: {} }) }))
  await H.fetchSceneOnce('l-ok', 0)
  F(H.sceneReadFailure('l-ok', 0) === null, 'a scene.json that was read is recorded as failed')
  console.warn = realWarn
  // 6. the scene bake carries the displays
  const bs = bake ? bake(sourceOf('cartograph/bake-scene.js')) : sourceOf('cartograph/bake-scene.js')
  F(/^\s*displays: displayChannelsFor\(displayRecordsOf\(look\), design\.displays, `bake-scene \$\{look\}`\),$/m.test(bs), 'bake-scene does not write displays through displayChannelsFor with the town\'s records')
  const B = await importSource('cartograph/bake-scene.js', { span: { functions: ['displayRecordsOf'] }, prefix: "import { instanceForMap } from '../src/instances/registry.js'\nimport { mapForLook } from './tree-bake-inputs.mjs'\n", suffix: '\nexport { displayRecordsOf }', ...(bake ? { transform: bake } : {}) })
  const REG = await importSource('src/instances/registry.js')
  for (const m of REG.registeredMaps()) {
    const inst = REG.instanceForMap(m), want = (inst.displays || []).map(x => x.id).sort().join(','), got = Object.keys(S.displayChannelsFor(B.displayRecordsOf(inst.lookId), undefined, m)).sort().join(',')
    F(got === want, `the bake gives "${inst.lookId}" displays [${got}], not its town's [${want}]`)
  }
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
    ['the bake writing the Look\'s displays raw', { bake: (s) => s.replace('displays: displayChannelsFor(displayRecordsOf(look), design.displays, `bake-scene ${look}`),', 'displays: design.displays || {},') }],
    ['the bake reading no town', { bake: (s) => s.replace("return Object.fromEntries((displays || []).map(d => [d.id, d]))", "return {}") }],
    ['the bake matching the town by its Look id, not its scene', { bake: (s) => s.replace('const displays = scene ? instanceForMap(scene)?.displays : undefined', "const displays = instanceForMap(look + '-look')?.displays") }],
    ['the old gains read differently', { pin: (s) => s.replace('const SHOW_GAIN = 2.4,', 'const SHOW_GAIN = 3,') }],
    ['a gain put back on the show', { view: (s) => s.replace('v => v * lit.show)', 'v => v * lit.show * SHOW_GAIN)').replace("import { getTodSlotMinutes }", "const SHOW_GAIN = 1.2\nimport { getTodSlotMinutes }") }],
    ['the glow at a fixed level', { view: (s) => s.replace('glowColour(warm, lit.glow, c, j, now)', 'glowColour(warm, 1.7, c, j, now)') }],
    ['the shimmer not centred on 1', { eng: (s) => s.replace('w = level * (1 + GLOW_SHIMMER * Math.sin(', 'w = level * (0.8 + 0.2 * Math.sin(') }],
    ['the shimmer swing changed', { eng: (s) => s.replace('export const GLOW_SHIMMER = 0.25', 'export const GLOW_SHIMMER = 0.2') }],
    ['<Displays> passing no channel', { mount: (s) => s.replace(' channel={scene.displays[d.id]}', '') }],
    ['<Displays> silent on a failed read', { mount: (s) => s.replace('if (!list.length || (!scene && !failed)) return null', 'if (!list.length || !scene) return null') }],
    ['a failed read not recorded', { hook: (s) => s.replace('_failed.set(key,', 'void (key,') }],
    ['a 404 taken for the network', { hook: (s) => s.replace("if (!r.ok) throw httpFailure(r,", "if (!r.ok) throw new Transient(") }],
    ['<Displays> not refusing a scene with none', { mount: (s) => s.replace(": !scene.displays?.[d.id] ? `${where}: the Look's scene.json carries no channel for it", ": false ? `${where}: the Look's scene.json carries no channel for it") }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await verdict(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
