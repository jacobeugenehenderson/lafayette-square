// BRIEF-cut-once-in-full-precision §3.1: the fixtures, read-only, off a town's own files at the kit's own call sites.
// node scratch/cut-once/extract-fixtures.mjs --data=<cartograph/data/<town> dir> --town=<label> [--scene=<id>]
// Writes scratch/cut-once/fixtures/<town>-*.json: the deck inputs (deckInputs, before the union), the street decks
// (streetDecks over mintInputs' own streets), the coast rings and
// arcs (readCoast), and the embankment strips (embankmentFootprints). Then runs waterWithoutDecks on them and prints every
// output edge ≤ 2 mm, so a fixture is accepted only if it reproduces the defect it is meant to hold.
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { deckInputs, deckFootprints, streetDecks, waterWithoutDecks, embankmentFootprints } from '../../cartograph/structures.mjs'
import { readCoast } from '../../cartograph/coastFile.mjs'
import { tessellateAdaptive } from '../../cartograph/derive.js'
import { highwayStandard, townState } from '../../src/cartograph/streetProfiles.js'
import { mintInputs, townBlockCustoms } from '../../cartograph/mintInputs.mjs'
import { projectorOf, localBB } from '../../cartograph/geography.mjs'
import { splitBoundary, discOf } from '../../cartograph/boundaryRecords.mjs'
import { homeLookOf } from '../../cartograph/homeLook.mjs'

const arg = (k) => process.argv.slice(2).map(a => a.match(new RegExp(`^--${k}=(.+)$`))).find(Boolean)?.[1]
const data = arg('data'), town = arg('town')
if (!data || !town) throw new Error('usage: --data=<town data dir> --town=<id>')
const here = dirname(fileURLToPath(import.meta.url)), out = join(here, 'fixtures'); fs.mkdirSync(out, { recursive: true })
const read = (p) => JSON.parse(fs.readFileSync(join(data, p), 'utf8'))
const osm = read('raw/osm.json'), coastDoc = read('clean/coast.json'), sk = read('clean/skeleton.json').streets || []
const overlay = fs.existsSync(join(data, 'clean/overlay.json')) ? (read('clean/overlay.json').streets || {}) : {}
const fine = coastDoc.fineM
const coast = readCoast(join(data, 'clean'), coastDoc.square, 'fixtures')        // the square is its own (the guard is the mint's)
const di = deckInputs(osm.ground)
// the mint's own streets: mintInputs over the ribbons' streets (as claims-the-coast-is-one-line-on-the-lattice calls it), every
// file the town's own (--data), so the street decks are the ones the mint takes out
const geo = read('geography.json'), bb = localBB(osm, projectorOf(geo))
const { disc } = splitBoundary(read('neighborhood_boundary.json'), `fixtures: ${town}`)
const MI = mintInputs({ ribbonStreets: read('clean/ribbons.json').streets, skeletonStreets: sk, osm, bb, disc, discAt: discOf(disc, `fixtures: ${town}`),
  cleanDir: join(data, 'clean'), blockCustoms: townBlockCustoms(homeLookOf(arg('scene') || town), `fixtures: ${town}`), who: `fixtures: ${town}` })
const streets = MI.streets
const sd = streetDecks(osm.ground, streets, fine)
let hwy = null
const registry = JSON.parse(fs.readFileSync(join(here, '../../references/registry.json'), 'utf8'))
const std = () => hwy ??= highwayStandard(registry, townState(osm), new Map())
const emb = embankmentFootprints(sk, { overlay, std, tessellate: tessellateAdaptive, stepM: fine })
const w = waterWithoutDecks(coast.rings, coast.arcs, sd.rings, fine)

const short = []
for (const [ri, r] of w.rings.entries()) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], L = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (L <= 0.002) short.push({ ring: ri, edge: i, deck: r.deck?.[i] ?? null, mm: +(L * 1000).toFixed(3), a, b }) }
const fpAll = deckFootprints(osm.ground, fine)
let fpShort = 0; for (const r of fpAll.rings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= 0.002) fpShort++ }

const save = (name, v) => { const p = join(out, `${town}-${name}.json`); fs.writeFileSync(p, JSON.stringify(v)); return p }
save('deck-inputs', { fineM: fine, inputs: di.inputs, count: di.count })
save('street-decks', { fineM: fine, note: "streetDecks over mintInputs' own streets (ribbons.json's, joined and simplified)", rings: sd.rings, decks: sd.decks })
save('embankments', { fineM: fine, paths: emb.paths, rings: emb.rings, embankments: emb.embankments })
console.log(JSON.stringify({ town, fineM: fine, deckInputs: di.inputs.length, footprintRings: fpAll.rings.length, footprintEdgesLe2mm: fpShort,
  streetDecks: sd.decks.map(d => d.streets.slice(0, 3)), embankments: emb.embankments.map(e => e.name),
  waterRings: w.rings.length, waterEdgesLe2mm: short.length, onDeck: short.filter(s => s.deck != null).length, short: short.slice(0, 30) }, null, 1))
// --at=x,z: every output vertex within 5 cm of the place, with its neighbours (a back-step reads as a reversal there)
const at = arg('at')?.split(',').map(Number)
if (at) for (const [ri, r] of w.rings.entries()) r.forEach((p, i) => { if (Math.hypot(p[0] - at[0], p[1] - at[1]) > 0.05) return
  console.log(`ring ${ri} v${i} deck ${r.deck?.[i]}:`, [-2, -1, 0, 1, 2].map(d => r[(i + d + r.length) % r.length].join(',')).join(' → ')) })
