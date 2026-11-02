#!/usr/bin/env node
/**
 * "DOES A SHOW PLAY ONLY INSIDE ITS WINDOWS, AND IS A WINDOW WHOSE ENDS PASS EACH OTHER REFUSED?" (Jacob, 2026-11-01:
 * "Displays: Clock time windows: Yes"; Boz's rulings and Zob's co-sign of the plan, same day.)
 *
 * Through src/displays/showChannel.js (#inWindows, #refuseWindowSense, #validateDisplayChannel), engine.js#showtimesOn
 * and src/lib/todSlots.js (#todSlotYear, #todSlotDays), on planted days and on the cached years of the registered towns:
 *   1. MEMBERSHIP, one modular rule: a minute is inside iff (m − from) mod 1440 < (to − from) mod 1440, so a window across
 *      midnight needs no special case;
 *   2. A SHOWTIME's whole run lies in a window: "from 19:00 to 23:00" hourly gives 19, 20, 21, 22; "only at 8 and 10 pm"
 *      is a window around them at 120 minutes; across midnight 22:00 → 02:00 gives 22, 23, 00, 01; a run ending AT `to`
 *      is inside, one starting at `to` is not, one a minute past `to` is not;
 *   3. a window is refused by name for: an end that is neither a slot nor HH:MM; from = to; an empty list; an unknown key;
 *   4. THE YEAR (Boz, as worded): a window whose two ends pass each other on some day at the town is refused, naming the
 *      days it runs the other way round (19:00 → Dusk at PTown); one whose ends keep their order is not (Dusk → Deep,
 *      Dusk → Dawn, Dusk → 23:00, Noon → 15:00); ends that pass only across the clock change's 60-minute step, and ends
 *      that meet on a day, are refused; two windows that overlap on a day are refused, adjacent ones are not;
 *   5. THE BOUND it rests on (Boz's condition): no slot of any registered town moves more than SLOT_DAY_MOVE_MAX_MIN in a
 *      day (read from todSlots.js, its one home), and where one does (80°N, a slot snapping between noon and the nadir)
 *      a window ending on it is refused as unjudgeable, never judged;
 *   6. THE CACHE: the year is computed once per place and year, keyed by the place's VALUES (an equal place in a new
 *      object is a hit; a moved latitude is a miss), frozen; todSlotDays gives n consecutive town dates;
 *   7. WIRED: validateDisplayChannel validates the windows; bake-manifest refuses them over the cached year ahead, beside
 *      the crowding sweep; LightShow's per-day memo refuses them over the town's year (the last line).
 * Usage: node checks/claims-a-show-plays-only-inside-its-windows.mjs [--mutants]
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const hm = (h, m = 0) => h * 60 + m

async function verdict({ chan, eng, slots, bake, show } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const T = await importSource('src/lib/todSlots.js', slots ? { transform: slots } : {})
  const redirect = { 'src/lib/todSlots.js': slots ? { transform: slots } : {} }
  const S = await importSource('src/displays/showChannel.js', { ...(chan ? { transform: chan } : {}), redirect })
  const E = await importSource('src/displays/lightShow/engine.js', eng ? { transform: eng } : {})
  const refuses = (f, re) => { try { f(); return false } catch (e) { return re.test(e.message) } }
  const SM = { dawn: hm(6), sunrise: hm(6, 30), noon: hm(12, 30), golden: hm(17), sunset: hm(17, 30), dusk: hm(18), night: hm(19), deep: hm(0, 30) }
  const KEY = { glow: 1.36, show: 2.4, kelvin: 3810, showEvery: 60 }
  const ch = (showWindows, every = 60) => ({ animated: 'tod', values: { dusk: { ...KEY, showEvery: every }, dawn: { ...KEY, showEvery: every } },
    edges: { dusk: { fade: 'up', minutes: 0 }, dawn: { fade: 'down', minutes: 0 } }, ...(showWindows ? { showWindows } : {}) })
  const times = (c, secs = 300, sm = SM) => E.showtimesOn((m) => S.displayAt(c, m, sm), secs)
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  // 1. membership
  const W = [{ from: '19:00', to: '23:00' }], X = [{ from: '22:00', to: '02:00' }]
  F(!S.inWindows(W, hm(18, 59), SM) && S.inWindows(W, hm(19), SM) && S.inWindows(W, hm(23) - 1e-6, SM) && !S.inWindows(W, hm(23), SM), 'a minute inside [19:00, 23:00) is not read as inside, or one outside is')
  F(S.inWindows(X, hm(23, 30), SM) && S.inWindows(X, hm(1), SM) && !S.inWindows(X, hm(3), SM) && !S.inWindows(X, hm(21, 59), SM), 'a window across midnight (22:00 → 02:00) is not one modular span')
  F(S.inWindows(undefined, hm(3), SM), 'with no windows a minute is not inside (a show must play wherever Show is above 0)')
  // 2. showtimes inside a window
  F(same(times(ch(W)), [hm(19), hm(20), hm(21), hm(22)]), `"from 19:00 to 23:00" hourly is not 19, 20, 21, 22 (${times(ch(W))})`)
  F(same(times(ch([{ from: '19:30', to: '22:30' }], 120)), [hm(20), hm(22)]), `"only at 8 and 10 pm" (19:30 → 22:30, every 120) is not 20:00 and 22:00 (${times(ch([{ from: '19:30', to: '22:30' }], 120))})`)
  F(same(times(ch(X)), [hm(0), hm(1), hm(22), hm(23)]), `across midnight 22:00 → 02:00 hourly is not 22, 23, 00, 01 (${times(ch(X))})`)
  F(times(ch([{ from: '19:00', to: '20:05' }])).includes(hm(20)), 'a run ending exactly AT the window\'s end (20:00 + 5 min, to 20:05) is not inside')
  F(!times(ch([{ from: '19:00', to: '20:04' }])).includes(hm(20)), 'a run ending a minute past the window\'s end is scheduled (a show clipped)')
  F(!times(ch([{ from: '18:00', to: '19:00' }])).includes(hm(19)), 'a run starting AT the window\'s end is scheduled')
  F(same(times(ch([{ from: 'dusk', to: '20:00' }])), [hm(18), hm(19)]), 'a window from a slot (Dusk 18:00) to a clock time does not resolve the slot on the day')
  F(same(times(ch()), [0, 1, 2, 3, 4, 5, 18, 19, 20, 21, 22, 23].map(h => hm(h))), `with no windows the hourly shows from Dusk (18:00) to Dawn (06:00) are not all there (${times(ch())})`)
  // 3. refused by name
  const bad = (ws, re, what) => F(refuses(() => S.validateDisplayChannel(ch(ws), 'check'), re), `a window with ${what} is not refused by name`)
  bad([{ from: '25:00', to: '23:00' }], /its from \("25:00"\) is neither a time-of-day slot .* nor a time on the town's clock/, 'an end of 25:00')
  bad([{ from: 'dusky', to: '23:00' }], /its from \("dusky"\) is neither/, 'an end that is no slot')
  bad([{ from: 'dusk', to: 'dusk' }], /starts and ends at Dusk, so it holds no time/, 'from = to')
  bad([], /showWindows is a list of \{ from, to \}; with no windows, leave it out/, 'an empty list')
  bad([{ from: 'dusk', to: '23:00', every: 5 }], /"every" is not part of a window/, 'an unknown key')
  // 4. the year, at real places, through the cache
  const place = (lat, lon, tz) => ({ lat, lon, tz }), PT = place(42.05167, -70.18666, 'America/New_York')
  const year = T.todSlotYear(PT, 2026)
  const judged = (ws) => { try { S.refuseWindowSense(ws, year, 'check'); return 'ok' } catch (e) { return e.message } }
  F(/its two ends pass each other here, so on \d+ days \([A-Z][a-z]{2} \d+ – [A-Z][a-z]{2} \d+.*\) it runs the other way round/.test(judged([{ from: '19:00', to: 'dusk' }])), `19:00 → Dusk at PTown is not refused naming the days it runs the other way round (${judged([{ from: '19:00', to: 'dusk' }]).slice(0, 160)})`)
  for (const w of [['dusk', 'deep'], ['dusk', 'dawn'], ['dusk', '23:00'], ['noon', '15:00']]) F(judged([{ from: w[0], to: w[1] }]) === 'ok', `${w.join(' → ')} at PTown is refused, though its ends keep their order all year (${judged([{ from: w[0], to: w[1] }]).slice(0, 160)})`)
  const planted = (dusks) => dusks.map((d, i) => ({ date: `2026-03-${String(1 + i).padStart(2, '0')}`, minutes: { ...SM, dusk: d } }))
  const step = planted([hm(17), hm(17), hm(17), hm(18), hm(18)])                  // the clock change: Dusk 60 minutes later at once
  F(refuses(() => S.refuseWindowSense([{ from: 'dusk', to: '17:30' }], step, 'check'), /pass each other here, so on 2 days \(Mar 4 – Mar 5\)/), 'ends that pass only across the clock change\'s 60-minute step are not refused')
  F(refuses(() => S.refuseWindowSense([{ from: 'dusk', to: '17:30' }], planted([hm(17), hm(17, 10), hm(17, 30)]), 'check'), /on Mar 3 its two ends fall on the same minute/), 'ends that meet on a day are not refused')
  F(refuses(() => S.refuseWindowSense([{ from: '19:00', to: '22:00' }, { from: '21:00', to: '23:00' }], year, 'check'), /windows 1 \(19:00 → 22:00\) and 2 \(21:00 → 23:00\) overlap on/), 'two windows that overlap are not refused')
  F(judged([{ from: '19:00', to: '21:00' }, { from: '21:00', to: '23:00' }]) === 'ok', 'two adjacent windows (one ends where the next begins) are refused as overlapping')
  F(judged(undefined) === 'ok', 'a channel with no windows is refused')
  // 5. the bound it rests on
  const REG = await importSource('src/instances/registry.js'), bound = T.SLOT_DAY_MOVE_MAX_MIN
  F(Number.isFinite(bound) && bound > 0, 'todSlots.js names no SLOT_DAY_MOVE_MAX_MIN')
  const moveOf = (rows) => { let w = { m: 0 }; for (let k = 1; k < rows.length; k++) for (const id of Object.keys(rows[k].minutes)) { const x = Math.abs(rows[k].minutes[id] - rows[k - 1].minutes[id]) % 1440, m = Math.min(x, 1440 - x); if (m > w.m) w = { m, id, date: rows[k].date } } return w }
  let towns = 0
  for (const id of REG.registeredMaps()) { const g = REG.instanceForMap(id)?.geography; if (!g) continue; towns++
    const w = moveOf(T.todSlotYear(place(g.lat, g.lon, g.timezone), 2026))
    F(w.m <= bound, `in ${id} ${w.id} moves ${w.m.toFixed(1)} minutes on ${w.date}, past the ${bound} a window's judgement rests on`) }
  F(towns > 0, 'no registered town has a geography to judge a window at')
  // No real latitude jumps (the slots' closest approach is continuous; claims-every-slot-has-a-time-every-day), so the
  // guard is driven on a PLANTED year whose Dusk jumps from the nadir to noon in a day.
  const jump = planted([hm(0, 30), hm(0, 30), hm(12, 30), hm(12, 30)])
  F(refuses(() => S.refuseWindowSense([{ from: 'dusk', to: '23:00' }], jump, 'check'), /Dusk moves 720 minutes from 2026-03-02 to 2026-03-03 here, so whether this window's ends pass each other cannot be judged/), 'a window ending on a slot that jumps past the bound is judged rather than refused')
  F(!refuses(() => S.refuseWindowSense([{ from: '19:00', to: '23:00' }], jump, 'check'), /./), 'a window of two clock times is refused for a slot\'s jump it does not end on')
  const north = moveOf(T.todSlotYear(place(80, 15, 'Europe/Oslo'), 2026))
  F(north.m <= bound, `at 80°N ${north.id} moves ${north.m.toFixed(1)} minutes on ${north.date}, past ${bound}`)
  // 6. the cache
  const t0 = performance.now(), again = T.todSlotYear({ lat: 42.05167, lon: -70.18666, tz: 'America/New_York' }, 2026), hit = performance.now() - t0
  F(again === year, 'an equal place in a new object is not served from the cache')
  F(T.todSlotYear(place(42.5, -70.18666, 'America/New_York'), 2026) !== year, 'a moved latitude is served the old year')
  F(Object.isFrozen(year) && Object.isFrozen(year[0]) && Object.isFrozen(year[0].minutes), 'the cached year is not frozen')
  F(year.length === 365 && year[0].date === '2026-01-01' && year.at(-1).date === '2026-12-31', `the year is not every town day of 2026 (${year.length}: ${year[0]?.date} … ${year.at(-1)?.date})`)
  const ahead = T.todSlotDays(PT, new Date('2026-12-30T17:00:00Z'), 5)
  F(same(ahead.map(r => r.date), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']), `todSlotDays does not give consecutive town dates across the year (${ahead.map(r => r.date)})`)
  const t1 = performance.now(); for (const w of [['dusk', 'deep'], ['19:00', 'dusk']]) judged([{ from: w[0], to: w[1] }]); const judge = (performance.now() - t1) / 2
  if (!chan && !eng && !slots && !bake && !show) console.log(`   a cache hit: ${hit.toFixed(3)} ms · judging one window over the cached year: ${judge.toFixed(2)} ms · the largest daily move in a registered town is within ${bound} min`)
  // 7. wired
  const cv = code(chan ? chan(sourceOf('src/displays/showChannel.js')) : sourceOf('src/displays/showChannel.js'))
  F(/if \('showWindows' in ch\) validateWindows\(ch\.showWindows, where\)/.test(cv), 'validateDisplayChannel does not validate a channel\'s windows')
  const bm = code(bake ? bake(sourceOf('cartograph/bake-manifest.mjs')) : sourceOf('cartograph/bake-manifest.mjs'))
  F(/refuseWindowSense\(channel\.showWindows, year, `\$\{where\}, \$\{span\}`\)/.test(bm) && /const yearAhead = \(place\) => todSlotDays\(place, new Date\(\), 366\)/.test(bm), 'bake-manifest does not refuse a channel\'s windows over the cached year ahead')
  const ls = code(show ? show(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx'))
  F(/if \(channel\.showWindows\) refuseWindowSense\(channel\.showWindows, getTodSlotYear\(clock\.year\), where\)/.test(ls), "LightShow's per-day memo does not refuse a channel's windows over the town's year")
  return fails
}

const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ a show does not keep to its windows:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a show plays only inside its windows: one modular rule, a run never clipped by an end, refused by name; a window whose ends pass each other on some day at the town is refused naming the days, across the clock change too; the year is cached by place and judged within the slots\' daily bound')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['a run starting at the end let in (≤ for <)', { chan: (s) => s.replace('windows.some(w => into(w, minute, slotMinutes) < span(w, slotMinutes))', 'windows.some(w => into(w, minute, slotMinutes) <= span(w, slotMinutes))') }],
    ['showtimes ignoring the windows', { eng: (s) => s.replace('return a.show > 0 && a.open', 'return a.show > 0') }],
    ['a window across midnight special-cased away (from < to only)', { chan: (s) => s.replace('const span = (w, sm) => ((windowEndMinute(w.to, sm) - windowEndMinute(w.from, sm)) % DAY_MIN + DAY_MIN) % DAY_MIN', 'const span = (w, sm) => Math.max(0, windowEndMinute(w.to, sm) - windowEndMinute(w.from, sm))') }],
    ['ends passing never noticed (no wrap test)', { chan: (s) => s.replace('if (prev != null && Math.abs(L - prev) > DAY_MIN / 2) side ^= 1', 'void 0') }],
    ['ends that meet allowed', { chan: (s) => s.replace("      if (L === 0) throw new Refusal(", "      if (L === -1) throw new Refusal(") }],
    ['the slot bound unguarded', { chan: (s) => s.replace('if (move > SLOT_DAY_MOVE_MAX_MIN) throw', 'if (false) throw') }],
    ['overlap unchecked', { chan: (s) => s.replace('    if (d) throw new Refusal(`[showChannel] ⛔ ${where}: windows ${i + 1}', '    if (false) throw new Refusal(`[showChannel] ⛔ ${where}: windows ${i + 1}') }],
    ['windows not validated with the channel', { chan: (s) => s.replace("  if ('showWindows' in ch) validateWindows(ch.showWindows, where)\n", '') }],
    ['the cache keyed by nothing (recomputed)', { slots: (s) => s.replace('  let rows = YEARS.get(key)', '  let rows = null') }],
    ['the cache keyed without the latitude', { slots: (s) => s.replace('const key = `${lat},${lon},${tz},${year}`', 'const key = `${lon},${tz},${year}`') }],
    ['the bake not judging the windows', { bake: (s) => s.replace('refuseWindowSense(channel.showWindows, year,', 'void (channel.showWindows, year,') }],
    ['the renderer not judging the windows', { show: (s) => s.replace('if (channel.showWindows) refuseWindowSense(', 'if (false) refuseWindowSense(') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
