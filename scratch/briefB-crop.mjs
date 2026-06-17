#!/usr/bin/env node
// SVG crop around the marked node [20,-402] — Hickory/Mackay same-corridor-join.
import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const r = buildTileGround(ribbons, {
  curbWidth: design.curbWidth, smooth: 0, blockLandUse: design.blockLandUse,
  cornerRadiusScale: design.cornerRadiusScale, cornerRadiusOverrides: design.cornerRadiusOverrides,
  cornerCornerRadiusOverrides: design.cornerCornerRadiusOverrides, blockCustoms: design.blockCustoms,
  emitArtifact: true,
})
const T = process.env.CT ? process.env.CT.split(',').map(Number) : [20, -402], R = process.env.CR ? +process.env.CR : 22
// LS frame: +x = WEST, +z = NORTH. Flip x so it reads geographically; SVG y down → flip z.
const W = 600, sc = W / (2 * R)
const X = p => (T[0] + R - p[0]) * sc      // +x west → mirror
const Y = p => (R - (p[1] - T[1])) * sc * -1 + W // z up
const yy = p => (-(p[1] - T[1]) + R) * sc
const path = (ring, close = true) => 'M' + ring.map(p => `${X(p).toFixed(1)},${yy(p).toFixed(1)}`).join(' L') + (close ? ' Z' : '')
const near = ring => ring.some(p => Math.hypot(p[0] - T[0], p[1] - T[1]) < R + 5)
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" fill="#1a1a1a"/>`
const layer = (rings, fill, stroke, sw = 0.8, op = 1) => { for (const ring of (rings || [])) if (ring.length >= 3 && near(ring)) svg += `<path d="${path(ring)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" fill-opacity="${op}"/>` }
layer(r.asphalt, '#444', '#888', 0.5)
for (const [, rings] of Object.entries(r.treelawnByLu || {})) layer(rings, '#2d4a2d', '#5a8', 0.5, 0.7)
layer(r.sidewalk, '#3a3a4a', '#88a', 0.5, 0.7)
layer(r.curb, 'none', '#ff5', 1.0)       // curb line = yellow
for (const poly of (r._jPolys || [])) { const rings = Array.isArray(poly[0][0]) ? poly : [poly]; layer(rings, 'rgba(255,80,80,0.35)', '#f44', 0.8) }
// node + marker bbox
svg += `<circle cx="${X(T)}" cy="${yy(T)}" r="4" fill="#0ff"/>`
const mb = [[4,-426],[41,-426],[41,-380],[4,-380]]
svg += `<path d="${path(mb)}" fill="none" stroke="#f0f" stroke-width="1" stroke-dasharray="4 3"/>`
// spike marker
svg += `<circle cx="${X([26.4,-399.4])}" cy="${yy([26.4,-399.4])}" r="3" fill="#f80"/>`
svg += `</svg>`
writeFileSync(new URL('./briefB-crop.svg', import.meta.url), svg)
console.log('wrote scratch/briefB-crop.svg  (cyan=node, orange=asphalt spike, magenta dashed=marker #4, red=aprons, yellow=curb)')
