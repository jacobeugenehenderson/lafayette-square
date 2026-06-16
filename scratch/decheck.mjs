import { readFileSync } from 'fs'
const r=JSON.parse(readFileSync(new URL('../src/data/toy/toy-ribbons.json',import.meta.url)))
const k=p=>Math.round(p[0]*100)+','+Math.round(p[1]*100)
const deg=new Map()
for(const s of r.streets){const p=s.points;if(!p||p.length<2)continue;deg.set(k(p[0]),(deg.get(k(p[0]))||0)+1);deg.set(k(p[p.length-1]),(deg.get(k(p[p.length-1]))||0)+1)}
for(const s of r.streets){const p=s.points;if(!p||p.length<2)continue
  for(const [idx,e] of [[0,p[0]],[p.length-1,p[p.length-1]]]){
    if((deg.get(k(e))||0)!==1)continue
    const which = idx===0?'start':'end'
    console.log(`tip ${e.map(x=>x.toFixed(0)).join(',')} street="${s.name||s.skelId}" cap?`, JSON.stringify({capStart:s.capStart,capEnd:s.capEnd,caps:s.caps,capEnds:s.capEnds}))
  }}
