// READ-ONLY — confirm (1) the seam bids NO corner/ADA in sectionPass, (2) grid
// tiles unchanged. Compares cornerSet pads near the seam + a grid tile's iA.
import { readFileSync } from 'fs'
import { buildTileGround, sectionPass } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius
const clip = bnd.boundary.map(([x, z]) => [bnd.center[0] + (x - bnd.center[0]) * sc0, bnd.center[1] + (z - bnd.center[1]) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: 1, blockCustoms: d.blockCustoms||null, emitArtifact: true })
const T16 = pr._shapeArtifact[16]
// runs of T16: confirm roadId present + the seam roadId match
console.log('tile16 runs roadId:', T16.runs.map(x=>`${x.skelId}->${x.roadId}`).join('  '))
// fillets near the seam (these become ADA pad anchors) — count near [521,-407]
const seam=[521,-407]
const near=(p,R)=>p&&Math.hypot(p[0]-seam[0],p[1]-seam[1])<R
console.log('frozen fillets near seam:', (T16.fillets||[]).filter(f=>near(f.apex,12)).length, '(was the bump source)')
