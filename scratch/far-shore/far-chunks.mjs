// far-chunks.mjs — (c): the far layer split into station ranges, with the bare-station skip. What chunk size holds the
// 4 ms ceiling, what does splitting add, and are the chunks' triangles the whole build's? (The near layer's chunking,
// `stations` + normalMargin, is the mechanism; its seam is measured exact by scratch/boulder-chunk-sweep.mjs.)
// ▶ node scratch/far-shore/far-chunks.mjs --town=provincetown --slab=../integration/public/baked
import { readFileSync } from 'node:fs'
import { makeDrawnGround } from '../../src/lib/drawnGround.js'
import { makeElevationSampler } from '../../src/lib/terrainCommon.js'
import { revetmentFaces, toeFor } from '../../src/lib/revetmentFromSlab.js'
const B = await import(`./revetmentDrape.${process.argv.find(a => a.startsWith('--impl='))?.slice(7) ?? 'skipbare'}.mjs`)
import { MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'
import { isWaterGroupId } from '../../src/components/waterMaterial.js'
globalThis.__SKIP_BARE = true
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const town = arg('town'), dir = `${arg('slab', 'public/baked')}/${town}`
const rd = (f) => readFileSync(`${dir}/${f}`), ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const tj = JSON.parse(rd('terrain.json')), T = makeElevationSampler({ ...tj, data: new Float32Array(ab(rd('terrain.bin'))) }, 1)
const D = makeDrawnGround(JSON.parse(rd('ground.json')), ab(rd('ground.bin')), { groups: g => !isWaterGroupId(g.id) && g.partition !== false, rawAt: T.getElevationRaw })
const drawnAt1 = (x, z) => { const p = D.partsAt(x, z); return p ? p.raw + p.y : T.getElevationRaw(x, z) }
const floorM = tj.bed?.visibleToM ?? 0
const faces = revetmentFaces(JSON.parse(rd('revetment.json'))).filter(f => f.anyArmour).map(f => {
  const waterY = f.levelM ?? 0, toeFloor = Math.max(floorM, f.lowM != null ? waterY - f.lowM + MIN_ARMOUR_D50_M : 0)
  return { ...f, toeAt: toeFor(f, drawnAt1, toeFloor, waterY), berm: f.toeBerm, groundAt: drawnAt1, waterY } })
let gMs = 0
const Gs = faces.map(f => { const t = performance.now(); const G = B.drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: 1 }); gMs += performance.now() - t; return G })
console.log(`${town}: drapeGlobals for ${faces.length} faces ${gMs.toFixed(0)} ms (max ${''})`)
for (const per of [4, 8, 16, 32]) {
  let tot = 0, max = 0, n = 0, over = 0, tris = 0, wholeTris = 0, maxAt = ''
  faces.forEach((f, fi) => { const G = Gs[fi]
    for (let i = 0; i < G.nAlong - 1; i += per) { const t = performance.now()
      const d = B.revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: 1, globals: G, stations: [i, Math.min(G.nAlong - 1, i + per)] })
      const ms = performance.now() - t; tot += ms; n++; if (ms > max) { max = ms; maxAt = `${f.key}@${i}` } if (ms > 4) over++; tris += d.stats?.tris || 0 } })
  console.log(`  ${String(per).padStart(2)} stations/chunk: ${n} chunks · total ${tot.toFixed(0)} ms · max ${max.toFixed(1)} ms (${maxAt}) · ${over} over 4 ms · ${tris.toLocaleString()} tris`)
}
{ let t = 0, tris = 0; faces.forEach((f, fi) => { const a = performance.now(); const d = B.revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: 1, globals: Gs[fi] }); t += performance.now() - a; tris += d.stats?.tris || 0 })
  console.log(`  whole faces: total ${t.toFixed(0)} ms · ${tris.toLocaleString()} tris`) }
