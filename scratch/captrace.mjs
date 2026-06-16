globalThis.__CAPTRACE = true
import { readFileSync } from 'fs'
import { buildTileGround } from '../src/lib/tileGround.js'
const r=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
buildTileGround(r,{stencil:clip,curbWidth:d.curbWidth,smooth:d.streetSmooth??0.5,blockLandUse:d.blockLandUse})
