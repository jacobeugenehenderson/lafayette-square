#!/usr/bin/env node
// Snapshot the FILL output (sectionPassTile) + iA per tile, for the dead-end
// mouth-wrap rollout SAFETY check. Run with HEAD code → baseline; run after the
// change → compare. Args: <out.json> [opts-json]
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const OUT = process.argv[2] || path.join(HERE, 'piece-snap.json')
const OPTS = process.argv[3] ? JSON.parse(process.argv[3]) : {}

const { buildTileGround, sectionPassTile } = await import(path.join(ROOT, 'src/lib/tileGround.js'))
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ribbons.json')))
const bnd = JSON.parse(fs.readFileSync(path.join(ROOT, 'cartograph/data/lafayette-square/neighborhood_boundary.json')))
const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/looks/lafayette-square/design.json')))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])

const pr = buildTileGround(ribbons, {
  stencil: clip, smooth: 0, curbWidth: design.curbWidth,
  blockLandUse: design.blockLandUse || null, cornerRadiusScale: design.cornerRadiusScale ?? 1,
  blockCustoms: design.blockCustoms || null, emitArtifact: true, ...OPTS,
})
const tiles = pr._shapeArtifact || []

// canonical-form a ring set: round to mm, no reorder (we want byte-stability of
// the produced geometry; rounding kills float jitter that's not a real change)
const R = (v) => Math.round(v * 1000)
const ringsKey = (rings) => (rings || []).map(r => r.map(p => `${R(p[0])},${R(p[1])}`).join(';')).join('|')

const stripMat = { outer: 'LU', inner: 'SW' }
const out = { tiles: [], mouthCount: 0 }
for (let ti = 0; ti < tiles.length; ti++) {
  const st = tiles[ti]
  // iA digest
  const iaKey = ringsKey(st.iA)
  const sp = sectionPassTile(st, design.curbWidth, stripMat, design.blockCustoms || null)
  const tlAll = Object.entries(sp.tlByLu || {}).sort().map(([k, v]) => `${k}=${ringsKey(v)}`).join('||')
  const swKey = ringsKey(sp.Wacc)
  const mouths = (st.mouths || []).map(m => ({ mid: m.mid.map(R), R: R(m.R) }))
  out.mouthCount += mouths.length
  out.tiles.push({ ti, mouths: mouths.length, mouthMids: mouths.map(m => m.mid.join(',')), iaKey, swKey, tlAll })
}
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(`tiles=${out.tiles.length}  totalMouths=${out.mouthCount}  → ${path.relative(ROOT, OUT)}`)
