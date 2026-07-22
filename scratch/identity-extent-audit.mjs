// BEAT-2 TEST: group streets by identity (name), reconstruct each road's full
// extent from its pieces as a graph, find its TRUE ENDS (degree-1 tips).
// A road should resolve to exactly 2 true-ends. Roundabout loops are the risk:
// a loop contributes a cycle with NO degree-1 tip. Flag every road that does
// not resolve to a clean 2-end path, and say WHY (loop / fork / island).
import fs from 'fs'
const Q = 0.5 // weld tolerance (m) for shared vertices
const qk = p => Math.round(p[0]/Q)+','+Math.round(p[1]/Q)

function audit(path, label){
  const R = JSON.parse(fs.readFileSync(path,'utf8'))
  const streets = (R.streets||[]).filter(s=>s.points&&s.points.length>=2 && !s.gradeSeparated)
  // group by identity = trimmed name (bare fragments w/o name -> own identity by skelId)
  const fam = new Map()
  for(const s of streets){
    const id = (s.name&&s.name.trim()) || ('__'+s.skelId)
    if(!fam.has(id)) fam.set(id,[])
    fam.get(id).push(s)
  }
  let clean2=0, loopMid=0, flagged=[]
  for(const [id,pieces] of fam){
    // build graph over quantized vertices
    const deg = new Map(), adj = new Map()
    const bump=(k)=>deg.set(k,(deg.get(k)||0)+1)
    const link=(a,b)=>{ if(!adj.has(a))adj.set(a,new Set()); adj.get(a).add(b) }
    let edges=0
    for(const s of pieces){
      const p=s.points
      for(let i=0;i<p.length-1;i++){
        const a=qk(p[i]), b=qk(p[i+1])
        if(a===b) continue
        bump(a);bump(b);link(a,b);link(b,a);edges++
      }
    }
    const verts=[...deg.keys()]
    const ends = verts.filter(v=>deg.get(v)===1)
    // connected components
    const seen=new Set(); let comps=0
    for(const v of verts){ if(seen.has(v))continue; comps++; const st=[v]; seen.add(v)
      while(st.length){ const x=st.pop(); for(const y of (adj.get(x)||[])) if(!seen.has(y)){seen.add(y);st.push(y)} } }
    const hasCycle = edges >= verts.length   // in a forest edges = verts - comps; cycle if more
    const nEnds = ends.length
    let verdict
    if(nEnds===2 && comps===1) { verdict = hasCycle?'2-ends + mid-loop (roundabout OK)':'clean 2-end path'; if(hasCycle)loopMid++; else clean2++ }
    else if(nEnds===0 && comps===1) verdict='PURE LOOP — no true ends (roundabout-only identity)'
    else verdict=`irregular: ${nEnds} ends, ${comps} components`
    if(nEnds!==2 || comps!==1) flagged.push({id,pieces:pieces.length,nEnds,comps,hasCycle,verdict})
  }
  console.log(`\n===================== ${label} =====================`)
  console.log(`${streets.length} streets → ${fam.size} identities`)
  console.log(`  clean 2-end paths:        ${clean2}`)
  console.log(`  2-end + mid-loop (OK):    ${loopMid}`)
  console.log(`  FLAGGED (not clean 2-end):${flagged.length}`)
  flagged.sort((a,b)=>a.nEnds-b.nEnds)
  for(const f of flagged){
    const named = f.id.startsWith('__') ? '(unnamed '+f.id.slice(2)+')' : f.id
    console.log(`   • ${named.padEnd(30)} pieces=${f.pieces} ends=${f.nEnds} comps=${f.comps}  → ${f.verdict}`)
  }
}
audit('src/data/ribbons.json','LAFAYETTE SQUARE')
audit('cartograph/data/hipointe-demun/clean/ribbons.json','HI-POINTE / DEMUN')
