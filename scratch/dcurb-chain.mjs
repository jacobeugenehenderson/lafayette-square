import { readFileSync } from 'fs'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url), 'utf8'))
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])
// find Lafayette carriageways and dump points near [181,220] (mark#2) and [-355,138] (mark#3 input)
const lafs = ribbons.streets.filter(s=>/lafayette/i.test(s.name||''))
console.log('Lafayette streets:', lafs.map(s=>`${s.skelId} pair=${s.pairId||'-'} phase=${s.phase?.role||'-'} n=${s.points.length}`).join('\n  '))
function turnAt(pts,i){const a=pts[i-1],v=pts[i],b=pts[i+1];if(!a||!b)return null;const e1=dist(a,v),e2=dist(v,b);if(e1<1e-6||e2<1e-6)return 0;const d=((v[0]-a[0])/e1)*((b[0]-v[0])/e2)+((v[1]-a[1])/e1)*((b[1]-v[1])/e2);return Math.acos(Math.max(-1,Math.min(1,d)))*180/Math.PI}
for(const M of [[181,220],[-355,138]]){
  console.log(`\n=== chain points within 30m of [${M}] ===`)
  for(const s of lafs){
    for(let i=0;i<s.points.length;i++){
      if(dist(s.points[i],M)<30){
        const t=turnAt(s.points,i)
        const e1=i>0?dist(s.points[i-1],s.points[i]):0, e2=i<s.points.length-1?dist(s.points[i],s.points[i+1]):0
        console.log(`  ${s.skelId}[${i}] [${s.points[i][0].toFixed(1)},${s.points[i][1].toFixed(1)}] turn=${t==null?'end':t.toFixed(0)+'°'} e=(${e1.toFixed(1)},${e2.toFixed(1)})`)
      }
    }
  }
}
