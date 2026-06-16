// Crop the three closed loops with the emitted loop-medians, to judge whether
// the tiny turning-circle bulbs (Saint Vincent, Park Place) want grass or paving.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import clipperLib from 'clipper-lib'
import { buildTileGround } from '../src/lib/tileGround.js'

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const CURB_W = 0.1524, SW_W = 1.524, DEFAULT_HW = 4.0
const SCALE = 1000, toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const { ClipperOffset, JoinType, EndType, Clipper } = clipperLib

const LOOP_SNAP = 2.0, LOOP_MIN_MED = 20
const emitted = []
for (const S of r.streets) {
  const pts = S.points.map(p => [p[0], p[1]])
  if (pts.length < 4) continue
  if (Math.hypot(pts[0][0] - pts[pts.length-1][0], pts[0][1] - pts[pts.length-1][1]) > LOOP_SNAP) continue
  pts[pts.length - 1] = [pts[0][0], pts[0][1]]
  const hw = S.measure?.left?.pavementHW || S.measure?.right?.pavementHW || DEFAULT_HW
  const inset = hw + CURB_W + SW_W
  const co = new ClipperOffset(); co.ArcTolerance = 0.01 * SCALE
  co.AddPath(pts.map(toC), JoinType.jtRound, EndType.etClosedPolygon)
  const out = []; co.Execute(out, -inset * SCALE)
  let best = null, bestA = 0
  for (const ring of out) { const a = Math.abs(Clipper.Area(ring)); if (a > bestA) { bestA = a; best = ring } }
  if (!best || bestA / (SCALE*SCALE) < LOOP_MIN_MED) continue
  emitted.push({ kind: 'median', name: S.name, loopId: S.skelId||S.name, ring: best.map(p => [p.X/SCALE, p.Y/SCALE]) })
}
r.medians = [...(r.medians || []), ...emitted]

const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(r, { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse })

async function crop(name, cx, cy, W) {
  const px = 900, sc = px / W, minx = cx - W/2, miny = cy - W/2
  const X = x => ((x - minx) * sc).toFixed(1), Y = y => ((y - miny) * sc).toFixed(1)
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
  const path = (rings, fill) => { let dd=''; for (const rr of (rings||[])){ if(!rr||rr.length<3)continue; dd+=rr.map((p,i)=>(i?'L':'M')+X(p[0])+' '+Y(p[1])).join(' ')+' Z ' } if(dd) s+=`<path d="${dd}" fill="${fill}" stroke="#000" stroke-width="0.3" stroke-opacity="0.4"/>` }
  path(pr.asphalt, '#3a3a3a')
  for (const [k, rings] of Object.entries(pr.luByClass||{})) path(rings, k==='median'?'#6aa84f':'#2a2218')
  for (const rings of Object.values(pr.treelawnByLu)) path(rings, '#6aa84f')
  path(pr.sidewalk, '#e8e2d4'); path(pr.curb, '#888')
  s += '</svg>'
  await sharp(Buffer.from(s)).png().toFile(new URL(`./loop-crop-${name}.png`, import.meta.url).pathname)
  console.log('wrote loop-crop-'+name+'.png')
}
await crop('benton', 85, -310, 90)
await crop('saintvincent', -409, -160, 45)
await crop('parkplace', 772, 97, 45)
