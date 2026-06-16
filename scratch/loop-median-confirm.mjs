// Confirm the derive.js [E2-loop] block reproduces the validated Benton grass.
// Replicates the EXACT detection/inset arithmetic I added to derive.js, run
// against the in-tree ribbons.json, then renders the neighborhood. No pipeline
// run, no artifact writes — pure read + render.
import { readFileSync } from 'fs'
import sharp from 'sharp'
import clipperLib from 'clipper-lib'
import { buildTileGround } from '../src/lib/tileGround.js'

const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))

// STANDARDS values (from cartograph/standards.js)
const CURB_W = 0.1524, SW_W = 1.524, DEFAULT_HW = 4.0
const SCALE = 1000, toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) })
const { ClipperOffset, JoinType, EndType, Clipper } = clipperLib

// ── the [E2-loop] block, verbatim arithmetic ──
const LOOP_SNAP = 2.0, LOOP_MIN_MED = 20
const overlayLoops = {}   // no overrides in this confirm
const emitted = []
for (const S of r.streets) {
  const pts = S.points.map(p => [p[0], p[1]])
  if (pts.length < 4) continue
  const gap = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1])
  if (gap > LOOP_SNAP) continue
  const loopId = S.skelId || S.name
  const interior = overlayLoops[loopId]?.interior || 'median'
  if (interior !== 'median') continue
  pts[pts.length - 1] = [pts[0][0], pts[0][1]]
  const hw = S.measure?.left?.pavementHW || S.measure?.right?.pavementHW || DEFAULT_HW
  const inset = hw + CURB_W + SW_W
  const co = new ClipperOffset(); co.ArcTolerance = 0.01 * SCALE
  co.AddPath(pts.map(toC), JoinType.jtRound, EndType.etClosedPolygon)
  const out = []; co.Execute(out, -inset * SCALE)
  let best = null, bestA = 0
  for (const ring of out) { const a = Math.abs(Clipper.Area(ring)); if (a > bestA) { bestA = a; best = ring } }
  if (!best || bestA / (SCALE * SCALE) < LOOP_MIN_MED) { console.log(`  skip ${loopId} (island ${(bestA/(SCALE*SCALE)).toFixed(0)}m² < ${LOOP_MIN_MED})`); continue }
  emitted.push({ kind: 'median', name: S.name, loopId, ring: best.map(p => [p.X / SCALE, p.Y / SCALE]) })
  console.log(`  EMIT median ${loopId} "${S.name}" island=${(bestA/(SCALE*SCALE)).toFixed(0)}m² inset=${inset.toFixed(2)}m verts=${best.length}`)
}
r.medians = [...(r.medians || []), ...emitted]
console.log(`emitted ${emitted.length} loop medians`)

// ── render the whole neighborhood ──
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const pr = buildTileGround(r, { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse })

// full-neighborhood frame
const allx = [], ally = []
for (const rings of [pr.asphalt, pr.sidewalk, pr.curb]) for (const rr of (rings||[])) for (const p of rr) { allx.push(p[0]); ally.push(p[1]) }
const minx = Math.min(...allx), maxx = Math.max(...allx), miny = Math.min(...ally), maxy = Math.max(...ally)
const W = Math.max(maxx - minx, maxy - miny), px = 1600, sc = px / W
const X = x => ((x - minx) * sc).toFixed(1), Y = y => ((y - miny) * sc).toFixed(1)
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
const path = (rings, fill) => { let dd = ''; for (const rr of (rings || [])) { if (!rr || rr.length < 3) continue; dd += rr.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' } if (dd) s += `<path d="${dd}" fill="${fill}" stroke="#000" stroke-width="0.2" stroke-opacity="0.3"/>` }
path(pr.asphalt, '#3a3a3a')
for (const [k, rings] of Object.entries(pr.luByClass || {})) path(rings, k === 'median' ? '#6aa84f' : '#2a2218')
for (const rings of Object.values(pr.treelawnByLu)) path(rings, '#6aa84f')
path(pr.sidewalk, '#e8e2d4'); path(pr.curb, '#888')
s += '</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./loop-median-confirm.png', import.meta.url).pathname)
console.log('wrote loop-median-confirm.png; median class present:', !!pr.luByClass?.median)
