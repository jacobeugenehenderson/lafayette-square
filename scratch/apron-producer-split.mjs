import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
import { buildTileGround } from '../src/lib/tileGround.js'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ribbons = JSON.parse(fs.readFileSync(path.join(ROOT,'src/data/ribbons.json'),'utf8'))
const design = JSON.parse(fs.readFileSync(path.join(ROOT,'public/looks/lafayette-square/design.json'),'utf8'))
const rl = console.log; console.log = () => {}
const pr = buildTileGround(ribbons, { curbWidth:0.381, blockCustoms:design.blockCustoms||null, blockLandUse:design.blockLandUse||null,
  cornerRadiusScale:design.cornerRadiusScale??1, cornerRadiusOverrides:design.cornerRadiusOverrides||null,
  cornerCornerRadiusOverrides:design.cornerCornerRadiusOverrides||null, emitArtifact:true })
console.log = rl
console.log('[A07] ' + (pr._curbProducers?.line || 'n/a'))
const art = pr._shapeArtifact || []
console.log('artifact tiles:', art.length, '· with iA:', art.filter(t=>t.iA?.length).length, '· with iaEdge on iA verts:', art.filter(t=>t.iaEdge?.length).length)
console.log('artifact tile keys:', Object.keys(art[0]||{}).join(', '))
