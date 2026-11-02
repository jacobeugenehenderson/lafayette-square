// tour-heap.mjs <town> <before|after> — MEASURE ONLY. The heap after a FULL-SHORE TOUR: every armoured face walked chunk by
// chunk with a near set of W stone chunks sliding along it, all faces kept alive to the end (as the player keeps them).
//   before: the pre-fix player. Each step resolves the chosen chunks (chunkStones); nothing is kept but shoreChunks.js's
//           candidate memo, which is unbounded. The memory outcome needs each chunk resolved once, so the tour resolves
//           only the chunk entering the set (the old player re-resolved all W every step: same memory, W times the time).
//   after:  this branch. stonesOf for the near set, then retainStones(now, previous): the stones and the candidates are
//           both kept to the near window.
// W, the near set in the movie regime: the stone chunks within NEAR_RADIUS_M (90 m, SlabRevetment.jsx) of the camera along
// the shore, 2·90/CHUNK_M + 1. An assumption of this instrument, said: the real near set depends on the camera.
// ▶ node --expose-gc scratch/frame-budget/usher/tour-heap.mjs huron before ; … huron after   (from the kit root)
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const R = process.cwd(), imp = (p) => import(pathToFileURL(`${R}/${p}`).href)
if (typeof global.gc !== 'function') throw new Error('run with node --expose-gc')
const [town, mode] = process.argv.slice(2)
if (!['before', 'after'].includes(mode)) throw new Error('mode: before | after')
const { prepareFaces } = await imp('cartograph/bake-revetment-far.js')
const { chunkStones, CHUNK_M } = await imp('src/lib/shoreChunks.js')
const { stoneContext, stonesOf, retainStones, STONE_MARGIN } = await imp('src/lib/revetmentNear.js')
const { boulderPalette } = await imp('src/lib/boulderGeometry.js')
const rd = (f) => readFileSync(`public/baked/${town}/${f}`), ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const rv = JSON.parse(rd('revetment.json'))
const { faces: raw, parts } = prepareFaces({ revetment: rv, terrainJson: JSON.parse(rd('terrain.json')), terrainBin: ab(rd('terrain.bin')), groundJson: JSON.parse(rd('ground.json')), groundBin: ab(rd('ground.bin')) })
const paletteSize = boulderPalette({ seed: rv.seed }).length, W = Math.ceil((2 * 90) / CHUNK_M) + 1
global.gc(); const h0 = process.memoryUsage().heapUsed
const faces = raw.map(f => ({ ...f, ctx: stoneContext(f, { paletteSize, seed: rv.seed }), stones: new Map() }))
global.gc(); const hCtx = process.memoryUsage().heapUsed
const t0 = performance.now(); let steps = 0, peak = 0
let before = []
for (const f of faces) {
  for (let s = 0; s < f.ctx.nChunks; s++) {
    const now = []; for (let ci = Math.max(0, s - W + 1); ci <= s; ci++) now.push([f, ci])
    if (mode === 'before') chunkStones(f.ctx, s, STONE_MARGIN)
    else { for (const [g, ci] of now) stonesOf(g, ci, parts); retainStones(faces, now, before); before = now }
    steps++
    if (steps % 200 === 0) { const h = process.memoryUsage().heapUsed; if (h > peak) peak = h }
  }
}
global.gc(); const h1 = process.memoryUsage().heapUsed
const cand = faces.reduce((a, f) => a + f.ctx._cand.size, 0), kept = faces.reduce((a, f) => a + f.stones.size, 0)
console.log(JSON.stringify({ town, mode, W, faces: faces.length, steps, ms: Math.round(performance.now() - t0),
  heapAfterTourMB: +((h1 - h0) / 1e6).toFixed(1), contextsMB: +((hCtx - h0) / 1e6).toFixed(1), peakSampledMB: +((Math.max(peak, h1) - h0) / 1e6).toFixed(1),
  candidateChunksHeld: cand, stoneChunksHeld: kept }))
