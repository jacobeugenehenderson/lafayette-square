import { buildTileGround } from '../src/lib/tileGround.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
const bnd=JSON.parse(fs.readFileSync(ROOT+'/cartograph/data/lafayette-square/neighborhood_boundary.json','utf8'))
const d=JSON.parse(fs.readFileSync(ROOT+'/public/looks/lafayette-square/design.json','utf8'))
const tR=bnd.streetFade.outer+50,sc0=tR/bnd.radius,cx=bnd.center[0],cz=bnd.center[1]
const clip=bnd.boundary.map(([x,z])=>[cx+(x-cx)*sc0,cz+(z-cz)*sc0])
const g=buildTileGround(R,{stencil:clip,curbWidth:d.curbWidth,smooth:0,blockLandUse:d.blockLandUse,cornerRadiusScale:d.cornerRadiusScale??1,emitArtifact:true})
const sa=r=>{let a=0;for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1}return a/2}
const N=[340,-120.6]
const st=g._shapeArtifact[10]
// pick the iA ring, find vertices within 22m of N, print in ring-index order with turn+sign
for(const ia of st.iA){
  if(!ia.some(p=>Math.hypot(p[0]-N[0],p[1]-N[1])<22))continue
  const sign=sa(ia)>=0?1:-1
  console.log('iA ring '+ia.length+'pts, vertices within 22m of N=[340,-120.6], ring-order:')
  for(let i=0;i<ia.length;i++){
    const b=ia[i];if(Math.hypot(b[0]-N[0],b[1]-N[1])>22)continue
    const a=ia[(i-1+ia.length)%ia.length],c=ia[(i+1)%ia.length]
    let ix=b[0]-a[0],iz=b[1]-a[1],ox=c[0]-b[0],oz=c[1]-b[1]
    const li=Math.hypot(ix,iz),lo=Math.hypot(ox,oz);ix/=li;iz/=li;ox/=lo;oz/=lo
    const cross=ix*oz-iz*ox
    const turn=Math.acos(Math.max(-1,Math.min(1,ix*ox+iz*oz)))*180/Math.PI
    const cvx=(cross*sign>0)?'CVX':'CNCV'
    const flag=turn>35?(cvx==='CNCV'?'  <<< THORN(concave)':'  <<< (convex)'):''
    console.log('  i='+i+' ['+b[0].toFixed(2)+','+b[1].toFixed(2)+'] d='+Math.hypot(b[0]-N[0],b[1]-N[1]).toFixed(1)+'m turn='+turn.toFixed(0)+'° '+cvx+flag)
  }
}
