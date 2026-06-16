import { readFileSync } from 'fs'
import { sectionOpen } from '../src/lib/tileGround.js'
const t = JSON.parse(readFileSync(new URL('../public/baked/lafayette-square/shape.json', import.meta.url)))
const d = JSON.parse(readFileSync(new URL('../public/looks/lafayette-square/design.json', import.meta.url)))
const sg = sectionOpen(t, d.curbWidth, { outer:'LU', inner:'SW' }, null, d.blockCustoms||null)
const med = (sg.luByClass && sg.luByClass.median) || []
const A=r=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return Math.abs(a)/2}
console.log('Section (frozen shape.json) median: %d rings, %d m²', med.length, med.reduce((s,r)=>s+A(r),0).toFixed(0))
