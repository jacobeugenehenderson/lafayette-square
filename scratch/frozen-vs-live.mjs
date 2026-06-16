import { readFileSync } from 'fs'
import sharp from 'sharp'
import { buildTileGround, sectionOpen } from '../src/lib/tileGround.js'
const ribbons=JSON.parse(readFileSync(new URL('../src/data/ribbons.json',import.meta.url)))
const shape=JSON.parse(readFileSync(new URL('../public/baked/lafayette-square/shape.json',import.meta.url)))
const d=JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json',import.meta.url)))
const bnd=JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/neighborhood_boundary.json',import.meta.url)))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius
const clip=bnd.boundary.map(([x,z])=>[bnd.center[0]+(x-bnd.center[0])*sc0,bnd.center[1]+(z-bnd.center[1])*sc0])
const A=r=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
const sjF=r=>r.filter(g=>{const cx=g.reduce((s,p)=>s+p[0],0)/g.length,cy=g.reduce((s,p)=>s+p[1],0)/g.length;return cx>-492&&cx<-292&&cy>-290&&cy<170})
const frozen=sectionOpen(shape,d.curbWidth,{outer:'LU',inner:'SW'},clip,d.blockCustoms||null)
console.log('FROZEN shape.json (Section): S-Jeff median rings=',sjF((frozen.luByClass?.median)||[]).length,'areas=',sjF((frozen.luByClass?.median)||[]).map(r=>A(r).toFixed(0)).join(','))
for(const sm of [0,1.5]){const o=buildTileGround(ribbons,{stencil:clip,smooth:sm,curbWidth:d.curbWidth,blockLandUse:d.blockLandUse||null,cornerRadiusScale:d.cornerRadiusScale??1,blockCustoms:d.blockCustoms||null,emitArtifact:true});console.log(`LIVE smooth=${sm}: S-Jeff median rings=`,sjF((o.luByClass?.median)||[]).length,'areas=',sjF((o.luByClass?.median)||[]).map(r=>A(r).toFixed(0)).join(','))}
