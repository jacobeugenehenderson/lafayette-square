#!/usr/bin/env node
/**
 * "DOES A LIVE SHOW ADVANCE EVERY FRAME, OR ONCE A SECOND?" (Jacob, 2026-11-02 on provincetown.online: "The frame rate
 * of the monument/display is still very stuttery, barely animated. It looks like about 2 fps." Measured there: the bulbs'
 * colour buffer uploaded every frame, its contents changing about once a second. The cause: the live path read the
 * town's minute from whole seconds.)
 *
 *   1. THE CLOCK, driven (townClock.js#townMinuteOf): across one second at 60 frames, in towns east and west of UTC and a
 *      half-hour zone, the town's minute strictly increases every frame and equals the whole minute + seconds + ms;
 *   2. THE SHOW, driven (showSchedule.js#displayStateAt, fed by townMinuteOf at 60 frames inside a show): mode 'show' and
 *      t strictly increasing every frame, by the frame's own length;
 *   3. WIRED (LightShow.jsx, read): the live state is read at townMinuteOf(instant), never at a minute rebuilt from the
 *      clock's whole-second fields.
 * Usage: node checks/claims-a-show-advances-every-frame.mjs [--mutants]
 */
import { importSource, sourceOf } from './_importSource.mjs'

const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

async function verdict({ clock, view } = {}) {
  const fails = [], F = (c, m) => { if (!c) fails.push(m) }
  const C = await importSource('src/lib/townClock.js', clock ? { transform: clock } : {})
  const H = await importSource('src/displays/showSchedule.js')
  const S = await importSource('src/displays/showChannel.js')
  // 1. the clock: 60 frames from 0.5 s before a whole second, across it
  for (const tz of ['America/New_York', 'Asia/Tokyo', 'Asia/Kolkata', 'UTC']) {
    const t0 = Date.UTC(2026, 11, 4, 3, 0, 0) - 500, m = Array.from({ length: 60 }, (_, i) => C.townMinuteOf(new Date(t0 + i * 1000 / 60), tz))
    const rising = m.every((x, i) => !i || x > m[i - 1])
    F(rising, `${tz}: the town's minute does not rise every frame across a second (${m.slice(28, 33).map(x => x.toFixed(5)).join(', ')} …)`)
    const at = new Date(t0 + 250), c = C.townClockOf(at, tz)
    F(Math.abs(C.townMinuteOf(at, tz) - (c.minuteOfDay + (c.seconds + 0.75) / 60)) < 1e-9, `${tz}: the town's minute is not its whole minute + seconds + milliseconds`)
  }
  // 2. the show: hourly on the hour from 00:00, the show 302.2 s; frames from 21:01:10.000 in New York, 60 a second
  const T = await importSource('src/lib/todSlots.js'), real = (d) => T.todSlotRowOf({ lat: 40.7128, lon: -74.006, tz: 'America/New_York' }, d)   // REAL rows
  const ch = S.defaultDisplayChannel()
  const D = '2026-12-04', n = { before: H.nightsOn(ch, H.prevDate(D), real, 302.2), today: H.nightsOn(ch, D, real, 302.2) }
  const start = C.townDateAt({ year: 2026, month: 12, day: 4, minute: 21 * 60 + 1 + 10 / 60 }, 'America/New_York').getTime()
  const st = Array.from({ length: 60 }, (_, i) => { const at = new Date(start + i * 1000 / 60); return H.displayStateAt(ch, n.before, n.today, C.townClockOf(at, 'America/New_York').date, C.townMinuteOf(at, 'America/New_York'), real) })
  F(st.every(s => s.mode === 'show'), `21:01:10 is not inside the 21:00 show (${st[0].mode})`)
  F(st.every((s, i) => !i || s.t > st[i - 1].t), `the show's t does not rise every frame (${st.slice(0, 4).map(s => s.t.toFixed(4)).join(', ')} …)`)
  F(Math.abs(st[59].t - st[0].t - 59 / 60) < 0.002, `the show's t does not advance by the frames' own length (a Date holds whole milliseconds) (${(st[59].t - st[0].t).toFixed(4)} s over 59 frames)`)
  // 3. wired
  const ls = code(view ? view(sourceOf('src/displays/lightShow/LightShow.jsx')) : sourceOf('src/displays/lightShow/LightShow.jsx'))
  F(/displayStateAt\(channel, day\.current\.before, day\.current\.today, clock\.date, townMinuteOf\(instant\), getTodSlotRow\)/.test(ls) && !/clock\.seconds \/ 60/.test(ls), 'LightShow does not read the live state at townMinuteOf(instant), or rebuilds the minute from whole seconds')
  return fails
}

const run = async (m) => { try { return await verdict(m) } catch (e) { return [`it threw: ${String(e.message).slice(0, 200)}`] } }
const fails = await run()
if (fails.length) { console.log('⛔ a live show does not advance every frame:\n  · ' + fails.join('\n  · ')); process.exitCode = 1 }
else console.log('✅ a live show advances every frame: the town\'s minute carries the millisecond, so the show\'s t rises by each frame\'s own length')

if (process.argv.includes('--mutants')) {
  const mutants = [
    ['the whole-second clock', { clock: (s) => s.replace('return c.minuteOfDay + (c.seconds + ms / 1000) / 60', 'return c.minuteOfDay + c.seconds / 60') }],
    ['the millisecond read wrong', { clock: (s) => s.replace('ms = ((when.getTime() % 1000) + 1000) % 1000', 'ms = when.getTime() % 500') }],
    ['the live minute rebuilt from the fields', { view: (s) => s.replace('clock.date, townMinuteOf(instant), getTodSlotRow)', 'clock.date, clock.hours * 60 + clock.minutes + clock.seconds / 60, getTodSlotRow)') }],
  ]
  let bad = 0
  for (const [name, m] of mutants) { const f = await run(m); console.log(`${f.length ? '🔴' : '⚪ SURVIVED'} mutant: ${name}${f.length ? ` (${f.length})` : ''}`); if (!f.length) bad++ }
  if (bad) process.exitCode = 1
}
