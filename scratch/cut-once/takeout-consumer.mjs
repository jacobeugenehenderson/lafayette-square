// The take-out's CONSUMER (Zob, 2026-10-29): PTown's ① mint (tileGround.js#mintProtopolygon) on mintInputs' own arguments, once
// with the kit's take-out (integer, as mintInputs makes it) and once with the candidate's (takeout.mjs). The coast is the v5
// fixture (fixtures/ptown-coast.json, as coast.json in a temp clean dir); everything else is the town's own files, read-only.
// node scratch/cut-once/takeout-consumer.mjs --data=<provincetown data dir>
import fs from 'fs'
import { join } from 'path'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
process.argv[1] = process.argv[1] + '#consumer'
const T = await import('./takeout.mjs'), { streetDecks } = await import('../../cartograph/structures.mjs'), { readCoast } = await import('../../cartograph/coastFile.mjs')
const { mintInputs, townBlockCustoms } = await import('../../cartograph/mintInputs.mjs'), { projectorOf, localBB } = await import('../../cartograph/geography.mjs')
const { splitBoundary, discOf } = await import('../../cartograph/boundaryRecords.mjs'), { homeLookOf } = await import('../../cartograph/homeLook.mjs')
const tg = await import('../../src/lib/tileGround.js')
const data = process.argv.slice(2).map(a => a.match(/^--data=(.+)$/)).find(Boolean)?.[1]
if (!data) throw new Error('usage: --data=<provincetown data dir>')
const read = (p) => JSON.parse(fs.readFileSync(join(data, p), 'utf8')), who = 'takeout-consumer'
const cleanDir = mkdtempSync(join(tmpdir(), 'takeout-consumer-')); writeFileSync(join(cleanDir, 'coast.json'), fs.readFileSync(new URL('./fixtures/ptown-coast.json', import.meta.url)))
const osm = read('raw/osm.json'), bb = localBB(osm, projectorOf(read('geography.json'))), { disc } = splitBoundary(read('neighborhood_boundary.json'), who)
const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f() } finally { console.log = l; console.warn = w } }
const MI = quiet(() => mintInputs({ ribbonStreets: read('clean/ribbons.json').streets, skeletonStreets: read('clean/skeleton.json').streets || [], osm, bb, disc, discAt: discOf(disc, who),
  cleanDir, blockCustoms: townBlockCustoms(homeLookOf('provincetown'), who), who }))
const coast = readCoast(cleanDir, bb, who), sd = streetDecks(osm.ground || {}, MI.streets, coast.doc.fineM)
rmSync(cleanDir, { recursive: true, force: true })
const mint = (name, water) => { const t0 = Date.now()
  try { quiet(() => tg.mintProtopolygon({ streets: MI.streets, gradeSep: MI.gradeSep, boundary: MI.boundary, coast: water.rings, coastArcs: water.arcs, bb: MI.bb })); console.log(name, 'MINTED', `${Date.now() - t0} ms`) }
  catch (e) { console.log(name, 'REFUSED:', String(e.message).slice(0, 400)) } }
console.log(`street decks: ${sd.rings.length} (the fixture's: 4)`)
mint('integer  ', { rings: MI.coast, arcs: MI.coastArcs })
mint('candidate', T.takeOutCandidate(coast.rings, coast.arcs, sd.rings, coast.doc.fineM))
