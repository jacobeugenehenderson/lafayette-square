// prep-cost.mjs — what SlabRevetment's `faces` useMemo costs at mount, piece by piece (toeFor, drapeGlobals oct 3,
// shoreContext), as it stands. These stay at runtime for the near layer once the far layer is baked.
// ▶ node scratch/far-shore/prep-cost.mjs --town=provincetown --slab=../integration/public/baked
import { readFileSync } from 'node:fs'
import { makeDrawnGround } from '../../src/lib/drawnGround.js'
import { makeElevationSampler } from '../../src/lib/terrainCommon.js'
import { revetmentFaces, toeFor } from '../../src/lib/revetmentFromSlab.js'
import { drapeGlobals } from '../../src/lib/revetmentDrape.js'
import { shoreContext } from '../../src/lib/shoreChunks.js'
import { boulderPalette } from '../../src/lib/boulderGeometry.js'
import { MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'
import { isWaterGroupId } from '../../src/components/waterMaterial.js'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const town = arg('town'), dir = `${arg('slab', 'public/baked')}/${town}`
const rd = (f) => readFileSync(`${dir}/${f}`), ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const tj = JSON.parse(rd('terrain.json')), T = makeElevationSampler({ ...tj, data: new Float32Array(ab(rd('terrain.bin'))) }, 1)
const D = makeDrawnGround(JSON.parse(rd('ground.json')), ab(rd('ground.bin')), { groups: g => !isWaterGroupId(g.id) && g.partition !== false, rawAt: T.getElevationRaw })
let reads = 0
const drawnAt1 = (x, z) => { reads++; const p = D.partsAt(x, z); return p ? p.raw + p.y : T.getElevationRaw(x, z) }
const doc = JSON.parse(rd('revetment.json')), floorM = tj.bed?.visibleToM ?? 0
let t = performance.now(); const palette = boulderPalette({ seed: doc.seed }); const tPal = performance.now() - t
let tToe = 0, tG = 0, tCtx = 0, rToe = 0, rCtx = 0
for (const f0 of revetmentFaces(doc).filter(f => f.anyArmour)) {
  const waterY = f0.levelM ?? 0, toeFloor = Math.max(floorM, f0.lowM != null ? waterY - f0.lowM + MIN_ARMOUR_D50_M : 0)
  let r0 = reads; t = performance.now(); const toeAt = toeFor(f0, drawnAt1, toeFloor, waterY); tToe += performance.now() - t; rToe += reads - r0
  const f = { ...f0, toeAt, berm: f0.toeBerm, groundAt: drawnAt1, waterY }
  t = performance.now(); drapeGlobals({ poly: f.poly, crestAt: f.crestAt, toeAt, berm: f.berm, octaves: 3 }); tG += performance.now() - t
  r0 = reads; t = performance.now(); shoreContext({ poly: f.poly, crestAt: f.crestAt, taperAt: f.taperAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, oversample: 10, paletteSize: palette.length, seed: doc.seed }); tCtx += performance.now() - t; rCtx += reads - r0
}
console.log(`${town} mount prep: palette ${tPal.toFixed(0)} ms · toeFor ${tToe.toFixed(0)} ms (${rToe} reads) · drapeGlobals(oct 3) ${tG.toFixed(0)} ms · shoreContext ${tCtx.toFixed(0)} ms (${rCtx} reads)`)
