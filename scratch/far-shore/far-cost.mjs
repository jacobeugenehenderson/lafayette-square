// far-cost.mjs — WHAT DOES THE REVETMENT'S FAR LAYER COST ON THE MAIN THREAD, PER FACE, AS THE PLAYER BUILDS IT?
// Read-only. Reproduces SlabRevetment.jsx's face preparation and its far-layer build (FAR_OCTAVES, the drawn ground as
// groundAt, groundRelative's second pass) against a town's local slab (public/baked/<town>/), the same inputs the
// player fetches. ⭐ It passes groundAt (the retired boulder-farfield-cost.mjs did not): the profile's cost is all inside it.
// ▶ node scratch/far-shore/far-cost.mjs --town=provincetown [--json=out.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { makeDrawnGround } from '../../src/lib/drawnGround.js'
import { makeElevationSampler } from '../../src/lib/terrainCommon.js'
import { revetmentFaces, toeFor } from '../../src/lib/revetmentFromSlab.js'
import { drapeGlobals, revetmentDrape } from '../../src/lib/revetmentDrape.js'
import { waterLevelsIfWet } from '../../cartograph/waterLevel.mjs'
import { MIN_ARMOUR_D50_M } from '../../cartograph/shore-armour.mjs'
import { isWaterGroupId } from '../../src/components/waterMaterial.js'

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const town = arg('town'), out = arg('json')
if (!town) { console.error('--town is required'); process.exit(2) }
const dir = `${arg('slab', 'public/baked')}/${town}`
const rd = (f) => readFileSync(`${dir}/${f}`)
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)

const tj = JSON.parse(rd('terrain.json')), T = makeElevationSampler({ ...tj, data: new Float32Array(ab(rd('terrain.bin'))) }, 1)
const gj = JSON.parse(rd('ground.json'))
let t0 = performance.now()
const D = makeDrawnGround(gj, ab(rd('ground.bin')), { groups: g => !isWaterGroupId(g.id) && g.partition !== false, rawAt: T.getElevationRaw })
const drawnMs = performance.now() - t0
let calls = 0
const parts = (x, z) => { calls++; const p = D.partsAt(x, z); return p ? { raw: p.raw, y: p.y } : { raw: T.getElevationRaw(x, z), y: 0 } }
const drawnAt1 = (x, z) => { const g = parts(x, z); return g.raw + g.y }

const doc = JSON.parse(rd('revetment.json'))
const levels = waterLevelsIfWet({ datum: tj.datum, water: tj.water })
const floorM = tj.bed?.visibleToM ?? 0
t0 = performance.now()
const faces = revetmentFaces(doc).filter(f => f.anyArmour).map(f => {
  const waterY = f.levelM ?? 0
  const toeFloor = Math.max(floorM, f.lowM != null ? waterY - f.lowM + MIN_ARMOUR_D50_M : 0)
  const toeAt = toeFor(f, drawnAt1, toeFloor, waterY)
  return { ...f, toeAt, berm: f.toeBerm, groundAt: drawnAt1, waterY }
})
const prepMs = performance.now() - t0, prepCalls = calls

const rows = []
for (const f of faces) {
  const c0 = calls; let ms = 0, relMs = 0, tris = 0, verts = 0, bytes = 0, gz = 0, err = null, lenM = 0
  for (let i = 1; i < f.poly.length; i++) lenM += Math.hypot(f.poly[i].x - f.poly[i - 1].x, f.poly[i].z - f.poly[i - 1].z)
  try {
    const a = performance.now()
    const G = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: 1 })
    const d = revetmentDrape({ poly: f.poly, crestAt: f.crestAt, toeAt: f.toeAt, berm: f.berm, groundAt: f.groundAt, waterY: f.waterY, octaves: 1, globals: G })
    const b = performance.now(); ms = b - a
    const drapeCalls = calls - c0
    // groundRelative: one more drawn-ground read per vertex
    const g = d.geometry, p = g.attributes.position, pins = new Float32Array(p.count * 4)
    for (let i = 0; i < p.count; i++) { const raw = parts(p.getX(i), p.getZ(i)).raw; p.setY(i, p.getY(i) - raw); pins[i * 4] = 1; pins[i * 4 + 1] = raw }
    relMs = performance.now() - b
    tris = d.stats?.tris || 0; verts = p.count
    // what a baked far mesh would carry: position f32×3 + normal f32×3 + drawn raw f32 (one, not four) + index u32×3
    const buf = Buffer.concat([g.attributes.position.array, g.attributes.normal?.array || new Float32Array(0), pins.filter((_, i) => i % 4 === 1), g.index?.array || new Uint32Array(0)].map(x => Buffer.from(x.buffer, x.byteOffset, x.byteLength)))
    bytes = buf.length; gz = gzipSync(buf).length
    rows.push({ key: f.key, lenM: Math.round(lenM), ms: +ms.toFixed(1), relMs: +relMs.toFixed(1), tris, verts, drapeCalls, relCalls: verts, bytes, gz })
  } catch (e) { err = e.message; rows.push({ key: f.key, lenM: Math.round(lenM), err }) }
}
const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0)
rows.sort((a, b) => (b.ms + b.relMs) - (a.ms + a.relMs))
console.log(`${town}: drawn ground ${D.triCount.toLocaleString()} tris built in ${drawnMs.toFixed(0)} ms · ${faces.length} armoured faces · face prep (toeFor) ${prepMs.toFixed(0)} ms, ${prepCalls.toLocaleString()} ground reads`)
console.log(`far layer: drape ${sum('ms').toFixed(0)} ms + groundRelative ${sum('relMs').toFixed(0)} ms · ${sum('tris').toLocaleString()} tris · ${(sum('drapeCalls') + sum('relCalls')).toLocaleString()} ground reads · bytes ${(sum('bytes') / 1e6).toFixed(2)} MB raw, ${(sum('gz') / 1e6).toFixed(2)} MB gzip`)
console.log(`µs per ground read ≈ ${((sum('ms') + sum('relMs')) * 1000 / (sum('drapeCalls') + sum('relCalls'))).toFixed(1)}`)
console.log('largest faces (ms = drape + groundRelative):')
for (const r of rows.slice(0, 8)) console.log(`  ${r.key}  ${r.lenM} m  ${r.err ? 'ERR ' + r.err : `${(r.ms + r.relMs).toFixed(0)} ms  ${r.tris} tris  ${r.drapeCalls + r.relCalls} reads`}`)
console.log(`faces over 4 ms: ${rows.filter(r => r.ms + r.relMs > 4).length} · over 50 ms: ${rows.filter(r => r.ms + r.relMs > 50).length} · over 200 ms: ${rows.filter(r => r.ms + r.relMs > 200).length}`)
if (out) writeFileSync(out, JSON.stringify({ town, drawnMs, prepMs, prepCalls, faces: rows }, null, 1))
