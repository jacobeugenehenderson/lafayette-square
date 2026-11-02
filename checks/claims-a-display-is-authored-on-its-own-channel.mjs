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
 *      the default glows exactly inside the old dusk-to-dawn span (the pinned engine.js#glowSpan) at every fifth minute;
 *   6. the scene bake carries every registered town's displays, each its Look's channel or the default, through
 *      displayChannelsFor (so a display the town lacks fails the bake), read from the town's own instance records.
 * Usage: node checks/claims-a-display-is-authored-on-its-own-channel.mjs [--mutants] [--kelvin]
 *   --kelvin: prints the nearest temperature and its residual against the old glow colour.
 *   7. the renderer lights the bulbs from the channel: the show's colour × the channel's show, the glow from the
 *      channel's kelvin and glow through engine.js#glowColour, whose shimmer is centred on 1 (its time-average is the
 *      channel's level) with the old relative swing; no gain constant left in LightShow.jsx. <Displays> passes each
 *      display its channel from scene.json#displays, and refuses by name a scene that carries none, and a scene that
 *      could not be read (useSceneJson.js#fetchSceneOnce fails with a 404 or bad JSON as a Refusal, a 5xx or no answer as a Transient; useSceneRead
 *      hands that failure to its reader).
 *   8. THE SCHEDULE is the channel's (engine.js#showtimesOn, #liveState, #refuseCrowdedShows):
 *      · under the default, the showtimes are the old schedule's (the pinned engine.js#showtimes over the old night) on
 *        every day of 2026 at 25°, 35°, 42° and 48.5° (just under the first slot the sun can miss, Night's −18°);
 *      · a showtime is m % showEvery = 0 with show > 0 over the WHOLE run (never clipped): a run the show falls to 0 under
 *        is no showtime; show 0 is no show; showEvery steps (Boz's worked example: 120 through an evening window gives
 *        two-hourly shows only there);
 *      · a step that crowds the show is refused by name (Zob's C2), and bake-manifest refuses it over every day of a year
 *        at the town's position, naming the window;
 *      · live: a show from each showtime, t from its start, on the town's clock through the change of clocks
 *        (2026-11-01); the glow while the channel glows; off otherwise and out of season; LightShow asks liveState with
 *        the town's clock and the day's channel, refusing a crowded day, and never the sun's altitude;
 *      · runSeconds (the Tonight strip's) refuses an unknown transition by name; Stage's Tonight strip reads the same
 *        channel and showtimesOn.
 *   9. STAGE EDITS IT (item 4): the store keeps only what the Look authored (design.json#displays), and its actions —
 *      run here, the real displayChannelActions — copy the default on the first edit, seed a new key with the channel's
 *      value there (showEvery step-held), never remove the last key, keep a 0-minute fade, refuse an invalid write by
 *      name and leave the store as it was, save on every write, and revert to the default; Stage's card is wired to
 *      them, and Stage lights the display from the store (STAGE_CHANNELS → <Town overrides.displays> → <SetPiece> →
 *      <Displays channels>), the Tonight strip from the same channel;
 *  10. a minute is printed HH:MM from the WHOLE minute (engine.js#hhmm): every tenth of a minute of a day prints the
 *      rounded minute, never :60 or 24:xx (Jacob saw "19:60" in Stage, 2026-11-01).
 * "The old" is the code as it was at PIN (1b833418, the integration tip the channel was built on), read with `git show`:
 * the pinned blob is the source, so it cannot drift (Zob, 2026-11-01). Without that history git fails, loudly.
 */
import { importSource, sourceOf, spanOf } from './_importSource.mjs'
import { execFileSync } from 'node:child_process'

const PIN = '1b833418b98ce845c53ec22f0618d172b36725e3'
const atPin = (rel) => execFileSync('git', ['show', `${PIN}:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
// The old schedule's own functions (glowSpan, showtimes), run from the pinned blob: they use nothing but DAY_MIN.
const OLD = await import('data:text/javascript;base64,' + Buffer.from(spanOf(atPin('src/displays/lightShow/engine.js'), { from: 'const DAY_MIN = 1440', to: 'export function liveState' }).replace(/^export /gm, '') + '\nexport { glowSpan, showtimes }').toString('base64'))

const DAY = 1440
const TEST_POINT = { lat: 42.05, lon: -70.19, tz: 'America/New_York' }   // a mid-latitude test point, not a town
const key = (o = {}) => ({ glow: 1, show: 2, kelvin: 3000, showEvery: 60, ...o })
const refuses = (f, re) => { try { f(); return false } catch (e) { return re.test(e.message) } }
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e

async function verdict({ chan, param, view, bake, eng, mount, pin, hook, manifest, stage, store, wire } = {}) {
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
    const span = OLD.glowSpan({ dusk: sm.dusk, dawn: sm.dawn })
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
  F(/const sm = getTodSlotMinutes\(instant\), at = \(m\) => displayAt\(channel, m, sm\)/.test(ls) && /lit = day\.current\.at\(useTimeOfDay\.getState\(\)\.getMinuteOfDay\(\)\), warm = kelvinToRgb\(lit\.kelvin\)/.test(ls), 'LightShow does not read the channel at the town\'s minute')
  F(!/_GAIN\b/.test(ls.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'a gain constant is left in LightShow.jsx')
  const dj = mount ? mount(sourceOf('src/displays/Displays.jsx')) : sourceOf('src/displays/Displays.jsx')
  F(/<P\.Renderer display=\{d\} channel=\{lit\[d\.id\]\}/.test(dj) && /: !lit\?\.\[d\.id\] \? `\$\{where\}: the Look's scene\.json carries no channel for it/.test(dj), '<Displays> does not pass each display its channel, or does not refuse a scene with none')
  F(/if \(live\) \{ try \{ lit = displayChannelsFor\(Object\.fromEntries\(\(town\.displays \|\| \[\]\)\.map\(d => \[d\.id, d\]\)\), live, /.test(dj) && /else lit = scene\?\.displays \?\? null/.test(dj) && /: liveErr \? liveErr\n/.test(dj), "<Displays> does not light from Stage's live channels through displayChannelsFor (the default for the rest, a refusal named), or the baked scene elsewhere")
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
  // 8. the schedule
  for (const lat of [25, 35, 42.05, 48.5]) {
    let diff = null, n = 0
    for (let dd = 0; dd < 365 && !diff; dd += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + dd, 17)), place = { lat, lon: -70.19, tz: 'America/New_York' }, sm = todSlotMinutesAt(date, place)
      const want = OLD.showtimes({ dusk: sm.dusk, dawn: sm.dawn }, 300), got = E.showtimesOn((m) => S.displayAt(d, m, sm), 300)
      n++
      if (JSON.stringify(want) !== JSON.stringify(got)) diff = `${lat}° ${date.toISOString().slice(0, 10)}: showtimes ${got.map(m => m / 60)} under the default, not the old ${want.map(m => m / 60)}`
    }
    F(!diff, diff)
  }
  const fl = (vals, edges) => ({ animated: 'tod', values: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, key(v)])), edges })
  const atOf = (ch) => (m) => S.displayAt(ch, m, SM)
  // never clipped: show falls to 0 at Night (hard) — a run that crosses it is no showtime
  const clip = fl({ dusk: { show: 2, showEvery: 60 }, night: { show: 0, showEvery: 60 }, dawn: { show: 0, showEvery: 60 } }, { dusk: { fade: 'up', minutes: 0 }, night: { fade: 'down', minutes: 0 } })
  const ct = E.showtimesOn(atOf(clip), 40 * 60)
  F(JSON.stringify(ct) === JSON.stringify([1080]), `with show falling to 0 at Night (${SM.night}), a 40-minute show plays at ${ct}, not only 18:00 (a 19:00 run would be clipped)`)
  const clip10 = fl({ dusk: { show: 2, showEvery: 10 }, night: { show: 0, showEvery: 10 }, dawn: { show: 0, showEvery: 10 } }, { dusk: { fade: 'up', minutes: 0 }, night: { fade: 'down', minutes: 0 } })
  const c10 = E.showtimesOn(atOf(clip10), 50 * 60)
  F(JSON.stringify(c10) === JSON.stringify([1080, 1090, 1100]), `a 50-minute show every 10 minutes until show falls to 0 at ${SM.night} plays at ${c10}, not 18:00, 18:10 and 18:20 (a run that ENDS as the show falls to 0 is whole, as the old schedule's "ends before dawn")`)
  F(E.showtimesOn(atOf(fl({ dusk: { show: 0 }, dawn: { show: 0 } })), 300).length === 0, 'a channel with show 0 still has showtimes')
  const win = fl({ dusk: { show: 1, showEvery: 120 }, deep: { show: 0, showEvery: 120 } }, { dusk: { fade: 'up', minutes: 0 }, deep: { fade: 'down', minutes: 0 } })
  const wt = E.showtimesOn(atOf(win), 300)
  F(JSON.stringify(wt) === JSON.stringify([1080, 1200, 1320]), `showEvery 120 through an evening window plays at ${wt.map(m => m / 60)}, not 18, 20 and 22`)
  // crowding (C2): 40-minute show, 60 then 45 from a key at 01:10 → 01:00 and 01:30
  const SMc = { ...SM, deep: 70 }, crowd = fl({ dusk: { show: 1, showEvery: 60 }, deep: { show: 1, showEvery: 45 } })
  F(refuses(() => E.refuseCrowdedShows([['day', (m) => S.displayAt(crowd, m, SMc)]], 40 * 60, 'check'), /on day the shows at 01:00 and 01:30 are 30 minutes apart, and a show runs 40\.0/), 'a step in showEvery that crowds the show is not refused by name')
  F(!refuses(() => E.refuseCrowdedShows([['day', atOf(d)]], 300, 'check'), /./), 'the default schedule is refused as crowded')
  const bm = manifest ? manifest(sourceOf('cartograph/bake-manifest.mjs')) : sourceOf('cartograph/bake-manifest.mjs')
  F(/refuseCrowdedShows\(year\.map\(r => \[r\.date, \(m\) => displayAt\(channel, m, r\.minutes\)\]\), secs, `\$\{where\}, \$\{span\}`\)/.test(bm) && /const year = yearAhead\(place\), span = `the year \$\{year\[0\]\.date\} … \$\{year\.at\(-1\)\.date\}`/.test(bm) && /const yearAhead = \(place\) => todSlotDays\(place, new Date\(\), 366\)/.test(bm), 'bake-manifest does not refuse a crowded schedule over a year at the town\'s position, naming the window')
  // live
  const { townClockOf } = await importSource('src/lib/townClock.js')
  const DISP = { season: 'lights' }, CAL = [{ id: 'lights', start_date: '2026-10-31', end_date: '2027-01-01' }], C = { segs: [], seconds: 300 - 2 * 3.8 }
  const atD = atOf(d), times = E.showtimesOn(atD, E.showSeconds(C))
  const st = (iso) => E.liveState(DISP, C, townClockOf(new Date(iso), 'America/New_York'), CAL, atD, times, 'check')
  const sh = st('2026-11-01T23:00:30Z')                                        // 18:00:30 EST, the day the clocks went back
  F(sh.mode === 'show' && Math.abs(sh.t - 30) < 1e-6, `at the town's 18:00:30 on the day of the change of clocks the show is not 30 s in (${JSON.stringify(sh)})`)
  F(st('2026-11-01T23:30:00Z').mode === 'glow', 'between shows inside the glow it does not glow')
  F(st('2026-11-01T17:00:00Z').mode === 'off', 'by day (12:00) it is not off')
  F(E.liveState(DISP, C, townClockOf(new Date('2026-10-01T23:00:30Z'), 'America/New_York'), CAL, atD, times, 'check').mode === 'off', 'out of season it is not off')
  F(/liveState\(display, compiled, clock, calendar, day\.current\.at, day\.current\.times, where\)/.test(ls) && /refuseCrowdedShows\(\[\[clock\.date, at\]\], secs, where\)/.test(ls) && !/sunAltitude/.test(ls), "LightShow's live path does not ask the schedule with the town's clock and the day's channel (refusing a crowded day), or reads the sun's altitude")
  let named = false; try { E.runSeconds([{ look: 'a', seconds: 5 }, { transition: 'no-such' }, { look: 'a', seconds: 5 }]) } catch (e) { named = /transition "no-such"/.test(e.message) }
  F(named, "runSeconds (Stage's Tonight strip) does not refuse an unknown transition by name")
  const sa = stage ? stage(sourceOf('src/stage/StageApp.jsx')) : sourceOf('src/stage/StageApp.jsx')
  F(/authored = useCartographStore\(s => s\.displays\?\.\[display\.id\]\)/.test(sa) && /const schedule = useMemo\(\(\) => authored \|\| defaultDisplayChannel\(\), \[authored\]\)/.test(sa) && /at = \(m\) => displayAt\(schedule, m, sm\), secs = runSeconds\(display\.run\), times = showtimesOn\(at, secs\)/.test(sa), "Stage's Tonight strip does not read the display's channel through showtimesOn")
  // 9. Stage edits it
  const ST = await importSource('src/cartograph/stores/useCartographStore.js', { span: { functions: ['displayChannelActions'] },
    prefix: "import { defaultDisplayChannel, validateDisplayChannel } from '../../displays/showChannel.js'\nimport { resolveGroupAtMinute, keyedStepAt, todEdgePatch, NAMED_TOD_SLOTS_BY_ID } from '../animatedParam.js'\nexport let SM = null\nexport const setSM = (m) => { SM = m }\nconst getTodSlotMinutes = () => SM\nconst useTimeOfDay = { getState: () => ({ currentTime: new Date(0) }) }\n",
    suffix: '\nexport { displayChannelActions }', ...(store ? { transform: store } : {}) })
  ST.setSM(SM)
  let state = { displays: {} }, saves = 0
  const set = (f) => { const r = f(state); if (r !== state) state = { ...state, ...r } }
  const A = ST.displayChannelActions(set, () => ({ _saveDesignDebounced: () => { saves++ } }))
  A.setDisplayValue('m', 'glow', 0.5, 'dusk')
  F(state.displays.m?.values?.dusk?.glow === 0.5 && state.displays.m.values.dawn.glow === d.values.dawn.glow && state.displays.m.edges?.dawn?.minutes === 0, `the first edit does not copy the default with the change (${JSON.stringify(state.displays.m)})`)
  A.setDisplayValue('m', 'showEvery', 120, 'dusk')
  const was = S.displayAt(state.displays.m, SM.night, SM)
  A.addDisplaySlot('m', 'night')
  const nk = state.displays.m.values.night
  F(nk && nk.showEvery === 120 && Math.abs(nk.glow - was.glow) < 1e-9 && Math.abs(nk.kelvin - was.kelvin) < 1e-9, `a new key is not seeded with the channel there (${JSON.stringify(was)}), showEvery step-held (${JSON.stringify(nk)})`)
  A.setDisplayTransition('m', 'night', 'down', 0)
  F(state.displays.m.edges?.night?.fade === 'down' && state.displays.m.edges.night.minutes === 0, 'a 0-minute fade (a switch) is not kept')
  A.removeDisplaySlot('m', 'night')
  F(!('night' in state.displays.m.values) && !state.displays.m.edges?.night, 'removing a key leaves it, or its fade mark')
  A.removeDisplaySlot('m', 'dawn'); A.removeDisplaySlot('m', 'dusk')
  F(Object.keys(state.displays.m.values).length === 1, `the last key was removed (${Object.keys(state.displays.m.values)})`)
  const before = JSON.stringify(state)
  F(refuses(() => A.setDisplayValue('m', 'showEvery', 50, 'dusk'), /showEvery \(50\) must be a whole number of minutes that divides the day/) && JSON.stringify(state) === before, 'an invalid write is not refused by name, or it changed the store')
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
  F(/<DisplayChannel id=\{d\.id\} \/>/.test(sa) && /onSetValue=\{\(key, value, slotId\) => setValue\(id, key, value, slotId\)\}/.test(sa) && /fields=\{DISPLAY_FIELDS\}/.test(sa), "Stage's Displays section has no channel card per display, or it is not wired to the store")
  // 10. HH:MM
  let badClock = null
  for (let t = -1; t <= 1441 && !badClock; t += 0.1) {
    const txt = E.hhmm(t), m = txt.match(/^(\d\d):(\d\d)$/), want = ((Math.round(t) % 1440) + 1440) % 1440
    if (!m || +m[1] > 23 || +m[2] > 59 || +m[1] * 60 + +m[2] !== want) badClock = `${t.toFixed(1)} prints "${txt}"`
  }
  F(!badClock, `a minute is printed wrong: ${badClock}`)
  F(/import \{ showtimesOn, runSeconds, hhmm \} from '\.\.\/displays\/lightShow\/engine\.js'/.test(sa) && !/const hhmm = /.test(sa), "Stage's Tonight strip does not print through the engine's one hhmm")
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
    ['<Displays> passing no channel', { mount: (s) => s.replace(' channel={lit[d.id]}', '') }],
    ['a run clipped (the whole-run test dropped)', { eng: (s) => s.replace('for (let k = 1; k < len && whole; k++) if (!plays((m + k) % DAY_MIN)) whole = false\n    if (whole && !plays((m + len - 1e-6) % DAY_MIN)) whole = false\n', '') }],
    ['a run allowed to end where show is 0', { eng: (s) => s.replace('if (whole && !plays((m + len - 1e-6) % DAY_MIN)) whole = false', 'if (whole && !plays((m + len) % DAY_MIN)) whole = false') }],
    ['showtimes on a fixed hour, not the channel\'s step', { eng: (s) => s.replace('if (m % at(m).showEvery || !plays(m)) continue', 'if (m % 60 || !plays(m)) continue') }],
    ['shows where show is 0', { eng: (s) => s.replace('const plays = (m) => { const a = at(m); return a.show > 0 && a.open }', 'const plays = (m) => { const a = at(m); return a.open }') }],
    ['a crowded schedule accepted', { eng: (s) => s.replace('if (t.length > 1 && next - t[i] < len) throw', 'if (false) throw') }],
    ['bake-manifest not refusing a crowded year', { manifest: (s) => s.replace('refuseCrowdedShows(year.map(', 'void (year.map(') }],
    ['live never showing', { eng: (s) => s.replace("if (since < seconds) return { mode: 'show', t: since, up }", '') }],
    ['live glowing regardless of the channel', { eng: (s) => s.replace("return at(minute).glow > 0 ? { mode: 'glow', t: 0, up } : { mode: 'off', t: 0, up }", "return { mode: 'glow', t: 0, up }") }],
    ['the live path on the sun\'s altitude', { view: (s) => s.replace('day.current.at, day.current.times, where)', 'day.current.at, useTimeOfDay.getState().getLightingPhase().sunAltitude < 0 ? day.current.times : [], where)') }],
    ['runSeconds silent on an unknown transition', { eng: (s) => s.replace('if (!TRANSITION[s.transition]) throw', 'if (false) throw') }],
    ['the Tonight strip on its own schedule', { stage: (s) => s.replace('times = showtimesOn(at, secs)', 'times = [1080]') }],
    ['HH:MM split before rounding (19:60)', { eng: (s) => s.replace("export const hhmm = (minute) => { const m = (Math.round(minute) % DAY_MIN + DAY_MIN) % DAY_MIN; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` }", "export const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`") }],
    ['an edit written without validation', { store: (s) => s.replace("validateDisplayChannel(next, `Stage › Displays › ${id}`)", '') }],
    ['the last key removable', { store: (s) => s.replace(' || Object.keys(ch.values).length < 2) return null', ') return null') }],
    ['revert keeping the channel', { store: (s) => s.replace('const next = { ...(s.displays || {}) }; delete next[id]; return { displays: next }', 'return s') }],
    ['a new key seeded at a fixed cadence', { store: (s) => s.replace("showEvery: keyedStepAt(ch, 'showEvery', m, sm) }", 'showEvery: 60 }') }],
    ['Stage not carrying displays to <Town>', { wire: (rel, s) => rel.endsWith('CartographApp.jsx') ? s.replace("'labels', 'displays',\n]", "'labels',\n]") : s }],
    ['<SetPiece> not handing Stage\'s channels on', { wire: (rel, s) => rel.endsWith('SetPiece.jsx') ? s.replace(' channels={displaysOverride}', '') : s }],
    ['<Displays> silent on a failed read', { mount: (s) => s.replace('if (!list.length || (!live && !scene && !failed)) return null', 'if (!list.length || (!live && !scene)) return null') }],
    ['a failed read untyped', { hook: (s) => s.replace('throw e instanceof Refusal || e instanceof Transient ? e : ', 'throw ') }],
    ['a 404 taken for the network', { hook: (s) => s.replace("if (!r.ok) throw httpFailure(r,", "if (!r.ok) throw new Transient(") }],
    ['<Displays> not refusing a scene with none', { mount: (s) => s.replace(": !lit?.[d.id] ? `${where}: the Look's scene.json carries no channel for it", ": false ? `${where}: the Look's scene.json carries no channel for it") }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
