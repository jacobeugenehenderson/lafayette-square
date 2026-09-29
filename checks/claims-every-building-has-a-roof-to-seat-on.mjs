#!/usr/bin/env node
/**
 * "DOES EVERY BUILDING A VISITOR CAN TAP HAVE A ROOF TO SEAT ITS SELECTION ON?"  — a per-town census.
 *
 * WHY (Boz, 2026-09-29, after 4e253d7c). `<TownPoint building={id}>` seats the Ward's selection dot on the building's
 * roof peak (src/lib/roofTop.js). A building with no roof top gets NO dot — reported by name, never a guessed height,
 * never a thrown render that blacks the canvas. This census names every such building, per town, before a visitor finds
 * it, in the two classes src/lib/roofTop.js tells apart:
 *   · setPiece — no slab geometry: its 3D is the town's set piece (Provincetown's monument). Seating there needs the set
 *                piece's own top; until then the monument's card shows no roof dot.
 *   · noRoof   — walls or a foundation but no roof: a building the bake left open.
 * ⛔ Each is a failure that lists its ids. A town that reads clean has a seat on every building.
 * ⭐ Reads the slab the player reads (public/baked/<town>/buildings.json + .bin) with the runtime's own function.
 * ⛔ Mutation-tested 2026-09-29: roofTops returning null for flat roofs → every town red; a `throw` in RoofPoint → red.
 *
 * Usage: node checks/claims-every-building-has-a-roof-to-seat-on.mjs [<town> …]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, scenes } from './_scenes.mjs'
import { roofTops, rooflessWhy } from '../src/lib/roofTop.js'

const fails = []
// The seat itself must CONTAIN a missing roof: the app's children are not behind a boundary, so a throw blacks the canvas.
const town = readFileSync(join(ROOT, 'src/components/Town.jsx'), 'utf8')
const roofPoint = town.slice(town.indexOf('function RoofPoint('), town.indexOf('function GroundPoint('))
if (!roofPoint || /\bthrow\b/.test(roofPoint)) fails.push('src/components/Town.jsx: RoofPoint throws — one tap on a roofless building would black the town\'s canvas; report by name and seat nothing')
let towns = []
try { towns = scenes('public/baked/<scene>/buildings.json') } catch (e) { console.error(`⛔ NOT CHECKED — ${e.message}`); process.exit(2) }
for (const t of towns) {
  const dir = join(ROOT, 'public/baked', t)
  const manifest = JSON.parse(readFileSync(join(dir, 'buildings.json'), 'utf8'))
  const buf = readFileSync(join(dir, manifest.bin || 'buildings.bin'))
  const tops = roofTops(manifest, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const by = { setPiece: [], noRoof: [] }
  manifest.buildings.forEach((b, i) => { if (tops[i] == null) by[rooflessWhy(b)].push(b.id) })
  const n = by.setPiece.length + by.noRoof.length
  if (!n) { console.log(`  ✅ ${t.padEnd(26)} ${manifest.buildings.length} buildings, every one has a roof to seat on`); continue }
  if (by.setPiece.length) fails.push(`${t}: ${by.setPiece.length} building(s) whose 3D is the set piece — no roof seat: ${by.setPiece.join(', ')}`)
  if (by.noRoof.length) fails.push(`${t}: ${by.noRoof.length} building(s) with walls but no roof: ${by.noRoof.slice(0, 20).join(', ')}${by.noRoof.length > 20 ? ` …+${by.noRoof.length - 20}` : ''}`)
}
if (fails.length) {
  console.error(`⛔ ${fails.length} failure(s) — a selection on these seats nothing (reported by name, never a crash):`)
  for (const f of fails) console.error('   ' + f)
  process.exit(1)
}
console.log(`✅ every building in ${towns.length} town(s) has a roof to seat a selection on`)
