// read-cost.mjs — what one drawn-ground read costs at the revetment, by makeDrawnGround's grid cell. Same answers
// required (the candidate set is a superset of the containing triangles at any cell, in the same order).
// ▶ node scratch/far-shore/read-cost.mjs --town=provincetown --slab=../integration/public/baked
import { readFileSync } from 'node:fs'
import { makeDrawnGround } from '../../src/lib/drawnGround.js'
import { makeElevationSampler } from '../../src/lib/terrainCommon.js'
import { revetmentFaces } from '../../src/lib/revetmentFromSlab.js'
import { isWaterGroupId } from '../../src/components/waterMaterial.js'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const town = arg('town'), dir = `${arg('slab', 'public/baked')}/${town}`
const rd = (f) => readFileSync(`${dir}/${f}`), ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const tj = JSON.parse(rd('terrain.json')), T = makeElevationSampler({ ...tj, data: new Float32Array(ab(rd('terrain.bin'))) }, 1)
const gj = JSON.parse(rd('ground.json')), bin = ab(rd('ground.bin'))
// query points: every armoured face's spine, every 0.5 m, offset ±0..6 m across — where the drape reads
const pts = []
for (const f of revetmentFaces(JSON.parse(rd('revetment.json'))).filter(f => f.anyArmour)) for (let i = 1; i < f.poly.length; i++) {
  const a = f.poly[i - 1], b = f.poly[i], L = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = (b.z - a.z) / L, nz = -(b.x - a.x) / L
  for (let s = 0; s < L; s += 0.5) for (const o of [-6, -3, 0, 3, 6]) pts.push(a.x + (b.x - a.x) * s / L + nx * o, a.z + (b.z - a.z) * s / L + nz * o) }
let ref = null
for (const cell of [8, 4, 2]) {
  const t0 = performance.now()
  const D = makeDrawnGround(gj, bin, { groups: g => !isWaterGroupId(g.id) && g.partition !== false, rawAt: T.getElevationRaw, cell })
  const build = performance.now() - t0, out = new Float64Array(pts.length)
  const t1 = performance.now()
  for (let k = 0; k < pts.length; k += 2) { const p = D.partsAt(pts[k], pts[k + 1]); out[k] = p ? p.raw : NaN; out[k + 1] = p ? p.y : NaN }
  const q = performance.now() - t1
  const same = ref ? out.every((v, i) => Object.is(v, ref[i])) : true; if (!ref) ref = out
  console.log(`${town} cell ${cell} m: build ${build.toFixed(0)} ms · ${(pts.length / 2).toLocaleString()} reads ${q.toFixed(0)} ms = ${(q * 2000 / pts.length).toFixed(2)} µs/read · ${same ? 'identical' : 'DIFFERENT'} to cell 8`)
}
