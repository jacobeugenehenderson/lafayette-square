// skip-bare-ab.mjs — EXPERIMENT: does skipping a bare station's column change the far layer by a single byte, and what does
// it save? Original src/lib/revetmentDrape.js vs scratch/far-shore/revetmentDrape.skipbare.mjs (one added `continue`).
// ▶ node scratch/far-shore/skip-bare-ab.mjs --town=provincetown --slab=../integration/public/baked
import { readFileSync } from 'node:fs'
import { makeDrawnGround } from '../../src/lib/drawnGround.js'
import { makeElevationSampler } from '../../src/lib/terrainCommon.js'
import { revetmentFaces, toeFor } from '../../src/lib/revetmentFromSlab.js'
import * as A from '../../src/lib/revetmentDrape.js'
const B = await import(`./revetmentDrape.${process.argv.find(a => a.startsWith('--impl='))?.slice(7) ?? 'skipbare'}.mjs`)
import { MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'
import { isWaterGroupId } from '../../src/components/waterMaterial.js'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const town = arg('town'), dir = `${arg('slab', 'public/baked')}/${town}`
const rd = (f) => readFileSync(`${dir}/${f}`), ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const tj = JSON.parse(rd('terrain.json')), T = makeElevationSampler({ ...tj, data: new Float32Array(ab(rd('terrain.bin'))) }, 1)
const D = makeDrawnGround(JSON.parse(rd('ground.json')), ab(rd('ground.bin')), { groups: g => !isWaterGroupId(g.id) && g.partition !== false, rawAt: T.getElevationRaw })
let calls = 0
const drawnAt1 = (x, z) => { calls++; const p = D.partsAt(x, z); return p ? p.raw + p.y : T.getElevationRaw(x, z) }
const floorM = tj.bed?.visibleToM ?? 0
const faces = revetmentFaces(JSON.parse(rd('revetment.json'))).filter(f => f.anyArmour).map(f => {
  const waterY = f.levelM ?? 0, toeFloor = Math.max(floorM, f.lowM != null ? waterY - f.lowM + MIN_ARMOUR_D50_M : 0)
  return { ...f, toeAt: toeFor(f, drawnAt1, toeFloor, waterY), berm: f.toeBerm, groundAt: drawnAt1, waterY } })
const eq = (x, y) => (!x && !y) || (x && y && x.length === y.length && Buffer.compare(Buffer.from(x.buffer, x.byteOffset, x.byteLength), Buffer.from(y.buffer, y.byteOffset, y.byteLength)) === 0)
let tA = 0, tB = 0, cA = 0, cB = 0, diff = 0
for (const f of faces) {
  const run = (M, skip) => { globalThis.__SKIP_BARE = skip; const c0 = calls, t0 = performance.now()
    const G = M.drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: 1 })
    const d = M.revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: 1, globals: G })
    return { d, ms: performance.now() - t0, c: calls - c0 } }
  const a = run(A, false), b = run(B, true)
  tA += a.ms; tB += b.ms; cA += a.c; cB += b.c
  const ga = a.d.geometry, gb = b.d.geometry
  const same = eq(ga.attributes.position?.array, gb.attributes.position?.array) && eq(ga.attributes.normal?.array, gb.attributes.normal?.array) && eq(ga.index?.array, gb.index?.array)
  if (!same) { diff++; console.log(`  ✗ ${f.key} differs`) }
  console.log(`  ${f.key.padEnd(9)} ${a.ms.toFixed(0).padStart(5)} → ${b.ms.toFixed(0).padStart(5)} ms · reads ${a.c} → ${b.c} · ${same ? 'identical' : 'DIFFERENT'}`)
}
console.log(`${town}: ${faces.length} faces · drape ${tA.toFixed(0)} → ${tB.toFixed(0)} ms · ground reads ${cA} → ${cB} · ${diff} face(s) differ`)
