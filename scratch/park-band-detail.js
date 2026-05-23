// Dump the actual ring for one of the SELFINT sidewalks for inspection.
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { buildBlockGeometryV2 } from '../src/lib/buildBlockGeometryV2.js'

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

const v2 = buildBlockGeometryV2(ribbons, {
  stencil,
  cornerRadiusScale: design.cornerRadiusScale ?? 1,
  cornerRadiusOverrides: design.cornerRadiusOverrides || {},
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || {},
  blockCustoms: design.blockCustoms || null,
  blockLandUse: design.blockLandUse || null,
  curbWidth: design.curbWidth ?? 0.45,
})

function pointInRing(px, py, r) { let inside = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1]; if ((zi > py) !== (zj > py) && px < (xj - xi) * (py - zi) / (zj - zi) + xi) inside = !inside } return inside }
function avgPointOfBand(fb) {
  const all = []
  for (const ring of (fb.treelawnRings || [])) all.push(...ring)
  for (const ring of (fb.sidewalkRings || [])) all.push(...ring)
  if (!all.length) return null
  let cx = 0, cz = 0
  for (const p of all) { cx += p[0]; cz += p[1] }
  return [cx / all.length, cz / all.length]
}
let parkIdx = -1
for (let i = 0; i < v2.blockSharp.length; i++) if (pointInRing(0, 0, v2.blockSharp[i])) { parkIdx = i; break }
const parkRing = v2.blockSharp[parkIdx]

const parkBands = []
for (const fb of v2.frontageBands) {
  if (!fb) continue
  const p = avgPointOfBand(fb)
  if (!p) continue
  if (pointInRing(p[0], p[1], parkRing)) parkBands.push(fb)
}

// Pick the SELFINT entries (those with a 'corner' key — arc spans)
const arcEntries = parkBands.filter(fb => fb.corner)
console.log(`arc-span entries (with .corner): ${arcEntries.length}`)
for (const fb of arcEntries) {
  console.log(`\n--- corner=${fb.corner} chain=${ribbons.streets[fb.chainIdx]?.name} side=${fb.side} ---`)
  for (const ring of fb.sidewalkRings) {
    console.log(`sidewalk ring verts=${ring.length}:`)
    for (let i = 0; i < ring.length; i++) {
      console.log(`  [${i}] ${ring[i][0].toFixed(2)}, ${ring[i][1].toFixed(2)}`)
    }
  }
}
