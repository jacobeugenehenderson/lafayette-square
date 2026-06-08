// [D2] Screenshot A/B backstop — render buildTileGround output (the full LS
// ground: treelawn/sidewalk/curb/asphalt) frozen-tiles-ON vs OFF, full map +
// a Mississippi×Lafayette corner zoom, and PIXEL-compare the rasters.
// (The machine gate is scratch/d2-assert.mjs — byte-identical construction
// output; this is the eye-level backstop the brief asks for.)
import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'

const ROOT = new URL('..', import.meta.url).pathname
const ribbons = JSON.parse(readFileSync(ROOT + 'src/data/ribbons.json', 'utf-8'))
const bnd = JSON.parse(readFileSync(ROOT + 'cartograph/data/lafayette-square/neighborhood_boundary.json', 'utf-8'))
const d = JSON.parse(readFileSync(ROOT + 'public/looks/lafayette-square/design.json', 'utf-8'))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const opts = {
  stencil: clip, curbWidth: d.curbWidth, smooth: 0,
  blockLandUse: d.blockLandUse, cornerRadiusScale: d.cornerRadiusScale,
  cornerRadiusOverrides: d.cornerRadiusOverrides, cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides,
  blockCustoms: d.blockCustoms,
}

// windows: [tag, centerX, centerZ, width-meters]  (+x=WEST +z=NORTH — labels only)
const WINDOWS = [
  ['full', cx, cz, 2 * bnd.radius + 100],
  ['miss-laf', 174, 208, 80],
]

const render = (pr, cxw, cyw, W, px = 1600) => {
  const minx = cxw - W / 2, miny = cyw - W / 2, sc = px / W
  const X = x => ((x - minx) * sc).toFixed(1), Y = y => ((y - miny) * sc).toFixed(1)
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
  const path = (rings, fill) => {
    let dd = ''
    for (const rr of (rings || [])) { if (!rr || rr.length < 3) continue; dd += rr.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' }
    if (dd) s += `<path d="${dd}" fill="${fill}" stroke="#000" stroke-width="0.3" stroke-opacity="0.5"/>`
  }
  for (const rings of Object.values(pr.treelawnByLu || {})) path(rings, '#5aa02a')
  path(pr.sidewalk, '#e8e2d4'); path(pr.curb, '#888'); path(pr.asphalt, '#4a4a4a')
  for (const rings of Object.values(pr.luByLu || {})) path(rings, '#2e3b2a')
  s += '</svg>'
  return s
}

const ON = buildTileGround(ribbons, opts)
const off = { ...ribbons }; delete off.tiles
const OFF = buildTileGround(off, opts)

let allSame = true
for (const [tag, wx, wy, W] of WINDOWS) {
  const pa = `${ROOT}scratch/d2-ab-${tag}-ON.png`, pb = `${ROOT}scratch/d2-ab-${tag}-OFF.png`
  await sharp(Buffer.from(render(ON, wx, wy, W))).png().toFile(pa)
  await sharp(Buffer.from(render(OFF, wx, wy, W))).png().toFile(pb)
  const A = await sharp(pa).raw().toBuffer(), B = await sharp(pb).raw().toBuffer()
  const same = A.length === B.length && A.equals(B)
  if (!same) allSame = false
  console.log(`${tag}: ${same ? 'PIXEL-IDENTICAL' : 'PIXELS DIFFER ✗'}  (${pa.replace(ROOT, '')} vs OFF)`)
}
console.log(allSame ? '\nA/B BACKSTOP PASSED — frozen-ON vs OFF pixel-identical' : '\nA/B BACKSTOP FAILED')
process.exit(allSame ? 0 : 1)
