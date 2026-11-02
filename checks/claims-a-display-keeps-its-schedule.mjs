#!/usr/bin/env node
/**
 * "DOES A DISPLAY KEEP ITS SCHEDULE (WHEN), WITH ITS LEVELS AUTHORED AT THE SLOTS, AND DOES EVERY PUBLISHED SLAB STILL PLAY
 * EXACTLY AS IT DID?" (Jacob, 2026-11-01: "a very logical setup of 'start/end, recurring'"; Boz's rulings (a)–(c); Zob's
 * co-sign and conditions 1–3; Jacob's rule "A player update never breaks a published slab".)
 *
 * Through src/displays/showSchedule.js and showChannel.js, on planted rows and on the cached year at PTown:
 *   1. SHOWS: from a first start to a last start (inclusive: "until 00:00" plays the midnight show) every N, on the clock;
 *      never clipped (a start whose whole run does not fit the light is dropped); an interval shorter than the show refused;
 *   2. AMBIENT: on and off with their fades (full minutes, a fade-out holding the levels as they were at off); off "after
 *      the last show": the last played show closes to BLACK, and only that one, then dark;
 *   3. THE NIGHT: belongs to its first event's date (a weekday entry's 00:00 show plays on Saturday's clock); each later
 *      END reads the row of the date it falls on (a Dawn after midnight reads the next date's: Zob 1), across the clock
 *      change too; two slots on one minute keep the day's order (a white night dark, a polar night lit, as before);
 *   4. DAYS: daily, weekdays; a DATED entry replaces them on its dates; fireworks (no Ambient) play on their date only;
 *   5. REFUSED by name: a bad END, days, key, fade, interval; an entry with nothing; "after the last show" with no shows;
 *      over the year: two ends that pass each other (naming the days), a slot that jumps, two nights that overlap on a date
 *      or across midnight (Zob 3), an Ambient that would never go off (a planted fault: a night with no show); a show at
 *      Ambient's own on-time plays whatever its fade-in (Boz's ruling on Zob's probes); ONE HOME PER FACT: a key at 0 is a level (a show plays dark, Ambient hangs dark),
 *      never an off (Jacob, 2026-11-02);
 *   6. THE PUBLISHED SHAPES, read, EXACTLY: PTown's published channel (per-key showEvery, sunset ▲15, dawn ▼15) and the
 *      old default, against the OLD engine and resolver at a pinned full sha, at EVERY minute of 2026 at PTown (glow, show,
 *      kelvin) and every date's showtimes (Zob 2); a pre-display slab plays its declared displays on the default, a
 *      displays block missing one is refused;
 *   7. KEPT: the year cache (keyed by place values, frozen, consecutive dates), SLOT_DAY_MOVE_MAX_MIN's one home, the
 *      clock-change reader Stage's Tonight says (townClockChange: New York, Lord Howe, London, Santiago at midnight).
 *   8. A SLOT-KEYED FIRST SHOW on the town's REAL rows: at the slot's first whole minute, every night of the year (the staging
 *      slab, 2026-11-02); shows that play on no night of the year refused by name, shows that play on some never.
 * Usage: node checks/claims-a-display-keeps-its-schedule.mjs [--mutants]
 */
import { execFileSync } from 'node:child_process'
import { importSource, sourceOf, resolveImports } from './_importSource.mjs'

// The engine and resolver as they were before the schedule (integration, 2026-11-02): the per-key cadence, the ▲/▼ marks.
const OLD_SHA = '6cdde136121729936df3e503ac3e6da89bd3965b'
const atSha = (rel) => execFileSync('git', ['show', `${OLD_SHA}:${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const DAY = 1440, hm = (h, m = 0) => h * 60 + m, same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const PT = { lat: 42.05167, lon: -70.18666, tz: 'America/New_York' }

async function verdict({ sched, chan, slots, clock, view, bake, store } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const refuses = (f, re) => { try { f(); return false } catch (e) { return re.test(e.message) } }
  const T = await importSource('src/lib/todSlots.js', slots ? { transform: slots } : {})
  const H = await importSource('src/displays/showSchedule.js', sched ? { transform: sched } : {})
  const S = await importSource('src/displays/showChannel.js', { ...(chan ? { transform: chan } : {}), redirect: { 'src/displays/showSchedule.js': sched ? { transform: sched } : {} } })
  // planted rows: the same slot minutes every date, unless a test plants its own
  const SM = { dawn: hm(6), sunrise: hm(6, 30), noon: hm(12, 30), golden: hm(17), sunset: hm(17, 30), dusk: hm(18), night: hm(19), deep: hm(0, 30) }
  const flat = () => SM
  const KEY = { glow: 1.36, show: 2.4, kelvin: 3810 }
  const chOf = (schedule, values) => S.validateDisplayChannel({ animated: 'tod', values: values || { dusk: { ...KEY }, dawn: { ...KEY } }, schedule }, 'check')
  const nights = (ch, date, rowOf = flat, secs = 302.2) => ({ before: H.nightsOn(ch, H.prevDate(date), rowOf, secs), today: H.nightsOn(ch, date, rowOf, secs) })
  const at = (ch, date, minute, rowOf = flat, secs = 302.2) => { const n = nights(ch, date, rowOf, secs); return H.displayStateAt(ch, n.before, n.today, date, minute, rowOf) }
  const times = (ch, date, rowOf = flat, secs = 302.2) => { const n = nights(ch, date, rowOf, secs); return H.showtimesOnDate(n.before, n.today) }
  const D = '2026-12-04'                                                              // a Friday
  // 1–2. Jacob's: Ambient at Sunset (15) until after the last show; shows 19:00 → 00:00 every 60
  const jacob = chOf([{ days: 'daily', ambient: { on: 'sunset', fadeIn: 15, off: 'after-last-show', fadeOut: 0 }, shows: { first: '19:00', last: '00:00', every: 60 } }])
  const tonight = H.nightsOn(jacob, D, flat, 302.2)[0]
  F(same(tonight?.starts, [hm(19), hm(20), hm(21), hm(22), hm(23), DAY]), `from 19:00 to 00:00 hourly the night's starts are not 19–23 and the midnight show (${tonight?.starts})`)
  F(at(jacob, D, hm(17, 30) + 7.5).mode === 'glow' && Math.abs(at(jacob, D, hm(17, 30) + 7.5).glow - 1.36 / 2) < 1e-9, 'Ambient is not half up 7.5 minutes into its 15-minute fade-in')
  const last = at(jacob, H.nextDate(D), 4.9)
  F(last.mode === 'show' && last.dark === true, `the night's last show (00:00) does not close to black (${JSON.stringify(last)})`)
  F(at(jacob, D, hm(23, 2)).dark === false, 'a show before the last closes to black (only the last may)')
  F(at(jacob, H.nextDate(D), 6).mode === 'off' && at(jacob, H.nextDate(D), hm(5)).mode === 'off', 'after the last show the display is not dark until the next Ambient on')
  F(at(jacob, D, hm(18)).mode === 'glow', 'before the first show Ambient is not on')
  const until = (last) => H.nightsOn(chOf([{ days: 'daily', ambient: { on: 'sunset', fadeIn: 0, off: '00:03', fadeOut: 0 }, shows: { first: '19:00', last, every: 60 } }]), D, flat, 302.2)[0].starts
  F(!until('00:00').includes(DAY), 'a show clipped by Ambient going off (00:03, a 5:02 show at 00:00) is scheduled')
  F(refuses(() => H.refuseShortCadence(chOf([{ days: 'daily', ambient: null, shows: { first: '19:00', last: '20:00', every: 4 } }]), 302.2, 'check'), /every 4 min is shorter than the show \(5:02\)/), 'an interval shorter than the show is not refused by name')
  // a fade-out holds the levels as they were at off
  const hold = chOf([{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: 'dawn', fadeOut: 30 }, shows: null }], { dusk: { glow: 1, show: 2, kelvin: 3000 }, dawn: { glow: 2, show: 2, kelvin: 3000 }, noon: { glow: 0, show: 0, kelvin: 3000 } })
  F(Math.abs(at(hold, H.nextDate(D), hm(6) + 15).glow - 2 * 0.5) < 1e-9, `a fade-out does not hold the level at off (${at(hold, H.nextDate(D), hm(6) + 15).glow}, not 2 × 0.5)`)
  // 3. the night's date; Zob 1: a Dawn after midnight reads the next date's row (and across the clock change)
  const rowsBy = { '2026-12-04': { ...SM, dawn: hm(6) }, '2026-12-05': { ...SM, dawn: hm(6, 10) }, '2026-12-03': SM, '2026-12-06': SM }
  const r2 = (d) => rowsBy[d] || SM, dd = chOf([{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: 'dawn', fadeOut: 0 }, shows: null }])
  F(H.nightsOn(dd, D, r2, 302.2)[0].offAt === DAY + hm(6, 10), `a Dawn after midnight reads the night's own date's dawn (${H.nightsOn(dd, D, r2, 302.2)[0].offAt}), not the next date's`)
  const ny = (d) => T.todSlotRowOf(PT, d), dst = H.nightsOn(dd, '2026-03-07', ny, 302.2)[0]
  F(dst.offAt === DAY + ny('2026-03-08').dawn, `across the clock change the night's Dawn is not read from the morning's own date (${dst.offAt} vs ${DAY + ny('2026-03-08').dawn})`)
  const fri = chOf([{ days: 'weekdays', ambient: null, shows: { first: '23:00', last: '00:00', every: 60 } }])
  F(times(fri, '2026-12-05').includes(0), 'a Friday entry\'s 00:00 show does not play on Saturday\'s clock (the night belongs to Friday)')
  F(!times(fri, '2026-12-06').includes(0) && !times(fri, '2026-12-05').includes(hm(23)), 'a weekday entry plays on a weekend night')
  // two slots on one minute: the day's order (80°N)
  const lit = (lat, date) => { const P = { lat, lon: 15, tz: 'Europe/Oslo' }, rowOf = (d) => T.todSlotRowOf(P, d), ch = S.defaultDisplayChannel(); let n = 0; for (let m = 0; m < DAY; m += 5) if (at(ch, date, m, rowOf).glow > 0) n++; return n }
  F(lit(80, '2026-06-21') === 0, `on a white night (80°N) the default glows (${lit(80, '2026-06-21')} samples)`)
  F(lit(80, '2026-12-21') === DAY / 5, `on a polar night (80°N) the default is not lit all day (${lit(80, '2026-12-21')} of ${DAY / 5})`)
  // 4. dated replaces daily; fireworks
  const nye = chOf([{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: 'dawn', fadeOut: 0 }, shows: { first: '00:00', last: '23:00', every: 60 } },
    { days: { dates: ['2026-12-31'] }, ambient: null, shows: { first: '23:59', last: '23:59', every: 60 } }])
  F(same(times(nye, '2026-12-31').filter(t => t >= hm(12)), [hm(23, 59)]) && times(nye, '2026-12-30').includes(hm(20)), `a dated entry does not replace the daily on its date (${times(nye, '2026-12-31').map(t => (t / 60).toFixed(2))})`)
  F(at(nye, '2026-12-31', hm(20)).glow === 0 && at(nye, '2026-12-31', hm(23, 59) + 1).mode === 'show', 'fireworks (no Ambient) glow, or do not play at their time')
  // 5. refused by name
  const R = (schedule, re, what) => F(refuses(() => chOf(schedule), re), `${what} is not refused by name`)
  R([{ days: 'daily', ambient: { on: '25:00', fadeIn: 0, off: 'dawn', fadeOut: 0 }, shows: null }], /Ambient's on \("25:00"\) is neither a time-of-day slot/, 'an END of 25:00')
  R([{ days: 'sundays', ambient: null, shows: { first: '20:00', last: '20:00', every: 60 } }], /its days \("sundays"\) are 'daily', 'weekdays' or \{ dates/, 'days of "sundays"')
  R([{ days: 'daily', ambient: null, shows: null }], /it has neither Ambient nor shows/, 'an entry with nothing')
  R([{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: 'after-last-show', fadeOut: 0 }, shows: null }], /Ambient ends after the last show, and the entry has no shows: add shows, or choose when Ambient goes off/, '"after the last show" with no shows')
  R([{ days: 'daily', ambient: { on: 'dusk', fadeIn: -1, off: 'dawn', fadeOut: 0 }, shows: null }], /Ambient's fadeIn \(-1\) is minutes, 0 or more/, 'a negative fade')
  R([{ days: 'daily', ambient: null, shows: { first: '20:00', last: '21:00', every: 0 } }], /the shows' every \(0\) is a whole number of minutes, 1 or more/, 'an interval of 0')
  R([{ days: 'daily', ambient: null, shows: { first: '20:00', last: '21:00', every: 60, at: 1 } }], /"at" is not part of the shows/, 'an unknown key')
  F(refuses(() => S.validateDisplayChannel({ animated: 'tod', values: { dusk: { ...KEY } }, edges: { dusk: { fade: 'up', minutes: 0 } }, schedule: jacob.schedule }, 'check'), /AND a schedule/), 'fade marks on a display\'s keys beside a schedule are not refused (they retired into Ambient)')
  const year = T.todSlotDays(PT, new Date('2026-01-02T17:00:00Z'), 366)
  const judged = (schedule, secs = 302.2) => { try { H.refuseScheduleSense(chOf(schedule), year, secs, 'check'); return 'ok' } catch (e) { return e.message } }
  F(/Ambient's 'comes on' and 'goes off' \(19:00 → Dusk\) pass each other here, so on \d+ days \(.*\) they run the other way round: choose/.test(judged([{ days: 'daily', ambient: { on: '19:00', fadeIn: 0, off: 'dusk', fadeOut: 0 }, shows: null }])), 'Ambient from 19:00 to Dusk at PTown is not refused naming its days')
  F(judged(jacob.schedule) === 'ok' && judged(S.defaultDisplayChannel().schedule) === 'ok', `Jacob's schedule or the default is refused at PTown (${judged(jacob.schedule).slice(0, 140)})`)
  F(/two entries' nights overlap on/.test(judged([{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: '23:00', fadeOut: 0 }, shows: null }, { days: 'daily', ambient: { on: '22:00', fadeIn: 0, off: 'dawn', fadeOut: 0 }, shows: null }])), 'two daily nights that overlap are not refused')
  F(/runs past .*'s night beginning; nights overlap across midnight/.test(judged([{ days: 'daily', ambient: { on: '00:30', fadeIn: 0, off: '05:00', fadeOut: 0 }, shows: null }, { days: { dates: ['2026-12-31'] }, ambient: { on: 'dusk', fadeIn: 0, off: '01:00', fadeOut: 0 }, shows: null }])), 'a dated night running past midnight into the next date\'s night is not refused (Zob 3)')
  const jump = Array.from({ length: 4 }, (_, i) => ({ date: `2026-03-0${i + 1}`, minutes: { ...SM, dusk: i < 2 ? hm(0, 30) : hm(12, 30) } }))
  F(refuses(() => H.refuseScheduleSense(chOf([{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: '23:00', fadeOut: 0 }, shows: null }]), jump, 302.2, 'check'), /Dusk moves 720 minutes from 2026-03-02 to 2026-03-03 here/), 'a schedule ending on a slot that jumps is judged rather than refused')
  // Zob's probes (2026-11-02) under Boz's ruling: a show at Ambient's own on-time PLAYS, whatever its fade-in (the fade shapes
  // the level, never whether a show plays); so the lone show plays and "after the last show" ends on it
  for (const [amb, shows, want] of [[{ on: '21:00', fadeIn: 5 }, { first: '21:00', last: '21:00' }, [hm(21)]], [{ on: 'dusk', fadeIn: 10 }, { first: 'dusk', last: 'dusk' }, [SM.dusk]], [{ on: 'dusk', fadeIn: 10 }, { first: 'dusk', last: '23:00' }, [SM.dusk, ...[19, 20, 21, 22, 23].map(h => hm(h))]]]) {
    const z = chOf([{ days: 'daily', ambient: { ...amb, off: 'after-last-show', fadeOut: 0 }, shows: { ...shows, every: 60 } }]), n = H.nightsOn(z, D, flat, 302.2)[0]
    F(same(n.starts, want) && n.end === want.at(-1) + 302.2 / 60, `Ambient at ${amb.on} (fade ${amb.fadeIn}), shows ${shows.first}–${shows.last}: the starts are not ${want} ending the night (${n.starts}; end ${n.end})`)
  }
  // the same probes on the town's REAL rows (a slot's minute is never whole): the lone show starts at Dusk's first whole minute
  const real = (d) => T.todSlotRowOf(PT, d), duskR = Math.ceil(real(D).dusk)
  for (const [fadeIn, last, want] of [[10, 'dusk', [duskR]], [0, 'dusk', [duskR]], [10, '23:00', [duskR, ...[1, 2, 3, 4, 5, 6].map(k => duskR + 60 * k).filter(t => t <= hm(23))]]]) {
    const z = chOf([{ days: 'daily', ambient: { on: 'dusk', fadeIn, off: 'after-last-show', fadeOut: 0 }, shows: { first: 'dusk', last, every: 60 } }]), n = H.nightsOn(z, D, real, 302.2)[0]
    F(same(n.starts, want), `on PTown's real rows, Ambient at Dusk (fade ${fadeIn}), shows Dusk–${last}: the starts are not ${want} (${n.starts}; Dusk ${real(D).dusk})`)
  }
  // 8. A SLOT-KEYED FIRST SHOW, on REAL rows, every night of the year (Jacob's staging slab, 2026-11-02: "first show Golden"
  // played no show on any night, in either engine, and nothing refused it; Stage said "0 shows")
  const staged = chOf([{ days: 'daily', ambient: { on: 'golden', fadeIn: 15, off: '00:00', fadeOut: 0 }, shows: { first: 'golden', last: '00:00', every: 60 } }], { sunset: { glow: 1.36, show: 2, kelvin: 2700 } })
  let miss = null
  for (const { date, minutes } of year.slice(0, -1)) {
    const n = H.nightsOn(staged, date, real, 302.2)[0], g = Math.ceil(minutes.golden), st = n?.starts || []
    if (!st.length || st.some((t, k) => t !== g + 60 * k) || st.at(-1) + 302.2 / 60 > DAY || st.at(-1) + 60 + 302.2 / 60 <= DAY) { miss = `${date}: Golden ${minutes.golden.toFixed(2)}, starts ${st}`; break }
  }
  F(!miss, `a first show at Golden does not start at Golden's first whole minute, hourly to the last that ends by 00:00, every night of the year (${miss})`)
  F(judged(staged.schedule) === 'ok', `Jacob's staging schedule is refused (${judged(staged.schedule).slice(0, 160)})`)
  F(/schedule entry 1: its shows \(first show 23:00, last show starts 23:30, every 30 min\) play on no night of the year: no show's whole run fits between Ambient's 'comes on' and its 'goes off' \(with its fade-out\); choose a first show, or a last, inside Ambient's span/.test(judged([{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: '22:00', fadeOut: 0 }, shows: { first: '23:00', last: '23:30', every: 30 } }])), 'shows that play on no night of the year are not refused by name')
  const some = judged([{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: '22:00', fadeOut: 0 }, shows: { first: '20:30', last: '20:30', every: 60 } }])
  F(some === 'ok', `shows that play on some nights (a 20:30 show, before Dusk in June) are refused (${some.slice(0, 160)})`)
  // the invariant behind it: a night with "after the last show" and no show is refused by name, never left lit (a fault
  // planted in nightOf drops every start)
  const HP = await importSource('src/displays/showSchedule.js', { transform: (s) => (sched ? sched(s) : s).replace('      if (whole) {', '      if (false) {') })
  const planted = (() => { try { HP.refuseScheduleSense(S.validateDisplayChannel({ animated: 'tod', values: { dusk: { ...KEY }, dawn: { ...KEY } }, schedule: [{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: 'after-last-show', fadeOut: 0 }, shows: { first: '19:00', last: '22:00', every: 60 } }] }, 'check'), year, 302.2, 'check'); return 'ok' } catch (e) { return e.message } })()
  F(/no show plays, so Ambient \(going off after the last show\) would never go off: choose when Ambient goes off/.test(planted), `a night with no show and Ambient to go off after it is not refused by name (${planted.slice(0, 120)})`)
  // ONE HOME PER FACT (Jacob, 2026-11-02): a key at 0 is a level, never an off. Every key at Show 0 and Ambient 0, Ambient
  // Dusk → Dawn, shows hourly: the scheduled shows still play (dark), Ambient is still hung (dark), outside it is off.
  const zero = chOf([{ days: 'daily', ambient: { on: 'dusk', fadeIn: 0, off: 'dawn', fadeOut: 0 }, shows: { first: '00:00', last: '23:00', every: 60 } }], { dusk: { glow: 0, show: 0, kelvin: 3000 }, dawn: { glow: 0, show: 0, kelvin: 3000 } })
  const z20 = at(zero, D, hm(20)), z2030 = at(zero, D, hm(20, 30)), z12 = at(zero, D, hm(12))
  F(z20.mode === 'show' && z20.show === 0, `a key at Show 0 cancels a scheduled show (20:00: ${z20.mode})`)
  F(z2030.mode === 'glow' && z2030.glow === 0, `a key at Ambient 0 unhangs Ambient inside its span (20:30: ${z2030.mode})`)
  F(z12.mode === 'off', `outside Ambient's span the display is not off (12:00: ${z12.mode})`)
  F(same(H.nightsOn(jacob, '2026-11-26', (d) => T.todSlotRowOf(PT, d), 302.2)[0].starts, [hm(19), hm(20), hm(21), hm(22), hm(23), DAY]), 'a night ending after its last show runs on into the next evening\'s shows')
  // 6. THE PUBLISHED SHAPES, EXACT against the old engine at a pinned full sha, every minute of 2026 at PTown
  const OS = await importSource('src/displays/showChannel.js', { transform: () => resolveImports(atSha('src/displays/showChannel.js'), 'src/displays/showChannel.js'), redirect: { 'src/cartograph/animatedParam.js': { transform: () => resolveImports(atSha('src/cartograph/animatedParam.js'), 'src/cartograph/animatedParam.js') } } })
  const OE = await importSource('src/displays/lightShow/engine.js', { transform: () => resolveImports(atSha('src/displays/lightShow/engine.js'), 'src/displays/lightShow/engine.js') })
  const PUBLISHED = { animated: 'tod', values: { dawn: { glow: 1.36, show: 2.4, kelvin: 3810, showEvery: 60 }, sunset: { glow: 1.36, show: 2, kelvin: 2700, showEvery: 60 } }, edges: { dawn: { fade: 'down', minutes: 15 }, sunset: { fade: 'up', minutes: 15 } } }
  for (const [name, old] of [['PTown\'s published channel', PUBLISHED], ['the old default', OS.defaultDisplayChannel()]]) {
    const copy = JSON.stringify(old), now = S.validateDisplayChannel(old, 'check')
    F(JSON.stringify(old) === copy && !('edges' in now) && now.schedule?.length === 1, `${name} is not read into one schedule entry, or the input changed`)
    const rowOf = (d) => T.todSlotRowOf(PT, d)
    let diff = null
    for (let d = 0; d < 365 && !diff; d++) {
      const date = new Date(Date.UTC(2026, 0, 1 + d, 12)).toISOString().slice(0, 10), sm = rowOf(date), n = nights(now, date, rowOf)
      const wasTimes = OE.showtimesOn((m) => OS.displayAt(old, m, sm), 302.2), nowTimes = H.showtimesOnDate(n.before, n.today)
      if (!same(wasTimes, nowTimes)) { diff = `${date}: showtimes ${nowTimes} now, ${wasTimes} before`; break }
      for (let m = 0; m < DAY; m++) {
        const was = OS.displayAt(old, m, sm), st = H.displayStateAt(now, n.before, n.today, date, m, rowOf)
        if (Math.abs(was.glow - st.glow) > 1e-9 || Math.abs(was.show - st.show) > 1e-9 || Math.abs(was.kelvin - st.kelvin) > 1e-6) { diff = `${date} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}: glow ${st.glow} show ${st.show} kelvin ${st.kelvin} now, ${was.glow} ${was.show} ${was.kelvin} before`; break }
      }
    }
    F(!diff, `${name} does not play exactly as before: ${diff}`)
  }
  F(refuses(() => S.validateDisplayChannel({ ...PUBLISHED, values: { ...PUBLISHED.values, dawn: { ...PUBLISHED.values.dawn, showEvery: 120 } } }, 'check'), /its keys carry different cadences \(dawn=120, sunset=60\), a shape never published/), 'a per-key cadence whose keys differ is not refused by name')
  F(refuses(() => S.validateDisplayChannel({ ...PUBLISHED, edges: { ...PUBLISHED.edges, noon: { fade: 'up', minutes: 5 } } }, 'check'), /the published shape has exactly one up and one down/), 'a per-key channel with two ▲ marks is not refused by name')
  const ids = { 'monument-lights': {} }
  F(same(Object.keys(S.readPreDisplaySlab({}, ids, 'check')), ['monument-lights']) && same(S.readPreDisplaySlab({}, ids, 'check')['monument-lights'], S.defaultDisplayChannel()), 'a slab with no displays key (PTown 10-29) does not play its declared display on the default')
  F(same(S.readPreDisplaySlab({}, {}, 'check'), {}), 'a slab with no displays key and none declared (Huron) is not a town with no displays')
  F(refuses(() => S.readPreDisplaySlab({ displays: {} }, ids, 'check'), /has no channel for "monument-lights", which the town declares: an inconsistent slab/), 'a displays block missing a declared display is not refused by name')
  // 7. kept: the cache, the bound, the clock-change reader
  const y = T.todSlotYear(PT, 2026)
  F(T.todSlotYear({ ...PT }, 2026) === y && T.todSlotYear({ ...PT, lat: 42.5 }, 2026) !== y && Object.isFrozen(y) && y.length === 365, 'the year cache is not keyed by the place\'s values, or not frozen')
  F(Number.isFinite(T.SLOT_DAY_MOVE_MAX_MIN) && T.SLOT_DAY_MOVE_MAX_MIN > 0, 'todSlots.js names no SLOT_DAY_MOVE_MAX_MIN')
  const C = await importSource('src/lib/townClock.js', clock ? { transform: clock } : {})
  const night = (d, tz) => { const a = C.townDateAt({ year: +d.slice(0, 4), month: +d.slice(5, 7), day: +d.slice(8, 10), minute: 720 }, tz); return C.townClockChange(a, new Date(a.getTime() + 86400000), tz) }
  for (const [d, tz, w] of [['2026-03-07', 'America/New_York', { kind: 'skip', from: '02:00', to: '02:59' }], ['2026-10-31', 'America/New_York', { kind: 'repeat', from: '01:00', to: '01:59' }], ['2026-06-20', 'America/New_York', null], ['2026-04-04', 'Australia/Lord_Howe', { kind: 'repeat', from: '01:30', to: '01:59' }], ['2026-03-28', 'Europe/London', { kind: 'skip', from: '01:00', to: '01:59' }], ['2026-09-05', 'America/Santiago', { kind: 'skip', from: '00:00', to: '00:59' }]])
    F(same(night(d, tz), w), `the night of ${d} in ${tz} reads ${JSON.stringify(night(d, tz))}, not ${JSON.stringify(w)}`)
  // wired
  const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const ls = code(view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx'))
  F(/const channel = useMemo\(\(\) => validateDisplayChannel\(given, where\), \[given, where\]\)/.test(ls) && /displayStateAt\(channel, day\.current\.before, day\.current\.today, clock\.date,/.test(ls) && /refuseScheduleSense\(channel, getTodSlotDaysAhead\(/.test(ls) && /real && mode !== 'off' && !toDark \?/.test(ls), "LightShow does not play the validated channel's schedule (its state, its year, the last show's dark close)")
  const bm = code(bake ? bake(sourceOf('cartograph/bake-manifest.mjs')) : sourceOf('cartograph/bake-manifest.mjs'))
  F(/const channel = validateDisplayChannel\(bakedScene\.displays\[d\.id\], where\)/.test(bm) && /refuseShortCadence\(channel, secs, where\)/.test(bm) && /refuseScheduleSense\(channel, year, secs, `\$\{where\}, \$\{span\}`\)/.test(bm), 'bake-manifest does not judge the schedule, as the player reads it, over the year')
  const st = code(store ? store(sourceOf('src/cartograph/stores/useCartographStore.js')) : sourceOf('src/cartograph/stores/useCartographStore.js'))
  F(/const cur = s\.displays\?\.\[id\] \? validateDisplayChannel\(s\.displays\[id\], where\) : defaultDisplayChannel\(\)/.test(st) && /refuseScheduleSense\(next, getTodSlotDaysAhead\(useTimeOfDay\.getState\(\)\.currentTime, 366\), runSeconds, where\)/.test(st), 'the store does not read an old Look through the validator, or does not judge a schedule at the gesture')
  return fails
}

const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 240)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ a display does not keep its schedule:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a display keeps its schedule: shows from a first to a last start every N, never clipped; Ambient on and off with its fades, dark after the last show; a night on its own date, each end on its own row; dated replaces daily; refused by name over the year; every published slab plays exactly as before')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the shows on the sun\'s fractional minute (the staging slab)', { sched: (s) => s.replace('const showMinute = (end, row) => Math.ceil(windowEndMinute(end, row))', 'const showMinute = (end, row) => windowEndMinute(end, row)') }],
    ['a slot show rounded, not ceiled (before Ambient is on)', { sched: (s) => s.replace('const showMinute = (end, row) => Math.ceil(windowEndMinute(end, row))', 'const showMinute = (end, row) => Math.round(windowEndMinute(end, row))') }],
    ['a year of no shows not refused', { sched: (s) => s.replace('for (const [e, count] of played) if (!count) {', 'for (const [e, count] of played) if (false) {') }],
    ['one night of no shows refused', { sched: (s) => s.replace('played.set(e, (played.get(e) || 0) + (n ? n.starts.length : 0))', 'played.set(e, (played.get(e) ?? 1) && (n ? n.starts.length : 0))') }],
    ['the last start exclusive (no midnight show)', { sched: (s) => s.replace('if (o > mod(l - f) || o % shows.every) continue', 'if (o >= mod(l - f) || o % shows.every) continue') }],
    ['a run clipped (the whole-run gate dropped)', { sched: (s) => s.replace('const whole = !amb || (x >= onAt && (fixedOff == null || x + len <= fixedOff + (amb.fadeOut || 0)))', 'const whole = true') }],
    ['a fade-in dropping the show at Ambient\'s on-time (Zob\'s probes)', { sched: (s) => s.replace('x >= onAt && (fixedOff', 'x > onAt && (fixedOff') }],
    ['an Ambient that never goes off allowed', { sched: (s) => s.replace("if (e.ambient?.off === 'after-last-show' && (!n || n.lastStart == null)) throw", 'if (false) throw') }],
    ['a Show 0 key cancelling a show (two homes)', { sched: (s) => s.replace('const whole = !amb || (x >= onAt && (fixedOff == null || x + len <= fixedOff + (amb.fadeOut || 0)))', 'const whole = levelsAt(ch, mod(x), rowAt(x)).show > 0 && (!amb || (x >= onAt && (fixedOff == null || x + len <= fixedOff + (amb.fadeOut || 0))))') }],
    ['an Ambient 0 key unhanging Ambient (two homes)', { sched: (s) => s.replace("    if (n.onAt != null) return { mode: 'glow',", "    if (n.onAt != null && lit.glow > 0) return { mode: 'glow',") }],
    ['every close white (the last show not dark)', { sched: (s) => s.replace("return { mode: 'show', t: (x - s) * 60, dark: n.closesDark && s === n.lastStart, ...lit }", "return { mode: 'show', t: (x - s) * 60, dark: false, ...lit }") }],
    ['every show dark', { sched: (s) => s.replace("dark: n.closesDark && s === n.lastStart", 'dark: n.closesDark') }],
    ['an end read from the night\'s own date (Zob 1)', { sched: (s) => s.replace('const a = windowEndMinute(end, rD), b = DAY + windowEndMinute(end, rN)', 'const a = windowEndMinute(end, rD), b = DAY + windowEndMinute(end, rD)') }],
    ['slots on one minute without the day\'s order', { sched: (s) => s.replace("    if (a === prev && prevEnd && !HHMM.test(end) && !HHMM.test(prevEnd) && slotsInDayOrder(prevEnd, end, a, rD)) return a\n", '') }],
    ['a fade-out not holding the level at off', { sched: (s) => s.replace("const lv = n.offAt != null && x >= n.offAt ? levelsAt(", "const lv = false ? levelsAt(") }],
    ['a dated entry beside the daily (not replacing)', { sched: (s) => s.replace('  if (dated.length) return dated\n', '') }],
    ['the night on the clock\'s date (yesterday\'s night dropped)', { sched: (s) => s.replace("for (const [nights, x] of [[nightsBefore, minute + DAY], [nightsToday, minute]])", "for (const [nights, x] of [[nightsToday, minute]])") }],
    ['ends passing never noticed', { sched: (s) => s.replace('if (prev != null && Math.abs(L - prev) > DAY / 2) side ^= 1', 'void 0') }],
    ['the slot bound unguarded', { sched: (s) => s.replace('if (move > SLOT_DAY_MOVE_MAX_MIN) throw', 'if (false) throw') }],
    ['nights overlapping across midnight allowed', { sched: (s) => s.replace('if (e0 > DAY + s1) throw', 'if (false) throw') }],
    ['a night with no end running into the next evening (no cap at the last start)', { sched: (s) => s.replace('        if (!starts.length && fixedOff == null) cap = x + mod(showMinute(shows.last, rowAt(x)) - mod(x))\n', '') }],
    ['the published cadence not read', { chan: (s) => s.replace('  if (!keyed.length && !marks.length) return ch\n', '  return ch\n') }],
    ['a published cadence with differing keys read as the first', { chan: (s) => s.replace('if (n.length !== 1) throw', 'if (false) throw') }],
    ['the published fades read as hard (the minutes dropped)', { chan: (s) => s.replace("ambient: { on: up[0][0], fadeIn: up[0][1].minutes, off: down[0][0], fadeOut: down[0][1].minutes }", "ambient: { on: up[0][0], fadeIn: 0, off: down[0][0], fadeOut: 0 }") }],
    ['a pre-display slab refused again', { chan: (s) => s.replace("if (!scene || !('displays' in scene)) return displayChannelsFor(", "if (!scene || !('displays' in scene)) throw new Refusal('[showChannel] ⛔ re-bake the Look\\'s scene'); if (false) return displayChannelsFor(") }],
    ['a pre-display slab read as no displays (the monument dark)', { chan: (s) => s.replace("return displayChannelsFor(identityDisplays, undefined, `${where} (a slab from before displays had a channel)`)", 'return {}') }],
    ['a clock change at midnight not wrapped (24:00)', { clock: (s) => s.replace('const wallHHMM = (m) => { const x = ((m % 1440) + 1440) % 1440;', 'const wallHHMM = (m) => { const x = m;') }],
    ['the cache keyed without the latitude', { slots: (s) => s.replace('const key = `${lat},${lon},${tz},${year}`', 'const key = `${lon},${tz},${year}`') }],
    ['LightShow not closing the last show to dark', { view: (s) => s.replace("real && mode !== 'off' && !toDark ?", "real && mode !== 'off' ?") }],
    ['the bake not judging the schedule', { bake: (s) => s.replace('refuseScheduleSense(channel, year, secs,', 'void (channel, year, secs,') }],
    ['the store not reading an old Look', { store: (s) => s.replace('const cur = s.displays?.[id] ? validateDisplayChannel(s.displays[id], where) : defaultDisplayChannel()', 'const cur = s.displays?.[id] || defaultDisplayChannel()') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
