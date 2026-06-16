import { readFileSync } from 'fs'
import { extractFaces } from '../src/lib/tileGround.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const streets = r.streets.filter(s=>s?.points?.length>=2)
function area(ring){let a=0;for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1}return a/2}
const t0=Date.now()
const tiles = extractFaces(streets)
console.log('extract time', Date.now()-t0,'ms')
console.log('tiles:', tiles.length)
const areas = tiles.map(area).sort((a,b)=>a-b)
console.log('smallest 5:', areas.slice(0,5).map(a=>a.toFixed(0)))
console.log('largest 5:', areas.slice(-5).map(a=>a.toFixed(0)))
console.log('total tile area:', areas.reduce((a,b)=>a+b,0).toFixed(0))
// how many distinct node positions, how many segments
