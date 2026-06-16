import { smoothChain } from '../src/lib/smoothCenterline.js'
import fs from 'fs'
const ribbons = JSON.parse(fs.readFileSync('./src/data/ribbons.json','utf8'))
const osm = JSON.parse(fs.readFileSync('./cartograph/data/lafayette-square/raw/osm.json','utf8'))
const skel = JSON.parse(fs.readFileSync('./cartograph/data/lafayette-square/clean/skeleton.json','utf8'))

const len = pts => { let s=0; for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];s+=Math.hypot((b[0]??b.x)-(a[0]??a.x),(b[1]??b.z)-(a[1]??a.z))} return s }
function report(label, ribStreet){
  if(!ribStreet){console.log(label,'NOT FOUND');return}
  const p = ribStreet.points
  const sm = smoothChain(p, 0.5)
  const L = len(p)
  console.log(`${label}: ribbons=${p.length}pts  smoothChain(0.5)=${sm?sm.length:'null(untouched)'}pts  len=${L.toFixed(0)}m  spacing≈${(L/(p.length-1)).toFixed(1)}m/seg  smoothedSpacing≈${sm?(L/(sm.length-1)).toFixed(1):'-'}m`)
}
const find = re => ribbons.streets.filter(s=>re.test(s.name||''))
// Benton loop (the 29-pt one)
const bentons = find(/benton/i).sort((a,b)=>b.points.length-a.points.length)
report('Benton LOOP', bentons[0])
report('Benton stub', bentons[1])

// A straight grid street — pick longest residential with few-but-some pts, name match
;['Mississippi','Park Ave','Lafayette Ave','Hickory','Kennett','Dolman','Truman'].forEach(nm=>{
  const s = find(new RegExp(nm,'i')).sort((a,b)=>b.points.length-a.points.length)[0]
  if(s) report('STREET '+nm, s)
})
