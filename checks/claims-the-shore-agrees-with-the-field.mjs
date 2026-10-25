#!/usr/bin/env node
// CLAIM — THE SHORE AGREES WITH THE FIELD (BRIEF-the-shore-is-one-line §4, Boz 2026-10-25).
//
// The water the bake digs its bed under (clean/coast.json, rasterised by coastFile.mjs#maskOf — the bake's own cells) and
// the height field must say the same thing about where the land ends:
//   (a) DRY BED — cells under the mask whose lidar stood above that cell's HIGH level: land the coast called water. The
//       bed overwrites them, so terrain.bin cannot show it; bake-terrain#writeBed RECORDS them, before digging, as
//       terrain.json `bed.dry` (row runs; rock excluded, `bed.rock`). Read here, never recomputed (the slot-run
//       cross-check is checks/claims-the-dry-bed-record-is-the-lidar.mjs). ⭐ GATED AT 0 off the line (Boz, 2026-10-25):
//       a cell whose centre lies within one grid diagonal of a coast edge straddles a line traced at the source's pixel,
//       so it may read either way; those are printed, never gated. No dry baseline is carried.
//   (b) WET LAND — on terrain.bin: ground OUTSIDE the mask, inside the disc, below that cell's LOW level: water at every
//       tide that the coast called land (Zob's definition; Boz, 2026-10-25).
//   and, printed for the sand line (step 4), never gated: the INTERTIDAL — ground outside the mask below HIGH and
//       4-connected to the water (a mapped dike holds it: coastFile.mjs#heldCells), the band the tide covers: the beach.
// Both are printed in m² per town against a DATED BASELINE (on the OSM coast, below) and are RED if worse than it. The brief's target is ~0 for both.
// ⭐ SEEN TO FAIL, every run: (b) is measured again with the mask shifted by the brief's p50 coast-vs-lidar offset
// (4.34 m) on each axis; a mask that is not the shore must not score better, or the instrument cannot see the shore.
// A town with no coast.json or no `bed.dry` (baked before the record) is NOT CHECKED for that part, and says so.
//
//   node checks/claims-the-shore-agrees-with-the-field.mjs [--scene=<id> …] [--data-root=<dir>]
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { readCoast, maskOf, heldCells, COAST_FILE } from '../cartograph/coastFile.mjs'
import { waterLevels } from '../cartograph/waterLevel.mjs'
import { localBB, projectorOf, geographyFor } from '../cartograph/geography.mjs'
import { ringsInDrawing } from '../cartograph/coast-in-drawing.mjs'
import { discOf } from '../cartograph/boundaryRecords.mjs'

// (b)'s dated baseline, m², on ①'s waterRings (the OSM coast) and the 2026-10-25 tranche terrain: Zob's probe, reproduced
// by this instrument. ⛔ No (a) baseline: Zob's post-dig figure was the kept rock, which bed.dry excludes (Boz, 2026-10-25).
const BASELINE = { huron: { wet: 350 }, provincetown: { wet: 0 } }
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
  const disc = discOf(JSON.parse(readFileSync(join(dir, 'neighborhood_boundary.json'), 'utf8')), 'claims-the-shore-agrees-with-the-field')
  const wetLand = (rs) => {
    const mask = maskOf(rs, W, Ht, bounds)
    let n = 0, any = 0
    for (let j = 0; j < Ht; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i
      if (mask[k]) { any++; continue }
      if (H[k] < L.lowAt(X(i), Z(j)) && disc.inDisc(X(i), Z(j))) n++
    }
    if (!any) throw new Error(`⛔ ${scene}: the coast's ${rs.length} ring(s) cover NO cell of the terrain grid — the mask and the grid disagree about the frame; an empty mask would score 0 and pass blind`)
    return n * cellM2
  }
  const intertidal = (rs) => {
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
  const wet = wetLand(rings), tide = intertidal(rings)
  const shifted = Math.min(...[[P50_M, 0], [-P50_M, 0], [0, P50_M], [0, -P50_M]].map(([dx, dz]) => wetLand(rings.map(r => r.map(([x, z]) => [x + dx, z + dz])))))
  const okWet = !base || wet <= base.wet + cellM2 / 2, seesShore = shifted >= wet   // half a cell: the baseline is rounded to m²
  console.log(`  ${okWet ? '✅' : '⛔'} (b) wet land ${Math.round(wet).toLocaleString()} m²${base ? ` (baseline ${base.wet.toLocaleString()} m², 2026-10-25, on the OSM coast)` : ''}`)
  console.log(`     intertidal (below HIGH, connected; the sand line's, not gated): ${Math.round(tide).toLocaleString()} m²`)
  console.log(`  ${seesShore ? '✅' : '⛔'} the instrument sees the shore: the mask moved ${P50_M} m scores ${Math.round(shifted).toLocaleString()} m² at best, not better`)
  if (!okWet || !seesShore) red++
  const dry = tj.bed?.dry
  if (!dry) console.log(`  (a) NOT CHECKED — terrain.json has no bed.dry (baked before writeBed recorded it; ▶ re-bake the terrain)`)
  else {
    // the coast's edges in a 20 m bucket grid; a dry cell is ON THE LINE within one grid diagonal of one
    const diag = Math.hypot(sx, sz), CELL = 20, segs = new Map()
    for (const r of rings) for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]
      for (let gx = Math.floor(Math.min(a[0], b[0]) / CELL); gx <= Math.floor(Math.max(a[0], b[0]) / CELL); gx++)
        for (let gz = Math.floor(Math.min(a[1], b[1]) / CELL); gz <= Math.floor(Math.max(a[1], b[1]) / CELL); gz++) {
          const key = gx + ',' + gz; if (!segs.has(key)) segs.set(key, []); segs.get(key).push([a, b]) } }
    const near = (x, z) => { for (let gx = Math.floor((x - diag) / CELL); gx <= Math.floor((x + diag) / CELL); gx++) for (let gz = Math.floor((z - diag) / CELL); gz <= Math.floor((z + diag) / CELL); gz++)
      for (const [a, b] of segs.get(gx + ',' + gz) || []) { const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0
        if (Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz) <= diag) return true } return false }
    let onLine = 0, off = 0
    const R = dry.runs
    for (let q = 0; q < R.length; q += 3) for (let i = R[q + 1]; i <= R[q + 2]; i++) { if (near(X(i), Z(R[q]))) onLine++; else off++ }
    if (onLine + off !== dry.cells) { console.log(`  ⛔ (a) bed.dry says ${dry.cells} cells and its runs hold ${onLine + off}`); red++ }
    const ok = off === 0
    console.log(`  ${ok ? '✅' : '⛔'} (a) dry bed off the line: ${off.toLocaleString()} cell(s) = ${Math.round(off * dry.cellM2).toLocaleString()} m² (gate 0) · on the line (within ${diag.toFixed(2)} m of a coast edge): ${onLine.toLocaleString()} cell(s) = ${Math.round(onLine * dry.cellM2).toLocaleString()} m², printed · rock kept apart: ${tj.bed.rock?.cells ?? 0}`)
    if (!ok) red++
  }
}
if (red) { console.log(`\n⛔ ${red} failure(s): a dry bed off the line, wet land past its baseline, or a blind instrument.`); process.exit(1) }
if (!checked) { console.log('\n⚠️ NOT CHECKED: no town has its coast, terrain and levels yet.'); process.exit(2) }
console.log(`\n✅ ${checked} town(s): no dry bed off the line, and no more wet land than the dated baseline.`)
