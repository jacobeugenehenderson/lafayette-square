// claims-the-beach-band-is-the-towns-own.mjs — IS THE SAND SURFACE'S BEACH BAND DERIVED FROM EACH TOWN, OR A CONSTANT?
//
// Boz, 2026-09-25: beachBandM is a property of a COAST, so it is DERIVED per town (p95 of the town's
// beach-tagged ground's distance from the waterline), never one physics number — Provincetown's
// measurement is the receipt, not the value. A town with no beach-tagged ground gets it ABSENT, named.
//   ① surfaces.mjs files beachBandM + beachSlopeDeg as `derived`, with no literal value;
//   ② deriveSand on Provincetown agrees with an INDEPENDENT measurement (2 m bilinear sampling of the
//     same field, scratch/marram-beach-band.mjs's method) within one texel + the far-field bound;
//   ③ two coastal towns derive DIFFERENT bands (a shared constant would make them equal);
//   ④ a town with no beach-tagged ground gets both ABSENT with a reason.
// Reads real shape.json / terrain / map.json and writes nothing.
//
// ▶ MUTATION-TEST IT: in bake-coast-distance.js deriveSand, return `{ value: 98, … }` for beachBandM → ③ RED.
//
//   node checks/claims-the-beach-band-is-the-towns-own.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { SURFACES } from '../cartograph/surfaces.mjs'
import { waterRuns } from '../cartograph/shoreRuns.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MOD = process.env.COAST_BAKE_SRC || '../cartograph/bake-coast-distance.js'
const { coastDistanceField, deriveSand } = await import(MOD)
let red = 0
const bad = (m) => { red++; console.log(`   ⛔ ${m}`) }

console.log('① THE MODEL FILES THEM AS DERIVED')
for (const k of ['beachBandM', 'beachSlopeDeg']) {
  const p = SURFACES.sand.params[k]
  p.source !== 'derived' ? bad(`sand.${k} is '${p.source}', not derived`)
    : ('value' in p || p.finding) ? bad(`sand.${k} carries a literal value/finding`) : console.log(`   ✅ sand.${k}: derived, over ${p.over.join('/')}, p${p.percentile * 100}`)
}

const town = (scene) => {
  const shape = JSON.parse(fs.readFileSync(path.join(REPO, 'public/baked', scene, 'shape.json'), 'utf8'))
  const tm = JSON.parse(fs.readFileSync(path.join(REPO, 'cartograph/data', scene, 'clean/terrain.json'), 'utf8'))
  const natural = JSON.parse(fs.readFileSync(path.join(REPO, 'cartograph/data', scene, 'clean/map.json'), 'utf8')).layers?.natural || []
  const hb = fs.readFileSync(path.join(REPO, 'cartograph/data', scene, 'clean/terrain.bin'))
  const { field, W, H, stepX, errBoundM } = coastDistanceField(waterRuns(shape), tm)
  const heights = new Float32Array(hb.buffer, hb.byteOffset, W * H)
  return { field, W, H, stepX, errBoundM, bounds: tm.bounds, natural, heights, d: deriveSand({ field, W, H, bounds: tm.bounds, heights, natural }) }
}

console.log('② PROVINCETOWN MATCHES AN INDEPENDENT MEASUREMENT')
const pt = town('provincetown')
{
  const { field, W, H, bounds: b } = pt, sx = (b.maxX - b.minX) / (W - 1), sz = (b.maxZ - b.minZ) / (H - 1)
  const at = (x, z) => { const fi = (x - b.minX) / sx, fj = (z - b.minZ) / sz, i = Math.floor(fi), j = Math.floor(fj), a = fi - i, c = fj - j
    return (1 - a) * (1 - c) * field[j * W + i] + a * (1 - c) * field[j * W + i + 1] + (1 - a) * c * field[(j + 1) * W + i] + a * c * field[(j + 1) * W + i + 1] }
  const inside = (r, x, z) => { let k = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const A = r[i], B = r[j]; if ((A.z > z) !== (B.z > z) && x < (B.x - A.x) * (z - A.z) / (B.z - A.z) + A.x) k = !k } return k }
  const d = []
  for (const f of pt.natural.filter(f => SURFACES.sand.params.beachBandM.over.includes(f.use))) {
    const xs = f.ring.map(p => p.x), zs = f.ring.map(p => p.z)
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 2) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 2) if (inside(f.ring, x, z)) d.push(at(x, z))
  }
  d.sort((a, c) => a - c)
  const ref = d[Math.floor(SURFACES.sand.params.beachBandM.percentile * d.length)], tol = pt.stepX + pt.errBoundM
  const got = pt.d.beachBandM.value
  Math.abs(got - ref) <= tol ? console.log(`   ✅ derived ${got} m · independent ${ref.toFixed(1)} m · tolerance ±${tol.toFixed(1)} m`)
    : bad(`derived ${got} m vs independent ${ref.toFixed(1)} m — beyond ±${tol.toFixed(1)} m`)
}

console.log('③ TWO COASTS, TWO BANDS')
const hu = town('huron')
pt.d.beachBandM.value !== hu.d.beachBandM.value && pt.d.beachSlopeDeg.value !== hu.d.beachSlopeDeg.value
  ? console.log(`   ✅ provincetown ${pt.d.beachBandM.value} m / ${pt.d.beachSlopeDeg.value}° · huron ${hu.d.beachBandM.value} m / ${hu.d.beachSlopeDeg.value}°`)
  : bad(`provincetown and huron derive the same band — a constant, not a derivation (${pt.d.beachBandM.value} / ${hu.d.beachBandM.value})`)

console.log('④ NO BEACH → ABSENT, NAMED')
{
  const none = deriveSand({ field: pt.field, W: pt.W, H: pt.H, bounds: pt.bounds, heights: pt.heights, natural: [] })
  none.beachBandM.absent && none.beachBandM.why && none.beachSlopeDeg.absent && none.beachSlopeDeg.why
    ? console.log(`   ✅ ${none.beachBandM.why}`) : bad(`a town with no beach-tagged ground got ${JSON.stringify(none)}`)
}
console.log(red ? `\n⛔ FAIL — ${red}` : '\n✅ PASS')
process.exit(red ? 1 : 0)
