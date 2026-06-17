import { readFileSync } from 'fs'
const ribbons = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url), 'utf8'))
const get=n=>ribbons.streets.find(s=>s.skelId===n)
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],len=v=>Math.hypot(v[0],v[1]),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]
function clen(p){const s=[0];for(let i=1;i<p.length;i++)s.push(s[i-1]+len(sub(p[i],p[i-1])));return s}
// for a chain, compute the two offset edges (left=+hw_L, right=-hw_R) per vertex via local tangent
function offsetEdges(pts,hwL,hwR){
  const n=pts.length,L=[],R=[]
  for(let i=0;i<n;i++){
    const a=pts[Math.max(0,i-1)],b=pts[Math.min(n-1,i+1)]
    const t=sub(b,a);const tl=len(t)||1;const u=[t[0]/tl,t[1]/tl];const nm=[-u[1],u[0]]
    L.push([pts[i][0]+nm[0]*hwL,pts[i][1]+nm[1]*hwL])
    R.push([pts[i][0]-nm[0]*hwR,pts[i][1]-nm[1]*hwR])
  }
  return {L,R}
}
function report(label, spineId, cwIds){
  console.log(`\n===== ${label} =====`)
  const sp=get(spineId)
  console.log(`spine ${spineId}: ${sp.points.length} pts, len=${clen(sp.points).pop().toFixed(1)}m, hwL=${sp.measure.left.pavementHW.toFixed(2)} hwR=${sp.measure.right.pavementHW.toFixed(2)}`)
  const so=offsetEdges(sp.points,sp.measure.left.pavementHW,sp.measure.right.pavementHW)
  console.log(`  spine outer-L end0=[${so.L[0].map(v=>v.toFixed(1))}] end1=[${so.L[so.L.length-1].map(v=>v.toFixed(1))}]`)
  console.log(`  spine outer-R end0=[${so.R[0].map(v=>v.toFixed(1))}] end1=[${so.R[so.R.length-1].map(v=>v.toFixed(1))}]`)
  for(const cid of cwIds){
    const c=get(cid);const L=clen(c.points).pop()
    const co=offsetEdges(c.points,c.measure.left.pavementHW,c.measure.right.pavementHW)
    console.log(`cw ${cid}: ${c.points.length} pts len=${L.toFixed(1)}m hw=${c.measure.left.pavementHW.toFixed(2)} innerSign=${c.innerSign} spineStart=${c.phase.spineAtStart} spineEnd=${c.phase.spineAtEnd}`)
    console.log(`  cw pts: ${c.points.map(p=>`[${p[0].toFixed(0)},${p[1].toFixed(0)}]`).join(' ')}`)
    console.log(`  cw edge-L: ${co.L.map(p=>`[${p[0].toFixed(0)},${p[1].toFixed(0)}]`).join(' ')}`)
    console.log(`  cw edge-R: ${co.R.map(p=>`[${p[0].toFixed(0)},${p[1].toFixed(0)}]`).join(' ')}`)
  }
}
report('MARK#3 west transition (node ~[-355,139])','lafayette-avenue-3',['lafayette-avenue-7','lafayette-avenue-8'])
report('MARK#2 east transition (node ~[166,222])','lafayette-avenue-1',['lafayette-avenue-5','lafayette-avenue-6'])
