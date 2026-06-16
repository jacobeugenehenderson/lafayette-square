import { readFileSync } from 'fs'
import clipperLib from 'clipper-lib'
const SCALE=1000
function uA(rings){const {Clipper,ClipType,PolyType,PolyFillType}=clipperLib;const c=new Clipper();for(const r of rings){const p=Array.isArray(r[0])?r:r.map(q=>[q.x,q.z]);if(p.length>=3)c.AddPath(p.map(q=>({X:Math.round(q[0]*SCALE),Y:Math.round(q[1]*SCALE)})),PolyType.ptSubject,true)}const o=[];c.Execute(ClipType.ctUnion,o,PolyFillType.pftNonZero,PolyFillType.pftNonZero);let a=0;for(const p of o){let s=0;for(let i=0;i<p.length;i++){const q=p[i],r=p[(i+1)%p.length];s+=q.X*r.Y-r.X*q.Y}a+=s/2}return Math.abs(a)/SCALE/SCALE}
const { buildTileGround } = await import('/Users/jacobhenderson/Desktop/lafayette-square.nosync/src/lib/tileGround.js')
const R=(p)=>JSON.parse(readFileSync('/Users/jacobhenderson/Desktop/lafayette-square.nosync/'+p))
const ribbons=R('src/data/ribbons.json'),design=R('public/looks/lafayette-square/design.json'),bnd=R('cartograph/data/lafayette-square/neighborhood_boundary.json')
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const g=buildTileGround(ribbons,{stencil:clip,curbWidth:design.curbWidth,smooth:0,blockLandUse:design.blockLandUse,cornerRadiusScale:design.cornerRadiusScale??1,cornerRadiusOverrides:design.cornerRadiusOverrides,cornerCornerRadiusOverrides:design.cornerCornerRadiusOverrides,blockCustoms:design.blockCustoms})
let luTot=0;for(const k of Object.keys(g.luByClass))luTot+=uA(g.luByClass[k])
let tlTot=0;for(const k of Object.keys(g.treelawnByLu))tlTot+=uA(g.treelawnByLu[k])
console.log('lu footprint',luTot.toFixed(1),'(baseline ~2718468) | treelawn',tlTot.toFixed(1),'| block',uA(g.block).toFixed(1),'| cornerFillets',Object.keys(g.cornerFillets).length)
