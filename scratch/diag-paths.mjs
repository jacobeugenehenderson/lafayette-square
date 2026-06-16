import fs from 'fs'
const ROOT = '/Users/jacobhenderson/Desktop/lafayette-square.nosync'
process.env.PATHDBG='1'
const { buildTileGround } = await import(ROOT + '/src/lib/tileGround.js')
const ribbons = JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json'))
const bnd = JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json'))
const design = JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json'))
const tR = bnd.streetFade.outer + 50, sc0 = tR / bnd.radius, cx0 = bnd.center[0], cz0 = bnd.center[1]
const clip = bnd.boundary.map(([x, z]) => [cx0 + (x - cx0) * sc0, cz0 + (z - cz0) * sc0])
buildTileGround(ribbons,{stencil:clip,smooth:1.5,curbWidth:design.curbWidth,blockLandUse:design.blockLandUse||null,cornerRadiusScale:design.cornerRadiusScale??1,blockCustoms:design.blockCustoms||null,emitArtifact:true})
