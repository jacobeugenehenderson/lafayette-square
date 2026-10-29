// far-across-step.mjs — Zob's C3: the far layer's drapeGlobals drops toeAt and berm (SlabRevetment far useFrame), so
// nAcross is sized as if the toe sat at the waterline while each station's u still runs to its own spanHere. Per armoured
// station: the across step the far layer gets (spanHere / (nAcross − 1)) against the step its lattice intends (G.step).
// ▶ node scratch/far-shore/far-across-step.mjs --town=provincetown
import { readFileSync } from 'node:fs'
import { makeDrawnGround } from '../../src/lib/drawnGround.js'
import { makeElevationSampler } from '../../src/lib/terrainCommon.js'
import { revetmentFaces, toeFor } from '../../src/lib/revetmentFromSlab.js'
import { drapeGlobals } from '../../src/lib/revetmentDrape.js'
import { MIN_ARMOUR_D50_M, d50For, RIPRAP_REPOSE_DEG } from '../../cartograph/shore-armour.mjs'
import { isWaterGroupId } from '../../src/components/waterMaterial.js'
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d
const town = arg('town'), dir = `${arg('slab', 'public/baked')}/${town}`
const rd = (f) => readFileSync(`${dir}/${f}`), ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const tj = JSON.parse(rd('terrain.json')), T = makeElevationSampler({ ...tj, data: new Float32Array(ab(rd('terrain.bin'))) }, 1)
const D = makeDrawnGround(JSON.parse(rd('ground.json')), ab(rd('ground.bin')), { groups: g => !isWaterGroupId(g.id) && g.partition !== false, rawAt: T.getElevationRaw })
const groundAt = (x, z) => { const p = D.partsAt(x, z); return p ? p.raw + p.y : T.getElevationRaw(x, z) }
const src = readFileSync('src/lib/revetmentDrape.js', 'utf8')
const U_LO = +src.match(/const U_LO = (-?[\d.]+)/)[1], U_HI = +src.match(/U_HI = (-?[\d.]+)/)[1]   // read, not retyped
const TAN = Math.tan(RIPRAP_REPOSE_DEG * Math.PI / 180), floorM = tj.bed?.visibleToM ?? 0
const ratios = { far: [], with: [] }
for (const f of revetmentFaces(JSON.parse(rd('revetment.json'))).filter(f => f.anyArmour)) {
  const waterY = f.levelM ?? 0, toeFloor = Math.max(floorM, f.lowM != null ? waterY - f.lowM + MIN_ARMOUR_D50_M : 0)
  const toeAt = toeFor(f, groundAt, toeFloor, waterY), berm = f.toeBerm
  const Gfar = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, octaves: 1 }), Gw = drapeGlobals({ poly: f.poly, crestAt: f.crestAt, toeAt, berm, octaves: 1 })
  for (let i = 0; i < Gfar.nAlong; i++) { const t = i / (Gfar.nAlong - 1), h = f.crestAt(t); if (!(h >= MIN_ARMOUR_D50_M)) continue
    // revetmentDrape's own spanHere, with the toe and berm it is given at build time
    const run = h / TAN, bermU = berm ? berm.stonesWide * d50For(h) / run : 0, span = (U_HI - 1) + toeAt(t) + bermU - U_LO
    ratios.far.push(span * run / (Gfar.nAcross - 1) / Gfar.step); ratios.with.push(span * run / (Gw.nAcross - 1) / Gw.step) }
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(2) }
for (const k of ['far', 'with']) console.log(`${town} ${k === 'far' ? 'far as called today' : 'with toeAt + berm  '}: across step ÷ intended step over ${ratios[k].length} armoured stations — median ${q(ratios[k], 0.5)} · p90 ${q(ratios[k], 0.9)} · max ${q(ratios[k], 1)}`)
