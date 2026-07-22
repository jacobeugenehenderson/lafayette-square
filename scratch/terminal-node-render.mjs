// [BRIEF-terminal-node-sweep] A/B curb render at a target node.
// BASE strips throughId → cornerAt falls back to roadId (the OLD false-corner
// behavior); NEW keeps throughId (the fix). SAME tileGround.js both sides, so
// the ONLY variable is the identity key. Renders curb+asphalt+centerlines to PNG.
//   node scratch/terminal-node-render.mjs <scene> <cx> <cz> [win]
import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround, sectionOpen } from '../src/lib/tileGround.js'

const scene = process.argv[2] || 'hipointe-demun'
const cxw = +process.argv[3], cyw = +process.argv[4], W = +(process.argv[5] || 100)
const base = `../cartograph/data/${scene}`
const ribPath = scene === 'lafayette-square' ? '../src/data/ribbons.json' : `${base}/clean/ribbons.json`
const r = JSON.parse(readFileSync(new URL(ribPath, import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL(`${base}/neighborhood_boundary.json`, import.meta.url)))
const d = JSON.parse(readFileSync(new URL(`../public/looks/${scene}/design.json`, import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
// emitArtifact:true → build the FROZEN shape the BAKE ships; render its
// sectionOpen curb (the brief's gate — NOT the live buildTileGround.curb).
const opts = { stencil: clip, curbWidth: d.curbWidth, smooth: d.streetSmooth ?? 0.5, blockLandUse: d.blockLandUse, emitArtifact: true }

// BASE = throughId stripped (fallback to roadId = old behavior). NEW = as-is.
const stripped = JSON.parse(JSON.stringify(r))
for (const s of (stripped.streets || stripped)) { delete s.throughId; delete s.through }

const rawA = buildTileGround(stripped, opts), rawB = buildTileGround(r, opts)
const A = sectionOpen(rawA._shapeArtifact, opts.curbWidth, { outer: 'LU', inner: 'SW' }, clip)  // BASE frozen
const B = sectionOpen(rawB._shapeArtifact, opts.curbWidth, { outer: 'LU', inner: 'SW' }, clip)  // NEW frozen

const px = 1200, minx = cxw - W / 2, miny = cyw - W / 2, sc = px / W
const X = x => ((x - minx) * sc).toFixed(1), Y = y => ((y - miny) * sc).toFixed(1)
function svg(tg, title) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#e9e4d8">`
  const path = (rings, fill, stroke = '#000', sw = 0.4) => {
    let dd = ''
    for (const rr of (rings || [])) { if (!rr || rr.length < 3) continue; dd += rr.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' }
    if (dd) s += `<path d="${dd}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-opacity="0.6"/>`
  }
  path(tg.asphalt, '#c9c2b0')            // asphalt tan
  path(tg.curb, '#2b6cff')               // CURB in blue (the silhouette Jacob marks)
  // centerlines (navy) for orientation
  for (const st of (r.streets || r)) {
    if (!st.points || st.points.length < 2) continue
    let dd = 'M' + st.points.map(p => X(p[0]) + ' ' + Y(p[1])).join(' L ')
    s += `<path d="${dd}" fill="none" stroke="#0a1a4a" stroke-width="1.4"/>`
  }
  // node marker
  s += `<circle cx="${X(cxw)}" cy="${Y(cyw)}" r="7" fill="#fff" stroke="#333" stroke-width="2"/>`
  s += `<text x="12" y="34" font-size="26" font-family="sans-serif" fill="#111">${title}</text></svg>`
  return s
}
for (const [tag, tg, title] of [['base', A, 'BASE (roadId → false corner)'], ['new', B, 'NEW (throughId → through)']]) {
  const p = new URL(`./tns-${scene}-${tag}.png`, import.meta.url).pathname
  await sharp(Buffer.from(svg(tg, title))).png().toFile(p)
  console.log('wrote', p)
}
