import { readFileSync } from 'fs'
import { buildPathRibbons } from '../src/lib/buildPathRibbons.js'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const area = m => { let t=0; for (const rings of m.values()) for (const ring of rings) { let a=0; for(let i=0;i<ring.length;i++){const[x1,y1]=ring[i],[x2,y2]=ring[(i+1)%ring.length];a+=x1*y2-x2*y1} t+=Math.abs(a)/2 } return t }
const vtx = m => { let n=0; for (const rings of m.values()) for (const ring of rings) n+=ring.length; return n }
for (const cap of ['square','rounded','round']) {
  const m = buildPathRibbons(r, { alleyCap: cap })
  console.log(`alleyCap=${cap.padEnd(8)} → kinds=[${[...m.keys()].join(',')}]  totalArea=${area(m).toFixed(0)}  verts=${vtx(m)}`)
}
