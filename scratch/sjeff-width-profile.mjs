// SOURCE measurement (no render): the S-Jefferson median width profile = chainGap − surveyHW per station.
import { readFileSync } from 'fs'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const survey = JSON.parse(readFileSync(new URL('../cartograph/data/lafayette-square/raw/survey.json', import.meta.url))).streets
const pairs=[]; const seen=new Set(); const byId={}; for(const s of r.streets) byId[s.skelId]=s
for(const s of r.streets){ if(s.phase?.kind!=='divided'||!s.pairId) continue; const k=[s.skelId,s.pairId].sort().join('|'); if(seen.has(k))continue; seen.add(k); const m=byId[s.pairId]; if(m&&/jefferson/i.test(s.name)) pairs.push([s,m]) }
const closest=(p,poly)=>{let bd=1e9;for(let i=0;i<poly.length-1;i++){const a=poly[i],b=poly[i+1],dx=b[0]-a[0],dz=b[1]-a[1],L2=dx*dx+dz*dz;const t=L2>0?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/L2)):0;const d=Math.hypot(p[0]-(a[0]+dx*t),p[1]-(a[1]+dz*t));if(d<bd)bd=d}return bd}
for(const [A,B] of pairs){
  const sHW = survey[A.name]?.pavementHalfWidth ?? survey[B.name]?.pavementHalfWidth ?? 0
  console.log(`\n${A.name}  (pair ${A.skelId} ↔ ${B.skelId})  surveyHW=${sHW.toFixed(2)}  → carriageway ${(sHW/2).toFixed(2)}m each side`)
  const a=A.points
  const widths=[]
  for(let i=0;i<a.length;i++){ const gap=closest(a[i],B.points); widths.push(gap) }
  const med = widths.map(g=>g-sHW)
  console.log(`  chainGap range: ${Math.min(...widths).toFixed(1)}–${Math.max(...widths).toFixed(1)}m`)
  console.log(`  MEDIAN (gap−surveyHW): ${Math.min(...med).toFixed(1)}–${Math.max(...med).toFixed(1)}m   (negative = carriageways overlap → no median)`)
  console.log(`  per-station median widths: ${med.map(m=>m.toFixed(1)).join(', ')}`)
}
