// claims-deadend-look.mjs — RENDER THE NINE. Read-only.
//
// The nine folds that miss a mouth corner (== the nine whose leg runs through
// the mouth; set-identical, PIPELINE-CLAIMS C4). Renders each tip's FILL to a
// PNG so it can be LOOKED AT rather than sized off a counter.
//
// ⭐ WITH THE SCENE'S AUTHORED STATE LOADED (`blockCustoms`), per R1a / Layer 0 q3.
//   `ab-cap.mjs`, which this reuses, passes blockLandUse but NOT blockCustoms —
//   the same blindness that made litmus-curb-parallel score authored width as damage.
//   Pass `bare` as argv[2] to render the un-authored state for comparison.
//
//   node scratch/claims-deadend-look.mjs [authored|bare]
import { readFileSync, writeFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'

const MODE = process.argv[2] === 'bare' ? 'bare' : 'authored'

// The nine, from scratch/claims-deadend-set-decomposition.mjs.
// 'genuine' = two mouth passes, one missing a corner. 'onepass' = only one pass
// presented at all — a DIFFERENT condition sharing the counter (C5).
const NINE = [
  ['allen-avenue-0', 'start'], ['carroll-street-0', 'end'], ['geyer-avenue-0', 'end'],
  ['mackay-place-1', 'start'], ['park-avenue-3', 'end'], ['south-13th-street', 'end'],
  ['south-18th-street-3', 'end'], ['waverly-place-1', 'end'], ['waverly-place-1', 'start'],
]

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))

const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])

const orig = console.log; console.log = () => {}
const pr = buildTileGround(r, {
  stencil: clip,
  curbWidth: d.curbWidth,
  smooth: d.streetSmooth ?? 0.5,
  blockLandUse: d.blockLandUse,
  blockCustoms: MODE === 'authored' ? (d.blockCustoms || null) : null,
})
console.log = orig

// tip coords off the frozen faces
const tipOf = (skelId, capEnd) => {
  for (const t of r.tiles) for (const c of (t.caps || []))
    if (c.skelId === skelId && c.capEnd === capEnd) return t.ring[c.vertexIdx]
  return null
}

const W = 60, px = 1000
const render = (tag, cxw, cyw) => {
  const minx = cxw - W / 2, miny = cyw - W / 2, sc = px / W
  const X = (x) => ((x - minx) * sc).toFixed(1), Y = (y) => ((y - miny) * sc).toFixed(1)
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
  const path = (rings, fill) => {
    let dd = ''
    for (const rr of (rings || [])) {
      if (!rr || rr.length < 3) continue
      dd += rr.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z '
    }
    if (dd) s += `<path d="${dd}" fill="${fill}" stroke="#000" stroke-width="0.3" stroke-opacity="0.5"/>`
  }
  for (const rings of Object.values(pr.treelawnByLu)) path(rings, '#5aa02a')
  path(pr.sidewalk, '#e8e2d4'); path(pr.curb, '#888'); path(pr.asphalt, '#4a4a4a')
  // crosshair on the tip itself so the mouth is unambiguous
  s += `<circle cx="${X(cxw)}" cy="${Y(cyw)}" r="4" fill="none" stroke="#ff3b3b" stroke-width="2"/>`
  s += `<text x="12" y="28" fill="#ff8" font-family="monospace" font-size="20">${tag} [${MODE}]</text>`
  s += '</svg>'
  const out = new URL(`./look-deadend-${tag}-${MODE}.png`, import.meta.url)
  writeFileSync(new URL(`./look-deadend-${tag}-${MODE}.svg`, import.meta.url), s)
  return sharp(Buffer.from(s)).png().toFile(out.pathname)
}

for (const [skelId, capEnd] of NINE) {
  const tip = tipOf(skelId, capEnd)
  if (!tip) { console.log(`⛔ no cap found: ${skelId}[${capEnd}]`); continue }
  await render(`${skelId}-${capEnd}`, tip[0], tip[1])
  console.log(`wrote look-deadend-${skelId}-${capEnd}-${MODE}.png   @ ${tip[0].toFixed(1)}, ${tip[1].toFixed(1)}`)
}
console.log(`\n${NINE.length} tips, mode=${MODE}. blockCustoms ${MODE === 'authored' ? 'LOADED' : 'NULL (bare defaults)'}.`)
