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
 *   3. a town with no zone throws by name (townPlace refuses the geography).
 * ⛔ Mutation-tested 2026-09-29: openSlotAt back on getHours()/getDay() → (1) and (2) red.
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
