import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const rd = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'))
// args: scene ribbonsPath boundaryPath designPath cx cz tag
const [scene, cx, cz, tag] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5] || 'n']
const paths = scene === 'ls'
  ? ['src/data/ribbons.json', 'cartograph/data/lafayette-square/neighborhood_boundary.json', 'public/looks/lafayette-square/design.json']
  : ['cartograph/data/hipointe-demun/clean/ribbons.json', 'cartograph/data/hipointe-demun/neighborhood_boundary.json', 'public/looks/hipointe-demun/design.json']
const ribbons = rd(paths[0]), bnd = rd(paths[1]), design = rd(paths[2])
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const pr = buildTileGround(ribbons, { stencil: clip, smooth: design.streetSmooth ?? 0, curbWidth: design.curbWidth, blockLandUse: design.blockLandUse || null, cornerRadiusScale: design.cornerRadiusScale ?? 1, cornerRadiusOverrides: design.cornerRadiusOverrides || null, blockCustoms: design.blockCustoms || null })
const R = 55, node = [cx, cz]
const VX = [cx - R, cx + R], VZ = [cz - R, cz + R]
const px = 640, w = VX[1] - VX[0], h = VZ[1] - VZ[0], sc = px / w, H = h * sc
const X = x => ((x - VX[0]) * sc).toFixed(1), Y = z => ((z - VZ[0]) * sc).toFixed(1)
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${(H + 22).toFixed(0)}" style="background:#161616">`
s += `<text x="8" y="15" fill="#ddd" font-family="monospace" font-size="12">${scene} @ [${cx},${cz}]  [${tag}]</text><g transform="translate(0,22)">`
const draw = (rings, fill) => { let dd = ''; for (const r of (rings || [])) { if (!r || r.length < 3) continue; dd += r.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' } if (dd) s += `<path d="${dd}" fill="${fill}" fill-rule="evenodd" stroke="#000" stroke-width="0.3" stroke-opacity="0.5"/>` }
const luColor = { median: '#3f7a28', park: '#3f7a28', recreation: '#3f7a28', residential: '#6b5535', institutional: '#5a5a70', commercial: '#6a5a3a', unknown: '#555', island: '#3f7a28', parking: '#666' }
for (const [cls, rings] of Object.entries(pr.luByClass || {})) draw(rings, luColor[cls] || '#4a5a2a')
for (const rings of Object.values(pr.treelawnByLu || {})) draw(rings, '#5aa02a')
draw(pr.sidewalk, '#d8d2c4')
draw(pr.asphalt, '#4a4a4a')
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
for (const st of (pr._shapeArtifact || [])) {
  const iA = st.iA || []; const rings = (Array.isArray(iA[0]) && typeof iA[0][0] === 'number') ? [iA] : iA
  for (const ring of rings) { if (!ring || ring.length < 3 || !ring.some(p => len(p, node) < R)) continue; const col = st.isMedian ? '#ff5aa0' : '#38d0ff'; s += `<polyline points="${ring.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" fill="none" stroke="${col}" stroke-width="1.3" stroke-opacity="0.85"/>` }
}
s += `<circle cx="${X(cx)}" cy="${Y(cz)}" r="3" fill="#ffd000"/></g></svg>`
await sharp(Buffer.from(s)).png().toFile(path.join(ROOT, `scratch/node-${scene}-${tag}.png`))
console.log(`wrote node-${scene}-${tag}.png`)
