#!/usr/bin/env node
/**
 * "IS A DISPLAY AUTHORED ON ITS OWN LOOK CHANNEL, AND DOES THE DEFAULT DO WHAT THE SHOW DID?" (Jacob, 2026-11-01,
 * r-a-display-is-authored-on-its-own-look-channel; Boz's rulings and Zob's conditions on the plan, same day)
 *
 * Through src/displays/showChannel.js, on synthetic channels (a channel's WHEN, its schedule, is
 * checks/claims-a-display-keeps-its-schedule.mjs, which also proves every published shape plays exactly as before):
 *   3. a channel is refused by name for: a level missing, unknown or below 0; an unknown slot; a kelvin outside the colour
 *      model; not keyed on the day; an unknown part; ▲/▼ marks on a display's keys beside a schedule (they retired into
 *      Ambient); no schedule;
 *   4. a Look keying a display the town lacks is refused by name; a display with no channel gets the default, a fresh
 *      copy each time;
 *   5. the default's LEVELS are the old Light Show's: show = the old SHOW_GAIN, glow = the old GLOW_GAIN × the old
 *      shimmer's time-averaged mean, read from LightShow.jsx and engine.js#glowColour at PIN (never typed here); kelvin is
 *      the temperature whose kelvinToRgb is nearest the old glow's colour;
 *   6. the scene bake carries every registered town's displays, each its Look's channel or the default, through
 *      displayChannelsFor, read from the town's own instance records;
 *   7. the renderer lights the bulbs from the schedule's state: the show's colour × its show, Ambient through
 *      engine.js#glowColour at its kelvin and glow, the shimmer centred on 1 with the old relative swing; no gain constant;
 *      <Displays> lights Stage from displayChannelsFor and the baked scene through showChannel.js#readPreDisplaySlab, a
 *      refusal named; a scene.json read that fails keeps its kind (a 404 or bad JSON a Refusal, a 5xx or none a Transient);
 *   9. STAGE EDITS IT: the store (the real displayChannelActions) copies the default on the first edit, seeds a new key
 *      with the levels there, never removes the last key, sets a schedule and refuses one that crowds the show or whose
 *      ends pass each other AT THE GESTURE, reads an old Look through its one reader and saves the new shape on its first
 *      write, refuses an invalid write and leaves the store as it was, saves, and reverts; the card's keys carry no ▲/▼;
 *      Stage lights the display from the store (the card's Schedule and Tonight: claims-the-schedule-card-changes-only-what-it-touches);
 *  10. a minute prints HH:MM and a length M:SS from the WHOLE minute / second (never 19:60 or 4:60).
 * Usage: node checks/claims-a-display-is-authored-on-its-own-channel.mjs [--mutants] [--kelvin]
 *   --kelvin: prints the nearest temperature and its residual against the old glow colour.
 * "The old" is the code at PIN (1b833418, the integration tip the channel was built on), read with `git show`.
 */
import { importSource, sourceOf, spanOf } from './_importSource.mjs'
import { execFileSync } from 'node:child_process'

const PIN = '1b833418b98ce845c53ec22f0618d172b36725e3'
const atPin = (rel) => execFileSync('git', ['show', `${PIN}:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const DAY = 1440
const TEST_POINT = { lat: 42.05, lon: -70.19, tz: 'America/New_York' }   // a mid-latitude test point, not a town
const key = (o = {}) => ({ glow: 1, show: 2, kelvin: 3000, ...o })
const refuses = (f, re) => { try { f(); return false } catch (e) { return re.test(e.message) } }
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e

async function verdict({ chan, param, view, bake, eng, mount, pin, hook, manifest, stage, store, wire } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const redirect = param ? { 'src/cartograph/animatedParam.js': { transform: param } } : undefined
  const S = await importSource('src/displays/showChannel.js', { ...(chan ? { transform: chan } : {}), ...(redirect ? { redirect } : {}) })
  const SM = { dawn: 360, sunrise: 390, noon: 720, golden: 1000, sunset: 1050, dusk: 1080, night: 1150, deep: 1440 - 20 }
  const d = S.defaultDisplayChannel()
  // 3. refusals (the schedule's own: claims-a-display-keeps-its-schedule)
  const one = (k, extra = {}) => ({ animated: 'tod', values: { dusk: k }, schedule: d.schedule, ...extra })
  const R = (ch, re, what) => F(refuses(() => S.validateDisplayChannel(ch, 'check'), re), `${what} is not refused by name`)
  const { kelvin, ...noK } = key(); void kelvin
  R(one(noK), /kelvin is not authored/, 'a key with no kelvin')
  R(one(key({ hue: 3 })), /"hue" is not a display level/, 'an unknown level')
  R(one(key({ glow: -1 })), /Ambient and show are levels, never below 0/, 'a level below 0')
  R(one(key(), { lights: 1 }), /"lights" is not part of a display channel/, 'an unknown part of a channel')
  R({ animated: 'tod', values: { midnight: key() }, schedule: d.schedule }, /"midnight" is not a time-of-day slot/, 'an unknown slot')
  R(one(key({ kelvin: 500 })), /500 K is outside the colour model/, 'a kelvin outside the model')
  R({ values: { glow: 1 } }, /keyed on the day/, 'a channel not keyed on the day')
  R(one(key(), { edges: { dusk: { fade: 'down', minutes: 0 } } }), /fade marks AND a schedule/, 'a fade mark on a display key (they retired into Ambient)')
  R({ animated: 'tod', values: { dusk: key() } }, /a display's schedule is a list of entries/, 'a channel with no schedule')
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
  // 7. the renderer lights from the channel
  F(near(E.GLOW_SHIMMER, ob / oa), `the glow's shimmer swing (${E.GLOW_SHIMMER}) is not the old relative swing (${(ob / oa).toFixed(3)})`)
  let nSum = 0, nn = 0
  for (let t = 0; t < 600; t += 0.05) { nSum += E.glowColour([200, 100, 50], 1.36, 3, 7, t)[0]; nn++ }
  F(near(nSum / nn / 200, 1.36, 0.01), `the glow's time-average (${(nSum / nn / 200).toFixed(3)}) is not the channel's level (1.36): the shimmer is not centred on 1`)
  const ls = view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx')
  F(/show\.colour\(c, row\)\.map\(v => v \* lit\.show\) : real && mode !== 'off' && !toDark \? glowColour\(warm, lit\.glow, c, j, now\)/.test(ls), 'LightShow does not light the show by the channel\'s show and Ambient by its kelvin and glow')
  F(/const lit = state, warm = kelvinToRgb\(lit\.kelvin\)/.test(ls), 'LightShow does not light from the schedule\'s state at the town\'s instant')
  F(!/_GAIN\b/.test(ls.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'a gain constant is left in LightShow.jsx')
  const dj = mount ? mount(sourceOf('src/displays/Displays.jsx')) : sourceOf('src/displays/Displays.jsx')
  F(/<P\.Renderer display=\{d\} channel=\{lit\[d\.id\]\}/.test(dj), '<Displays> does not pass each display its channel')
  F(/if \(live\) \{ try \{ lit = displayChannelsFor\(declared, live, /.test(dj) && /else if \(scene\) \{ try \{ lit = readPreDisplaySlab\(scene, declared, /.test(dj) && /: liveErr \? liveErr\n/.test(dj), "<Displays> does not light from Stage's live channels through displayChannelsFor, or the baked scene through readPreDisplaySlab, a refusal named")
  F(/if \(!list\.length \|\| \(!live && !scene && !failed\)\) return null/.test(dj) && /: failed \? failed\n/.test(dj), '<Displays> goes silent on a scene.json that could not be read (it must refuse it by name)')
  const H = await importSource('src/lib/useSceneJson.js', { span: { functions: ['fetchSceneOnce'] },
    prefix: "import { Refusal, Transient, httpFailure } from './refusal.js'\nconst _cache = new Map(), _fetchOpts = undefined\nlet slabFetch = null\nexport const setFetch = (f) => { slabFetch = f }\nexport { Refusal, Transient }\n",
    suffix: '\nexport { fetchSceneOnce }', ...(hook ? { transform: hook } : {}) })
  const realWarn = console.warn; console.warn = () => {}
  const reads = [['a 404', { ok: false, status: 404 }, 'Refusal'], ['a 503', { ok: false, status: 503 }, 'Transient'],
    ['bad JSON', { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token') } }, 'Refusal'], ['no answer', null, 'Transient']]
  for (const [what, res, kind] of reads) {
    H.setFetch(async () => { if (!res) throw new TypeError('Failed to fetch'); return res })
    const e = await H.fetchSceneOnce(`l-${what}`, 0).then(() => null, (x) => x)
    F(e instanceof H[kind] && !(kind === 'Refusal' && e instanceof H.Transient), `a scene.json read that ends in ${what} does not fail as a ${kind} (${e?.constructor?.name ?? 'nothing'})`)
  }
  H.setFetch(async () => ({ ok: true, status: 200, json: async () => ({ displays: {} }) }))
  F(await H.fetchSceneOnce('l-ok', 0).then(() => true, () => false), 'a scene.json that was read fails')
  console.warn = realWarn
  let named = false; try { E.runSeconds([{ look: 'a', seconds: 5 }, { transition: 'no-such' }, { look: 'a', seconds: 5 }]) } catch (e) { named = /transition "no-such"/.test(e.message) }
  F(named, "runSeconds (Stage's Tonight strip) does not refuse an unknown transition by name")
  const sa = stage ? stage(sourceOf('src/stage/StageApp.jsx')) : sourceOf('src/stage/StageApp.jsx')
  // 9. Stage edits it
  const ST = await importSource('src/cartograph/stores/useCartographStore.js', { span: { functions: ['displayChannelActions'] },
    prefix: "import { defaultDisplayChannel, validateDisplayChannel } from '../../displays/showChannel.js'\nimport { levelsAt, refuseShortCadence, refuseScheduleSense } from '../../displays/showSchedule.js'\nimport { NAMED_TOD_SLOTS_BY_ID } from '../animatedParam.js'\nimport { todSlotDays } from '../../lib/todSlots.js'\nexport let SM = null\nexport const setSM = (m) => { SM = m }\nconst getTodSlotMinutes = () => SM\nconst getTodSlotDaysAhead = (from, n) => todSlotDays({ lat: 42.05, lon: -70.19, tz: 'America/New_York' }, new Date('2026-06-01T16:00:00Z'), n)\nconst useTimeOfDay = { getState: () => ({ currentTime: new Date(0) }) }\n",
    suffix: '\nexport { displayChannelActions }', ...(store ? { transform: store } : {}) })
  ST.setSM(SM)
  let state = { displays: {} }, saves = 0
  const set = (f) => { const r = f(state); if (r !== state) state = { ...state, ...r } }
  const A = ST.displayChannelActions(set, () => ({ _saveDesignDebounced: () => { saves++ } }))
  A.setDisplayValue('m', 'glow', 0.5, 'dusk')
  F(state.displays.m?.values?.dusk?.glow === 0.5 && state.displays.m.values.dawn.glow === d.values.dawn.glow && JSON.stringify(state.displays.m.schedule) === JSON.stringify(d.schedule), `the first edit does not copy the default with the change (${JSON.stringify(state.displays.m).slice(0, 200)})`)
  const Hs = await importSource('src/displays/showSchedule.js')
  const was = Hs.levelsAt(state.displays.m, SM.night, SM)
  A.addDisplaySlot('m', 'night')
  const nk = state.displays.m.values.night
  F(nk && JSON.stringify(Object.keys(nk).sort()) === '["glow","kelvin","show"]' && Math.abs(nk.glow - was.glow) < 1e-9 && Math.abs(nk.kelvin - was.kelvin) < 1e-9, `a new key is not seeded with the channel's levels there (${JSON.stringify(was)}; ${JSON.stringify(nk)})`)
  A.removeDisplaySlot('m', 'night')
  F(!('night' in state.displays.m.values), 'removing a key leaves it')
  const jacob = [{ days: 'daily', ambient: { on: 'sunset', fadeIn: 15, off: 'after-last-show', fadeOut: 0 }, shows: { first: '19:00', last: '00:00', every: 60 } }]
  A.setDisplaySchedule('m', jacob, 302.2)
  F(JSON.stringify(state.displays.m.schedule) === JSON.stringify(jacob), 'a schedule is not set')
  const preSched = JSON.stringify(state)
  F(refuses(() => A.setDisplaySchedule('m', [{ ...jacob[0], shows: { ...jacob[0].shows, every: 4 } }], 302.2), /every 4 min is shorter than the show \(5:02\)/) && JSON.stringify(state) === preSched, 'an interval shorter than the show is not refused AT THE GESTURE, or it changed the store')
  F(refuses(() => A.setDisplaySchedule('m', [{ days: 'daily', ambient: { on: '19:00', fadeIn: 0, off: 'dusk', fadeOut: 0 }, shows: null }], 302.2), /pass each other here, so on \d+ days/) && JSON.stringify(state) === preSched, 'a schedule whose ends pass each other is not refused AT THE GESTURE naming the days, or it changed the store')
  // an old Look (the published per-key shape) loads; its first write saves the schedule's shape
  state = { ...state, displays: { ...state.displays, old: { animated: 'tod', values: { dawn: { glow: 1.36, show: 2.4, kelvin: 3810, showEvery: 60 }, sunset: { glow: 1.36, show: 2, kelvin: 2700, showEvery: 60 } }, edges: { dawn: { fade: 'down', minutes: 15 }, sunset: { fade: 'up', minutes: 15 } } } } }
  A.setDisplayValue('old', 'glow', 0.9, 'dawn')
  const sv = state.displays.old
  F(!('edges' in sv) && Object.values(sv.values).every(k => !('showEvery' in k)) && sv.values.dawn.glow === 0.9 && JSON.stringify(sv.schedule) === JSON.stringify([{ days: 'daily', ambient: { on: 'sunset', fadeIn: 15, off: 'dawn', fadeOut: 15 }, shows: { first: '00:00', last: '23:00', every: 60 } }]), `an old Look's first write does not save the schedule's shape (${JSON.stringify(sv).slice(0, 220)})`)
  A.removeDisplaySlot('m', 'dawn'); A.removeDisplaySlot('m', 'dusk')
  F(Object.keys(state.displays.m.values).length === 1, `the last key was removed (${Object.keys(state.displays.m.values)})`)
  const before = JSON.stringify(state)
  F(refuses(() => A.setDisplayValue('m', 'glow', -1, Object.keys(state.displays.m.values)[0]), /Ambient and show are levels, never below 0/) && JSON.stringify(state) === before, 'an invalid write is not refused by name, or it changed the store')
  F(saves >= 6, `a write did not save (${saves} saves)`)
  A.revertDisplay('m')
  F(!('m' in state.displays), 'revert does not drop the Look\'s channel (back to the default)')
  const storeSrc = sourceOf('src/cartograph/stores/useCartographStore.js')
  F(/\{ key: 'displays', hydrate: \(d\) => \(_isObj\(d\.displays\) \? JSON\.parse\(JSON\.stringify\(d\.displays\)\) : \{\}\) \}/.test(storeSrc) && /\.\.\.displayChannelActions\(set, get\)/.test(storeSrc), 'the store does not keep design.json#displays (hydrated and saved), or does not mount the actions')
  const w = (rel) => (wire ? wire(rel, sourceOf(rel)) : sourceOf(rel))
  F(/'labels', 'displays',\n\]/.test(w('src/cartograph/CartographApp.jsx')), "Stage's STAGE_CHANNELS does not carry displays to <Town>")
  const tw = w('src/components/Town.jsx')
  F(/'setPieceLight', 'displays',/.test(tw) && /displaysOverride=\{o\.displays\}/.test(tw), '<Town> does not take overrides.displays to <SetPiece>')
  F(/channels=\{displaysOverride\}/.test(w('src/components/SetPiece.jsx')), '<SetPiece> does not hand Stage\'s channels to <Displays>')
  const lit = sa.slice(sa.indexOf('function DisplayChannel('), sa.indexOf('const CAPTION = '))
  F(/<DisplayChannel display=\{d\} \/>/.test(sa) && /DISPLAY_FIELDS\.map\(f => \(/.test(lit) && /onChange=\{\(v\) => put\(\(\) => setValue\(id, f\.key, v, selected\)\)\}/.test(lit) && !/<TodChannel/.test(lit), "Stage's Displays section has no Lit card per display editing the selected key's levels through the store (not TodChannel: no ▲/▼, no clock-scrubbed chips)")
  // 10. HH:MM
  let badClock = null
  for (let t = -1; t <= 1441 && !badClock; t += 0.1) {
    const txt = E.hhmm(t), m = txt.match(/^(\d\d):(\d\d)$/), want = ((Math.round(t) % 1440) + 1440) % 1440
    if (!m || +m[1] > 23 || +m[2] > 59 || +m[1] * 60 + +m[2] !== want) badClock = `${t.toFixed(1)} prints "${txt}"`
  }
  F(!badClock, `a minute is printed wrong: ${badClock}`)
  let badLen = null
  for (let t = 0; t <= 1000 && !badLen; t += 0.1) { const txt = E.mmss(t), m = txt.match(/^(\d+):(\d\d)$/); if (!m || +m[2] > 59 || +m[1] * 60 + +m[2] !== Math.round(t)) badLen = `${t.toFixed(1)} s prints "${txt}"` }
  F(!badLen, `a show's length is not printed M:SS from the whole second (${badLen})`)
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

// A run that throws (a Refusal from the code under a mutant) is a failure, never a crash of the check.
const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ a display is not authored on its own channel:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log("✅ a display is authored on its own channel: its levels keyed on the slots and refused by name, the default the old show's levels, the renderer, the scene read and the store all on the one channel (its WHEN: claims-a-display-keeps-its-schedule)")

if (process.argv.includes('--mutants')) {
  const mutants = [
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
    ['a gain put back on the show', { view: (s) => s.replace('v => v * lit.show)', 'v => v * lit.show * SHOW_GAIN)').replace("import { getTodSlotRow, getTodSlotDaysAhead }", "const SHOW_GAIN = 1.2\nimport { getTodSlotRow, getTodSlotDaysAhead }") }],
    ['the glow at a fixed level', { view: (s) => s.replace('glowColour(warm, lit.glow, c, j, now)', 'glowColour(warm, 1.7, c, j, now)') }],
    ['the shimmer not centred on 1', { eng: (s) => s.replace('w = level * (1 + GLOW_SHIMMER * Math.sin(', 'w = level * (0.8 + 0.2 * Math.sin(') }],
    ['the shimmer swing changed', { eng: (s) => s.replace('export const GLOW_SHIMMER = 0.25', 'export const GLOW_SHIMMER = 0.2') }],
    ['<Displays> passing no channel', { mount: (s) => s.replace(' channel={lit[d.id]}', '') }],
    ['runSeconds silent on an unknown transition', { eng: (s) => s.replace('if (!TRANSITION[s.transition]) throw', 'if (false) throw') }],
    ['M:SS rounded per part (4:60)', { eng: (s) => s.replace('export const mmss = (seconds) => { const t = Math.round(seconds); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, \'0\')}` }', 'export const mmss = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, \'0\')}`') }],
    ['a level below 0 accepted', { chan: (s) => s.replace('if (k.glow < 0 || k.show < 0) throw', 'if (false) throw') }],
    ['a new key seeded with nothing', { store: (s) => s.replace('[slotId]: levelsAt(ch, sm[slotId], sm) }', '[slotId]: { glow: 0, show: 0, kelvin: 3000 } }') }],
    ['the gesture not judging the schedule', { store: (s) => s.replace('      refuseScheduleSense(next, getTodSlotDaysAhead(useTimeOfDay.getState().currentTime, 366), runSeconds, where)\n', '') }],
    ['a slider writing a key not selected', { stage: (s) => s.replace('onChange={(v) => put(() => setValue(id, f.key, v, selected))}', 'onChange={(v) => put(() => setValue(id, f.key, v, keys[0]))}') }],
    ['HH:MM split before rounding (19:60)', { eng: (s) => s.replace("export const hhmm = (minute) => { const m = (Math.round(minute) % DAY_MIN + DAY_MIN) % DAY_MIN; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }", "export const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`") }],
    ['an edit written without validation', { store: (s) => s.replace('[id]: validateDisplayChannel(next, where) }', '[id]: next }') }],
    ['the last key removable', { store: (s) => s.replace(' || Object.keys(ch.values).length < 2) return null', ') return null') }],
    ['revert keeping the channel', { store: (s) => s.replace('const next = { ...(s.displays || {}) }; delete next[id]; return { displays: next }', 'return s') }],
    ['Stage not carrying displays to <Town>', { wire: (rel, s) => rel.endsWith('CartographApp.jsx') ? s.replace("'labels', 'displays',\n]", "'labels',\n]") : s }],
    ['<SetPiece> not handing Stage\'s channels on', { wire: (rel, s) => rel.endsWith('SetPiece.jsx') ? s.replace(' channels={displaysOverride}', '') : s }],
    ['<Displays> silent on a failed read', { mount: (s) => s.replace('if (!list.length || (!live && !scene && !failed)) return null', 'if (!list.length || (!live && !scene)) return null') }],
    ['a failed read untyped', { hook: (s) => s.replace('throw e instanceof Refusal || e instanceof Transient ? e : ', 'throw ') }],
    ['a 404 taken for the network', { hook: (s) => s.replace("if (!r.ok) throw httpFailure(r,", "if (!r.ok) throw new Transient(") }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
