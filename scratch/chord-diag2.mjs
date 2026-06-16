import { smoothChain } from '../src/lib/smoothCenterline.js'
import fs from 'fs'
const ribbons = JSON.parse(fs.readFileSync('./src/data/ribbons.json','utf8'))
const turn = (p,i)=>{const ax=p[i][0]-p[i-1][0],az=p[i][1]-p[i-1][1],bx=p[i+1][0]-p[i][0],bz=p[i+1][1]-p[i][1];const la=Math.hypot(ax,az),lb=Math.hypot(bx,bz);if(la<1e-6||lb<1e-6)return 0;let c=(ax*bx+az*bz)/(la*lb);c=Math.max(-1,Math.min(1,c));return Math.acos(c)*180/Math.PI}
function angles(label, p){
  const ts=[]; for(let i=1;i<p.length-1;i++) ts.push(turn(p,i))
  ts.sort((a,b)=>b-a)
  const seglens=[]; for(let i=1;i<p.length;i++) seglens.push(Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]))
  seglens.sort((a,b)=>a-b)
  console.log(`\n${label}: ${p.length}pts`)
  console.log('  turn° top8:', ts.slice(0,8).map(x=>x.toFixed(1)).join(' '))
  console.log('  #verts turn>30°(corner-split):', ts.filter(x=>x>30).length, ' >90°(near-spike):', ts.filter(x=>x>90).length, ' 1-30°(gentle, drives ×4):', ts.filter(x=>x>1&&x<=30).length, ' <1°(straight):', ts.filter(x=>x<=1).length)
  console.log('  seglen min/med/max:', seglens[0].toFixed(1), seglens[Math.floor(seglens.length/2)].toFixed(1), seglens[seglens.length-1].toFixed(1))
}
const find=re=>ribbons.streets.filter(s=>re.test(s.name||''))
const benton=find(/benton/i).sort((a,b)=>b.points.length-a.points.length)[0]
angles('Benton LOOP', benton.points)
angles('Mississippi', find(/mississippi/i).sort((a,b)=>b.points.length-a.points.length)[0].points)
angles('Lafayette Ave', find(/lafayette ave/i).sort((a,b)=>b.points.length-a.points.length)[0].points)

// Dead-ends: streets whose endpoint is shared by no other street (degree-1)
const key=(x,z)=>`${x.toFixed(1)},${z.toFixed(1)}`
const deg={}; for(const s of ribbons.streets){const p=s.points;if(!p||p.length<2)continue;for(const e of [p[0],p[p.length-1]]){const k=key(e[0],e[1]);deg[k]=(deg[k]||0)+1}}
let deadEnds=[]
for(const s of ribbons.streets){const p=s.points;if(!p||p.length<2)continue;for(const[idx,e]of [[0,p[0]],[1,p[p.length-1]]]){if(deg[key(e[0],e[1])]===1)deadEnds.push({name:s.name,pts:p.length,where:idx?'end':'start',caps:s.caps})}}
console.log('\n=== DEAD-ENDS (degree-1 endpoints):', deadEnds.length)
deadEnds.slice(0,15).forEach(d=>console.log(' ', d.name||'(unnamed)', '| pts:', d.pts, '| caps:', JSON.stringify(d.caps)))
