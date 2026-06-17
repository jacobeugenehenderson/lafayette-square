// Dump an SVG of each cul-de-sac: tile.ring (grey), asphalt (dark), curb (blue),
// so the notch is visible to the eye instead of inferred from turn angles.
import { readFileSync, writeFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const out = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse || null, cornerRadiusScale: d.cornerRadiusScale ?? 1, blockCustoms: d.blockCustoms || null, emitArtifact: true })
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

// annotate: neck corners (from CULDESAC_DBG) + the probe's worst-turn notch points
const ANNO = {
  SV:   { necks: [[-416.4, -164.2]], notch: [[-400.2, -151.8]] },
  Park: { necks: [[774.9, 89.6], [777.4, 103.7]], notch: [[761.6, 100.5], [778.9, 87.6]] },
}
for (const [name, C, R] of [['SV', [-409.2, -160.1], 14], ['Park', [772.5, 97.3], 14]]) {
  const W = 700, pad = 20, sc = (W - 2 * pad) / (2 * R)
  const X = x => pad + (x - (C[0] - R)) * sc, Y = y => pad + (y - (C[1] - R)) * sc
  const path = (ring, stroke, fill, w) => `<path d="M${ring.map(p => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('L')}Z" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`
  const near = ring => ring.some(p => dist(p, C) < R)
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" fill="#1a2530"/>`
  // tiles (grey outline)
  for (const t of (out._tiles || [])) if (t.ring && near(t.ring)) svg += path(t.ring, '#667', 'none', 1)
  // asphalt (dark fill)
  for (const a of (out.asphalt || [])) if (near(a)) svg += path(a, 'none', '#2a2a2a', 0)
  // curb (blue)
  for (const c of (out.curb || [])) if (near(c)) svg += path(c, '#4af', 'none', 1.5)
  // marks: bulb centre + neck corners (orange) + probe notch points (magenta)
  svg += `<circle cx="${X(C[0])}" cy="${Y(C[1])}" r="2" fill="red"/>`
  for (const p of (ANNO[name]?.necks || [])) svg += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="5" fill="none" stroke="orange" stroke-width="2"/>`
  for (const p of (ANNO[name]?.notch || [])) svg += `<circle cx="${X(p[0])}" cy="${Y(p[1])}" r="5" fill="none" stroke="magenta" stroke-width="2"/>`
  svg += `</svg>`
  const fn = `scratch/culdesac-${name}.svg`
  writeFileSync(new URL(`../${fn}`, import.meta.url), svg)
  console.log(`wrote ${fn}`)
}
