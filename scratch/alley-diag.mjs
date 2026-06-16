import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround } from '../src/lib/tileGround.js'
import { buildPathRibbons } from '../src/lib/buildPathRibbons.js'
import { differenceRings } from '../src/lib/buildBlockGeometryV2.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const bnd = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
const pr = buildTileGround(r, { stencil: clip, smooth: 0, curbWidth: d.curbWidth, blockLandUse: d.blockLandUse||null, cornerRadiusScale: d.cornerRadiusScale??1, blockCustoms: d.blockCustoms||null })
console.log('pr.block rings:', (pr.block||[]).length)
const subtract = []
for (const rr of (pr.curb||[])) if (rr?.length>=3) subtract.push(rr)
for (const rings of Object.values(pr.treelawnByLu||{})) for (const rr of rings) if (rr?.length>=3) subtract.push(rr)
for (const rr of (pr.sidewalk||[])) if (rr?.length>=3) subtract.push(rr)
for (const rr of (pr.luByClass?.park||[])) if (rr?.length>=3) subtract.push(rr)
const blockRings = (pr.block||[]).filter(rr=>rr?.length>=3)
const parcelInteriors = (subtract.length&&blockRings.length) ? differenceRings(blockRings, subtract) : blockRings
console.log('parcelInteriors rings:', parcelInteriors.length)
const ringsByKind = buildPathRibbons(r, { intersect: parcelInteriors, alleyCap: 'square' })
for (const [kind, rings] of ringsByKind) console.log('  ', kind, '→', (rings||[]).length, 'rings')
// also UNCLIPPED for comparison
const unclipped = buildPathRibbons(r, { alleyCap: 'square' })
console.log('UNCLIPPED:')
for (const [kind, rings] of unclipped) console.log('  ', kind, '→', (rings||[]).length, 'rings')
