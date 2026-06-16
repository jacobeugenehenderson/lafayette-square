import { jKey } from '../src/lib/smoothCenterline.js'
import fs from 'fs'
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
function metric(streets,label){
  const deg={},pt={},minE={}
  for(const s of streets){const p=s.points;if(!p)continue;for(let i=0;i<p.length;i++){const k=jKey(p[i][0],p[i][1]);const d=(i===0||i===p.length-1)?1:2;deg[k]=(deg[k]||0)+d;pt[k]=[p[i][0],p[i][1]];if(i>0)minE[k]=Math.min(minE[k]??1e9,dist(p[i-1],p[i]));if(i<p.length-1)minE[k]=Math.min(minE[k]??1e9,dist(p[i],p[i+1]))}}
  const j3=Object.keys(deg).filter(k=>deg[k]>=3)
  let stag=0,short=0;for(const k of j3){const others=j3.filter(o=>o!==k&&dist(pt[o],pt[k])<20).length;if(others>0)stag++;if(minE[k]<12)short++}
  console.log(label.padEnd(28)+' streets='+streets.length+' deg>=3 nodes='+j3.length+'  staggered(<20m pair)='+stag+'  short-edge(<12m)='+short)
  return {deg,pt,minE,j3}
}
const before=JSON.parse(fs.readFileSync('scratch/vesalius-ribbons-BEFORE.json','utf8')).streets
const after=JSON.parse(fs.readFileSync('scratch/vesalius-ribbons-AFTER.json','utf8')).streets
const trunk=JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8')).streets
console.log('=== STRUCTURAL stagger/dog-leg metric across frames ===')
const mB=metric(before,'vesalius BEFORE (old live)')
const mA=metric(after,'vesalius AFTER (P1 enriched)')
const mT=metric(trunk,'trunk CURRENT (RDP frame)')
// the 4 marked junctions: node structure in each frame
console.log('\n=== 4 marked junctions: deg>=3 nodes within 20m / min incident edge ===')
const MARKS=[['#1 Vail/Park',340,-120.6],['#2 Kennett/Miss',179.9,115.9],['#3 Mackay/Park',-48,-203.9],['#4 Waverly/Laf',-25.3,191.6]]
for(const [lab,x,z] of MARKS){
  const line=[]
  for(const [mlab,m] of [['BEF',mB],['AFT',mA],['TRK',mT]]){
    const near=m.j3.filter(k=>dist(m.pt[k],[x,z])<20)
    const minEdges=near.map(k=>m.minE[k]).filter(Number.isFinite)
    line.push(mlab+':'+near.length+'node/minE'+(minEdges.length?Math.min(...minEdges).toFixed(0):'-')+'m')
  }
  console.log('  '+lab.padEnd(18)+line.join('   '))
}
