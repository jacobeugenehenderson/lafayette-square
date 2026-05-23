// Scan ALL frontageBands for self-intersecting sidewalk rings.
import { readFileSync } from 'fs'
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

function segIntersect(a, b, c, d) {
  const x1 = a[0], y1 = a[1], x2 = b[0], y2 = b[1], x3 = c[0], y3 = c[1], x4 = d[0], y4 = d[1]
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(den) < 1e-9) return false
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6
}
function selfIntersects(r) {
  const n = r.length
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue
    if (segIntersect(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return true
  }
  return false
}
function ringArea(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]);return Math.abs(s)/2}

let total=0, broken=0
const breakouts = []
for (const fb of v2.frontageBands) {
  if (!fb) continue
  for (const k of ['treelawnRings','sidewalkRings','asphaltRings']) {
    for (const r of (fb[k] || [])) {
      total++
      if (r.length >= 3 && selfIntersects(r)) {
        broken++
        breakouts.push({key: fb.blockKey, kind: fb.corner?'arc':'straight', chain: fb.chainIdx, side: fb.side, ring: k, verts: r.length, area: ringArea(r).toFixed(2)})
      }
    }
  }
}
console.log(`total rings scanned: ${total}, self-intersecting: ${broken}`)
for (const b of breakouts.slice(0, 30)) console.log(' ', JSON.stringify(b))
