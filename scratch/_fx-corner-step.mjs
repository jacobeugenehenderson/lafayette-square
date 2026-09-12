// The proto painter's corner is a STAMP. A stamp is a STEP. How big, and where does it land?
// Reads the painter's own SECTION_DUMP channel — no re-derivation.
process.env.SECTION_DUMP='1'
import fs from 'fs'
const { sectionPassProtoTile, sectionDump } = await import('../src/lib/tileGround.js')
sectionDump.on = true
const s=JSON.parse(fs.readFileSync('public/baked/lafayette-square/shape.json','utf8'))
const d=JSON.parse(fs.readFileSync('public/looks/lafayette-square/design.json','utf8'))
const T=s.tiles||[], cw=d.curbWidth, bc=d.blockCustoms||null
let cornerRows=0, rows=0, stepW=[], stepL=[], lawnKilled=0
for(const st of T){ sectionDump.rows.length=0
  try{ sectionPassProtoTile(st, cw, {outer:'LU',inner:'SW'}, bc) }catch(e){ continue }
  const R=sectionDump.rows.slice(); rows+=R.length
  const byRing=new Map(); for(const r of R){ const a=byRing.get(r.ri)||byRing.set(r.ri,[]).get(r.ri); a.push(r) }
  for(const [,arr] of byRing){ arr.sort((a,b)=>a.i-b.i); const n=arr.length
    for(let k=0;k<n;k++){ const c=arr[k]; if(c.corner==null) continue; cornerRows++
      // the neighbour that is NOT itself a corner edge = the leg the step lands against
      for(const nb of [arr[(k-1+n)%n], arr[(k+1)%n]]){ if(!nb||nb.corner!=null) continue
        // walk OUTER boundary: corner edge is pushed to the kerb (cw); leg edge is cw+walkFrom
        stepW.push(Math.abs(nb.walk[0]-0))
        stepL.push(Math.abs((nb.lawn[1]-nb.lawn[0])))
        if (nb.lawn[1]-nb.lawn[0] > 0.05) lawnKilled++ } } } }
const q=(a,p)=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor(b.length*p)]:0}
console.log(`proto painter, LS: ${rows} per-edge rows · ${cornerRows} stamped-corner edges`)
console.log(`  corner↔leg boundaries examined      : ${stepW.length}`)
console.log(`  walk OUTER depth STEP across one vertex (m): median ${q(stepW,.5).toFixed(2)} · p90 ${q(stepW,.9).toFixed(2)} · max ${q(stepW,1-1e-9).toFixed(2)}`)
console.log(`  treelawn width on the adjoining LEG   (m): median ${q(stepL,.5).toFixed(2)} · p90 ${q(stepL,.9).toFixed(2)}`)
console.log(`  boundaries where a real treelawn (>5cm) goes to ZERO across ONE vertex: ${lawnKilled} (${(100*lawnKilled/Math.max(1,stepW.length)).toFixed(1)}%)`)
