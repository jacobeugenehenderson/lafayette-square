// BAM-1 CHECK: at each trouble-node, is the through-road ONE stitched line
// (arrives as an INTERIOR vertex, or two ends the frame already unions via roadId),
// or does it still arrive as TWO STUBS (two endpoints, not unioned)?
//
// For each chain touching the node we report:
//   INTERIOR  = the node is a mid-chain vertex  -> road passes through, unambiguous
//   END       = an endpoint lands on the node   -> candidate terminal (or half of an un-stitched through-road)
// and the roadId, so we can see which ENDs are already stitched into one road.
import fs from 'fs'
const R = JSON.parse(fs.readFileSync('src/data/ribbons.json','utf8'))
const near = (p,q,t=1.5)=>Math.hypot(p[0]-q[0],p[1]-q[1])<t

// node coords from the frozen verifier + my audit
const NODES = {
  'Kennett×S18':      [386.5, 149.0],
  'Mackay×Hickory':   [29.3, -434.9],
  'SaintVincent-dogleg':[-416.4, -164.2],
}

for (const [label, N] of Object.entries(NODES)){
  console.log(`\n===== ${label}  node=[${N}] =====`)
  const incident=[]
  for (const s of R.streets){
    const p=s.points; if(!p||p.length<2) continue
    for (let i=0;i<p.length;i++){
      if(!near(p[i],N)) continue
      const isEnd = (i===0||i===p.length-1)
      incident.push({ name:s.name||'?', skelId:s.skelId, roadId:s.roadId, i, n:p.length,
        kind: isEnd?'END':'INTERIOR' })
    }
  }
  if(!incident.length){ console.log('  (nothing within 1.5m — coord drift? widening to 4m)'); 
    for (const s of R.streets){const p=s.points;if(!p||p.length<2)continue
      for(let i=0;i<p.length;i++){ if(!near(p[i],N,4))continue
        const isEnd=(i===0||i===p.length-1)
        incident.push({name:s.name||'?',skelId:s.skelId,roadId:s.roadId,i,n:p.length,kind:isEnd?'END':'INTERIOR',far:true})}}
  }
  // group ENDs by roadId to see stitching
  const ends = incident.filter(x=>x.kind==='END')
  const interiors = incident.filter(x=>x.kind==='INTERIOR')
  for (const x of incident){
    console.log(`  ${x.kind.padEnd(8)} ${x.name.padEnd(22)} skelId=${String(x.skelId).padEnd(20)} roadId=${x.roadId}${x.far?'   (within 4m)':''}`)
  }
  // verdict
  const roadIdsOfEnds = [...new Set(ends.map(e=>e.roadId))]
  console.log(`  --- ${interiors.length} pass-through(interior), ${ends.length} endpoint(s), distinct roadIds among ends: ${roadIdsOfEnds.length}`)
  if (interiors.length>=1 && ends.length>=1)
    console.log(`  VERDICT: through-road passes as INTERIOR ✅ ; ${ends.length} stem(s) -> CLEAN, bam2/3 trivial`)
  else if (ends.length>=3)
    console.log(`  VERDICT: all ENDS, ${roadIdsOfEnds.length} roadIds -> is the through-road stitched into ONE roadId? if 2 ends share a roadId => stitched; if 3 distinct => TWO STUBS, bam1 gap`)
  else
    console.log(`  VERDICT: inspect above`)
}
