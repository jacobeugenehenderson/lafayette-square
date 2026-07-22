import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { buildTileGround } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const rd = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'))
const ribbons = rd('cartograph/data/hipointe-demun/clean/ribbons.json')
const bnd = rd('cartograph/data/hipointe-demun/neighborhood_boundary.json')
const design = rd('public/looks/hipointe-demun/design.json')
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(ribbons, { stencil: clip, smooth: 0, curbWidth: design.curbWidth, blockLandUse: design.blockLandUse || null, cornerRadiusScale: design.cornerRadiusScale ?? 1, blockCustoms: design.blockCustoms || null })
const node = [-4.4, 931.3]
const tag = process.argv[2] || 'post'
const VX = [-45, 45], VZ = [905, 960]
const px = 700, w = VX[1] - VX[0], h = VZ[1] - VZ[0], sc = px / w, H = h * sc
const X = x => ((x - VX[0]) * sc).toFixed(1), Y = z => ((z - VZ[0]) * sc).toFixed(1)
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${(H + 24).toFixed(0)}" style="background:#161616">`
s += `<text x="8" y="16" fill="#ddd" font-family="monospace" font-size="12">iA curb + fills near De Mun × Clayton  [${tag}]</text><g transform="translate(0,24)">`
const draw = (rings, fill, stroke = '#000', sw = 0.4) => {
  let dd = ''
  for (const r of (rings || [])) { if (!r || r.length < 3) continue; dd += r.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' }
  if (dd) s += `<path d="${dd}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${sw}" stroke-opacity="0.7"/>`
}
// fills for context (true output fields)
const luColor = { median: '#3f7a28', park: '#3f7a28', recreation: '#3f7a28', residential: '#6b5535', institutional: '#5a5a70', commercial: '#6a5a3a', unknown: '#555', island: '#3f7a28', parking: '#666' }
for (const [cls, rings] of Object.entries(pr.luByClass || {})) draw(rings, luColor[cls] || '#4a5a2a')
for (const rings of Object.values(pr.treelawnByLu || {})) draw(rings, '#5aa02a')
draw(pr.sidewalk, '#d8d2c4')
draw(pr.asphalt, '#4a4a4a')
// iA curb rings (highlight) near the node — draw as bright outlines
const tiles = pr._shapeArtifact || []
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
for (const st of tiles) {
  const iA = st.iA || []
  const rings = (Array.isArray(iA[0]) && typeof iA[0][0] === 'number') ? [iA] : iA
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue
    if (!ring.some(p => len(p, node) < 25)) continue
    const col = st.isMedian ? '#ff5aa0' : '#38d0ff'
    s += `<polyline points="${ring.map(p => X(p[0]) + ',' + Y(p[1])).join(' ')}" fill="none" stroke="${col}" stroke-width="1.6"/>`
    for (const p of ring) if (len(p, node) < 20) s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="1.4" fill="${col}"/>`
  }
}
s += `<circle cx="${X(node[0])}" cy="${Y(node[1])}" r="3" fill="#ffd000"/></g></svg>`
const outSvg = path.join(ROOT, `scratch/hpdm-ia-${tag}.svg`)
writeFileSync(outSvg, s)
await sharp(Buffer.from(s)).png().toFile(path.join(ROOT, `scratch/hpdm-ia-${tag}.png`))
console.log(`wrote hpdm-ia-${tag}.png  (magenta=median-tile iA, blue=block-tile iA, yellow=node)`)
