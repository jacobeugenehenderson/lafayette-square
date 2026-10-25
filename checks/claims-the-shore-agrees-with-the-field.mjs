#!/usr/bin/env node
// CLAIM — THE SHORE AGREES WITH THE FIELD (BRIEF-the-shore-is-one-line §4, Boz 2026-10-25).
//
// The water the bake digs its bed under (clean/coast.json, rasterised by coastFile.mjs#maskOf — the bake's own cells) and
// the height field must say the same thing about where the land ends:
//   (a) DRY BED — cells under the mask whose lidar stood above that cell's HIGH level: land the coast called water. The
//       bed overwrites them, so terrain.bin cannot show it; bake-terrain#writeBed RECORDS them, before digging, as
//       terrain.json `bed.dry` (row runs; rock excluded, `bed.rock`). Read here, never recomputed.
//   (b) WET LAND — on terrain.bin: ground OUTSIDE the mask, below that cell's HIGH level and 4-connected to the water
//       (a mapped dike holds it: bake-coast#heldCells): water the coast called land.
// Both are printed in m² per town against a DATED BASELINE (on the OSM coast, below) and are RED if worse than it. The brief's target is ~0 for both.
// ⭐ SEEN TO FAIL, every run: (b) is measured again with the mask shifted by the brief's p50 coast-vs-lidar offset
// (4.34 m) on each axis; a mask that is not the shore must not score better, or the instrument cannot see the shore.
// A town with no coast.json or no `bed.dry` (baked before the record) is NOT CHECKED for that part, and says so.
//
//   node checks/claims-the-shore-agrees-with-the-field.mjs [--scene=<id> …] [--data-root=<dir>]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { readCoast, maskOf, COAST_FILE } from '../cartograph/coastFile.mjs'
import { heldCells } from '../cartograph/bake-coast.mjs'
import { waterLevels } from '../cartograph/waterLevel.mjs'
import { localBB, projectorOf, geographyFor } from '../cartograph/geography.mjs'
import { ringsInDrawing } from '../cartograph/coast-in-drawing.mjs'

// m², on ①'s waterRings (the OSM coast) and the 2026-10-25 tranche terrain. `wet`: THIS instrument (Swash, 2026-10-25;
// PTown's equals that terrain's own `water.flood.floodedHa`, 209.6 ha). `dry`: Zob's probe, the same day (cause not
// established for PTown's); it is re-measured here once a terrain carries bed.dry. ⛔ Zob's probe also printed a (b) of
// 350 / 0 m², by another definition, not this one: never compare across the two.
const BASELINE = { huron: { dry: 8123, wet: 0 }, provincetown: { dry: 249438, wet: 2095680 } }
const P50_M = 4.34   // the brief's §0: the lidar trace's p50 offset off ①'s OSM coast on Huron

const args = process.argv.slice(2).filter(a => a.startsWith('--scene=')).map(a => a.slice(8))
const DATA = process.argv.find(a => a.startsWith('--data-root='))?.slice(12) || ROOT   // a checkout (or probe) holding cartograph/data
const scenes = args.length ? args : Object.keys(BASELINE)
let red = 0, checked = 0
for (const scene of scenes) {
  const dir = join(DATA, 'cartograph/data', scene)
  const tjp = join(dir, 'clean/terrain.json'), tbp = join(dir, 'clean/terrain.bin')
  if (!existsSync(join(dir, 'clean', COAST_FILE)) || !existsSync(tjp) || !existsSync(tbp)) { console.log(`── ${scene}: NOT CHECKED — needs clean/${COAST_FILE}, terrain.json and terrain.bin`); continue }
  const tj = JSON.parse(readFileSync(tjp, 'utf8')), tb = readFileSync(tbp)
  const H = new Float32Array(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength))
  const { width: W, height: Ht, bounds } = tj
  const osm = JSON.parse(readFileSync(join(dir, 'raw/osm.json'), 'utf8'))
  const coast = readCoast(join(dir, 'clean'), localBB(osm, projectorOf(geographyFor(scene))), 'claims-the-shore-agrees-with-the-field')
  if (!coast.coast) { console.log(`── ${scene}: inland (${coast.why})`); continue }
  if (!tj.water) { console.log(`⛔ ${scene}: terrain.json has no water levels — baked before the coast?`); red++; continue }
  checked++
  const L = waterLevels(tj.water)
  const sx = (bounds.maxX - bounds.minX) / (W - 1), sz = (bounds.maxZ - bounds.minZ) / (Ht - 1), cellM2 = sx * sz
  const X = (i) => bounds.minX + i * sx, Z = (j) => bounds.minZ + j * sz
  const { held } = heldCells(osm.ground, { W, H: Ht, x0: bounds.minX, z0: bounds.minZ, step: sx })
  const rings = ringsInDrawing(coast.rings, bounds).inDrawing
  const wetLand = (rs) => {
    const mask = maskOf(rs, W, Ht, bounds), seen = new Uint8Array(W * Ht), queue = new Int32Array(W * Ht)
    let qt = 0, n = 0
    for (let k = 0; k < W * Ht; k++) if (mask[k]) { seen[k] = 1; queue[qt++] = k }
    if (!qt) throw new Error(`⛔ ${scene}: the coast's ${rs.length} ring(s) cover NO cell of the terrain grid — the mask and the grid disagree about the frame; an empty mask would score 0 and pass blind`)
    for (let qh = 0; qh < qt; qh++) {
      const k = queue[qh], i = k % W, j = (k - i) / W
      for (const [ii, jj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (ii < 0 || jj < 0 || ii >= W || jj >= Ht) continue
        const q = jj * W + ii
        if (seen[q] || held[q] || !(H[q] < L.highAt(X(ii), Z(jj)))) continue
        seen[q] = 1; n++; queue[qt++] = q
      }
    }
    return n * cellM2
  }
  const base = BASELINE[scene]
  console.log(`── ${scene}: ${coast.doc.from}`)
  const wet = wetLand(rings)
  const shifted = Math.min(...[[P50_M, 0], [-P50_M, 0], [0, P50_M], [0, -P50_M]].map(([dx, dz]) => wetLand(rings.map(r => r.map(([x, z]) => [x + dx, z + dz])))))
  const okWet = !base || wet <= base.wet + cellM2 / 2, seesShore = shifted >= wet   // half a cell: the baseline is rounded to m²
  console.log(`  ${okWet ? '✅' : '⛔'} (b) wet land ${Math.round(wet).toLocaleString()} m²${base ? ` (baseline ${base.wet.toLocaleString()} m², 2026-10-25, on the OSM coast)` : ''}`)
  console.log(`  ${seesShore ? '✅' : '⛔'} the instrument sees the shore: the mask moved ${P50_M} m scores ${Math.round(shifted).toLocaleString()} m² at best, not better`)
  if (!okWet || !seesShore) red++
  const dry = tj.bed?.dry
  if (!dry) console.log(`  (a) NOT CHECKED — terrain.json has no bed.dry (baked before writeBed recorded it; ▶ re-bake the terrain)`)
  else {
    const m2 = dry.cells * dry.cellM2, ok = !base || m2 <= base.dry + dry.cellM2 / 2
    console.log(`  ${ok ? '✅' : '⛔'} (a) dry bed ${Math.round(m2).toLocaleString()} m² (${dry.cells.toLocaleString()} cells; rock kept apart: ${tj.bed.rock?.cells ?? 0})${base ? ` (baseline ${base.dry.toLocaleString()} m²)` : ''}`)
    if (!ok) red++
  }
}
if (red) { console.log(`\n⛔ ${red} town(s) disagree with the field more than their baseline, or the instrument is blind.`); process.exit(1) }
if (!checked) { console.log('\n⚠️ NOT CHECKED: no town has its coast, terrain and levels yet.'); process.exit(2) }
console.log(`\n✅ ${checked} town(s): the shore agrees with the field at least as well as the dated baseline.`)
