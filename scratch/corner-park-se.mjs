import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const marks = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/clean/marker_strokes.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
// MATCH THE LIVE SURVEY VIEW exactly (BlockGeometryV2Debug.jsx): streetSmooth=0 hardcoded, + cornerCornerRadiusOverrides
const pr = buildTileGround(r, { stencil: clip, curbWidth: design.curbWidth, smooth: 0, blockLandUse: design.blockLandUse, cornerRadiusScale: design.cornerRadiusScale ?? 1, cornerRadiusOverrides: design.cornerRadiusOverrides || null, cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides || null, blockCustoms: design.blockCustoms || null })

// two corners: SE (Park x S-18th) and NW (Lafayette x Mississippi)
const targets = [
  { name: 'park-wide', node: [424.4, -88.7], nodeMark: [424.4, -88.7], W: 200, mark: null, allMarks: marks },
]
for (const t of targets) {
  const c = t.node, W = t.W
  const minx = c[0] - W / 2, maxx = c[0] + W / 2, miny = c[1] - W / 2, maxy = c[1] + W / 2, px = 1800, sc = px / W
  // WORLD FRAME: +x = WEST, +z = NORTH. Screen = north-up, east-right (matches the aerial in Survey)
  //   east-right → screen-x decreases with world-x  → X = (maxx - x)
  //   north-up   → screen-y decreases with world-z  → Y = (maxy - y)
  const X = x => ((maxx - x) * sc).toFixed(1), Y = y => ((maxy - y) * sc).toFixed(1)
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
  const path = (rings, fill, sw = 0.3) => { let d = ''; for (const rr of (rings || [])) { if (!rr || rr.length < 3) continue; d += rr.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' } if (d) s += `<path d="${d}" fill="${fill}" stroke="#000" stroke-width="${sw}" stroke-opacity="0.5"/>` }
  // ALL THREE SHAPE LAYERS in distinct colors, to see which the magenta trace follows
  path(pr.asphalt, '#222', 0)            // asphalt fill (faint)
  const outline = (rings, col) => { for (const rr of (rings || [])) { if (!rr || rr.length < 3) continue; if (!rr.some(p => Math.abs(p[0] - c[0]) < W && Math.abs(p[1] - c[1]) < W)) continue; const d = rr.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z'; s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.5"/>` } }
  outline(pr.curb, '#ffffff')            // curb = white
  outline(pr.block, '#ffae00')           // block = orange
  // centerlines (bright cyan), clipped near corner
  for (const st of r.streets) {
    if (!st?.points || st.points.length < 2) continue
    const pts = st.points.filter(p => Math.abs(p[0] - c[0]) < W && Math.abs(p[1] - c[1]) < W)
    if (pts.length < 2) continue
    const d = st.points.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ')
    s += `<path d="${d}" fill="none" stroke="#22d3ee" stroke-width="1.5"/>`
  }
  // operator marked stroke(s) (magenta), labeled by index
  const allM = t.allMarks ? t.allMarks.map((m, i) => ({ m, i })) : (t.mark ? [{ m: t.mark, i: 2 }] : [])
  for (const { m, i } of allM) {
    if (!m.some(p => Math.abs(p.x - c[0]) < W && Math.abs(p.z - c[1]) < W)) continue
    const d = m.map((p, k) => (k ? 'L' : 'M') + X(p.x) + ' ' + Y(p.z)).join(' ')
    s += `<path d="${d}" fill="none" stroke="#ff2d9b" stroke-width="2.5"/>`
    s += `<text x="${X(m[0].x)}" y="${Y(m[0].z)}" fill="#ff2d9b" font-size="22">#${i}</text>`
  }
  // node marker (yellow dot)
  const nm = t.nodeMark || c
  s += `<circle cx="${X(nm[0])}" cy="${Y(nm[1])}" r="6" fill="#ffd400"/>`
  // compass labels
  s += `<text x="${px / 2}" y="30" fill="#0f0" font-size="30" text-anchor="middle">N</text>`
  s += `<text x="${px / 2}" y="${px - 10}" fill="#0f0" font-size="30" text-anchor="middle">S</text>`
  s += `<text x="${px - 30}" y="${px / 2}" fill="#0f0" font-size="30">E</text>`
  s += `<text x="10" y="${px / 2}" fill="#0f0" font-size="30">W</text>`
  s += '</svg>'
  writeFileSync(new URL(`./corner-${t.name}.svg`, import.meta.url), s)
  await sharp(Buffer.from(s)).png().toFile(new URL(`./corner-${t.name}.png`, import.meta.url).pathname)
  console.log(`wrote corner-${t.name}.png  node=${c}  window=${W}m`)
}
