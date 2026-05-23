// Verify the fix is firing: replicate the dedupe externally and check matched-after-dedupe counts.
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = 'lafayette-square'
const ribbons = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'ribbons.json'), 'utf-8'))
const design  = JSON.parse(readFileSync(join(ROOT, 'public', 'looks', scene, 'design.json'), 'utf-8'))
const sten = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json'), 'utf-8'))
const center = sten.center, radius = sten.radius
const streetFade = sten.streetFade || null
const targetR = streetFade ? streetFade.outer + 50 : radius
const scale = radius > 0 ? targetR / radius : 1
const stencil = sten.boundary.map(([x,z]) => [center[0]+(x-center[0])*scale, center[1]+(z-center[1])*scale])

const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  cornerRadiusScale: design.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || {},
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
  blockCustoms: design.blockCustoms || null,
  blockLandUse: design.blockLandUse || null,
  curbWidth: design.curbWidth ?? 0.45,
})

// Compare blockSharp.length vs blockRounded.length per ring
let totalDelta = 0
for (let i = 0; i < v2.blockSharp.length; i++) {
  const s = v2.blockSharp[i]?.length || 0
  const r = v2.blockRounded[i]?.length || 0
  const d = r - s
  totalDelta += d
}
console.log(`Total rounded - sharp vertex delta across all rings: ${totalDelta}`)
console.log(`per-ring deltas for the 11 dup-rings:`)
for (const idx of [0, 2, 7, 17, 33, 46, 47, 67, 99, 100]) {
  console.log(`  ring ${idx}: sharp=${v2.blockSharp[idx]?.length}  rounded=${v2.blockRounded[idx]?.length}  delta=${(v2.blockRounded[idx]?.length||0)-(v2.blockSharp[idx]?.length||0)}`)
}
