#!/usr/bin/env node
/**
 * "IS A PLACE OPEN BY THE TOWN'S CLOCK — THE SAME ANSWER WHEREVER THE VIEWER IS?"
 *
 * WHY (Warden's measurement, Boz's ruling, 2026-09-29). Jacob, in Central, looking at Provincetown (Eastern), saw neon lit
 * on a place its card called "Closed": `openSlotAt` read `getHours()`/`getDay()` in the VIEWER's zone. Invisible whenever
 * you test in the town's own zone — so this check never does: it asks the same instants from two viewer zones far from
 * the town and demands the same answers, and the town's clock reading its own wall time.
 *
 * Asserts:
 *   1. behaviour — under TZ=America/Chicago and TZ=Asia/Tokyo, for a town in America/New_York: townClockOf gives the same
 *      weekday/minute, and isOpenAt/openSlotAt the same answers, at instants around a 10:00–02:30 bar's edges and midnight;
 *      and those answers are the town's (open at 23:30 Eastern, closed at 03:00 Eastern);
 *   2. no town-clock surface reads the viewer's clock: openNow.js, PlaceCard's hours + menus, EventTicker's ticker;
 *   3. a town with no zone throws by name (townPlace refuses the geography);
 *   4. THE SKY'S TIME OF DAY (Boz, 2026-09-29 — Jacob tunes ToD keyframes from Central): from both viewers, the town's
 *      minute and day-of-year, the sun-event slots the keyframes key on (getTodSlotMinutes), and the scrub's writes
 *      (useTimeOfDay.setMinuteOfDay, useCalendar.setDayOfYear) land on the SAME instants and read the same town clock;
 *      and no ToD surface calls a viewer-clock getter or setter.
 *      ⚠️ Not covered, deliberately and said: the OLD player's DawnTimeline / WeatherTimeline / lib/dawnTimeline —
 *      frozen UI that retires at cutover (the Ward's Almanac replaces it).
 * ⛔ Mutation-tested 2026-09-29: openSlotAt back on getHours()/getDay() → (1) and (2) red; getMinuteOfDay back on
 *    getHours() → (4) red; getTodSlotMinutes' toMin back on getHours() → (4) red.
 *
 * Usage: node checks/claims-a-town-keeps-its-own-clock.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'

const fails = []
const TOWN = 'America/New_York'
// Instants (UTC) and what the TOWN's clock says of a bar open 10:00–02:30 every day.
const CASES = [
  ['2026-09-29T03:30:00Z', true],    // 23:30 Eastern (Mon)
  ['2026-09-29T06:29:00Z', true],    // 02:29 Eastern — yesterday's window spills
  ['2026-09-29T06:30:00Z', false],   // 02:30 Eastern — close is exclusive
  ['2026-09-29T07:00:00Z', false],   // 03:00 Eastern
  ['2026-09-29T14:00:00Z', true],    // 10:00 Eastern
  ['2026-09-29T13:59:00Z', false],   // 09:59 Eastern
]
const probe = `
  const { isOpenAt, openSlotAt } = await import(${JSON.stringify(join(ROOT, 'src/lib/openNow.js'))})
  const { townClockOf } = await import(${JSON.stringify(join(ROOT, 'src/lib/townClock.js'))})
  const bar = {}; for (const d of ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']) bar[d] = { open: '10:00', close: '02:30' }
  const out = ${JSON.stringify(CASES)}.map(([iso]) => { const t = new Date(iso); const c = townClockOf(t, ${JSON.stringify(TOWN)});
    return [c.dow, c.minuteOfDay, isOpenAt(bar, t, ${JSON.stringify(TOWN)}), openSlotAt(bar, t, ${JSON.stringify(TOWN)})?.close ?? null] })
  console.log(JSON.stringify(out))`
const ask = (tz) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', probe], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).trim())

// 1. Behaviour, from two viewers.
const chicago = ask('America/Chicago'), tokyo = ask('Asia/Tokyo')
if (JSON.stringify(chicago) !== JSON.stringify(tokyo)) fails.push(`the same instants read differently in Chicago and Tokyo — the town's clock follows the viewer:\n     Chicago ${JSON.stringify(chicago)}\n     Tokyo   ${JSON.stringify(tokyo)}`)
CASES.forEach(([iso, want], i) => { if (chicago[i][2] !== want) fails.push(`${iso} (Eastern ${Math.floor(chicago[i][1] / 60)}:${String(chicago[i][1] % 60).padStart(2, '0')}): open=${chicago[i][2]}, the town's clock says ${want}`) })

// 2. No town-clock surface reads the viewer's clock.
const code = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const slice = (src, from, to) => { const a = src.indexOf(from); return a < 0 ? '' : src.slice(a, to ? src.indexOf(to, a + from.length) : undefined) }
const VIEWER = /\.get(Hours|Day|Minutes|Date|Month|FullYear)\(\)/
const surfaces = [
  ['src/lib/openNow.js', (s) => s],
  ['src/components/PlaceCard.jsx', (s) => slice(s, 'function getOpenStatus(', '\n}\n')],
  ['src/components/PlaceCard.jsx (menus)', (s) => slice(s, 'const [activeMenu, setActiveMenu]', 'const currentMenu')],
  ['src/components/PlaceCard.jsx (orderable)', (s) => slice(s, 'const orderableMenus = useMemo', 'for (const [menuKey')],
  ['src/components/EventTicker.jsx', (s) => slice(s, 'function buildTickerEntries(', 'const entries = new Map()')],
]
for (const [label, pick] of surfaces) {
  const body = pick(code(label.split(' ')[0]))
  if (!body) fails.push(`${label}: the code this check reads is gone — re-point it`)
  else if (VIEWER.test(body)) fails.push(`${label} reads the VIEWER's clock (${body.match(VIEWER)[0]}) — read townClockOf instead`)
}

// 4. The sky's time of day, from both viewers.
const skyProbe = `
  const { setTownPlace } = await import(${JSON.stringify(join(ROOT, 'src/lib/townPlace.js'))})
  setTownPlace({ lat: 42.05, lon: -70.19, timezone: ${JSON.stringify(TOWN)}, lonToMeters: 1, latToMeters: 1 }, 'probe')
  const tc = await import(${JSON.stringify(join(ROOT, 'src/lib/townClock.js'))})
  const { getTodSlotMinutes } = await import(${JSON.stringify(join(ROOT, 'src/cartograph/animatedParam.js'))})
  const tod = (await import(${JSON.stringify(join(ROOT, 'src/hooks/useTimeOfDay.js'))})).default
  const cal = (await import(${JSON.stringify(join(ROOT, 'src/hooks/useCalendar.js'))})).default
  const t = new Date('2026-09-29T03:30:00Z')
  const slots = getTodSlotMinutes(t)
  tod.setState({ currentTime: t }); tod.getState().setMinuteOfDay(1110)
  const scrubbed = tod.getState().currentTime
  cal.setState({ currentDate: scrubbed }); cal.getState().setDayOfYear(100)
  console.log(JSON.stringify({ minute: tc.townMinuteOf(t), doy: tc.townDayOfYear(t), noon: Math.round(slots.noon), sunrise: Math.round(slots.sunrise),
    scrubbed: scrubbed.toISOString(), scrubbedMinute: tod.getState().getMinuteOfDay(), doyTo: cal.getState().currentDate.toISOString() }))`
const askSky = (tz) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', skyProbe], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).trim().split('\n').pop())
const sc = askSky('America/Chicago'), st = askSky('Asia/Tokyo')
console.log(`   sky, from Chicago and Tokyo: ${JSON.stringify(sc)}`)
if (JSON.stringify(sc) !== JSON.stringify(st)) fails.push(`the sky's time of day follows the viewer:\n     Chicago ${JSON.stringify(sc)}\n     Tokyo   ${JSON.stringify(st)}`)
if (sc.minute !== 23 * 60 + 30) fails.push(`townMinuteOf read ${sc.minute} at 23:30 Eastern`)
if (sc.scrubbedMinute !== 1110 || !sc.scrubbed.startsWith('2026-09-28T22:30')) fails.push(`setMinuteOfDay(18:30) landed at ${sc.scrubbed} (town minute ${sc.scrubbedMinute}) — want 18:30 Eastern on the town's date, 2026-09-28T22:30Z`)
if (!(sc.noon > 12 * 60 && sc.noon < 13 * 60)) fails.push(`the day's solar-noon slot reads ${sc.noon} min on the town's clock — Provincetown's solar noon is ~12:40 Eastern`)
const VIEWER_CLOCK = /\.get(Hours|Day|Minutes|Seconds|Date|Month|FullYear)\(\)|\.set(Hours|Minutes|Date|Month|FullYear)\(/
for (const f of ['src/hooks/useTimeOfDay.js', 'src/hooks/useCalendar.js', 'src/cartograph/animatedParam.js', 'src/cartograph/skyGrid.js',
  'src/components/Atmosphere.jsx', 'src/components/GatewayArch.jsx', 'src/App.jsx', 'src/cartograph/TodChannel.jsx',
  'src/cartograph/SkyGradientGrid.jsx', 'src/lib/weather-payload.js', 'src/lib/weather-signals.js']) {
  const m = code(f).match(VIEWER_CLOCK)
  if (m) fails.push(`${f} reads or writes the VIEWER's clock (${m[0]}) — use src/lib/townClock.js`)
}

// 3. No zone, no clock.
try {
  execFileSync(process.execPath, ['--input-type=module', '-e', `const { setTownPlace } = await import(${JSON.stringify(join(ROOT, 'src/lib/townPlace.js'))}); setTownPlace({ lat: 1, lon: 1, lonToMeters: 1, latToMeters: 1 }, 'no-zone')`], { stdio: 'pipe' })
  fails.push('a town with no timezone was placed — its clock would silently be the viewer\'s')
} catch (e) { if (!/timezone|geography/.test(String(e.stderr))) fails.push(`placing a zone-less town failed, but not by name: ${String(e.stderr).slice(0, 160)}`) }

if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log(`✅ ${CASES.length} instants read the same from Chicago and Tokyo, by the town's own clock; no hours surface reads the viewer's`)
