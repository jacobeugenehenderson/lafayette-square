import { readFileSync } from 'fs'
import { buildTileGround, extractFaces } from '../src/lib/tileGround.js'
import { smoothChain } from '../src/lib/smoothCenterline.js'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
let streets=r.streets.filter(s=>s?.points?.length>=2).map(s=>{const sm=smoothChain(s.points,0.5);return sm?{...s,points:sm}:s})
const tiles=extractFaces(streets)
const ixKey=p=>`${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)}`
const skelOf=si=>{const s=streets[si];return (s&&(s.skelId||s.name))||'?'}
// derive the per-corner keys exactly as resolveVertR does, for the FIRST tile w/ a 4-way vertex
let sampleKeys=[]
for(const t of tiles){const n=t.ring.length
  for(let i=0;i<n;i++){const eOut=t.edges[i],eIn=t.edges[(i-1+n)%n]
    if(eOut.streetIdx===eIn.streetIdx)continue   // straight-through, not a corner
    const ixk=ixKey(t.ring[i])
    const legOut=`${skelOf(eOut.streetIdx)}:${eOut.forward?'f':'b'}`
    const legIn=`${skelOf(eIn.streetIdx)}:${eIn.forward?'b':'f'}`
    const [a,b]=legOut<=legIn?[legOut,legIn]:[legIn,legOut]
    sampleKeys.push(`${ixk}|${a}|${b}`)
  }
  if(sampleKeys.length>3)break
}
console.log('sample per-corner keys derived by tileGround:')
sampleKeys.slice(0,4).forEach(k=>console.log('  ',k))
// now set an override on the first key & confirm geometry changes
function area(rings){let a=0;for(const rr of rings){let s=0;for(let i=0;i<rr.length;i++){const[x1,y1]=rr[i],[x2,y2]=rr[(i+1)%rr.length];s+=x1*y2-x2*y1}a+=Math.abs(s/2)}return a}
const base=buildTileGround(r,{smooth:0.5})
const mod=buildTileGround(r,{smooth:0.5,cornerCornerRadiusOverrides:{[sampleKeys[0]]:18}})
console.log('curb area base:',area(base.curb).toFixed(1),' per-corner override:',area(mod.curb).toFixed(1),' changed?',area(base.curb)!==area(mod.curb))
