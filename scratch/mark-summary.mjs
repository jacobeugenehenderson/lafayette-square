import { readFileSync } from 'fs'
const marks = JSON.parse(readFileSync('cartograph/data/lafayette-square/clean/marker_strokes.json','utf8'))
const rib = JSON.parse(readFileSync('src/data/ribbons.json','utf8'))
const streets = rib.streets || []
const P = (p)=> Array.isArray(p) ? {x:p[0],z:p[1]} : p
const d2=(a,b)=>{const dx=a.x-b.x,dz=a.z-b.z;return dx*dx+dz*dz}
// nearest street + perpendicular-ish distance from a query point
function nearest(q){
  let best=null,bd=Infinity
  for(const s of streets){const pts=(s.points||[]).map(P); for(const p of pts){const dd=d2(q,p); if(dd<bd){bd=dd;best=s}}}
  return {s:best,dist:Math.sqrt(bd)}
}
// median perpendicular offset of a stroke from its nearest street's polyline
function strokeVsStreet(stroke){
  const mid=stroke[Math.floor(stroke.length/2)]
  const {s,dist}=nearest(mid)
  // measure offset at several sample points to its nearest street pt
  const offs=[]
  for(let i=0;i<stroke.length;i+=Math.max(1,Math.floor(stroke.length/12))){
    const q=stroke[i]; let bd=Infinity
    for(const p of (s.points||[]).map(P)){const dd=d2(q,p); if(dd<bd)bd=dd}
    offs.push(Math.sqrt(bd))
  }
  offs.sort((a,b)=>a-b)
  return {s,med:offs[Math.floor(offs.length/2)],min:offs[0],max:offs[offs.length-1]}
}
console.log(`strokes: ${marks.length}`)
marks.forEach((st,i)=>{
  const a=st[0],b=st[st.length-1]
  const xs=st.map(p=>p.x),zs=st.map(p=>p.z)
  const bbox=`x[${Math.min(...xs).toFixed(0)},${Math.max(...xs).toFixed(0)}] z[${Math.min(...zs).toFixed(0)},${Math.max(...zs).toFixed(0)}]`
  const {s,med,min,max}=strokeVsStreet(st)
  const ph=s?.phase?`${s.phase.kind}/${s.phase.role}`:'—'
  const hw=s?.measure?`L${s.measure.left?.pavementHW??'?'}/R${s.measure.right?.pavementHW??'?'}`:'?'
  console.log(`#${i}: ${st.length}pt  ${bbox}  start(${a.x.toFixed(0)},${a.z.toFixed(0)})→end(${b.x.toFixed(0)},${b.z.toFixed(0)})`)
  console.log(`     nearest: ${s?.name||s?.id||s?.skelId||'?'} [${ph}] pavHW ${hw} | offset med ${med.toFixed(1)}m (min ${min.toFixed(1)}, max ${max.toFixed(1)})`)
})
