#!/usr/bin/env node
// CLAIM — WHEN THE LIDAR FLEW AND WHERE THE WATER STOOD THEN ARE READ, NAMED, AND NEVER GUESSED (fetch-flight-water.mjs).
//
// The coast at a lake town's level is the lidar's only above the water of its flight days; the band below is the
// bathymetry's (Boz's ruling of Jacob's method, 2026-10-25). ASSERTS, on drawn inputs (fake fetchers, no network), through
// the real functions:
//   1. projectsOf reads the 3DEP project from every URL, and REFUSES a line that names none;
//   2. flightWindows takes each project's earliest collect_start and latest collect_end over its work units, and REFUSES a
//      project WESM does not know;
//   3. monthsOf covers every month the window touches, across a year end;
//   4. gaugeOverWindows reads each month, converts through the record's own IGLD85 → NAVD88, names the highest and
//      lowest, takes the BAND'S TOP as the highest OBSERVED water of any month (Boz), REFUSES a month with no mean or no
//      highest, and REFUSES a tidal town by name (not built);
//   5. on every town that carries both records, the NAVD88 of each month is the record's conversion of its IGLD85.
// MUTANTS (each RED): projectsOf skips an unnamed line · the window takes the first work unit only · a missing month is
// skipped · the conversion is dropped (NAVD88 = IGLD85) · the band's top taken from the means · a missing highest skipped.
//
//   node checks/claims-the-flight-water-is-named.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { projectsOf, flightWindows, monthsOf, gaugeOverWindows, FLIGHTS_FILE, FLIGHT_WATER_FILE } from '../cartograph/fetch-flight-water.mjs'
import { igld85ToNavd88 } from '../cartograph/waterDatums.mjs'

const bad = []
const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) }
const throws = async (f) => { try { await f(); return false } catch { return true } }
const res = (body) => ({ ok: true, status: 200, json: async () => body })

console.log('── 1. the projects of a source list')
say(projectsOf('# c\nhttps://x/Projects/A_2019/TIFF/t1.tif\nhttps://x/Projects/A_2019/TIFF/t2.tif\nhttps://x/Projects/B_2006/t.tif\n').join() === 'A_2019,B_2006', 'every URL\'s project, once each')
say(await throws(() => projectsOf('https://x/elevation.tif')), 'a line naming no project REFUSES')

console.log('── 2. the flight window from WESM')
const T = (d) => Date.parse(d)
const wesm = async () => res({ features: [
  { attributes: { project: 'A_2019', workunit: 'A_1', collect_start: T('2019-11-08'), collect_end: T('2019-12-20') } },
  { attributes: { project: 'A_2019', workunit: 'A_2', collect_start: T('2020-02-01'), collect_end: T('2020-04-19') } }] })
const W = await flightWindows(['A_2019'], { minLon: 0, minLat: 0, maxLon: 1, maxLat: 1 }, { fetcher: wesm })
say(W.A_2019.start === '2019-11-08' && W.A_2019.end === '2020-04-19' && W.A_2019.workunits.length === 2, `earliest start, latest end over both work units (${W.A_2019.start} … ${W.A_2019.end})`)
say(await throws(() => flightWindows(['Z_1999'], { minLon: 0, minLat: 0, maxLon: 1, maxLat: 1 }, { fetcher: wesm })), 'a project WESM does not know REFUSES')

console.log('── 3. the months of a window')
say(monthsOf('2019-11-08', '2020-02-03').map(([y, m]) => `${y}-${m}`).join() === '2019-11,2019-12,2020-1,2020-2', 'across the year end, both ends included')

console.log('── 4. the gauge over the window')
const D = { kind: 'lake', station: { id: 'g', name: 'G' }, igld85ToNavd88: { points: [[171, 171.066], [176, 176.068]] } }
const level = { '2019-11': 174.63, '2019-12': 174.65, '2020-01': 174.76, '2020-02': 174.88, '2020-03': 174.96, '2020-04': 175.06 }
const peak = { '2019-11': 174.9, '2019-12': 174.95, '2020-01': 175.05, '2020-02': 175.3, '2020-03': 175.2, '2020-04': 175.25 }
const gauge = (holes = [], noPeak = []) => async (url) => { const b = new URL(url).searchParams.get('begin_date'), k = `${b.slice(0, 4)}-${b.slice(4, 6)}`
  return res(holes.includes(k) ? { error: { message: 'No data was found' } } : { data: [{ MSL: String(level[k]), highest: noPeak.includes(k) ? '' : String(peak[k]) }] }) }
const G = await gaugeOverWindows(D, W, 'fixture', { fetcher: gauge() })
const conv = igld85ToNavd88(D, 'fixture'), g = G.A_2019
say(g.months.length === 6 && g.highest.month === '2020-04' && g.lowest.month === '2019-11', `six months, highest ${g.highest.month}, lowest ${g.lowest.month}`)
say(g.months.every(m => Math.abs(m.navd88M - conv(m.igld85M)) < 1e-3), `each month converted by the record (${g.highest.igld85M} → ${g.highest.navd88M} m NAVD88)`)
say(await throws(() => gaugeOverWindows(D, W, 'fixture', { fetcher: gauge(['2020-02']) })), 'a month the gauge has no mean for REFUSES')
say(g.bandTop.month === '2020-02' && Math.abs(g.bandTop.navd88M - conv(175.3)) < 1e-3, `the band's top is the HIGHEST OBSERVED in any month (${g.bandTop.month}, ${g.bandTop.navd88M} m), not the highest mean (${g.highest.month})`)
say(await throws(() => gaugeOverWindows(D, W, 'fixture', { fetcher: gauge([], ['2019-12']) })), 'a month with no highest observed water REFUSES')
say(await throws(() => gaugeOverWindows({ ...D, kind: 'tidal' }, W, 'fixture', { fetcher: gauge() })), 'a TIDAL town REFUSES by name (not built)')

console.log('── 5. every town carrying both records')
let n = 0
for (const t of readdirSync(join(ROOT, 'cartograph/data'))) {
  const raw = join(ROOT, 'cartograph/data', t, 'raw'), fp = join(raw, FLIGHT_WATER_FILE), dp = join(raw, 'water-datums.json')
  if (!existsSync(fp) || !existsSync(dp)) continue
  n++
  const rec = JSON.parse(readFileSync(fp, 'utf8')), c = igld85ToNavd88(JSON.parse(readFileSync(dp, 'utf8')), t)
  const all = Object.values(rec.projects).flatMap(p => p.months)
  say(all.length && all.every(m => Math.abs(m.navd88M - c(m.igld85M)) < 1e-3), `${t}: ${all.length} month(s), each the record's conversion of its gauge reading`)
}
if (!n) console.log('  (no town carries raw/' + FLIGHT_WATER_FILE + ' on this machine)')
if (bad.length) { console.log(`\n⛔ ${bad.length} claim(s) fail.`); process.exit(1) }
console.log('\n✅ When the lidar flew, and where the water stood, are read and named.')
