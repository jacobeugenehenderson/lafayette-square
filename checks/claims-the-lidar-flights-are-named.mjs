#!/usr/bin/env node
// CLAIM — WHEN THE LIDAR FLEW, AND THE GEOID IT WAS DELIVERED ON, ARE READ AND NAMED, NEVER GUESSED (fetch-lidar-flights.mjs).
//
// The lidar's NAVD88 is its stated geoid's; the water record's is the current model's. One surface needs one basis, read
// from the two stated models, never a typed offset. ASSERTS, on drawn inputs (fake WESM and NGS, no network), through the
// real functions:
//   1. projectsOf reads the 3DEP project from every URL, and REFUSES a line that names none;
//   2. flightWindows takes each project's earliest collect_start and latest collect_end over its work units, its QL and
//      its ONE stated geoid; it REFUSES a project WESM does not know, and one stating two geoids or none;
//   3. geoidToCurrent puts toCurrentM = N(own) − N(current) on each project, from NGS, and REFUSES a geoid NGS has no id for;
//   4. lidarToRecordM REFUSES no record, and two projects with different corrections;
//   5. every town with a raw/elevation-flights.json carries one finite correction, and a run that judges NO town is RED by
//      name (the data blanked, an empty directory, is shown RED every run).
// MUTANTS (each RED): projectsOf skips an unnamed line · the window takes the first work unit only · the correction's sign
// flipped (N(current) − N(own)) · lidarToRecordM takes the first project's correction.
//
//   node checks/claims-the-lidar-flights-are-named.mjs
import { readFileSync, existsSync, readdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { projectsOf, flightWindows, geoidToCurrent, lidarToRecordM, FLIGHTS_FILE } from '../cartograph/fetch-lidar-flights.mjs'

const bad = []
const say = (ok, what) => { console.log(`  ${ok ? '✅' : '⛔'} ${what}`); if (!ok) bad.push(what) }
const throws = async (f) => { try { await f(); return false } catch { return true } }
const res = (body) => ({ ok: true, status: 200, json: async () => body })
const BB = { minLon: 0, minLat: 0, maxLon: 1, maxLat: 1 }

console.log('── 1. the projects of a source list')
say(projectsOf('# c\nhttps://x/Projects/A_2019/TIFF/t1.tif\nhttps://x/Projects/A_2019/TIFF/t2.tif\nhttps://x/Projects/B_2006/t.tif\n').join() === 'A_2019,B_2006', 'every URL\'s project, once each')
say(await throws(() => projectsOf('https://x/elevation.tif')), 'a line naming no project REFUSES')

console.log('── 2. the flight window, QL and geoid from WESM')
const T = (d) => Date.parse(d)
const wesm = (rows) => async () => res({ features: rows.map(attributes => ({ attributes })) })
const A = [{ project: 'A_2019', workunit: 'A_1', collect_start: T('2019-11-08'), collect_end: T('2019-12-20'), ql: 'QL 1', geoid: 'GEOID12B' },
           { project: 'A_2019', workunit: 'A_2', collect_start: T('2020-02-01'), collect_end: T('2020-04-19'), ql: 'QL 1', geoid: 'GEOID12B' }]
const W = await flightWindows(['A_2019'], BB, { fetcher: wesm(A) })
say(W.A_2019.start === '2019-11-08' && W.A_2019.end === '2020-04-19' && W.A_2019.workunits.length === 2 && W.A_2019.geoid === 'GEOID12B' && W.A_2019.ql === 'QL 1',
  `earliest start, latest end over both work units; one geoid (${W.A_2019.start} … ${W.A_2019.end}, ${W.A_2019.geoid}, ${W.A_2019.ql})`)
say(await throws(() => flightWindows(['Z_1999'], BB, { fetcher: wesm(A) })), 'a project WESM does not know REFUSES')
say(await throws(() => flightWindows(['A_2019'], BB, { fetcher: wesm([A[0], { ...A[1], geoid: 'GEOID18' }]) })), 'a project stating two geoids REFUSES')
say(await throws(() => flightWindows(['A_2019'], BB, { fetcher: wesm(A.map(a => ({ ...a, geoid: null }))) })), 'a project stating no geoid REFUSES')

console.log('── 3. the correction to the current geoid, from NGS')
const N = { 13: -35.145, 14: -35.111 }, names = { 13: 'GEOID12B', 14: 'GEOID18' }
const ngs = async (url) => { const m = +new URL(url).searchParams.get('model'); return res({ geoidModel: names[m], geoidHeight: N[m], error: 0.05 }) }
await geoidToCurrent(W, 41.4, -82.6, { fetcher: ngs })
say(W.A_2019.geoidAt.toCurrentM === -0.034, `GEOID12B → GEOID18 at the town: ${W.A_2019.geoidAt.toCurrentM} m (Huron's, NGS)`)
say(await throws(() => geoidToCurrent({ X: { geoid: 'GEOID99' } }, 41.4, -82.6, { fetcher: ngs })), 'a geoid NGS has no id for REFUSES')

console.log('── 4. one correction per surface')
say(await throws(() => lidarToRecordM(null, 'fixture')), 'no record REFUSES')
say(await throws(() => lidarToRecordM({ projects: { a: { geoidAt: { toCurrentM: -0.034 } }, b: { geoidAt: { toCurrentM: 0 } } } }, 'fixture')), 'two projects with different corrections REFUSE')
say(lidarToRecordM({ projects: { a: { geoidAt: { toCurrentM: -0.034 } }, b: { geoidAt: { toCurrentM: -0.034 } } } }, 'fixture') === -0.034, 'two projects sharing one correction give it')

console.log('── 5. every town carrying the record')
// over one data directory → the towns judged. ⛔ Judging NO town is RED by name, never a pass
function judgeTowns(data) {
  let n = 0
  for (const t of existsSync(data) ? readdirSync(data) : []) {
    const fp = join(data, t, 'raw', FLIGHTS_FILE)
    if (!existsSync(fp)) continue
    n++
    let d = null; try { d = lidarToRecordM(JSON.parse(readFileSync(fp, 'utf8')), t) } catch (e) { d = e.message.split('\n')[0] }
    say(Number.isFinite(d), `${t}: the lidar onto the record's basis ${typeof d === 'number' ? `${d} m` : `— ${d}`}`)
  }
  say(n > 0, n ? `§5 judged ${n} town(s) carrying raw/${FLIGHTS_FILE}` : `no town carries raw/${FLIGHTS_FILE} in ${data}: §5 judged nothing (▶ node cartograph/fetch-lidar-flights.mjs --scene=<town>)`)
  return n
}
judgeTowns(join(ROOT, 'cartograph/data'))
// the data blanked: §5 over an empty directory must turn RED by name
{ const before = bad.length, out = console.log; console.log = () => {}
  try { judgeTowns(mkdtempSync(join(tmpdir(), 'flights-'))) } finally { console.log = out }
  const caught = bad.slice(before).some(x => /§5 judged nothing/.test(x)); bad.length = before
  say(caught, `mutant: the data blanked → ${caught ? 'RED, as it must be' : 'GREEN — judging nothing passes'}`) }
if (bad.length) { console.log(`\n⛔ ${bad.length} claim(s) fail.`); process.exit(1) }
console.log('\n✅ When the lidar flew, and the geoid it was delivered on, are read and named.')
