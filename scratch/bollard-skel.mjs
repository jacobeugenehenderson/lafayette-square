import { jKey } from '../src/lib/smoothCenterline.js'
import fs from 'fs'
const ROOT='/Users/jacobhenderson/Desktop/lafayette-square.nosync'
const R=JSON.parse(fs.readFileSync(ROOT+'/src/data/ribbons.json','utf8'))
// build node degree + incident segments
const deg={},pt={},inc={}
for(const s of R.streets){const p=s.points;if(!p)continue;for(let i=0;i<p.length;i++){const k=jKey(p[i][0],p[i][1]);const d=(i===0||i===p.length-1)?1:2;deg[k]=(deg[k]||0)+d;pt[k]=[p[i][0],p[i][1]]}}
const JUNCS=[['#1 Vail/Park',340.0,-120.6],['#2 Kennett/Miss',179.9,115.9],['#3 Mackay/Park',-48.0,-203.9],['#4 Waverly/Laf',-25.3,191.6]]
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
for(const [lab,jx,jz] of JUNCS){
  const J=[jx,jz]
  console.log('\n===== '+lab+' N=['+jx+','+jz+'] =====')
  // all deg>=3 nodes within 30m (staggered junctions)
  const nodesNear=Object.keys(deg).filter(k=>deg[k]>=3&&dist(pt[k],J)<30).map(k=>({k,p:pt[k],deg:deg[k],d:dist(pt[k],J)})).sort((a,b)=>a.d-b.d)
  console.log(' deg>=3 nodes within 30m:',nodesNear.length)
  for(const n of nodesNear)console.log('    ['+n.p[0].toFixed(1)+','+n.p[1].toFixed(1)+'] deg'+n.deg+' ('+n.d.toFixed(1)+'m)')
  // all street segments passing within 15m of N: name, the local segment angle, segment length
  console.log(' street segments within 12m of N (name | seglen | local-edge-len near N):')
  for(const s of R.streets){const p=s.points;if(!p)continue
    // does any vertex lie within 14m?
    let hit=p.some(q=>dist(q,J)<14);if(!hit)continue
    // find the vertex nearest N and its incident edge lengths
    let bi=0,bd=1e9;for(let i=0;i<p.length;i++){const dd=dist(p[i],J);if(dd<bd){bd=dd;bi=i}}
    const elen=[];if(bi>0)elen.push(dist(p[bi-1],p[bi]).toFixed(1));if(bi<p.length-1)elen.push(dist(p[bi],p[bi+1]).toFixed(1))
    // total length
    let tot=0;for(let i=0;i<p.length-1;i++)tot+=dist(p[i],p[i+1])
    console.log('    '+(s.name||s.skelId||'?').padEnd(22)+(s.skelId||'').padEnd(16)+' pts='+p.length+' totLen='+tot.toFixed(0)+'m  edgesAtN=['+elen.join(',')+']m  vNearN=['+p[bi][0].toFixed(1)+','+p[bi][1].toFixed(1)+'](bd='+bd.toFixed(1)+')')
  }
}
