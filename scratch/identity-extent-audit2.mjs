// Corrected: identity = name AND connected (each connected component of a name = one road).
// Then true-ends per identity. This is the honest beat-1/beat-2 picture.
import fs from 'fs'
const Q=0.5, qk=p=>Math.round(p[0]/Q)+','+Math.round(p[1]/Q)
function audit(path,label){
  const R=JSON.parse(fs.readFileSync(path,'utf8'))
  const streets=(R.streets||[]).filter(s=>s.points&&s.points.length>=2&&!s.gradeSeparated)
  const fam=new Map()
  for(const s of streets){ const id=(s.name&&s.name.trim())||('__'+s.skelId); (fam.get(id)||fam.set(id,[]).get(id)).push(s) }
  const buckets={clean:0, midLoop:0, lollipop:0, pureLoop:0, fork:0}
  const forks=[], pureLoops=[]
  for(const [name,pieces] of fam){
    // build graph, split into connected components = separate identities
    const deg=new Map(), adj=new Map()
    const link=(a,b)=>{adj.set(a,(adj.get(a)||new Set())).get(a).add(b)}
    for(const s of pieces){const p=s.points;for(let i=0;i<p.length-1;i++){const a=qk(p[i]),b=qk(p[i+1]);if(a===b)continue;deg.set(a,(deg.get(a)||0)+1);deg.set(b,(deg.get(b)||0)+1);link(a,b);link(b,a)}}
    const seen=new Set()
    for(const v0 of deg.keys()){
      if(seen.has(v0))continue
      const comp=[]; const st=[v0]; seen.add(v0)
      while(st.length){const x=st.pop();comp.push(x);for(const y of (adj.get(x)||[]))if(!seen.has(y)){seen.add(y);st.push(y)}}
      // this component = one road identity
      let edges=0; for(const v of comp) edges+=(adj.get(v)?.size||0); edges/=2
      const ends=comp.filter(v=>deg.get(v)===1).length
      const hasCycle = edges >= comp.length
      if(ends===2 && !hasCycle) buckets.clean++
      else if(ends===2 && hasCycle) buckets.midLoop++
      else if(ends===1) { buckets.lollipop++ }
      else if(ends===0) { buckets.pureLoop++; pureLoops.push(name) }
      else { buckets.fork++; forks.push(`${name} (${ends} ends${hasCycle?', has cycle=divided?':''})`) }
    }
  }
  console.log(`\n===== ${label} =====`)
  console.log(`  clean 2-end path:          ${buckets.clean}`)
  console.log(`  2-end + mid-loop (roundabout in middle, RESOLVES): ${buckets.midLoop}`)
  console.log(`  lollipop (1 end + bulb, cul-de-sac/teardrop):      ${buckets.lollipop}`)
  console.log(`  pure loop (0 ends — needs a rule):                 ${buckets.pureLoop}  ${pureLoops.length?JSON.stringify(pureLoops):''}`)
  console.log(`  fork (≥3 ends — divided road or true Y):           ${buckets.fork}`)
  for(const f of forks) console.log(`       - ${f}`)
}
audit('src/data/ribbons.json','LAFAYETTE SQUARE')
audit('cartograph/data/hipointe-demun/clean/ribbons.json','HI-POINTE / DEMUN')
