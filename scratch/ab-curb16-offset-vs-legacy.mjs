// READ-ONLY — the brief's "offset-vs-legacy test, set up but not run" (tile 16).
// Run buildTileGround twice: DEFAULT (offsetRingVariable) vs iaOffset:false
// (legacy ring−aFill carve). Compare tile 16's frozen iA around the bump
// [521,-407]: max turn angle (the notch/bump), and a crop render. Does legacy
// come out fold-free at tile 16 (it's NOT a divided tile → no d-bulge)?
import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const cw = d.curbWidth
const base = { stencil: clip, smooth: 0, curbWidth: cw, blockLandUse: d.blockLandUse || null, cornerRadiusScale: d.cornerRadiusScale ?? 1, blockCustoms: d.blockCustoms || null, emitArtifact: true }

const OFF = buildTileGround(r, { ...base })._shapeArtifact[16]
const LEG = buildTileGround(r, { ...base, iaOffset: false })._shapeArtifact[16]

// turn-angle profile of a ring, flag verts turning > THR, near a focus point
function profile(ring, focus, R = 12) {
  const n = ring.length, hot = []
  let maxTurn = 0, maxAt = null
  for (let i = 0; i < n; i++) {
    const a = ring[(i - 1 + n) % n], v = ring[i], b = ring[(i + 1) % n]
    const inx = v[0] - a[0], iny = v[1] - a[1], ox = b[0] - v[0], oy = b[1] - v[1]
    const li = Math.hypot(inx, iny) || 1, lo = Math.hypot(ox, oy) || 1
    const dot = (inx / li) * (ox / lo) + (iny / li) * (oy / lo)
    const turn = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI
    const nearFocus = Math.hypot(v[0] - focus[0], v[1] - focus[1]) < R
    if (nearFocus) { if (turn > maxTurn) { maxTurn = turn; maxAt = v } ; if (turn > 12) hot.push([v[0].toFixed(1), v[1].toFixed(1), turn.toFixed(0)]) }
  }
  return { n, maxTurn: maxTurn.toFixed(1), maxAt: maxAt ? maxAt.map(x => x.toFixed(1)) : null, hotCount: hot.length, hot }
}
const focus = [521, -407]
for (const [nm, T] of [['OFFSET (current)', OFF], ['LEGACY (ring−aFill)', LEG]]) {
  console.log(`\n=== ${nm} — tile 16 iA ===`)
  console.log(`  rings=${T.iA.length}  cw=${cw} tl=${T.tl} sw=${T.sw}`)
  for (const ring of T.iA) {
    const p = profile(ring, focus)
    console.log(`  ring(${ring.length}pts) near[521,-407]: maxTurn=${p.maxTurn}° @${p.maxAt}  hot(>12°)=${p.hotCount}`)
    if (p.hot.length) console.log('     ' + p.hot.map(h => `(${h[0]},${h[1]}:${h[2]}°)`).join(' '))
  }
}

// crop both around the bump
async function crop(name, rings, cx, cy, W, ppx = 1100) {
  const sc = ppx / W, minx = cx - W / 2, miny = cy - W / 2
  const X = x => ((x - minx) * sc).toFixed(1), Y = y => ((y - miny) * sc).toFixed(1)
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${ppx}" height="${ppx}" style="background:#fff">`
  for (const rr of rings) { if (!rr || rr.length < 2) continue; s += `<path d="${rr.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ')} Z" fill="#eee" stroke="#000" stroke-width="1.5"/>` }
  for (const rr of rings) for (const p of rr) s += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="2" fill="#06c"/>`
  s += `<circle cx="${X(cx)}" cy="${Y(cy)}" r="5" fill="magenta"/>`
  s += '</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./${name}.png`, import.meta.url).pathname)
  console.log('wrote ' + name + '.png')
}
await crop('ab-curb16-offset', OFF.iA, 521, -407, 40)
await crop('ab-curb16-legacy', LEG.iA, 521, -407, 40)
