import { readFileSync } from 'fs'
const r = JSON.parse(readFileSync(new URL('../src/data/ribbons.json', import.meta.url)))
const W = r.streets.find(s=>s.skelId==='west-18th-street')
const S = r.streets.find(s=>s.skelId==='south-18th-street-3')
const seam=[516.2,-413.4]
const near=(p)=>Math.hypot(p[0]-seam[0],p[1]-seam[1])
// which end of each is the seam? print the 3 points nearest the seam on each, in order
function endTangent(st,nm){
  const p=st.points
  const d0=near(p[0]), dN=near(p[p.length-1])
  const atStart = d0<dN
  const seq = atStart ? p.slice(0,4) : p.slice(-4).reverse()  // seam-end first
  console.log(`${nm}: seam at ${atStart?'START':'END'}; pts from seam:`, seq.map(q=>`[${q[0].toFixed(1)},${q[1].toFixed(1)}]`).join(' '))
  // tangent leaving the seam
  const a=seq[0],b=seq[1]; const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1
  return [dx/L,dy/L]
}
const tW=endTangent(W,'W18'), tS=endTangent(S,'S18-3')
// the two tangents leave the shared seam in OPPOSITE directions along the road; the
// through-road bend = 180 - angle between them
const dot=tW[0]*tS[0]+tW[1]*tS[1]
const between=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI
console.log(`\nangle between the two seam-leaving tangents = ${between.toFixed(1)}°  → through-road KINK = ${(180-between).toFixed(1)}° (0 = perfectly C1 smooth centerline)`)
