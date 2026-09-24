// boulder-shore-atlas.mjs — THE WHOLE SHORE, IN ONE PICTURE, BY REASON.
// Jacob, 2026-09-23: "the entire shoreline is spotty and choppy." The census said holes
// 148 -> 38; his eye says otherwise. A number that disagrees with the operator's eye is a
// number measuring the wrong thing, so this draws EVERY station coloured by WHY it is or
// is not armoured, and prints what share of the shore each reason owns.
// Read-only. ▶ node scratch/boulder-shore-atlas.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { shoreArmourFor } from '../cartograph/shore-armour.mjs'

const doc = JSON.parse(readFileSync('public/baked/huron/revetment.json', 'utf8'))
const osm = JSON.parse(readFileSync('cartograph/data/huron/raw/osm.json', 'utf8'))
const tm = JSON.parse(readFileSync('cartograph/data/huron/clean/terrain.json', 'utf8'))
const armourAt = shoreArmourFor(osm.ground || {})

// ⭐ off-heightfield is kept SEPARATE from the no-height verdict: a null-crest station
// sitting in a park is ruled soft-shore, so the verdict hides how much shore has no
// ground at all. Both facts matter and they are different facts.
const COLOR = {
  'structure-tag':    [ 40, 200,  90],   // armour, by a tag — the strongest evidence
  'height':           [130, 230, 140],   // armour, by the ground standing up
  'below-one-course': [235, 120,  60],   // bare: too low for a course of stone
  'soft-shore':       [ 90, 150, 240],   // bare: park / beach / wetland says so
  'no-height':        [200,  60, 200],   // bare: nothing to rule on
  'off-heightfield':  [110, 110, 110],   // NO GROUND AT ALL — outside the terrain square
}
const b = tm.bounds
// ⛔⛔ IN-DISC ONLY BY DEFAULT, and that correction is Boz's, 2026-09-23. My first pass
// reported "off-heightfield 37.9%" as a frame mismatch — but the shoreline running past
// the terrain square is the shoreline running past THE RIM, and ORIENTATION rules that
// "the rim is an EDGE OF THE DRAWING, never an absence". Terrain covering the disc bbox
// is CORRECT. Counting shore outside the drawn neighbourhood inflated the defect by more
// than a third and pointed at the wrong thing entirely.
// ▶ pass `--all` to include it anyway.
const DISC = { cx: -46, cz: -36, r: 3539 }
const ALL = process.argv.includes('--all')
const inDisc = (x, z) => ALL || Math.hypot(x - DISC.cx, z - DISC.cz) <= DISC.r
const pts = [], tally = {}, lenBy = {}
for (const a of doc.arcs) {
  const st = a.stations
  for (let i = 0; i < st.length; i++) {
    const p = st[i]
    if (!inDisc(p.x, p.z)) continue
    const outside = p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ
    const why = outside ? 'off-heightfield' : (p.crest == null ? 'no-height' : armourAt(p.x, p.z, p.crest).why)
    tally[why] = (tally[why] || 0) + 1
    const half = ((i > 0 ? Math.hypot(p.x - st[i-1].x, p.z - st[i-1].z) : 0)
               + (i < st.length - 1 ? Math.hypot(st[i+1].x - p.x, st[i+1].z - p.z) : 0)) / 2
    lenBy[why] = (lenBy[why] || 0) + half
    pts.push({ x: p.x, z: p.z, why })
  }
}
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z) }
const PAD = 40, W = 1600
const scale = (W - 2 * PAD) / (maxX - minX)
const H = Math.round((maxZ - minZ) * scale) + 2 * PAD
const png = new PNG({ width: W, height: H })
for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 18; png.data[i+1] = 18; png.data[i+2] = 22; png.data[i+3] = 255 }
const put = (px, py, c, r = 2) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = px + dx, y = py + dy
    if (x < 0 || y < 0 || x >= W || y >= H) continue
    const o = (y * W + x) * 4
    png.data[o] = c[0]; png.data[o+1] = c[1]; png.data[o+2] = c[2]
  }
}
// the terrain square, so the frame mismatch is visible rather than asserted
const tx0 = PAD + (b.minX - minX) * scale, tx1 = PAD + (b.maxX - minX) * scale
const tz0 = PAD + (b.minZ - minZ) * scale, tz1 = PAD + (b.maxZ - minZ) * scale
for (let x = Math.max(0, tx0 | 0); x <= Math.min(W - 1, tx1 | 0); x++) for (const y of [tz0 | 0, tz1 | 0]) put(x, y, [70, 70, 80], 0)
for (let y = Math.max(0, tz0 | 0); y <= Math.min(H - 1, tz1 | 0); y++) for (const x of [tx0 | 0, tx1 | 0]) put(x, y, [70, 70, 80], 0)
for (const p of pts) put(Math.round(PAD + (p.x - minX) * scale), Math.round(PAD + (p.z - minZ) * scale), COLOR[p.why] || [255, 255, 255])
writeFileSync((ALL ? 'scratch/huron-shore-atlas-all.png' : 'scratch/huron-shore-atlas.png'), PNG.sync.write(png))

const totL = Object.values(lenBy).reduce((a, c) => a + c, 0)
console.log(`huron shore ${ALL ? '(ALL, incl. beyond the rim)' : '(IN-DISC ONLY, r=' + DISC.r + ')'}: ${pts.length} stations · ${(totL/1000).toFixed(2)} km\n`)
console.log('reason              stations    metres   share   colour')
for (const [k, n] of Object.entries(tally).sort((a, b2) => b2[1] - a[1])) {
  const c = COLOR[k] || [255,255,255]
  console.log(`  ${k.padEnd(18)} ${String(n).padStart(5)}  ${lenBy[k].toFixed(0).padStart(8)}  ${(100*lenBy[k]/totL).toFixed(1).padStart(5)}%  rgb(${c.join(',')})`)
}
const arm = (lenBy['structure-tag']||0) + (lenBy['height']||0)
console.log(`\nARMOURED ${arm.toFixed(0)} m (${(100*arm/totL).toFixed(1)}%) · BARE ${(totL-arm).toFixed(0)} m (${(100*(totL-arm)/totL).toFixed(1)}%)`)
console.log(`wrote scratch/huron-shore-atlas.png (${W}x${H}); the grey rectangle is the terrain square`)
