// Mercator — dump the park-corner block ring + the tile's aFill near the corner
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, scl = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * scl, cz + (z - cz) * scl])
const base = { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse, cornerRadiusScale: 1, cornerCornerRadiusOverrides: d.cornerCornerRadiusOverrides || null, blockCustoms: d.blockCustoms || null }

const pr = buildTileGround(r, base)
const inWin = p => p[0] > 150 && p[0] < 270 && p[1] > 190 && p[1] < 240

const ring = pr.block[20]
console.log('ring#20 vertices in corner window (x 150-270, z 190-240):')
let prev = null, run = []
ring.forEach((p, i) => {
  if (inWin(p)) run.push(`${i}:(${p[0].toFixed(1)},${p[1].toFixed(1)})`)
  else if (run.length) { console.log(' ', run.join(' ')); run = [] }
})
if (run.length) console.log(' ', run.join(' '))

// the corresponding shapeTile: find via _tiles + recompute alignment — instead
// use _perRunMeta to find the tile with a lafayette-avenue-6/right run + mississippi/left run
const tiles = pr._tiles
pr._perRunMeta.forEach((runs, ti) => {
  const ids = runs.map(rm => `${rm.skelId}/${rm.side}`)
  if (ids.some(s => s === 'lafayette-avenue-6/right') && ids.some(s => s.startsWith('mississippi-avenue'))) {
    console.log(`\ntile#${ti} runs:`, ids.join(' | '))
    for (const rm of runs) {
      if (rm.skelId !== 'lafayette-avenue-6' && rm.skelId !== 'mississippi-avenue') continue
      const m = rm.measure?.[rm.side]
      console.log(`  run ${rm.skelId}/${rm.side} segOrd:${rm.segOrd} pavementHW:${m?.pavementHW?.toFixed(2)} poly[0]:(${rm.poly[0][0].toFixed(1)},${rm.poly[0][1].toFixed(1)}) poly[-1]:(${rm.poly[rm.poly.length-1][0].toFixed(1)},${rm.poly[rm.poly.length-1][1].toFixed(1)}) pts:${rm.poly.length}`)
    }
  }
})
