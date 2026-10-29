// oct3-weight.mjs — the NEAR layer's resolution (octaves 3) over the WHOLE armoured shore, with the drawn ground: the
// weight bake-revetment.js's "~47 MB of drape" refers to, re-measured. Uses src's drape (the bare skip and range-local
// allocation, Step 1). ▶ node scratch/far-shore/oct3-weight.mjs --town=huron --slab=../integration/public/baked
import { readFileSync } from 'node:fs'
import { makeDrawnGround } from '../../src/lib/drawnGround.js'
import { makeElevationSampler } from '../../src/lib/terrainCommon.js'
import { revetmentFaces, toeFor } from '../../src/lib/revetmentFromSlab.js'
import * as B from '../../src/lib/revetmentDrape.js'
import { MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'
import { isWaterGroupId } from '../../src/components/waterMaterial.js'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const town = arg('town'), dir = `${arg('slab', 'public/baked')}/${town}`
const rd = (f) => readFileSync(`${dir}/${f}`), ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const tj = JSON.parse(rd('terrain.json')), T = makeElevationSampler({ ...tj, data: new Float32Array(ab(rd('terrain.bin'))) }, 1)
const D = makeDrawnGround(JSON.parse(rd('ground.json')), ab(rd('ground.bin')), { groups: g => !isWaterGroupId(g.id) && g.partition !== false, rawAt: T.getElevationRaw })
const drawnAt1 = (x, z) => { const p = D.partsAt(x, z); return p ? p.raw + p.y : T.getElevationRaw(x, z) }
const floorM = tj.bed?.visibleToM ?? 0
let tris = 0, verts = 0; const t0 = performance.now()
for (const f0 of revetmentFaces(JSON.parse(rd('revetment.json'))).filter(f => f.anyArmour)) {
  const waterY = f0.levelM ?? 0, toeFloor = Math.max(floorM, f0.lowM != null ? waterY - f0.lowM + MIN_ARMOUR_D50_M : 0)
  const f = { ...f0, toeAt: toeFor(f0, drawnAt1, toeFloor, waterY), berm: f0.toeBerm, groundAt: drawnAt1, waterY }
  const G = B.drapeGlobals({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, octaves: 3 })
  const d = B.revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: 3, globals: G })
  tris += d.stats?.tris || 0; verts += d.geometry.attributes.position.count }
console.log(`${town} octaves 3, whole shore: ${tris.toLocaleString()} tris, ${verts.toLocaleString()} verts, ${((verts * 28 + tris * 12) / 1e6).toFixed(1)} MB (pos+nrm+raw f32, u32 index) · ${(performance.now() - t0).toFixed(0)} ms`)
