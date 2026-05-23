// Instrument buildFrontageBandsV2 inline for the park corner arc spans.
// Re-implements the body to log ramp/asym/sym branch decisions per arc span.
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const scene = 'lafayette-square'
const ribbons = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'ribbons.json'), 'utf-8'))
const design = JSON.parse(readFileSync(join(ROOT, 'public', 'looks', scene, 'design.json'), 'utf-8'))
const sten = JSON.parse(readFileSync(join(ROOT, 'cartograph', 'data', scene, 'neighborhood_boundary.json'), 'utf-8'))
const center = sten.center, radius = sten.radius
const streetFade = sten.streetFade || null
const targetR = streetFade ? streetFade.outer + 50 : radius
const scale = radius > 0 ? targetR / radius : 1
const stencil = sten.boundary.map(([x, z]) => [center[0] + (x - center[0]) * scale, center[1] + (z - center[1]) * scale])

const mod = await import('../src/lib/buildBlockGeometryV2.js')
const v2 = mod.buildBlockGeometryV2(ribbons, {
  stencil,
  cornerRadiusScale: design.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || {},
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
  blockCustoms: design.blockCustoms || null,
  blockLandUse: design.blockLandUse || null,
  curbWidth: design.curbWidth ?? 0.45,
})
// Print the chain measures used for park's bordering streets
const wantNames = new Set(['Park Avenue', 'Mississippi Avenue', 'Lafayette Avenue', 'Missouri Avenue'])
for (let i = 0; i < ribbons.streets.length; i++) {
  const s = ribbons.streets[i]
  if (!wantNames.has(s.name)) continue
  console.log(`chain[${i}] ${s.name} measure.left=`, JSON.stringify(s.measure?.left), 'measure.right=', JSON.stringify(s.measure?.right))
}
