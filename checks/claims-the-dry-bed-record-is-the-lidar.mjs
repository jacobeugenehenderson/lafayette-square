#!/usr/bin/env node
// CLAIM — THE DRY-BED RECORD IS WHAT THE LIDAR SAYS (BRIEF-the-shore-is-one-line §4; Boz's ruled cross-check, 2026-10-25).
//
// terrain.json `bed.dry` is written by bake-terrain#writeBed before it digs; claims-the-shore-agrees-with-the-field reads
// it and cannot recompute it, because the bed has overwritten those heights. This is the record's own independent test, run
// in a slot (it reads the lidar): on ONE tile of the terrain grid, the lidar is read again through elevationSources.mjs
// (openRasters → rasterToGrid, the terrain's own reader, its sources in the same order) and (a) is recomputed: a cell under
// the coast's mask (coastFile.mjs#maskOf over readCoast's rings in the drawing), not rock (`bed.rock`), whose lidar − baseElev
// stands above that cell's HIGH (waterLevel.mjs). It must EQUAL the record's cells on that tile, cell for cell.
// The tile is the 128 × 128 block holding the most mask-edge cells: where (a) lives.
// ⭐ SEEN TO FAIL in the same run: (a) recomputed under the mask shifted by the brief's p50 offset (4.34 m) must NOT equal the
// record, or the comparison is blind.
// A cell the lidar holds no value for is counted and left out (the terrain filled it from a neighbour: fillMisses).
//
//   node checks/claims-the-dry-bed-record-is-the-lidar.mjs --scene=<id> [--data-root=<dir>]     ⚠️ reads the lidar
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './_scenes.mjs'
import { readCoast, maskOf } from '../cartograph/coastFile.mjs'
import { ringsInDrawing } from '../cartograph/coast-in-drawing.mjs'
import { waterLevels } from '../cartograph/waterLevel.mjs'
import { localBB, projectorOf, geographyFor, metresPerDegree } from '../cartograph/geography.mjs'
import { elevationSpecs, openRasters, rasterToGrid } from '../cartograph/elevationSources.mjs'

const arg = (k) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const scene = arg('scene'), DATA = arg('data-root') || ROOT, P50_M = 4.34, B = 128
if (!scene) { console.log('⛔ name a town: --scene=<id>'); process.exit(2) }
const dir = join(DATA, 'cartograph/data', scene)
const tj = JSON.parse(readFileSync(join(dir, 'clean/terrain.json'), 'utf8'))
if (!tj.bed?.dry) { console.log(`⛔ NOT CHECKED — ${scene}'s terrain.json has no bed.dry (baked before writeBed recorded it)`); process.exit(2) }
const { width: W, height: H, bounds, baseElev } = tj
const sx = (bounds.maxX - bounds.minX) / (W - 1), sz = (bounds.maxZ - bounds.minZ) / (H - 1)
const X = (i) => bounds.minX + i * sx, Z = (j) => bounds.minZ + j * sz
const osm = JSON.parse(readFileSync(join(dir, 'raw/osm.json'), 'utf8'))
const geo = geographyFor(scene), { lonToM, latToM } = metresPerDegree(geo, 'claims-the-dry-bed-record-is-the-lidar')
const toLL = (x, z) => [geo.lon + x / lonToM, geo.lat - z / latToM]
const coast = readCoast(join(dir, 'clean'), localBB(osm, projectorOf(geo)), 'claims-the-dry-bed-record-is-the-lidar')
if (!coast.coast) { console.log(`── ${scene}: inland — nothing to cross-check`); process.exit(0) }
const rings = ringsInDrawing(coast.rings, bounds).inDrawing
const L = waterLevels(tj.water)
const runsSet = (runs) => { const s = new Set(); for (let q = 0; q < (runs || []).length; q += 3) for (let i = runs[q + 1]; i <= runs[q + 2]; i++) s.add(runs[q] * W + i); return s }
const recDry = runsSet(tj.bed.dry.runs), rock = runsSet(tj.bed.rock?.runs)
const mask = maskOf(rings, W, H, bounds)

// the tile: the B × B block with the most mask-edge cells
let best = null
for (let j0 = 0; j0 < H; j0 += B) for (let i0 = 0; i0 < W; i0 += B) {
  let n = 0
  for (let j = j0; j < Math.min(H, j0 + B); j++) for (let i = i0 + 1; i < Math.min(W, i0 + B); i++) if (mask[j * W + i] !== mask[j * W + i - 1]) n++
  if (!best || n > best.n) best = { i0, j0, n }
}
if (!best?.n) { console.log(`⛔ ${scene}: the coast's mask has no edge on the terrain grid — nothing to cross-check`); process.exit(1) }
const ni = Math.min(B, W - best.i0), nj = Math.min(B, H - best.j0)
console.log(`── ${scene}: tile i ${best.i0}…${best.i0 + ni - 1}, j ${best.j0}…${best.j0 + nj - 1} (${best.n} mask-edge cells)`)
const opened = await openRasters(elevationSpecs(dir), { cacheMB: 64 })
const { grid } = await rasterToGrid(opened, { width: ni, height: nj, bounds: { minX: X(best.i0), maxX: X(best.i0 + ni - 1), minZ: Z(best.j0), maxZ: Z(best.j0 + nj - 1) }, toLL, quiet: true })
const dryUnder = (m) => {
  const out = new Set(); let noValue = 0
  for (let dj = 0; dj < nj; dj++) for (let di = 0; di < ni; di++) {
    const i = best.i0 + di, j = best.j0 + dj, k = j * W + i
    if (!m[k] || rock.has(k)) continue
    const v = grid[dj * ni + di]
    if (!Number.isFinite(v)) { noValue++; continue }
    if (v - baseElev > L.highAt(X(i), Z(j))) out.add(k)
  }
  return { out, noValue }
}
const inTile = (k) => { const i = k % W, j = (k - i) / W; return i >= best.i0 && i < best.i0 + ni && j >= best.j0 && j < best.j0 + nj }
const rec = new Set([...recDry].filter(inTile))
const { out: now, noValue } = dryUnder(mask)
const missing = [...rec].filter(k => !now.has(k)), extra = [...now].filter(k => !rec.has(k))
const same = !missing.length && !extra.length
console.log(`  ${same ? '✅' : '⛔'} recomputed ${now.size} dry cell(s) on the tile; the record holds ${rec.size} (${missing.length} only in the record, ${extra.length} only recomputed; ${noValue} without a lidar value, left out)`)
const shifted = dryUnder(maskOf(rings.map(r => r.map(([x, z]) => [x + P50_M, z])), W, H, bounds)).out
const blind = shifted.size === rec.size && [...rec].every(k => shifted.has(k))
console.log(`  ${blind ? '⛔' : '✅'} the comparison sees the mask: shifted ${P50_M} m it recomputes ${shifted.size} cell(s), ${blind ? 'IDENTICAL to the record — blind' : 'not the record'}`)
process.exit(same && !blind ? 0 : 1)
