import fs from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const ribbons = JSON.parse(fs.readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const design = JSON.parse(fs.readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const blockCustoms = design.blockCustoms || null
const opts = { blockCustoms, smooth:0 }

function iaOf(ribbons){
  const g = buildTileGround(ribbons, opts)
  // _shapeArtifact? buildTileGround returns rings per material; shape tiles are in opts out? 
  return g
}
const g = buildTileGround(ribbons, opts)
console.log('buildTileGround keys:', Object.keys(g))
