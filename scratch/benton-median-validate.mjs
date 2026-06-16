import { readFileSync } from 'fs'
import sharp from 'sharp'
import clipperLib from 'clipper-lib'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const SCALE = 1000, toC = p => ({ X: Math.round(p[0] * SCALE), Y: Math.round(p[1] * SCALE) }), fromC = p => [p.X / SCALE, p.Y / SCALE]

// ── inject the Benton loop interior as a kind:'median' (the agent's fix) ──
const body = r.streets.find(s => (s.skelId || s.name) === 'benton-place-1')
const pts = body.points.map(p => [p[0], p[1]])
pts[pts.length - 1] = [pts[0][0], pts[0][1]]        // SNAP closed (the 3cm gap)
const hw = body.measure?.left?.pavementHW || 3.96
const inset = hw + d.curbWidth + 1.5                 // curb-to-inner-sidewalk = the grass edge
const { ClipperOffset, JoinType, EndType } = clipperLib
const co = new ClipperOffset(2, 0.05 * SCALE)
co.AddPath(pts.map(toC), JoinType.jtRound, EndType.etClosedPolygon)
const out = []; co.Execute(out, -inset * SCALE)
const medRing = out.map(p => p.map(fromC)).sort((a, b) => b.length - a.length)[0]
console.log('median ring verts', medRing?.length, 'inset', inset.toFixed(2), 'm')
r.medians = [...(r.medians || []), { kind: 'median', name: 'benton-place', ring: medRing }]

// ── build + render ──
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx = bnd.center[0], cz = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx + (x - cx) * sc0, cz + (z - cz) * sc0])
const pr = buildTileGround(r, { stencil: clip, curbWidth: d.curbWidth, smooth: 0, blockLandUse: d.blockLandUse })
const cxw = 85, cyw = -310, W = 230, minx = cxw - W / 2, miny = cyw - W / 2, px = 1100, sc = px / W
const X = x => ((x - minx) * sc).toFixed(1), Y = y => ((y - miny) * sc).toFixed(1)
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" style="background:#161616">`
const path = (rings, fill) => { let dd = ''; for (const rr of (rings || [])) { if (!rr || rr.length < 3) continue; dd += rr.map((p, i) => (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1])).join(' ') + ' Z ' } if (dd) s += `<path d="${dd}" fill="${fill}" stroke="#000" stroke-width="0.3" stroke-opacity="0.4"/>` }
path(pr.asphalt, '#3a3a3a')
for (const [k, rings] of Object.entries(pr.luByClass || {})) path(rings, k === 'median' ? '#6aa84f' : '#2a2218')
for (const rings of Object.values(pr.treelawnByLu)) path(rings, '#6aa84f')
path(pr.sidewalk, '#e8e2d4'); path(pr.curb, '#888')
s += '</svg>'
await sharp(Buffer.from(s)).png().toFile(new URL('./benton-median-validate.png', import.meta.url).pathname)
console.log('wrote benton-median-validate.png; median class present:', !!pr.luByClass?.median)
